# file_sync/jobs/download_status_check.py
import os
from psycopg2.extras import RealDictCursor
from ..db import get_db_connection


def check_download_status():
    """检查正在下载的文件状态"""
    print("[DownloadStatusCheck] Checking download status...")
    
    try:
        with get_db_connection() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                # 获取正在下载的记录
                cur.execute("""
                    SELECT id, post_id, file_path, aria_log, expected_size
                    FROM file_sync
                    WHERE sync_status = 'DOWNLOADING'
                """)
                
                downloading_files = cur.fetchall()
                
                if not downloading_files:
                    print("[DownloadStatusCheck] No files currently downloading")
                    return 0
                
                completed_count = 0
                for record in downloading_files:
                    sync_id = record['id']
                    post_id = record['post_id']
                    file_path = record['file_path']
                    aria_log = record['aria_log']
                    expected_size = record['expected_size']
                    
                    # 检查文件是否下载完成
                    if os.path.exists(file_path):
                        actual_size = os.path.getsize(file_path)
                        
                        # 更新状态为完成
                        cur.execute("""
                            UPDATE file_sync 
                            SET sync_status = 'COMPLETE', 
                                actual_size = %s,
                                updated_at = NOW()
                            WHERE id = %s
                        """, (actual_size, sync_id))
                        
                        print(f"[DownloadStatusCheck] Completed download for post {post_id}: {file_path} ({actual_size} bytes)")
                        completed_count += 1
                
                print(f"[DownloadStatusCheck] Completed {completed_count} downloads")
                return completed_count
                
    except Exception as e:
        print(f"[DownloadStatusCheck] Error checking download status: {e}")
        return 0
