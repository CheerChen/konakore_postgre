import os
from dotenv import load_dotenv

load_dotenv()

RETRY_INTERVAL_SECONDS = 60
MAX_BACKOFF_SECONDS = 60 * 60
BATCH_SIZE_POST_TAGS = 100

POSTGRES_HOST = os.getenv("POSTGRES_HOST", "postgres")
POSTGRES_DB = os.getenv("POSTGRES_DB")
POSTGRES_USER = os.getenv("POSTGRES_USER")
POSTGRES_PASSWORD = os.getenv("POSTGRES_PASSWORD")

# Advisory lock names
LOCK_POST_TAGS = "process-post-tags"
LOCK_BACKFILL_POSTS = "backfill-posts"  # reserved if needed later
LOCK_TAG_SYNC = "sync-tags"  # reserved
