# Action Plan 3: Python Scheduler Service

**Objective:** Replace the database-internal scheduling (`pg_cron`) and network (`pg_net`) logic with a dedicated, containerized Python service. This service will handle all data synchronization tasks, making the logic easier to debug, maintain, and scale independently.

---

### **Step 1: Project Structure**

Create a new directory `scheduler` to house the Python service.

```
/konakore_postgre/
├── scheduler/             #<-- Create this directory
│   ├── scheduler.py       #<-- Main application logic
│   ├── requirements.txt   #<-- Python dependencies
│   └── Dockerfile         #<-- Docker definition
├── ...
```

---

### **Step 2: Define Dependencies (`scheduler/requirements.txt`)**

Create the `requirements.txt` file with the necessary Python libraries.

```txt
# File: scheduler/requirements.txt
requests
psycopg2-binary
schedule
python-dotenv
```

- **requests**: For making HTTP calls to the external API.
- **psycopg2-binary**: The standard PostgreSQL adapter for Python.
- **schedule**: A simple and lightweight library for scheduling periodic jobs.
- **python-dotenv**: For managing environment variables (like database credentials) locally.

---

### **Step 3: Implement the Scheduler Logic (`scheduler/scheduler.py`)**

This script will connect to the database, define the sync tasks, and run them on a schedule. It directly replaces the logic from the old `task_backfill_all_posts` and `task_sync_recent_posts` SQL functions.

```python
# File: scheduler/scheduler.py
import os
import time
import json
import schedule
import requests
import psycopg2
from psycopg2.extras import Json
from dotenv import load_dotenv

load_dotenv() # Load environment variables from .env file

# --- Database Connection ---
def get_db_connection():
    return psycopg2.connect(
        host="postgres",
        dbname=os.getenv("POSTGRES_DB"),
        user=os.getenv("POSTGRES_USER"),
        password=os.getenv("POSTGRES_PASSWORD")
    )

# --- Core Sync Logic (Replaces sync_posts_from_remote) ---
def sync_posts_from_remote(page: int, limit: int = 100):
    """
    Fetches posts from the remote API and inserts them into the database.
    Returns:
        - Positive integer: Number of posts inserted.
        - 0: Success, but no posts were returned (end of data).
        - -1: A network or request error occurred.
    """
    url = f"https://konachan.net/post.json?page={page}&limit={limit}"
    try:
        response = requests.get(url, timeout=30)
        response.raise_for_status() # Raise an exception for bad status codes (4xx or 5xx)
        posts = response.json()

        if not posts:
            return 0

        with get_db_connection() as conn:
            with conn.cursor() as cur:
                for post in posts:
                    cur.execute(
                        """
                        INSERT INTO posts (id, raw_data, last_synced_at)
                        VALUES (%s, %s, NOW())
                        ON CONFLICT (id) DO UPDATE
                        SET raw_data = EXCLUDED.raw_data, last_synced_at = NOW();
                        """,
                        (post['id'], Json(post))
                    )
        return len(posts)
    except requests.RequestException as e:
        print(f"Error fetching data from {url}: {e}")
        return -1

# --- Task Definitions (Replaces task_* SQL functions) ---
def task_backfill_all_posts():
    print("Running backfill task...")
    # Logic for backfilling all posts, managing state, etc.
    # This would read from the 'schedule_state' table, call sync_posts_from_remote,
    # and update the state, similar to the old SQL function.
    pass # Implementation left as an exercise

def task_sync_recent_posts():
    print("Running recent sync task...")
    # Logic for syncing recent pages, e.g., cycling through pages 1-30.
    pass # Implementation left as an exercise


# --- Schedule the Jobs ---
print("Scheduler started.")
# schedule.every(10).seconds.do(task_backfill_all_posts) # Example schedule
schedule.every(1).hour.do(task_sync_recent_posts)

while True:
    schedule.run_pending()
    time.sleep(1)
```

---

### **Step 4: Dockerize the Scheduler (`scheduler/Dockerfile`)**

Create a Dockerfile to build a container for the Python service.

```dockerfile
# File: scheduler/Dockerfile
FROM python:3.9-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the application code
COPY scheduler.py .

# Run the scheduler
CMD ["python", "scheduler.py"]
```
