import axios from 'axios';

export const apiClient = axios.create({
  baseURL: '/api',
});

export const getPosts = async (page = 1, limit = 100, liked = null, likedArtists = null) => {
  const params = new URLSearchParams({ page: page.toString(), limit: limit.toString() });
  if (liked !== null) {
    params.append('liked', liked.toString());
  }
  if (likedArtists !== null) {
    params.append('liked_artists', likedArtists.toString());
  }
  const response = await apiClient.get(`/v1/posts?${params}`);
  return response.data;
};

export const getTags = async (page = 1, limit = 100, liked = null) => {
  const params = new URLSearchParams({ page: page.toString(), limit: limit.toString() });
  if (liked !== null) {
    params.append('liked', liked.toString());
  }
  const response = await apiClient.get(`/v1/tags?${params}`);
  return response.data;
};

export const searchTags = async (query, page = 1, pageSize = 100, liked = null) => {
  const requestBody = { 
    query: query, 
    page: page,
    pageSize: pageSize
  };
  if (liked !== null) {
    requestBody.liked = liked;
  }
  const response = await apiClient.post('/v1/tags:search', requestBody);
  return response.data;
};

export const likePost = async (postId) => {
  const response = await apiClient.post(`/v1/posts/${postId}:like`);
  return response.data;
};

export const unlikePost = async (postId) => {
  const response = await apiClient.post(`/v1/posts/${postId}:unlike`);
  return response.data;
};

// 保留旧的 toggleLike 函数以保持向后兼容，但内部实现需要先获取当前状态
export const toggleLike = async (postId, currentLikeState) => {
  if (currentLikeState) {
    return await unlikePost(postId);
  } else {
    return await likePost(postId);
  }
};

export const getUserPreferences = async () => {
  const response = await apiClient.get('/v1/users/me/preferences');
  return response.data;
};

export const getLikedPosts = async (page = 1, limit = 3000, fields = 'tags,score,rating') => {
  const params = new URLSearchParams({ 
    page: page.toString(), 
    limit: limit.toString(),
    fields: fields
  });
  const response = await apiClient.get(`/v1/users/me/liked-posts?${params}`);
  return response.data;
};
