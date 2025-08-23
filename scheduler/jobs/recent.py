import schedule
from ..db import get_job_state, update_job_state


def task_sync_recent_posts(sync_func):
    """sync_func(page:int) -> ignored value"""
    print("[Recent Sync] Running recent sync task...")
    state = get_job_state("sync-recent")
    if not state:
        return
    page = state.get("current_page", 1)
    sync_func(page)  # ignore result for recent
    state["current_page"] = (page % 30) + 1
    update_job_state("sync-recent", state)


def register_recent_job(minutes: int, sync_func):
    schedule.every(minutes).minutes.do(task_sync_recent_posts, sync_func)
