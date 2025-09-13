import os
import time
import psycopg2
import requests
import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.gzip import GZipMiddleware
from dotenv import load_dotenv
from psycopg2.extras import RealDictCursor

load_dotenv()

app = FastAPI()

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# CORS middleware setup
origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://192.168.0.110:5173",
]

# Add GZip middleware for response compression
app.add_middleware(GZipMiddleware, minimum_size=1000)

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


def trigger_file_sync(action="start"):
    """触发file_sync服务，忽略错误以保持插件化特性"""
    try:
        # 容器间通信，使用服务名
        file_sync_url = os.getenv('FILE_SYNC_URL', 'http://file_sync:8090')
        
        response = requests.post(
            f"{file_sync_url}/trigger",
            json={"action": action},
            timeout=5  # 5秒超时
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
def get_posts(page: int = 1, limit: int = 100, liked = None):
    """Fetches a paginated list of posts from the database."""
    # 限制每页最大数量，防止查询过大
    limit = min(limit, 500)
    offset = (page - 1) * limit
    
    # 转换 liked 参数
    liked_filter = None
    if liked is not None:
        liked_filter = str(liked).lower() in ('true', '1', 'yes')
    
    with get_db_connection() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            # 获取总数
            if liked_filter is True:
                cur.execute("SELECT COUNT(*) FROM posts WHERE is_liked = TRUE")
            else:
                cur.execute("SELECT COUNT(*) FROM posts")
            total_count = cur.fetchone()['count']
            
            # 获取分页数据
            if liked_filter is True:
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
def get_tags(page: int = 1, limit: int = 100, liked = None):
    """获取指定posts参数范围内的tags统计信息
    参数:
    - page: 页码 (默认1)
    - limit: 每页posts数量限制 (默认100)  
    - liked: 是否只包含收藏的posts (可选)
    
    返回: 对应posts范围内所有tags的name、count、type信息
    """
    # 限制每页最大数量，防止查询过大
    limit = min(limit, 500)
    offset = (page - 1) * limit
    
    # 转换 liked 参数
    liked_filter = None
    if liked is not None:
        liked_filter = str(liked).lower() in ('true', '1', 'yes')
    
    with get_db_connection() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            # 先获取指定范围的posts
            if liked_filter is True:
                cur.execute(
                    "SELECT id FROM posts WHERE is_liked = TRUE ORDER BY id DESC LIMIT %s OFFSET %s",
                    (limit, offset)
                )
            else:
                cur.execute(
                    "SELECT id FROM posts ORDER BY id DESC LIMIT %s OFFSET %s",
                    (limit, offset)
                )
            
            posts = cur.fetchall()
            if not posts:
                return []
            
            post_ids = [post['id'] for post in posts]
            
            # 查询这些posts关联的所有tags及其统计信息
            placeholders = ','.join(['%s'] * len(post_ids))
            cur.execute(
                f"""
                SELECT 
                    t.name,
                    t.type,
                    COUNT(pt.post_id) as count
                FROM tags t
                JOIN post_tags pt ON t.id = pt.tag_id
                WHERE pt.post_id IN ({placeholders})
                GROUP BY t.id, t.name, t.type
                ORDER BY count DESC, t.name ASC
                """,
                post_ids
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
def search_tags(q: str, page: int = 1, limit: int = 100, liked = None):
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
    
    # 转换 liked 参数
    liked_filter = None
    if liked is not None:
        liked_filter = str(liked).lower() in ('true', '1', 'yes')
    
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
            if liked_filter is True:
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
            if liked_filter is True:
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
            
            # 如果是新增点赞，触发file_sync服务
            if new_liked_status:
                trigger_success = trigger_file_sync("start")
                if trigger_success:
                    logger.info(f"[API] File sync triggered for liked post {post_id}")
                else:
                    logger.warning(f"[API] Failed to trigger file sync for post {post_id}, but like operation succeeded")
            
            return {
                "post_id": post_id,
                "is_liked": new_liked_status,
                "message": f"Post {'liked' if new_liked_status else 'unliked'} successfully"
            }


@app.get("/user-preferences")
def get_user_preferences():
    """获取用户收藏偏好数据，供前端TagManager进行相关度排序
    
    返回用户收藏的posts中各类型标签的统计信息，让前端实现个性化排序算法
    """
    with get_db_connection() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            # 获取用户收藏posts中的标签统计
            cur.execute("""
                SELECT 
                    t.name,
                    t.type,
                    COUNT(pt.post_id) as liked_count,
                    t.count as global_count,
                    CASE 
                        WHEN t.type = 0 THEN 'GENERAL'
                        WHEN t.type = 1 THEN 'ARTIST'
                        WHEN t.type = 3 THEN 'COPYRIGHT'
                        WHEN t.type = 4 THEN 'CHARACTER'
                        WHEN t.type = 6 THEN 'COMPANY'
                        ELSE 'OTHER'
                    END as type_name
                FROM tags t
                JOIN post_tags pt ON t.id = pt.tag_id
                JOIN posts p ON pt.post_id = p.id
                WHERE p.is_liked = TRUE
                GROUP BY t.id, t.name, t.type, t.count
                HAVING COUNT(pt.post_id) >= 2  -- 至少出现2次才有统计意义
                ORDER BY t.type, COUNT(pt.post_id) DESC
            """)
            
            preferences = cur.fetchall()
            
            # 按类型分组
            preferences_by_type = {}
            total_stats = {
                'total_liked_posts': 0,
                'types': {}
            }
            
            for pref in preferences:
                type_name = pref['type_name']
                if type_name not in preferences_by_type:
                    preferences_by_type[type_name] = []
                    total_stats['types'][type_name] = {
                        'total_tags': 0,
                        'total_occurrences': 0
                    }
                
                preferences_by_type[type_name].append({
                    'name': pref['name'],
                    'liked_count': pref['liked_count'],
                    'global_count': pref['global_count'],
                    'preference_ratio': round(pref['liked_count'] / max(pref['global_count'], 1) * 100, 4)
                })
                
                total_stats['types'][type_name]['total_tags'] += 1
                total_stats['types'][type_name]['total_occurrences'] += pref['liked_count']
            
            # 获取收藏posts总数
            cur.execute("SELECT COUNT(*) as count FROM posts WHERE is_liked = TRUE")
            total_stats['total_liked_posts'] = cur.fetchone()['count']
            
            return {
                "preferences_by_type": preferences_by_type,
                "statistics": total_stats,
                "generated_at": time.time()
            }
