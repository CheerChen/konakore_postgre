import threading
from . import config
from .jobs.posts import run_backfill_process, sync_posts_from_remote, register_recent_job
from .jobs.tags import register_tags_sync_job
from .jobs.post_tags import run_post_tags_process
from .jobs.likes import run_likes_process
from .jobs.file_sync import run_file_sync_process
from .runner import run_periodic_scheduler


def start():
    print("Scheduler starting...")
    register_recent_job(48, sync_posts_from_remote)
    register_tags_sync_job(run_initial_sync=True)  # 启动时执行一次初始同步

    scheduler_thread = threading.Thread(target=run_periodic_scheduler, name="PeriodicScheduler", daemon=True)
    backfill_thread = threading.Thread(target=run_backfill_process, name="PostBackfill")
    post_tags_thread = threading.Thread(target=run_post_tags_process, name="PostTags")
    likes_thread = threading.Thread(target=run_likes_process, name="LikesMigration")
    file_sync_thread = threading.Thread(target=run_file_sync_process, name="FileSync")

    scheduler_thread.start()
    print("Periodic 'sync-recent' task scheduled.")
    print("Periodic 'sync-tags' task scheduled to run every 7 days.")
    
    backfill_thread.start(); print("Started post backfill thread.")
    post_tags_thread.start(); print("Started post_tags association thread.")
    likes_thread.start(); print("Started likes migration thread.")
    file_sync_thread.start(); print("Started file sync thread.")

    backfill_thread.join()
    post_tags_thread.join()
    likes_thread.join()
    file_sync_thread.join()
    print("All backfill and sync processes have completed.")


if __name__ == "__main__":
    start()
