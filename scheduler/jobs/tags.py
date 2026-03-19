import time
import requests
import schedule
from .. import config
from ..db import get_db_connection, get_job_state, update_job_state


def fetch_all_tags_from_remote():
    """获取所有tags数据，limit=0表示无限制"""
    url = "https://konachan.net/tag.json?limit=0"
    try:
        print("[Tags] Fetching all tags from remote...")
        resp = requests.get(url, timeout=120)  # 增加超时时间，因为是全量数据
        resp.raise_for_status()
        tags = resp.json()
        print(f"[Tags] Fetched {len(tags)} tags from remote")
        return tags
    except requests.RequestException as e:
        print(f"[Tags][Error] Failed to fetch all tags: {e}")
        return None


def batch_update_tags_to_db(tags, batch_size=100):
    """分批更新tags到数据库"""
    if not tags:
        return {"new": 0, "updated": 0, "total": 0}
    
    new_count = 0
    updated_count = 0
    total_batches = len(tags) // batch_size + (1 if len(tags) % batch_size > 0 else 0)
    
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            for i in range(0, len(tags), batch_size):
                batch = tags[i:i + batch_size]
                batch_num = i // batch_size + 1
                print(f"[Tags] Processing batch {batch_num}/{total_batches} ({len(batch)} tags)")
                
                for tag in batch:
                    # 检查是否已存在
                    cur.execute(
                        "SELECT count, type, ambiguous, name FROM tags WHERE id = %s",
                        (tag["id"],)
                    )
                    existing = cur.fetchone()
                    
                    if existing is None:
                        # 新tag，插入
                        cur.execute(
                            """
                            INSERT INTO tags (id, name, count, type, ambiguous, last_synced_at)
                            VALUES (%s, %s, %s, %s, %s, NOW())
                            """,
                            (tag["id"], tag["name"], tag["count"], tag["type"], tag["ambiguous"])
                        )
                        new_count += 1
                    else:
                        # 检查是否有变化
                        existing_count, existing_type, existing_ambiguous, existing_name = existing
                        if (existing_count != tag["count"] or 
                            existing_type != tag["type"] or 
                            existing_ambiguous != tag["ambiguous"] or
                            existing_name != tag["name"]):
                            # 数据有变化，更新
                            cur.execute(
                                """
                                UPDATE tags SET
                                    name = %s, count = %s, type = %s, 
                                    ambiguous = %s, last_synced_at = NOW()
                                WHERE id = %s
                                """,
                                (tag["name"], tag["count"], tag["type"], tag["ambiguous"], tag["id"])
                            )
                            updated_count += 1
                
                # 每批处理后提交并稍作休息
                conn.commit()
                if batch_num < total_batches:  # 不是最后一批时才休息
                    time.sleep(1)  # 避免过快的数据库操作
    
    return {"new": new_count, "updated": updated_count, "total": len(tags)}


def task_sync_all_tags():
    """全量同步tags的任务函数"""
    print("[Tags] Starting full tags sync task...")
    
    # 获取所有tags
    all_tags = fetch_all_tags_from_remote()
    if all_tags is None:
        print("[Tags] Failed to fetch tags, skipping this sync")
        return
    
    # 分批更新到数据库
    result = batch_update_tags_to_db(all_tags, batch_size=1000)
    
    print(f"[Tags] Sync completed: {result['new']} new, {result['updated']} updated, {result['total']} total")
    
    # 更新job状态
    state = get_job_state("sync-tags") or {}
    state["last_sync_count"] = result["total"]
    state["last_sync_new"] = result["new"] 
    state["last_sync_updated"] = result["updated"]
    state["last_completed_at"] = time.time()
    update_job_state("sync-tags", state)


def register_tags_sync_job(run_initial_sync=False):
    """注册tags同步任务，每7天执行一次"""
    # 每7天执行一次全量同步
    schedule.every(7).days.do(task_sync_all_tags)
    print("[Tags] Registered tags sync job to run every 7 days")
    
    # 可选择是否立即执行一次同步
    if run_initial_sync:
        # 检查上次同步时间，如果小于7天则跳过
        state = get_job_state("sync-tags")
        if state and "last_completed_at" in state:
            last_sync_time = state["last_completed_at"]
            current_time = time.time()
            days_since_last_sync = (current_time - last_sync_time) / (24 * 60 * 60)
            
            if days_since_last_sync < 7:
                print(f"[Tags] Skipping initial sync - last sync was {days_since_last_sync:.1f} days ago (< 7 days)")
                return
        
        print("[Tags] Running initial sync...")
        task_sync_all_tags()
