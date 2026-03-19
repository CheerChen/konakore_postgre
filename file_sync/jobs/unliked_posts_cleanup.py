# file_sync/jobs/unliked_posts_cleanup.py
import os
from psycopg2.extras import RealDictCursor
from ..db import get_db_connection


def check_unliked_posts():
    """检查不再喜欢的posts，删除对应文件"""
    print("[UnlikedPostsCleanup] Checking unliked posts for cleanup...")
    
    try:
        with get_db_connection() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                # 获取已完成但post不再喜欢的记录
                cur.execute("""
                    SELECT fs.id, fs.post_id, fs.file_path
                    FROM file_sync fs
                    JOIN posts p ON fs.post_id = p.id
                    WHERE fs.sync_status = 'COMPLETE' 
                    AND fs.is_deleted = FALSE
                    AND p.is_liked = FALSE
                """)
                
                to_delete = cur.fetchall()
                
                if not to_delete:
                    print("[UnlikedPostsCleanup] No files to delete")
                    return 0
                
                deleted_count = 0
                for record in to_delete:
                    sync_id = record['id']
                    post_id = record['post_id']
                    file_path = record['file_path']
                    
                    # 删除实际文件
                    try:
                        if os.path.exists(file_path):
                            os.remove(file_path)
                            print(f"[UnlikedPostsCleanup] Deleted file: {file_path}")
                        
                        # 更新数据库记录
                        cur.execute("""
                            UPDATE file_sync 
                            SET sync_status = 'DELETED',
                                is_deleted = TRUE,
                                updated_at = NOW()
                            WHERE id = %s
                        """, (sync_id,))
                        
                        deleted_count += 1
                        
                    except Exception as e:
                        print(f"[UnlikedPostsCleanup] Failed to delete file {file_path}: {e}")
                
                print(f"[UnlikedPostsCleanup] Deleted {deleted_count} files")
                return deleted_count
                
    except Exception as e:
        print(f"[UnlikedPostsCleanup] Error checking unliked posts: {e}")
        return 0
