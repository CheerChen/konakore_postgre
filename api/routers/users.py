"""
Users router - handles all user-related endpoints.
"""
from fastapi import APIRouter, Query
from psycopg2.extras import RealDictCursor
import time
import logging
from typing import Optional

import math

from models import (
    UserPreferencesResponse, UserPreferenceTag, UserPreferencesStats,
    ListLikedPostsResponse, LikedPostItem, PaginationInfo,
    RelevanceWeightsResponse
)
from utils import get_db_connection

# In-memory cache for relevance weights
_relevance_cache = {
    'weights': None,
    'liked_count': None,  # cache key: invalidate when liked count changes
}

# TF-IDF type weights (mirrors frontend TFIDF_HYBRID_CONFIG)
TYPE_WEIGHTS = {
    0: 0.4,   # GENERAL
    1: 3.0,   # ARTIST
    3: 2.5,   # COPYRIGHT
    4: 2.0,   # CHARACTER
    5: 0.1,   # META
    6: 2.0,   # COMPANY
}

router = APIRouter(prefix="/v1/users", tags=["users"])
logger = logging.getLogger(__name__)


@router.get("/me/preferences", response_model=UserPreferencesResponse)
def get_current_user_preferences():
    """
    Get current user's preference statistics based on liked posts.
    
    Returns tag statistics from liked posts for personalized sorting and recommendations.
    This endpoint uses '/me' as an alias for the current user (following resource naming best practices).
    
    In a multi-tenant system, this would use authentication to identify the user.
    Currently returns preferences for the single implicit user.
    """
    with get_db_connection() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            # Get tag statistics from liked posts
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
                HAVING COUNT(pt.post_id) >= 2  -- Only include tags appearing at least twice
                ORDER BY t.type, COUNT(pt.post_id) DESC
            """)
            
            preferences = cur.fetchall()
            
            # Group by type
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
                
                preferences_by_type[type_name].append(UserPreferenceTag(
                    name=pref['name'],
                    liked_count=pref['liked_count'],
                    global_count=pref['global_count'],
                    preference_ratio=round(pref['liked_count'] / max(pref['global_count'], 1) * 100, 4)
                ))
                
                total_stats['types'][type_name]['total_tags'] += 1
                total_stats['types'][type_name]['total_occurrences'] += pref['liked_count']
            
            # Get total liked posts count
            cur.execute("SELECT COUNT(*) as count FROM posts WHERE is_liked = TRUE")
            total_stats['total_liked_posts'] = cur.fetchone()['count']
            
            return UserPreferencesResponse(
                preferences_by_type=preferences_by_type,
                statistics=UserPreferencesStats(**total_stats),
                generated_at=time.time()
            )


@router.get("/me/liked-posts", response_model=ListLikedPostsResponse)
def get_current_user_liked_posts(
    page: int = Query(default=1, ge=1, description="Page number (1-indexed)"),
    limit: int = Query(default=3000, ge=1, le=5000, description="Number of posts per page (default 3000, max 5000)"),
    fields: str = Query(default="tags,score,rating", description="Comma-separated fields to return")
):
    """
    Get current user's liked posts for TF-IDF learning and preference modeling.
    
    Returns lightweight post data with only the requested fields to minimize data transfer.
    Default limit is 3000 posts which should be sufficient for building accurate user profiles.
    
    Recommended client-side caching: 30 minutes (same as preferences endpoint).
    
    Fields:
    - tags: Space-separated tag string (required for TF-IDF)
    - score: Post score/popularity
    - rating: Content rating (s=safe, q=questionable, e=explicit)
    
    In a multi-tenant system, this would use authentication to identify the user.
    Currently returns liked posts for the single implicit user.
    """
    # Enforce limit
    limit = min(limit, 5000)
    offset = (page - 1) * limit
    
    # Parse requested fields
    requested_fields = set(fields.split(','))
    
    with get_db_connection() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            # Get total count
            cur.execute("SELECT COUNT(*) as count FROM posts WHERE is_liked = TRUE")
            result = cur.fetchone()
            total_count = result['count'] if result else 0
            
            # Get liked posts with raw_data
            cur.execute("""
                SELECT id, raw_data
                FROM posts 
                WHERE is_liked = TRUE 
                ORDER BY id DESC 
                LIMIT %s OFFSET %s
            """, (limit, offset))
            
            db_posts = cur.fetchall()
            
            # Extract only requested fields from raw_data
            posts = []
            for row in db_posts:
                post_data = {'id': row['id']}
                raw = row['raw_data']
                
                # tags field is required for TF-IDF
                if 'tags' in requested_fields:
                    post_data['tags'] = raw.get('tags', '')
                else:
                    post_data['tags'] = ''  # Always include tags field
                
                if 'score' in requested_fields:
                    post_data['score'] = raw.get('score', 0)
                
                if 'rating' in requested_fields:
                    post_data['rating'] = raw.get('rating', 's')
                
                posts.append(LikedPostItem(**post_data))
            
            # Calculate pagination
            total_pages = (total_count + limit - 1) // limit if total_count > 0 else 0
            
            pagination = PaginationInfo(
                current_page=page,
                per_page=limit,
                total_items=total_count,
                total_pages=total_pages,
                has_next=page < total_pages,
                has_prev=page > 1
            )
            
            return ListLikedPostsResponse(posts=posts, pagination=pagination)


def _invalidate_relevance_cache():
    """Invalidate relevance weights cache. Call on like/unlike."""
    _relevance_cache['weights'] = None
    _relevance_cache['liked_count'] = None


@router.get("/me/relevance-weights", response_model=RelevanceWeightsResponse)
def get_relevance_weights():
    """
    Get TF-IDF relevance weights based on user's liked posts.

    Computes tag weights using:
    - TF: how many liked posts contain each tag (sublinear: 1 + ln(tf))
    - IDF: ln(total_posts / tag.count) from the tags table
    - Type weight: artist=3.0, copyright=2.5, character=2.0, general=0.4

    Results are cached in memory and invalidated on like/unlike.
    """
    with get_db_connection() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            # Check if cache is valid
            cur.execute("SELECT COUNT(*) as count FROM posts WHERE is_liked = TRUE")
            liked_count = cur.fetchone()['count']

            if (_relevance_cache['weights'] is not None
                and _relevance_cache['liked_count'] == liked_count):
                return _relevance_cache['weights']

            # Get total posts count
            cur.execute("SELECT COUNT(*) as count FROM posts")
            total_posts = cur.fetchone()['count']

            if liked_count == 0:
                result = RelevanceWeightsResponse(
                    weights={},
                    total_posts=total_posts,
                    liked_posts_count=0,
                    generated_at=time.time()
                )
                _relevance_cache['weights'] = result
                _relevance_cache['liked_count'] = liked_count
                return result

            # Compute TF-IDF in one SQL query:
            # TF = count of liked posts containing each tag
            # IDF data = tag.count (global), tag.type
            cur.execute("""
                SELECT
                    t.name,
                    t.type,
                    GREATEST(t.count, 1) as global_count,
                    COUNT(DISTINCT pt.post_id) as liked_tf
                FROM post_tags pt
                JOIN posts p ON pt.post_id = p.id
                JOIN tags t ON pt.tag_id = t.id
                WHERE p.is_liked = TRUE
                  AND t.name NOT LIKE 'tagme%%'
                GROUP BY t.id, t.name, t.type, t.count
            """)

            rows = cur.fetchall()

            weights = {}
            for row in rows:
                tf = row['liked_tf']
                df = row['global_count']
                tag_type = row['type']
                type_weight = TYPE_WEIGHTS.get(tag_type, 1.0)

                # sublinear TF × IDF × typeWeight
                weight = (1 + math.log(tf)) * math.log(total_posts / df) * type_weight
                if weight > 0:
                    weights[row['name']] = round(weight, 4)

            result = RelevanceWeightsResponse(
                weights=weights,
                total_posts=total_posts,
                liked_posts_count=liked_count,
                generated_at=time.time()
            )

            _relevance_cache['weights'] = result
            _relevance_cache['liked_count'] = liked_count

            logger.info(f"[API] Computed relevance weights: {len(weights)} tags, {liked_count} liked posts")

            return result
