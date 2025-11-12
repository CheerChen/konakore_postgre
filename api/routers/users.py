"""
Users router - handles all user-related endpoints.
"""
from fastapi import APIRouter
from psycopg2.extras import RealDictCursor
import time
import logging

from models import UserPreferencesResponse, UserPreferenceTag, UserPreferencesStats
from utils import get_db_connection

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
