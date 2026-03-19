import time
from psycopg2.extras import RealDictCursor
from .. import config
from ..db import get_db_connection, try_advisory_lock


def process_post_tags_batch(limit: int = config.BATCH_SIZE_POST_TAGS) -> int:
    """处理一批未完成的 posts：
    - 收集该批所有帖子需要的 tag 名称，统一一次查询 tags 表，避免 N 次查询。
    - 仅当帖子存在 ≥1 个 tag 且所有 tag 已存在，并全部成功写入关联后才标记 is_processed=TRUE。
    - 无 tag（或解析后为空）帖子保持未处理状态（方便后续如果数据补全再处理，或人工检查）。
    返回成功完成并标记 processed 的帖子数量。
    """
    with get_db_connection() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            # 取一批候选帖子
            cur.execute(
                """
                SELECT id, raw_data
                FROM posts
                WHERE is_processed = FALSE
                ORDER BY id
                LIMIT %s
                """,
                (limit,),
            )
            posts = cur.fetchall()
            if not posts:
                return 0

            # 解析所有帖子标签
            post_tags_map = {}
            global_tag_set = []  # 用列表保持插入顺序，再去重
            seen = set()
            for p in posts:
                raw = p["raw_data"] or {}
                tags_field = raw.get("tags") or raw.get("tag_string") or ""
                tag_names = [t for t in tags_field.split() if t]
                if tag_names:
                    post_tags_map[p["id"]] = tag_names
                    for t in tag_names:
                        if t not in seen:
                            seen.add(t)
                            global_tag_set.append(t)

            if not global_tag_set:
                # 当前批次没有任何含 tag 的帖子，直接返回 0（全部保持未处理）
                return 0

            # 一次查询所有需要的 tag
            cur.execute("SELECT id, name FROM tags WHERE name = ANY(%s)", (global_tag_set,))
            rows = cur.fetchall()
            name_to_id = {r["name"]: r["id"] for r in rows}

            processed_count = 0
            for p in posts:
                pid = p["id"]
                tag_names = post_tags_map.get(pid)
                # 没有 tag_names（为空或缺失） -> 不处理也不标记
                if not tag_names:
                    continue
                # 检查所有 tag 是否存在
                if any(name not in name_to_id for name in tag_names):
                    continue
                all_ok = True
                for name in tag_names:
                    tid = name_to_id[name]
                    try:
                        cur.execute(
                            """
                            INSERT INTO post_tags (post_id, tag_id, created_at)
                            VALUES (%s, %s, NOW())
                            ON CONFLICT (post_id, tag_id) DO NOTHING
                            """,
                            (pid, tid),
                        )
                    except Exception:
                        all_ok = False
                        break
                if all_ok:
                    cur.execute("UPDATE posts SET is_processed = TRUE WHERE id = %s", (pid,))
                    processed_count += 1

            return processed_count


def run_post_tags_process():
    print("[PostTags] Starting post_tags association process...")
    try:
        conn = get_db_connection()
        if not try_advisory_lock(conn, config.LOCK_POST_TAGS):
            print("[PostTags] Another instance active. Exit.")
            conn.close()
            return
        idle = 0
        while True:
            processed = process_post_tags_batch()
            if processed > 0:
                idle = 0
                print(f"[PostTags] Processed {processed} posts.")
            else:
                idle += 1
                # 空批时退避
                sleep_s = min(30 * idle, 3600)
                print(f"[PostTags] Idle batch. Sleep {sleep_s}s")
                time.sleep(sleep_s)
                continue
            # 成功处理后固定冷却时间，避免持续高频循环
            time.sleep(config.POST_TAGS_COOLDOWN_SECONDS)
    except Exception as e:
        print(f"[PostTags][Error] {e}")
    finally:
        try:
            if 'conn' in locals() and not conn.closed:
                conn.close()
        except Exception:
            pass
