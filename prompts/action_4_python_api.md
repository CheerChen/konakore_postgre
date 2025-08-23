# Action Plan 4: Python REST API Service

**Objective:** Replace `PostgREST` with a dedicated Python API service using the `FastAPI` framework. This provides maximum flexibility for creating custom endpoints, adding business logic, and controlling the API's behavior, while decoupling the API layer from the database implementation.

---

### **Step 1: Project Structure**

Create a new directory `api` for the FastAPI service.

```
/konakore_postgre/
├── api/                   #<-- Create this directory
│   ├── api.py             #<-- Main application logic
│   ├── requirements.txt   #<-- Python dependencies
│   └── Dockerfile         #<-- Docker definition
├── ...
```

---

### **Step 2: Define Dependencies (`api/requirements.txt`)**

Create the `requirements.txt` file for the API service.

```txt
# File: api/requirements.txt
fastapi
uvicorn[standard]
psycopg2-binary
python-dotenv
```

- **fastapi**: A modern, high-performance web framework for building APIs.
- **uvicorn**: A lightning-fast ASGI server, required to run FastAPI.
- **psycopg2-binary**: For connecting to the PostgreSQL database.
- **python-dotenv**: For local environment variable management.

---

### **Step 3: Implement the API Logic (`api/api.py`)**

This script creates a simple FastAPI application that connects to the database and provides an endpoint to fetch posts. It directly replaces the functionality that `PostgREST` was providing automatically.

```python
# File: api/api.py
import os
import psycopg2
from fastapi import FastAPI
from dotenv import load_dotenv
from psycopg2.extras import RealDictCursor

load_dotenv()

app = FastAPI()

def get_db_connection():
    return psycopg2.connect(
        host="postgres",
        dbname=os.getenv("POSTGRES_DB"),
        user=os.getenv("POSTGRES_USER"),
        password=os.getenv("POSTGRES_PASSWORD")
    )

@app.get("/")
def read_root():
    return {"message": "Konakore API is running"}

@app.get("/posts")
def get_posts(page: int = 1, limit: int = 20):
    """Fetches a paginated list of posts from the database."""
    offset = (page - 1) * limit
    with get_db_connection() as conn:
        # RealDictCursor returns rows as dictionaries (JSON-friendly)
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                "SELECT id, raw_data, is_processed, last_synced_at FROM posts ORDER BY id DESC LIMIT %s OFFSET %s",
                (limit, offset)
            )
            posts = cur.fetchall()
    return posts

# Add other endpoints as needed, for example, to get a single post:
@app.get("/posts/{post_id}")
def get_post(post_id: int):
    with get_db_connection() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("SELECT * FROM posts WHERE id = %s", (post_id,))
            post = cur.fetchone()
    return post
```

---

### **Step 4: Dockerize the API (`api/Dockerfile`)**

Create a Dockerfile to build a container for the FastAPI service.

```dockerfile
# File: api/Dockerfile
FROM python:3.9-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the application code
COPY api.py .

# Expose the port the API will run on
EXPOSE 8000

# Run the API with Uvicorn
# --host 0.0.0.0 makes it accessible from outside the container
CMD ["uvicorn", "api:app", "--host", "0.0.0.0", "--port", "8000"]
```
