# file_sync/jobs/liked_posts_sync.py
import os
import json
from psycopg2.extras import RealDictCursor
from ..db import get_db_connection
from ..utils.file_utils import check_file_exists, get_idx_path, ensure_dir, build_filename
from ..utils.url_utils import get_preferred_download_url
from ..utils.aria_utils import send_aria2_request, validate_download_url


def create_complete_record(post_id, raw_data, existing_file):
    """为已存在的文件创建COMPLETE记录"""
    try:
        actual_size = os.path.getsize(existing_file)
        # 从文件路径推断扩展名
        file_ext = os.path.splitext(existing_file)[1][1:]  # 去掉点号
        
        # 从file_ext获取真实的下载URL和预期大小
        if file_ext == 'jpg' or file_ext == 'jpeg':
            download_url = raw_data.get('jpeg_url')
            expected_size = raw_data.get('jpeg_file_size')
            if expected_size == 0:
                download_url = raw_data.get('file_url')
                expected_size = raw_data.get('file_size')
        else:
            download_url = raw_data.get('file_url')
            expected_size = raw_data.get('file_size')

        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO file_sync (post_id, download_url, expected_size, actual_size, file_path, file_ext, sync_status)
                    VALUES (%s, %s, %s, %s, %s, %s, 'COMPLETE')
                """, (
                    post_id,
                    download_url,
                    expected_size,
                    actual_size,
                    existing_file,
                    file_ext
                ))
        
        return True
        
    except Exception as e:
        print(f"[LikedPostsSync] Failed to create record for existing file {existing_file}: {e}")
        return False


def create_download_task(post_id, raw_data):
    """创建新的下载任务"""
    # 获取所有可能的下载URL
    download_urls = get_preferred_download_url(raw_data)
    
    if not download_urls:
        print(f"[LikedPostsSync] No download URLs found for post {post_id}")
        return False
    
    # 按优先级尝试验证URL
    selected_download = None
    for download_info in download_urls:
        url = download_info['url']
        expected_size = download_info['size']
        
        print(f"[LikedPostsSync] Trying URL for post {post_id}: {url}")
        
        if validate_download_url(url, expected_size):
            selected_download = download_info
            print(f"[LikedPostsSync] URL validated successfully for post {post_id}")
            break
        else:
            print(f"[LikedPostsSync] URL validation failed for post {post_id}, trying next priority")
    
    if not selected_download:
        print(f"[LikedPostsSync] No valid download URL found for post {post_id}")
        return False
    
    # 使用验证通过的URL创建下载任务
    url = selected_download['url']
    expected_size = selected_download['size']
    file_ext = selected_download['ext']
    
    # 获取idx目录
    idx_dir = get_idx_path(post_id)
    
    # 确保目录存在
    if not ensure_dir(idx_dir):
        return False
    
    # 构建文件名
    tags = raw_data.get('tags', '')
    filename = build_filename(post_id, tags, url)
    file_path = os.path.join(idx_dir, filename)
    
    print(f"[LikedPostsSync] Creating download task for post {post_id}: {filename}")
    
    # 发送aria2下载任务 - URL必须是数组
    aria_params = [[url], {"dir": idx_dir, "out": filename}]
    gid = send_aria2_request("aria2.addUri", aria_params)
    
    if not gid:
        print(f"[LikedPostsSync] Failed to add download task for post {post_id}")
        return False
    
    # 创建数据库记录
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO file_sync (post_id, download_url, expected_size, file_path, file_ext, aria_log, sync_status)
                    VALUES (%s, %s, %s, %s, %s, %s, 'DOWNLOADING')
                """, (
                    post_id,
                    url,
                    expected_size,
                    file_path,
                    file_ext,
                    json.dumps({"gid": gid, "method": "aria2.addUri", "params": aria_params})
                ))
        
        print(f"[LikedPostsSync] Created download record for post {post_id}, gid: {gid}")
        return True
        
    except Exception as e:
        print(f"[LikedPostsSync] Failed to create download record for post {post_id}: {e}")
        return False


def check_liked_posts():
    """检查喜欢的posts，创建同步记录"""
    print("[LikedPostsSync] Checking liked posts for file sync...")
    
    try:
        with get_db_connection() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                # 获取所有喜欢的且未同步的posts
                # 包括：1. 完全没有file_sync记录的  2. 已删除但重新liked的
                cur.execute("""
                    SELECT p.id, p.raw_data
                    FROM posts p
                    LEFT JOIN file_sync fs ON p.id = fs.post_id AND fs.sync_status NOT IN ('DELETED')
                    WHERE p.is_liked = TRUE 
                    AND fs.post_id IS NULL
                    ORDER BY p.id DESC
                    LIMIT 100
                """)
                
                posts = cur.fetchall()
                
                if not posts:
                    print("[LikedPostsSync] No new liked posts to sync")
                    return 0
                
                created_count = 0
                exists_count = 0
                failed_count = 0
                
                for post in posts:
                    post_id = post['id']
                    raw_data = post['raw_data']
                    
                    # 先检查文件是否已存在
                    existing_file = check_file_exists(post_id)
                    if existing_file:
                        # 文件已存在，创建COMPLETE记录
                        if create_complete_record(post_id, raw_data, existing_file):
                            exists_count += 1
                            print(f"[LikedPostsSync] Found existing file for post {post_id}: {existing_file}")
                        else:
                            failed_count += 1
                            print(f"[LikedPostsSync] Failed to create record for existing file {post_id}")
                    else:
                        # 文件不存在，创建下载任务
                        if create_download_task(post_id, raw_data):
                            created_count += 1
                        else:
                            failed_count += 1
                            print(f"[LikedPostsSync] Failed to create download for post {post_id}")
                
                print(f"[LikedPostsSync] Summary: {created_count} new downloads, {exists_count} existing files, {failed_count} failed")
                return created_count + exists_count
                
    except Exception as e:
        print(f"[LikedPostsSync] Error checking liked posts: {e}")
        return 0
