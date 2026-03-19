import time
from psycopg2.extras import RealDictCursor
from .. import config
from ..db import get_db_connection, try_advisory_lock


def process_likes_batch(limit: int = 100) -> int:
    """处理一批遗留的likes表数据：
    - 从likes表按id desc顺序获取一批记录
    - 检查对应的posts是否存在（避免处理还未backfill的数据）
    - 在posts表中标记is_liked=TRUE，但不修改其他字段
    - 成功标记后删除likes表中的对应记录
    - 如果posts中不存在对应记录，则跳过（空批退避）
    返回成功处理的likes记录数量。
    """
    with get_db_connection() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            # 取一批likes记录，按id desc排序
            cur.execute(
                """
                SELECT id
                FROM likes
                ORDER BY id DESC
                LIMIT %s
                """,
                (limit,),
            )
            likes = cur.fetchall()
            if not likes:
                return 0

            like_ids = [like["id"] for like in likes]
            
            # 检查这些id在posts表中是否存在
            cur.execute(
                """
                SELECT id
                FROM posts
                WHERE id = ANY(%s)
                """,
                (like_ids,)
            )
            existing_posts = cur.fetchall()
            existing_post_ids = {post["id"] for post in existing_posts}
            
            # 如果没有任何posts存在，说明还没有backfill到这些数据
            if not existing_post_ids:
                return 0
            
            processed_count = 0
            for like_id in like_ids:
                # 只处理在posts表中存在的记录
                if like_id not in existing_post_ids:
                    continue
                    
                try:
                    # 更新posts表中的is_liked字段，不修改其他字段
                    cur.execute(
                        """
                        UPDATE posts 
                        SET is_liked = TRUE 
                        WHERE id = %s
                        """,
                        (like_id,)
                    )
                    
                    # 如果更新成功，删除likes表中的记录
                    if cur.rowcount > 0:
                        cur.execute(
                            """
                            DELETE FROM likes 
                            WHERE id = %s
                            """,
                            (like_id,)
                        )
                        processed_count += 1
                        
                except Exception as e:
                    print(f"[Likes] Error processing like_id {like_id}: {e}")
                    # 出错时不删除likes记录，继续处理下一个
                    continue

            return processed_count


def run_likes_process():
    """运行likes处理进程"""
    print("[Likes] Starting likes migration process...")
    try:
        conn = get_db_connection()
        # 使用专门的advisory lock防止重复运行
        if not try_advisory_lock(conn, "process-likes"):
            print("[Likes] Another instance active. Exit.")
            conn.close()
            return
            
        idle = 0
        while True:
            processed = process_likes_batch()
            if processed > 0:
                idle = 0
                print(f"[Likes] Processed {processed} likes.")
            else:
                idle += 1
                # 空批时退避
                sleep_s = min(30 * idle, 3600)
                print(f"[Likes] Idle batch. Sleep {sleep_s}s")
                time.sleep(sleep_s)
                continue
                
            # 成功处理后固定冷却时间，避免持续高频循环
            time.sleep(2)  # 2秒冷却时间
            
    except Exception as e:
        print(f"[Likes][Error] {e}")
    finally:
        try:
            if 'conn' in locals() and not conn.closed:
                conn.close()
        except Exception:
            pass
