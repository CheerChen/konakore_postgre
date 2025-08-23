import os
from dotenv import load_dotenv

load_dotenv()

RETRY_INTERVAL_SECONDS = 60
MAX_BACKOFF_SECONDS = 24 * 60 * 60
BATCH_SIZE_POST_TAGS = 100
POST_TAGS_COOLDOWN_SECONDS = int(os.getenv("POST_TAGS_COOLDOWN_SECONDS", "2"))  # pause after each batch

POSTGRES_HOST = os.getenv("POSTGRES_HOST", "postgres")
POSTGRES_DB = os.getenv("POSTGRES_DB")
POSTGRES_USER = os.getenv("POSTGRES_USER")
POSTGRES_PASSWORD = os.getenv("POSTGRES_PASSWORD")

RECENT_SYNC_INTERVAL_MINUTES = int(os.getenv("RECENT_SYNC_INTERVAL_MINUTES", "48"))

# Advisory lock names
LOCK_POST_TAGS = "process-post-tags"
LOCK_BACKFILL_POSTS = "backfill-posts"  # reserved if needed later
LOCK_TAG_SYNC = "sync-tags"  # reserved
