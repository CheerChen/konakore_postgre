"""
Pydantic models for API request and response validation.
Follows Google AIP standards for field naming and structure.
"""
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field, field_validator
from datetime import datetime


# ============================================================================
# Base Models
# ============================================================================

class Post(BaseModel):
    """Post resource representation."""
    id: int
    data: Dict[str, Any] = Field(..., description="Post data from external API")
    processed: bool = Field(default=False, description="Whether the post has been processed")
    liked: bool = Field(default=False, description="Whether the post is liked by the user")
    update_time: datetime = Field(..., description="Last sync timestamp")

    class Config:
        json_schema_extra = {
            "example": {
                "id": 123456,
                "data": {"title": "Example", "url": "https://example.com"},
                "processed": False,
                "liked": True,
                "update_time": "2024-01-01T00:00:00Z"
            }
        }


class Tag(BaseModel):
    """Tag resource representation."""
    id: int
    name: str
    count: int
    type: int
    ambiguous: bool
    update_time: datetime = Field(..., description="Last sync timestamp")

    class Config:
        json_schema_extra = {
            "example": {
                "id": 1,
                "name": "landscape",
                "count": 100,
                "type": 0,
                "ambiguous": False,
                "update_time": "2024-01-01T00:00:00Z"
            }
        }


class TagSummary(BaseModel):
    """Tag summary for aggregated queries."""
    name: str
    type: int
    count: int = Field(..., description="Number of occurrences in the filtered posts")

    class Config:
        json_schema_extra = {
            "example": {
                "name": "landscape",
                "type": 0,
                "count": 42
            }
        }


# ============================================================================
# Request Models
# ============================================================================

class ListPostsRequest(BaseModel):
    """Request model for listing posts."""
    page: int = Field(default=1, ge=1, description="Page number (1-indexed)")
    limit: int = Field(default=100, ge=1, le=500, description="Number of posts per page")
    liked: Optional[bool] = Field(default=None, description="Filter by liked status")

    @field_validator('limit')
    @classmethod
    def validate_limit(cls, v):
        """Ensure limit does not exceed maximum."""
        return min(v, 500)


class ListTagsRequest(BaseModel):
    """Request model for listing tags."""
    page: int = Field(default=1, ge=1, description="Page number (1-indexed)")
    limit: int = Field(default=100, ge=1, le=500, description="Number of posts to consider")
    liked: Optional[bool] = Field(default=None, description="Filter posts by liked status")

    @field_validator('limit')
    @classmethod
    def validate_limit(cls, v):
        """Ensure limit does not exceed maximum."""
        return min(v, 500)


class SearchTagsRequest(BaseModel):
    """Request model for searching tags."""
    q: str = Field(..., min_length=2, description="Search query (minimum 2 characters)")
    page: int = Field(default=1, ge=1, description="Page number (1-indexed)")
    limit: int = Field(default=100, ge=1, le=500, description="Number of posts per page")
    liked: Optional[bool] = Field(default=None, description="Filter by liked status")

    @field_validator('limit')
    @classmethod
    def validate_limit(cls, v):
        """Ensure limit does not exceed maximum."""
        return min(v, 500)


class ToggleLikeRequest(BaseModel):
    """Request model for toggling post like status."""
    # Currently a simple toggle, but can be extended in the future
    pass


# ============================================================================
# Response Models
# ============================================================================

class PaginationInfo(BaseModel):
    """Pagination metadata."""
    current_page: int
    per_page: int
    total_items: int
    total_pages: int
    has_next: bool
    has_prev: bool


class ListPostsResponse(BaseModel):
    """Response model for listing posts."""
    posts: List[Post]
    pagination: PaginationInfo


class ListTagsResponse(BaseModel):
    """Response model for listing tags (aggregated by posts range)."""
    tags: List[TagSummary]


class SearchTagsResponse(BaseModel):
    """Response model for searching tags."""
    posts: List[Post]
    pagination: PaginationInfo
    search_query: str


class GetPostResponse(BaseModel):
    """Response model for getting a single post."""
    post: Optional[Post] = None


class GetTagResponse(BaseModel):
    """Response model for getting a single tag."""
    tag: Optional[Tag] = None


class ToggleLikeResponse(BaseModel):
    """Response model for toggling post like status."""
    post_id: int
    liked: bool
    message: str


class UserPreferenceTag(BaseModel):
    """Tag preference information."""
    name: str
    liked_count: int
    global_count: int
    preference_ratio: float


class UserPreferencesByType(BaseModel):
    """User preferences grouped by tag type."""
    tags: List[UserPreferenceTag]


class UserPreferencesStats(BaseModel):
    """Overall statistics for user preferences."""
    total_liked_posts: int
    types: Dict[str, Dict[str, int]]


class UserPreferencesResponse(BaseModel):
    """Response model for user preferences."""
    preferences_by_type: Dict[str, List[UserPreferenceTag]]
    statistics: UserPreferencesStats
    generated_at: float


class ErrorDetail(BaseModel):
    """Error detail structure following AIP-193."""
    code: str
    message: str
    details: Optional[Dict[str, Any]] = None


class ApiIndexResponse(BaseModel):
    """Response model for API index endpoint."""
    message: str
    version: str
    endpoints: Dict[str, Dict[str, str]]
    examples: Dict[str, str]


# ============================================================================
# Helper Functions
# ============================================================================

def db_post_to_api(db_row: dict) -> dict:
    """
    Convert database post row to API Post model format.
    Maps database field names (is_liked, is_processed, last_synced_at, raw_data)
    to API field names (liked, processed, update_time, data).
    """
    return {
        "id": db_row["id"],
        "data": db_row["raw_data"],
        "processed": db_row.get("is_processed", False),
        "liked": db_row.get("is_liked", False),
        "update_time": db_row["last_synced_at"]
    }


def db_tag_to_api(db_row: dict) -> dict:
    """
    Convert database tag row to API Tag model format.
    Maps database field names (last_synced_at) to API field names (update_time).
    """
    return {
        "id": db_row["id"],
        "name": db_row["name"],
        "count": db_row["count"],
        "type": db_row["type"],
        "ambiguous": db_row["ambiguous"],
        "update_time": db_row["last_synced_at"]
    }
