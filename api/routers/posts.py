"""
Posts router - handles all post-related endpoints.
"""
from fastapi import APIRouter, HTTPException, Query
from psycopg2.extras import RealDictCursor
from typing import Optional
import logging

from models import (
    ListPostsResponse, Post, PaginationInfo,
    GetPostResponse, ToggleLikeResponse,
    db_post_to_api
)
from utils import get_db_connection, trigger_file_sync

router = APIRouter(prefix="/v1/posts", tags=["posts"])
logger = logging.getLogger(__name__)


@router.get("", response_model=ListPostsResponse)
def list_posts(
    page: int = Query(default=1, ge=1, description="Page number (1-indexed)"),
    limit: int = Query(default=100, ge=1, le=500, description="Number of posts per page"),
    liked: Optional[bool] = Query(default=None, description="Filter by liked status")
):
    """
    List posts with pagination.
    
    Supports filtering by liked status.
    """
    # Limit enforcement
    limit = min(limit, 500)
    offset = (page - 1) * limit
    
    # Convert liked parameter
    liked_filter = None
    if liked is not None:
        liked_filter = bool(liked)
    
    with get_db_connection() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            # Get total count
            if liked_filter is True:
                cur.execute("SELECT COUNT(*) FROM posts WHERE is_liked = TRUE")
            else:
                cur.execute("SELECT COUNT(*) FROM posts")
            total_count = cur.fetchone()['count']
            
            # Get paginated data
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
            db_posts = cur.fetchall()
            
            # Convert to API models
            posts = [Post(**db_post_to_api(row)) for row in db_posts]
            
            # Calculate pagination
            total_pages = (total_count + limit - 1) // limit
            
            pagination = PaginationInfo(
                current_page=page,
                per_page=limit,
                total_items=total_count,
                total_pages=total_pages,
                has_next=page < total_pages,
                has_prev=page > 1
            )
            
            return ListPostsResponse(posts=posts, pagination=pagination)


@router.get("/{post_id}", response_model=GetPostResponse)
def get_post(post_id: int):
    """Get a specific post by ID."""
    with get_db_connection() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                "SELECT id, raw_data, is_processed, is_liked, last_synced_at FROM posts WHERE id = %s",
                (post_id,)
            )
            db_post = cur.fetchone()
            
            if not db_post:
                raise HTTPException(status_code=404, detail=f"Post with id {post_id} not found")
            
            post = Post(**db_post_to_api(db_post))
            return GetPostResponse(post=post)


@router.post("/{post_id}:like", response_model=ToggleLikeResponse)
def like_post(post_id: int):
    """
    Like a post (custom method following AIP-136).
    
    This is an idempotent operation - liking an already liked post has no effect.
    Triggers file sync service when a post is newly liked.
    """
    with get_db_connection() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            # Check if post exists and get current status
            cur.execute("SELECT id, is_liked FROM posts WHERE id = %s", (post_id,))
            post = cur.fetchone()
            
            if not post:
                raise HTTPException(
                    status_code=404,
                    detail=f"Post with id {post_id} not found"
                )
            
            # Set liked status to true
            was_already_liked = post["is_liked"]
            if not was_already_liked:
                cur.execute(
                    "UPDATE posts SET is_liked = TRUE WHERE id = %s",
                    (post_id,)
                )
                conn.commit()
                
                # Trigger file_sync service for newly liked post
                trigger_success = trigger_file_sync("start")
                if trigger_success:
                    logger.info(f"[API] File sync triggered for liked post {post_id}")
                else:
                    logger.warning(f"[API] Failed to trigger file sync for post {post_id}, but like operation succeeded")
            
            return ToggleLikeResponse(
                post_id=post_id,
                liked=True,
                message="Post liked successfully" if not was_already_liked else "Post already liked"
            )


@router.post("/{post_id}:unlike", response_model=ToggleLikeResponse)
def unlike_post(post_id: int):
    """
    Unlike a post (custom method following AIP-136).
    
    This is an idempotent operation - unliking an already unliked post has no effect.
    """
    with get_db_connection() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            # Check if post exists and get current status
            cur.execute("SELECT id, is_liked FROM posts WHERE id = %s", (post_id,))
            post = cur.fetchone()
            
            if not post:
                raise HTTPException(
                    status_code=404,
                    detail=f"Post with id {post_id} not found"
                )
            
            # Set liked status to false
            was_liked = post["is_liked"]
            if was_liked:
                cur.execute(
                    "UPDATE posts SET is_liked = FALSE WHERE id = %s",
                    (post_id,)
                )
                conn.commit()
            
            return ToggleLikeResponse(
                post_id=post_id,
                liked=False,
                message="Post unliked successfully" if was_liked else "Post already unliked"
            )
