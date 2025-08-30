import axios from 'axios';

export const apiClient = axios.create({
  baseURL: '/api',
});

export const getPosts = async (page = 1, limit = 100, liked = null) => {
  const params = new URLSearchParams({ page: page.toString(), limit: limit.toString() });
  if (liked !== null) {
    params.append('liked', liked.toString());
  }
  const response = await apiClient.get(`/posts?${params}`);
  return response.data;
};

export const getTags = async (page = 1, limit = 100, liked = null) => {
  const params = new URLSearchParams({ page: page.toString(), limit: limit.toString() });
  if (liked !== null) {
    params.append('liked', liked.toString());
  }
  const response = await apiClient.get(`/tags?${params}`);
  return response.data;
};

export const searchTags = async (query, page = 1, limit = 100, liked = null) => {
  const params = new URLSearchParams({ 
    q: query, 
    page: page.toString(), 
    limit: limit.toString() 
  });
  if (liked !== null) {
    params.append('liked', liked.toString());
  }
  const response = await apiClient.get(`/search/tags?${params}`);
  return response.data;
};

export const toggleLike = async (postId) => {
  const response = await apiClient.put(`/posts/${postId}/like`);
  return response.data;
};
