import threading
from . import config
from .jobs.posts import run_backfill_process, sync_posts_from_remote
from .jobs.tags import run_tag_sync_process, register_tags_sync_job
from .jobs.post_tags import run_post_tags_process
from .jobs.recent import register_recent_job
from .runner import run_periodic_scheduler


def start():
    print("Scheduler starting...")
    register_recent_job(config.RECENT_SYNC_INTERVAL_MINUTES, sync_posts_from_remote)
    register_tags_sync_job(run_initial_sync=True)  # 启动时执行一次初始同步

    scheduler_thread = threading.Thread(target=run_periodic_scheduler, name="PeriodicScheduler", daemon=True)
    backfill_thread = threading.Thread(target=run_backfill_process, name="PostBackfill")
    post_tags_thread = threading.Thread(target=run_post_tags_process, name="PostTags")

    scheduler_thread.start()
    print("Periodic 'sync-recent' task scheduled.")
    print("Periodic 'sync-tags' task scheduled to run every 7 days.")
    
    backfill_thread.start(); print("Started post backfill thread.")
    post_tags_thread.start(); print("Started post_tags association thread.")

    backfill_thread.join()
    post_tags_thread.join()
    print("All backfill and sync processes have completed.")


if __name__ == "__main__":
    start()
