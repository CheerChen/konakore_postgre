import os
import time
import requests
import json
import re
import glob
import websocket
from pathlib import Path
from psycopg2.extras import RealDictCursor
from .. import config
from ..db import get_db_connection


# 配置
ARIA2_URL = os.getenv('ARIA2_URL', 'http://localhost:6800/jsonrpc')
ARIA2_SECRET = os.getenv('ARIA2_SECRET', '')
DOWNLOAD_BASE_PATH = '/wallpaper'  # Docker容器内的路径
CHECK_INTERVAL = 120  # 2分钟检查一次
FILENAME_LENGTH_LIMIT = 200  # 文件名长度限制


def get_idx_path(post_id):
    """根据post_id计算idx目录路径"""
    idx = post_id // 10000
    idx_str = f"{idx:02d}"
    return os.path.join(DOWNLOAD_BASE_PATH, idx_str)


def ensure_dir(dir_path):
    """确保目录存在"""
    try:
        os.makedirs(dir_path, exist_ok=True)
        return True
    except Exception as e:
        print(f"[FileSync] Failed to create directory {dir_path}: {e}")
        return False


def clean_tags_for_filename(tags):
    """清理和缩短tags用于文件名"""
    if not tags:
        return ""
    
    # 分割tags
    tag_list = tags.split()
    
    # 逐步移除tags直到文件名长度合适
    while len(' '.join(tag_list)) >= FILENAME_LENGTH_LIMIT:
        if not tag_list:
            break
        tag_list = tag_list[:-1]
    
    cleaned_tags = ' '.join(tag_list)
    
    # 替换特殊字符
    cleaned_tags = re.sub(r'[\\/:*?"<>|]', '', cleaned_tags)
    
    return cleaned_tags


def build_filename(post_id, tags, url):
    """构建文件名"""
    # 确定文件扩展名
    if 'png' in url.lower():
        ext = 'png'
    else:
        ext = 'jpg'
    
    # 清理tags
    cleaned_tags = clean_tags_for_filename(tags)
    
    # 构建文件名
    if cleaned_tags:
        filename = f"Konachan.com - {post_id} {cleaned_tags}.{ext}"
    else:
        filename = f"Konachan.com - {post_id}.{ext}"
    
    return filename


def check_file_exists(post_id):
    """检查文件是否已存在"""
    idx_dir = get_idx_path(post_id)
    
    if not os.path.exists(idx_dir):
        return None
    
    # 搜索匹配 "Konachan.com - {post_id} *" 的文件
    pattern = os.path.join(idx_dir, f"Konachan.com - {post_id} *")
    matching_files = glob.glob(pattern)
    
    # 也检查没有tags的文件名
    pattern_no_tags = os.path.join(idx_dir, f"Konachan.com - {post_id}.*")
    matching_files.extend(glob.glob(pattern_no_tags))
    
    if matching_files:
        return matching_files[0]  # 返回第一个匹配的文件
    
    return None


def send_aria2_request(method, params=None):
    """发送aria2 JSON-RPC请求，支持HTTP和WebSocket"""
    if params is None:
        params = []
    
    # 如果设置了secret，添加到参数开头
    if ARIA2_SECRET:
        params.insert(0, f"token:{ARIA2_SECRET}")
    
    payload = {
        "jsonrpc": "2.0",
        "id": "qwer",
        "method": method,
        "params": params
    }
    
    try:
        if ARIA2_URL.startswith('ws://') or ARIA2_URL.startswith('wss://'):
            # WebSocket连接
            print(f"[FileSync] Using WebSocket connection to: {ARIA2_URL}")
            ws = websocket.create_connection(ARIA2_URL, timeout=10)
            ws.send(json.dumps(payload))
            result_str = ws.recv()
            ws.close()
            
            result = json.loads(result_str)
        else:
            # HTTP连接
            print(f"[FileSync] Using HTTP connection to: {ARIA2_URL}")
            response = requests.post(ARIA2_URL, json=payload, timeout=10)
            response.raise_for_status()
            result = response.json()
        
        if "error" in result:
            print(f"[FileSync] Aria2 error: {result['error']}")
            return None
        
        return result.get("result")
        
    except Exception as e:
        print(f"[FileSync] Failed to send aria2 request: {e}")
        return None


