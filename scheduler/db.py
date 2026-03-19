import time
import psycopg2
from psycopg2.extras import RealDictCursor, Json
from . import config


def get_db_connection(retries: int = 5, delay: int = 5):
    for i in range(retries):
        try:
            conn = psycopg2.connect(
                host=config.POSTGRES_HOST,
                dbname=config.POSTGRES_DB,
                user=config.POSTGRES_USER,
                password=config.POSTGRES_PASSWORD,
            )
            return conn
        except psycopg2.OperationalError as e:
            print(f"[DB] Connection failed: {e}")
            if i < retries - 1:
                print(f"[DB] Retrying in {delay}s ({i+1}/{retries})")
                time.sleep(delay)
            else:
                raise


def get_job_state(job_name: str):
    with get_db_connection() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("SELECT state FROM schedule_state WHERE job_name = %s", (job_name,))
            row = cur.fetchone()
            return row["state"] if row else None


def update_job_state(job_name: str, state: dict):
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE schedule_state SET state = %s, last_run_at = NOW() WHERE job_name = %s",
                (Json(state), job_name),
            )


def try_advisory_lock(conn, name: str) -> bool:
    with conn.cursor() as cur:
        cur.execute("SELECT pg_try_advisory_lock(hashtext(%s))", (name,))
        return cur.fetchone()[0]


def advisory_unlock(conn, name: str):
    with conn.cursor() as cur:
        cur.execute("SELECT pg_advisory_unlock(hashtext(%s))", (name,))
        return cur.fetchone()[0]
