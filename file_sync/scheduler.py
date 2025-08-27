# file_sync/scheduler.py
import time
from . import config
from .jobs.liked_posts_sync import check_liked_posts
from .jobs.download_status_check import check_download_status
from .jobs.unliked_posts_cleanup import check_unliked_posts


def run_sync_cycle():
    """执行一次同步周期，返回处理结果"""
    try:
        # 1. 检查喜欢的posts，创建下载任务
        processed_count = check_liked_posts()
        
        # 2. 检查下载状态，标记完成的文件
        completed_downloads = check_download_status()
        
        # 3. 检查不再喜欢的posts，删除文件
        deleted_files = check_unliked_posts()
        
        return processed_count, completed_downloads, deleted_files
        
    except Exception as e:
        print(f"[FileSync][Error] in sync cycle: {e}")
        return 0, 0, 0
