import os
import time
import psycopg2
from fastapi import FastAPI
from dotenv import load_dotenv
from psycopg2.extras import RealDictCursor

load_dotenv()

app = FastAPI()

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

@app.get("/")
def read_root():
    """API索引页面，显示所有可用的接口"""
    return {
        "message": "Konakore API is running",
        "endpoints": {
            "posts": {
                "GET /posts": "获取分页的posts列表 (参数: page, limit)",
                "GET /posts/{post_id}": "获取指定ID的post详情"
            },
            "tags": {
                "GET /tags": "获取分页的tags列表 (参数: page, limit)",
                "GET /tags/{tag_id}": "获取指定ID的tag详情",
                "GET /search/tags": "搜索tags并返回关联的posts (参数: q[>=2字符], limit)"
            }
        },
        "examples": {
            "posts": "/posts?page=1&limit=20",
            "tags": "/tags?page=1&limit=20",
            "search": "/search/tags?q=landscape&limit=10"
        }
    }

@app.get("/posts")
def get_posts(page: int = 1, limit: int = 20):
    """Fetches a paginated list of posts from the database."""
    offset = (page - 1) * limit
    with get_db_connection() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                "SELECT id, raw_data, is_processed, last_synced_at FROM posts ORDER BY id DESC LIMIT %s OFFSET %s",
                (limit, offset)
            )
            posts = cur.fetchall()
    return posts

@app.get("/posts/{post_id}")
def get_post(post_id: int):
    with get_db_connection() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("SELECT * FROM posts WHERE id = %s", (post_id,))
            post = cur.fetchone()
    return post

@app.get("/tags")
def get_tags(page: int = 1, limit: int = 20):
    """Fetches a paginated list of tags from the database."""
    offset = (page - 1) * limit
    with get_db_connection() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                "SELECT id, name, count, type, ambiguous, last_synced_at FROM tags ORDER BY count DESC LIMIT %s OFFSET %s",
                (limit, offset)
            )
            tags = cur.fetchall()
    return tags

@app.get("/tags/{tag_id}")
def get_tag(tag_id: int):
    with get_db_connection() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("SELECT * FROM tags WHERE id = %s", (tag_id,))
            tag = cur.fetchone()
    return tag


@app.get("/search/tags")
def search_tags(q: str, limit: int = 20):
    """搜索tags并返回关联的posts
    参数:
    - q: 搜索关键词 (最少2个字符)
    - limit: 每个tag返回的posts数量限制 (默认20)
    """
    
    if not q or not q.strip():
        return {"error": "Search query 'q' is required"}
    
    q = q.strip()
    if len(q) < 2:
        return {"error": "Search query must be at least 2 characters long"}
    
    search_term = f"%{q}%"
    
    with get_db_connection() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            # 搜索匹配的tags，硬限制返回数量
            cur.execute(
                """
                SELECT id, name, count, type, ambiguous 
                FROM tags 
                WHERE name ILIKE %s 
                ORDER BY count DESC
                LIMIT %s
                """,
                (search_term, 10)
            )
            matching_tags = cur.fetchall()
            
            if not matching_tags:
                return {"tags": [], "message": "No tags found"}
            
            # 为每个匹配的tag获取关联的posts
            result = []
            for tag in matching_tags:
                cur.execute(
                    """
                    SELECT p.id, p.raw_data, p.is_processed, p.last_synced_at
                    FROM posts p
                    JOIN post_tags pt ON p.id = pt.post_id
                    WHERE pt.tag_id = %s
                    ORDER BY p.id DESC
                    LIMIT %s
                    """,
                    (tag["id"], limit)
                )
                posts = cur.fetchall()
                
                result.append({
                    "tag": {
                        "id": tag["id"],
                        "name": tag["name"],
                        "count": tag["count"],
                        "type": tag["type"],
                        "ambiguous": tag["ambiguous"]
                    },
                    "posts": posts,
                    "posts_count": len(posts)
                })
    
    return {
        "query": q,
        "tags_found": len(result),
        "tags": result
    }
