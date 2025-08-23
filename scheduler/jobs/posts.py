import time
import requests
from psycopg2.extras import Json
from .. import config
from ..db import get_db_connection, get_job_state, update_job_state


def sync_posts_from_remote(page: int, limit: int = 100):
    url = f"https://konachan.net/post.json?page={page}&limit={limit}"
    try:
        resp = requests.get(url, timeout=30)
        resp.raise_for_status()
        posts = resp.json()
        if not posts:
            return 0
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                for post in posts:
                    cur.execute(
                        """
                        INSERT INTO posts (id, raw_data, last_synced_at) 
                        VALUES (%s, %s, NOW())
                        ON CONFLICT (id) DO UPDATE SET 
                            raw_data = EXCLUDED.raw_data, 
                            last_synced_at = NOW(),
                            is_processed = FALSE;
                        """,
                        (post["id"], Json(post)),
                    )
        return len(posts)
    except requests.RequestException as e:
        print(f"[Posts][Error] Failed to sync page {page}: {e}")
        return -1


def run_backfill_process():
    print("[Backfill] Starting backfill process...")
    interval = 10
    while True:
        state = get_job_state("backfill-all")
        if not state or not state.get("is_active", False):
            print("[Backfill] Job inactive/completed. Exit.")
            break
        page = state.get("current_page", 1)
        processed = sync_posts_from_remote(page)
        if processed > 0:
            print(f"[Backfill] Synced {processed} posts page {page}. Next in {interval}s")
            state["current_page"] = page + 1
            state["interval_seconds"] = interval
            update_job_state("backfill-all", state)
            time.sleep(interval)
            interval = min(interval * 2, config.MAX_BACKOFF_SECONDS)
        elif processed == 0:
            print("[Backfill] Complete.")
            state["is_active"] = False
            state["final_status"] = "completed"
            update_job_state("backfill-all", state)
            break
        else:
            print(f"[Backfill] Error syncing page {page}. Retry in {config.RETRY_INTERVAL_SECONDS}s")
            time.sleep(config.RETRY_INTERVAL_SECONDS)
