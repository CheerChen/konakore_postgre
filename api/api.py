import os
import time
import psycopg2
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from psycopg2.extras import RealDictCursor

load_dotenv()

app = FastAPI()

# CORS middleware setup
origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://192.168.0.110:5173",  # NAS frontend
    "http://192.168.0.110:8080",  # Alternative port
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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
                "GET /posts": "获取分页的posts列表 (参数: page, limit, liked)",
                "GET /posts/{post_id}": "获取指定ID的post详情",
                "PUT /posts/{post_id}/like": "切换指定post的喜欢状态"
            },
            "tags": {
                "GET /tags": "获取分页的tags列表 (参数: page, limit)",
                "GET /tags/{tag_id}": "获取指定ID的tag详情",
                "GET /search/tags": "搜索tags并返回关联的posts (参数: q[>=2字符], limit, liked)"
            }
        },
        "examples": {
            "posts": "/posts?page=1&limit=20",
            "liked_posts": "/posts?liked=true&page=1&limit=20",
            "like_post": "PUT /posts/123/like",
            "tags": "/tags?page=1&limit=20",
            "search": "/search/tags?q=landscape&limit=10",
            "search_liked": "/search/tags?q=landscape&liked=true&limit=10"
        }
    }

@app.get("/posts")
def get_posts(page: int = 1, limit: int = 100, liked: bool = None):
    """Fetches a paginated list of posts from the database."""
    # 限制每页最大数量，防止查询过大
    limit = min(limit, 500)
    offset = (page - 1) * limit
    
    with get_db_connection() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            # 获取总数
            if liked is True:
                cur.execute("SELECT COUNT(*) FROM posts WHERE is_liked = TRUE")
            else:
                cur.execute("SELECT COUNT(*) FROM posts")
            total_count = cur.fetchone()['count']
            
            # 获取分页数据
            if liked is True:
                cur.execute(
                    "SELECT id, raw_data, is_processed, is_liked, last_synced_at FROM posts WHERE is_liked = TRUE ORDER BY id DESC LIMIT %s OFFSET %s",
                    (limit, offset)
                )
            else:
                cur.execute(
                    "SELECT id, raw_data, is_processed, is_liked, last_synced_at FROM posts ORDER BY id DESC LIMIT %s OFFSET %s",
                    (limit, offset)
                )
            posts = cur.fetchall()
            
            # 计算总页数
            total_pages = (total_count + limit - 1) // limit
            
            return {
                "posts": posts,
                "pagination": {
                    "current_page": page,
                    "per_page": limit,
                    "total_posts": total_count,
                    "total_pages": total_pages,
                    "has_next": page < total_pages,
                    "has_prev": page > 1
                }
            }

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
def search_tags(q: str, page: int = 1, limit: int = 100, liked: bool = None):
    """搜索tags并返回关联的posts，使用和/posts相同的分页格式
    参数:
    - q: 搜索关键词 (最少2个字符)，精确匹配tag名称
    - page: 页码 (默认1)
    - limit: 每页posts数量限制 (默认100)
    """
    
    if not q or not q.strip():
        return {"error": "Search query 'q' is required"}
    
    q = q.strip()
    if len(q) < 2:
        return {"error": "Search query must be at least 2 characters long"}
    
    # 限制每页最大数量，防止查询过大
    limit = min(limit, 500)
    offset = (page - 1) * limit
    
    with get_db_connection() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            # 精确匹配tag名称
            cur.execute(
                "SELECT id FROM tags WHERE name = %s",
                (q,)
            )
            tag = cur.fetchone()
            
            if not tag:
                return {
                    "posts": [],
                    "pagination": {
                        "current_page": page,
                        "per_page": limit,
                        "total_posts": 0,
                        "total_pages": 0,
                        "has_next": False,
                        "has_prev": False
                    },
                    "search_query": q
                }
            
            tag_id = tag["id"]
            
            # 获取总数
            if liked is True:
                cur.execute(
                    """
                    SELECT COUNT(*)
                    FROM posts p
                    JOIN post_tags pt ON p.id = pt.post_id
                    WHERE pt.tag_id = %s AND p.is_liked = TRUE
                    """,
                    (tag_id,)
                )
            else:
                cur.execute(
                    """
                    SELECT COUNT(*)
                    FROM posts p
                    JOIN post_tags pt ON p.id = pt.post_id
                    WHERE pt.tag_id = %s
                    """,
                    (tag_id,)
                )
            total_count = cur.fetchone()['count']
            
            # 获取分页数据
            if liked is True:
                cur.execute(
                    """
                    SELECT p.id, p.raw_data, p.is_processed, p.is_liked, p.last_synced_at
                    FROM posts p
                    JOIN post_tags pt ON p.id = pt.post_id
                    WHERE pt.tag_id = %s AND p.is_liked = TRUE
                    ORDER BY p.id DESC
                    LIMIT %s OFFSET %s
                    """,
                    (tag_id, limit, offset)
                )
            else:
                cur.execute(
                    """
                    SELECT p.id, p.raw_data, p.is_processed, p.is_liked, p.last_synced_at
                    FROM posts p
                    JOIN post_tags pt ON p.id = pt.post_id
                    WHERE pt.tag_id = %s
                    ORDER BY p.id DESC
                    LIMIT %s OFFSET %s
                    """,
                    (tag_id, limit, offset)
                )
            posts = cur.fetchall()
            
            # 计算总页数
            total_pages = (total_count + limit - 1) // limit
            
            return {
                "posts": posts,
                "pagination": {
                    "current_page": page,
                    "per_page": limit,
                    "total_posts": total_count,
                    "total_pages": total_pages,
                    "has_next": page < total_pages,
                    "has_prev": page > 1
                },
                "search_query": q
            }


@app.put("/posts/{post_id}/like")
def toggle_like_post(post_id: int):
    """切换指定post的喜欢状态"""
    with get_db_connection() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            # 首先检查post是否存在并获取当前状态
            cur.execute("SELECT id, is_liked FROM posts WHERE id = %s", (post_id,))
            post = cur.fetchone()
            
            if not post:
                return {"error": f"Post with id {post_id} not found"}
            
            # 切换is_liked状态
            new_liked_status = not post["is_liked"]
            cur.execute(
                "UPDATE posts SET is_liked = %s WHERE id = %s",
                (new_liked_status, post_id)
            )
            conn.commit()
            
            return {
                "post_id": post_id,
                "is_liked": new_liked_status,
                "message": f"Post {'liked' if new_liked_status else 'unliked'} successfully"
            }
