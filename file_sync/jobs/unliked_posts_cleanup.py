# file_sync/jobs/unliked_posts_cleanup.py
import os
import re
import glob
from psycopg2.extras import RealDictCursor
from ..db import get_db_connection
from .. import config


def extract_post_id_from_filename(filepath):
    """从文件名中提取 post_id"""
    filename = os.path.basename(filepath)
    # 匹配 "Konachan.com - {post_id} ..." 格式
    match = re.match(r'Konachan\.com - (\d+)', filename)
    if match:
        return int(match.group(1))
    return None


def delete_file_and_update_record(conn, post_id, file_path):
    """删除文件并更新数据库记录"""
    try:
        # 删除实际文件
        if os.path.exists(file_path):
            os.remove(file_path)
            print(f"[UnlikedPostsCleanup] Deleted file: {file_path}")
        else:
            print(f"[UnlikedPostsCleanup] File already deleted: {file_path}")
        
        # 更新或插入 file_sync 记录
        with conn.cursor() as cur:
            # 先尝试更新已存在的记录
            cur.execute("""
                UPDATE file_sync 
                SET sync_status = 'DELETED',
                    is_deleted = TRUE,
                    updated_at = NOW()
                WHERE post_id = %s 
                AND sync_status != 'DELETED'
                RETURNING id
            """, (post_id,))
            
            result = cur.fetchone()
            
            # 如果没有记录，创建一个DELETED记录（用于追踪）
            if not result:
                cur.execute("""
                    INSERT INTO file_sync 
                    (post_id, download_url, file_path, sync_status, is_deleted)
                    VALUES (%s, 'N/A', %s, 'DELETED', TRUE)
                    ON CONFLICT DO NOTHING
                """, (post_id, file_path))
        
        return True
        
    except Exception as e:
        print(f"[UnlikedPostsCleanup] Failed to delete file {file_path}: {e}")
        return False


def cleanup_by_database():
    """基于 file_sync 表的快速清理（处理有记录的文件）"""
    print("[UnlikedPostsCleanup] Phase 1: Database-based cleanup...")
    
    deleted_count = 0
    
    try:
        with get_db_connection() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                # 获取有记录但post不再liked的文件
                # 只处理 COMPLETE 状态，跳过 DOWNLOADING（让它们继续完成下载）
                cur.execute("""
                    SELECT fs.id, fs.post_id, fs.file_path, fs.sync_status
                    FROM file_sync fs
                    JOIN posts p ON fs.post_id = p.id
                    WHERE fs.sync_status = 'COMPLETE'
                    AND fs.is_deleted = FALSE
                    AND p.is_liked = FALSE
                    LIMIT 100
                """)
                
                to_delete = cur.fetchall()
                
                if not to_delete:
                    print("[UnlikedPostsCleanup] Phase 1: No files to delete")
                    return 0
                
                for record in to_delete:
                    post_id = record['post_id']
                    file_path = record['file_path']
                    
                    if delete_file_and_update_record(conn, post_id, file_path):
                        deleted_count += 1
                
                print(f"[UnlikedPostsCleanup] Phase 1: Deleted {deleted_count} files")
                return deleted_count
                
    except Exception as e:
        print(f"[UnlikedPostsCleanup] Phase 1 error: {e}")
        return deleted_count


def cleanup_by_filesystem(max_dirs=5):
    """基于文件系统的深度清理（处理孤立文件）
    
    Args:
        max_dirs: 每次运行最多处理的目录数量，避免一次性扫描过多
    """
    print(f"[UnlikedPostsCleanup] Phase 2: Filesystem-based cleanup (max {max_dirs} dirs)...")
    
    deleted_count = 0
    
    try:
        # 获取所有idx目录
        base_path = config.DOWNLOAD_BASE_PATH
        if not os.path.exists(base_path):
            print(f"[UnlikedPostsCleanup] Base path not found: {base_path}")
            return 0
        
        # 获取所有两位数的目录 (00, 01, 02, ...)
        idx_dirs = sorted(glob.glob(os.path.join(base_path, "[0-9][0-9]")))
        
        if not idx_dirs:
            print("[UnlikedPostsCleanup] Phase 2: No directories found")
            return 0
        
        # 限制处理的目录数量
        idx_dirs = idx_dirs[:max_dirs]
        print(f"[UnlikedPostsCleanup] Phase 2: Processing {len(idx_dirs)} directories")
        
        with get_db_connection() as conn:
            for idx_dir in idx_dirs:
                # 获取该目录下所有文件
                pattern = os.path.join(idx_dir, "Konachan.com - *")
                files = glob.glob(pattern)
                
                if not files:
                    continue
                
                print(f"[UnlikedPostsCleanup] Checking {len(files)} files in {os.path.basename(idx_dir)}/")
                
                # 从文件名提取 post_ids
                file_post_map = {}  # {post_id: file_path}
                for file_path in files:
                    post_id = extract_post_id_from_filename(file_path)
                    if post_id:
                        file_post_map[post_id] = file_path
                
                if not file_post_map:
                    continue
                
                # 批量查询这些posts的liked状态
                post_ids = list(file_post_map.keys())
                with conn.cursor(cursor_factory=RealDictCursor) as cur:
                    cur.execute("""
                        SELECT id, is_liked
                        FROM posts
                        WHERE id = ANY(%s)
                    """, (post_ids,))
                    
                    posts_status = {row['id']: row['is_liked'] for row in cur.fetchall()}
                
                # 删除 is_liked=FALSE 的文件
                for post_id, file_path in file_post_map.items():
                    # 如果post不存在或is_liked=FALSE，删除文件
                    is_liked = posts_status.get(post_id, None)
                    
                    if is_liked is False:  # 明确是 False，不是 None
                        if delete_file_and_update_record(conn, post_id, file_path):
                            deleted_count += 1
        
        print(f"[UnlikedPostsCleanup] Phase 2: Deleted {deleted_count} files")
        return deleted_count
        
    except Exception as e:
        print(f"[UnlikedPostsCleanup] Phase 2 error: {e}")
        return deleted_count


# 用于追踪Phase 2的运行频率
_phase2_counter = 0
_phase2_interval = 10  # 每10次运行一次Phase 2


def check_unliked_posts():
    """
    两阶段清理策略：
    Phase 1: 基于数据库记录的快速清理（每次运行）
    Phase 2: 基于文件系统的深度清理（每N次运行一次）
    """
    global _phase2_counter
    
    print("[UnlikedPostsCleanup] Starting cleanup process...")
    
    # Phase 1: 总是运行，处理有记录的文件
    deleted_db = cleanup_by_database()
    
    # Phase 2: 定期运行，处理孤立文件
    deleted_fs = 0
    _phase2_counter += 1
    
    if _phase2_counter >= _phase2_interval:
        deleted_fs = cleanup_by_filesystem(max_dirs=100)  # 检查最多100个目录（基本覆盖所有）
        _phase2_counter = 0  # 重置计数器
    else:
        print(f"[UnlikedPostsCleanup] Phase 2 skipped ({_phase2_counter}/{_phase2_interval})")
    
    total_deleted = deleted_db + deleted_fs
    print(f"[UnlikedPostsCleanup] Total deleted: {total_deleted} files")
    
    return total_deleted
