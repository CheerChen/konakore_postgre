"""
Tasks router - exposes worker task progress.
"""
from typing import List

from fastapi import APIRouter
from psycopg2 import errors
from psycopg2.extras import RealDictCursor

from models import TaskStateResponse
from utils import get_db_connection

router = APIRouter(prefix="/v1/tasks", tags=["tasks"])


@router.get("", response_model=List[TaskStateResponse])
def list_tasks():
    """List worker tasks and their latest progress state."""
    try:
        with get_db_connection() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(
                    """
                    SELECT
                        id, name, type, category, status, desired_status,
                        progress_pct, current_value, total_value, unit,
                        state, config, error_message, started_at, completed_at,
                        last_run_at, next_run_at, updated_at
                    FROM task_state
                    ORDER BY
                        CASE id
                            WHEN 'backfill-all' THEN 1
                            WHEN 'sync-recent' THEN 2
                            WHEN 'sync-tags' THEN 3
                            WHEN 'post-tags' THEN 4
                            WHEN 'likes-migration' THEN 5
                            WHEN 'file-sync' THEN 6
                            ELSE 99
                        END,
                        id
                    """
                )
                return [dict(row) for row in cur.fetchall()]
    except errors.UndefinedTable:
        return []