def validate_download_url(url, expected_size=None):
    """验证下载URL是否可用"""
    try:
        print(f"[FileSync] Validating URL: {url}")
        
        # 发送HEAD请求检查URL
        response = requests.head(url, timeout=10, allow_redirects=True)
        
        if response.status_code != 200:
            print(f"[FileSync] URL validation failed with status {response.status_code}: {url}")
            return False
        
        # 检查Content-Length
        content_length = response.headers.get('content-length')
        if content_length:
            actual_size = int(content_length)
            print(f"[FileSync] URL validated, size: {actual_size} bytes")
            
            return True
        else:
            print(f"[FileSync] No content-length header, but status is 200")
            # 没有content-length但状态是200，可能还是可以下载的
            return True
            
    except Exception as e:
        print(f"[FileSync] URL validation error: {e}")
        return False


def get_preferred_download_url(raw_data):
    """Intelligent download URL selection logic: decide between JPEG and PNG based on compression ratio and file size"""
    
    # Get basic data
    jpeg_file_size = raw_data.get('jpeg_file_size', 0)
    file_size = raw_data.get('file_size', 0)
    jpeg_url = raw_data.get('jpeg_url')
    file_url = raw_data.get('file_url')
    
    # If no jpeg_file_size, directly use file_url
    if jpeg_file_size == 0:
        url = file_url
        size = file_size
    else:
        # Has jpeg_file_size, perform intelligent decision
        file_jpeg_ratio = file_size / jpeg_file_size if jpeg_file_size > 0 else 1
        original_size_bytes = file_size
        
        # Decision logic
        if file_jpeg_ratio >= 10:
            # Compression ratio over 10:1, indicates photo-like image, JPEG works well
            url = jpeg_url
            size = jpeg_file_size
            space_saving_percent = (1 - jpeg_file_size / file_size) * 100
            print(f"[FileSync] Choose JPEG: High compression ratio ({file_jpeg_ratio:.1f}:1), suitable for photos, saves {space_saving_percent:.1f}% space")
        elif file_jpeg_ratio >= 3:
            # Compression ratio 3-10x, medium compression
            if original_size_bytes > 5 * 1024 * 1024:  # Greater than 5MB
                # Recommend JPEG
                url = jpeg_url
                size = jpeg_file_size
                print(f"[FileSync] Choose JPEG: Large file ({original_size_bytes / (1024*1024):.1f}MB), compression ratio {file_jpeg_ratio:.1f}:1 acceptable")
            else:
                # Recommend PNG
                url = file_url
                size = file_size
                print(f"[FileSync] Choose PNG: Small file, maintain PNG lossless quality")
        else:
            # Compression ratio less than 3:1, JPEG advantage not significant
            url = file_url
            size = file_size
            print(f"[FileSync] Choose PNG: Poor compression effect ({file_jpeg_ratio:.1f}:1), maintain PNG lossless")
    
    # Infer file extension from URL
    if url and (url.lower().endswith('.jpg') or url.lower().endswith('.jpeg')):
        ext = 'jpg'
    elif url and url.lower().endswith('.png'):
        ext = 'png'
    elif url and url.lower().endswith('.gif'):
        ext = 'gif'
    else:
        ext = 'jpg'

    if url:
        return [{
            'url': url,
            'size': size,
            'ext': ext
        }]
    else:
        return []


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
        print(f"[FileSync] Failed to create record for existing file {existing_file}: {e}")
        return False


