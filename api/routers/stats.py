"""
Stats router - handles statistics and analytics endpoints.
"""
from fastapi import APIRouter
from psycopg2.extras import RealDictCursor
import time
import logging

from models import (
    StatsOverviewResponse, StatsDistributionBucket, StatsRatingBreakdown
)
from utils import get_db_connection

# In-memory cache for stats overview
_stats_cache = {
    'result': None,
    'liked_count': None,  # cache key: invalidate when liked count changes
}

router = APIRouter(prefix="/v1/stats", tags=["stats"])
logger = logging.getLogger(__name__)

NUM_BUCKETS = 80


@router.get("/overview", response_model=StatsOverviewResponse)
def get_stats_overview():
    """
    Get a comprehensive statistics overview in a single request.

    Returns:
    - Summary: total posts, total liked, like ratio
    - ID distribution: 80 equal-width buckets from min to max ID, newest first
    - Rating breakdown: count of s/q/e ratings for all posts and liked posts

    Results are cached in memory and invalidated when the liked count changes.
    """
    with get_db_connection() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            # Check if cache is valid
            cur.execute("SELECT COUNT(*) as count FROM posts WHERE is_liked = TRUE")
            liked_count = cur.fetchone()['count']

            if (_stats_cache['result'] is not None
                    and _stats_cache['liked_count'] == liked_count):
                return _stats_cache['result']

            # --- Summary ---
            cur.execute("SELECT COUNT(*) as count FROM posts")
            total_posts = cur.fetchone()['count']
            total_liked = liked_count
            ratio = round(total_liked / max(total_posts, 1), 4)

            # --- ID Distribution Buckets ---
            cur.execute("SELECT MIN(id) as min_id, MAX(id) as max_id FROM posts")
            range_row = cur.fetchone()
            min_id = range_row['min_id'] or 0
            max_id = range_row['max_id'] or 0

            buckets = []
            if total_posts > 0 and max_id > min_id:
                # Use width_bucket to assign each post to one of NUM_BUCKETS buckets
                # width_bucket(value, low, high, count) returns 1..count for values in [low, high)
                # and count+1 for values == high. We add 1 to max_id to make it inclusive.
                cur.execute("""
                    SELECT
                        width_bucket(id, %(min_id)s, %(max_id_exc)s, %(num_buckets)s) AS bucket,
                        COUNT(*) AS total_count,
                        COUNT(*) FILTER (WHERE is_liked = TRUE) AS liked_count
                    FROM posts
                    GROUP BY bucket
                    ORDER BY bucket
                """, {
                    'min_id': min_id,
                    'max_id_exc': max_id + 1,
                    'num_buckets': NUM_BUCKETS,
                })

                bucket_rows = {row['bucket']: row for row in cur.fetchall()}
                bucket_width = (max_id - min_id + 1) / NUM_BUCKETS

                for i in range(1, NUM_BUCKETS + 1):
                    id_start = min_id + int((i - 1) * bucket_width)
                    id_end = min_id + int(i * bucket_width) - 1 if i < NUM_BUCKETS else max_id
                    row = bucket_rows.get(i)
                    buckets.append(StatsDistributionBucket(
                        id_start=id_start,
                        id_end=id_end,
                        total_count=row['total_count'] if row else 0,
                        liked_count=row['liked_count'] if row else 0,
                    ))

                # Newest first
                buckets.reverse()

            # --- Rating Breakdown ---
            cur.execute("""
                SELECT
                    raw_data->>'rating' AS rating,
                    COUNT(*) AS total_count,
                    COUNT(*) FILTER (WHERE is_liked = TRUE) AS liked_count
                FROM posts
                WHERE raw_data->>'rating' IS NOT NULL
                GROUP BY raw_data->>'rating'
                ORDER BY raw_data->>'rating'
            """)

            ratings = [
                StatsRatingBreakdown(
                    rating=row['rating'],
                    total_count=row['total_count'],
                    liked_count=row['liked_count'],
                )
                for row in cur.fetchall()
            ]

            result = StatsOverviewResponse(
                total_posts=total_posts,
                total_liked=total_liked,
                ratio=ratio,
                buckets=buckets,
                ratings=ratings,
                generated_at=time.time(),
            )

            # Update cache
            _stats_cache['result'] = result
            _stats_cache['liked_count'] = liked_count

            logger.info(
                f"[API] Stats overview: {total_posts} posts, {total_liked} liked, "
                f"{len(buckets)} buckets, {len(ratings)} ratings"
            )

            return result
