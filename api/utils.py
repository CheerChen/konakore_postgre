"""
Shared utility functions for the API.
"""
import os
import time
import psycopg2
import requests
import logging
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)


def get_db_connection():
    """Establishes a database connection with retry logic."""
    retries = 5
    delay = 5  # seconds
    for i in range(retries):
        try:
            conn = psycopg2.connect(
                host="postgres",
                dbname=os.getenv("POSTGRES_DB"),
                user=os.getenv("POSTGRES_USER"),
                password=os.getenv("POSTGRES_PASSWORD")
            )
            return conn
        except psycopg2.OperationalError as e:
            print(f"Database connection failed: {e}")
            if i < retries - 1:
                print(f"Retrying in {delay} seconds... ({i+1}/{retries})")
                time.sleep(delay)
            else:
                print("Could not connect to the database after several retries.")
                raise


def trigger_file_sync(action="start"):
    """
    Trigger file_sync service, ignore errors to maintain plugin-like behavior.
    
    Args:
        action: The action to trigger (default: "start")
        
    Returns:
        bool: True if triggered successfully, False otherwise
    """
    try:
        # Container-to-container communication using service name
        file_sync_url = os.getenv('FILE_SYNC_URL', 'http://worker:8090')
        
        response = requests.post(
            f"{file_sync_url}/trigger",
            json={"action": action},
            timeout=5  # 5 second timeout
        )
        
        if response.status_code == 200:
            result = response.json()
            logger.info(f"[API] File sync triggered successfully: {result.get('message', 'Unknown')}")
            return True
        else:
            logger.warning(f"[API] File sync trigger failed with status {response.status_code}: {response.text}")
            return False
            
    except requests.exceptions.Timeout:
        logger.warning("[API] File sync trigger timeout - service may be slow or unavailable")
        return False
    except requests.exceptions.ConnectionError:
        logger.warning("[API] File sync service unavailable - plugin not running")
        return False
    except Exception as e:
        logger.error(f"[API] File sync trigger error: {e}")
        return False


def trigger_profile_update(post_id: int) -> bool:
    """
    Fire-and-forget notification to the worker that a post's liked status
    changed. The worker recomputes the user_profile vector asynchronously;
    the API does not wait for completion.

    Returns True if the worker accepted the request (202), False otherwise.
    """
    try:
        worker_url = os.getenv('FILE_SYNC_URL', 'http://worker:8090')
        response = requests.post(
            f"{worker_url}/v1/profile:update",
            json={"post_id": post_id},
            timeout=5,
        )
        if response.status_code in (200, 202):
            return True
        logger.warning(
            f"[API] Profile update rejected for post {post_id}: "
            f"status={response.status_code} body={response.text}"
        )
        return False
    except requests.exceptions.RequestException as e:
        logger.warning(f"[API] Profile update request failed for post {post_id}: {e}")
        return False
    except Exception as e:
        logger.error(f"[API] Profile update unexpected error: {e}")
        return False