def create_download_task(post_id, raw_data):
    """创建新的下载任务"""
    # 获取所有可能的下载URL
    download_urls = get_preferred_download_url(raw_data)
    
    if not download_urls:
        print(f"[FileSync] No download URLs found for post {post_id}")
        return False
    
    # 按优先级尝试验证URL
    selected_download = None
    for download_info in download_urls:
        url = download_info['url']
        expected_size = download_info['size']
        
        print(f"[FileSync] Trying URL for post {post_id}: {url}")
        
        if validate_download_url(url, expected_size):
            selected_download = download_info
            print(f"[FileSync] URL validated successfully for post {post_id}")
            break
        else:
            print(f"[FileSync] URL validation failed for post {post_id}, trying next priority")
    
    if not selected_download:
        print(f"[FileSync] No valid download URL found for post {post_id}")
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
    
    print(f"[FileSync] Creating download task for post {post_id}: {filename}")
    
    # 发送aria2下载任务 - URL必须是数组
    aria_params = [[url], {"dir": idx_dir, "out": filename}]
    gid = send_aria2_request("aria2.addUri", aria_params)
    
    if not gid:
        print(f"[FileSync] Failed to add download task for post {post_id}")
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
        
        print(f"[FileSync] Created download record for post {post_id}, gid: {gid}")
        return True
        
    except Exception as e:
        print(f"[FileSync] Failed to create download record for post {post_id}: {e}")
        return False


def check_liked_posts():
    """检查喜欢的posts，创建同步记录"""
    print("[FileSync] Checking liked posts for file sync...")
    
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
                    print("[FileSync] No new liked posts to sync")
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
                            print(f"[FileSync] Found existing file for post {post_id}: {existing_file}")
                        else:
                            failed_count += 1
                            print(f"[FileSync] Failed to create record for existing file {post_id}")
                    else:
                        # 文件不存在，创建下载任务
                        if create_download_task(post_id, raw_data):
                            created_count += 1
                        else:
                            failed_count += 1
                            print(f"[FileSync] Failed to create download for post {post_id}")
                
                print(f"[FileSync] Summary: {created_count} new downloads, {exists_count} existing files, {failed_count} failed")
                return created_count + exists_count
                
    except Exception as e:
        print(f"[FileSync] Error checking liked posts: {e}")
        return 0


def check_download_status():
    """检查正在下载的文件状态"""
    print("[FileSync] Checking download status...")
    
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
                    print("[FileSync] No files currently downloading")
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
                        
                        print(f"[FileSync] Completed download for post {post_id}: {file_path} ({actual_size} bytes)")
                        completed_count += 1
                
                print(f"[FileSync] Completed {completed_count} downloads")
                return completed_count
                
    except Exception as e:
        print(f"[FileSync] Error checking download status: {e}")
        return 0


def check_unliked_posts():
    """检查不再喜欢的posts，删除对应文件"""
    print("[FileSync] Checking unliked posts for cleanup...")
    
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
                    print("[FileSync] No files to delete")
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
                            print(f"[FileSync] Deleted file: {file_path}")
                        
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
                        print(f"[FileSync] Failed to delete file {file_path}: {e}")
                
                print(f"[FileSync] Deleted {deleted_count} files")
                return deleted_count
                
    except Exception as e:
        print(f"[FileSync] Error checking unliked posts: {e}")
        return 0


def run_file_sync_process():
    """运行文件同步进程"""
    print("[FileSync] Starting file sync process...")
    
    try:
        while True:
            print(f"[FileSync] Starting sync cycle at {time.strftime('%Y-%m-%d %H:%M:%S')}")
            
            # 1. 检查喜欢的posts，创建下载任务
            processed_count = check_liked_posts()
            
            # 2. 检查下载状态，标记完成的文件
            completed_downloads = check_download_status()
            
            # 3. 检查不再喜欢的posts，删除文件
            deleted_files = check_unliked_posts()
            
            print(f"[FileSync] Cycle completed: {processed_count} processed, {completed_downloads} completed, {deleted_files} deleted")
            
            # 等待下一次检查
            time.sleep(CHECK_INTERVAL)
            
    except Exception as e:
        print(f"[FileSync][Error] {e}")
    finally:
        print("[FileSync] File sync process stopped")


if __name__ == "__main__":
    run_file_sync_process()
