import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';

import SearchBar from '../components/SearchBar';
import MasonryGrid from '../components/MasonryGrid';
import AppLayout from '../components/AppLayout';
import PaginationControls from '../components/PaginationControls';
import SimplePagination from '../components/SimplePagination';
import LazyImageCard from '../components/LazyImageCard';
import CaptionContent from '../components/CaptionContent';
import { getPosts, searchTags } from '../api';
import { useTag } from '../contexts/TagContext';
import { Box, CircularProgress, Typography } from '@mui/material';
import { usePhotoSwipe } from '../hooks/usePhotoSwipe';

const FavoritesPage = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [perPage, setPerPage] = useState(100);
  const [sortOption, setSortOption] = useState('id');
  const [postsLikeState, setPostsLikeState] = useState({});

  const {
    extractTagsFromPosts,
    addTagsToCache,
    mergeTagsWithCache,
    getTagColors,
    getTagTranslation,
  } = useTag();

  const handleLikeChange = useCallback((postId, isLiked) => {
    setPostsLikeState(prev => ({ ...prev, [postId]: isLiked }));
  }, []);

  // --- DATA FETCHING (always liked=true) ---
  const postsQuery = useQuery({
    queryKey: ['favorites', currentPage, perPage],
    queryFn: () => getPosts(currentPage, perPage, true),
    enabled: !searchQuery,
    staleTime: 5 * 60 * 1000,
  });

  const searchQueryResults = useQuery({
    queryKey: ['favorites-search', searchQuery, currentPage, perPage],
    queryFn: () => searchTags(searchQuery, currentPage, perPage, true),
    enabled: !!searchQuery,
  });

  // --- EVENT HANDLERS ---
  const handleSearch = (query) => {
    setSearchQuery(query);
    setCurrentPage(1);
    setSortOption('id');
  };

  const clearSearch = () => {
    setSearchQuery('');
    setCurrentPage(1);
  };

  const handleTagClick = useCallback((tag) => {
    setSearchQuery(tag);
    setCurrentPage(1);
    setSortOption('id');
  }, []);

  const handlePageChange = (page) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // --- DATA PROCESSING ---
  let posts = [];
  let isLoading = false;
  let isError = false;
  let totalPages = 0;
  let totalPosts = 0;

  if (searchQuery) {
    const searchData = searchQueryResults.data;
    posts = searchData?.posts || [];
    isLoading = searchQueryResults.isLoading;
    isError = searchQueryResults.isError;
    totalPages = searchData?.pagination?.total_pages || 0;
    totalPosts = searchData?.pagination?.total_items || 0;
  } else {
    const postsData = postsQuery.data;
    posts = postsData?.posts || [];
    isLoading = postsQuery.isLoading;
    isError = postsQuery.isError;
    totalPages = postsData?.pagination?.total_pages || 0;
    totalPosts = postsData?.pagination?.total_items || 0;
  }

  // 合并本地收藏状态 + 排序（无过滤、无分组）
  const postsForGrid = useMemo(() => {
    if (!posts.length) return posts;

    const postsWithUpdatedLikes = posts.map(post => ({
      ...post,
      liked: postsLikeState.hasOwnProperty(post.id) ? postsLikeState[post.id] : post.liked
    }));

    return [...postsWithUpdatedLikes].sort((a, b) => {
      switch (sortOption) {
        case 'score':
          return (b.data.score || 0) - (a.data.score || 0);
        case 'id':
          return (b.id || 0) - (a.id || 0);
        case 'file_size':
          return (b.data.file_size || 0) - (a.data.file_size || 0);
        case 'resolution': {
          const aPixels = (a.data.width || 0) * (a.data.height || 0);
          const bPixels = (b.data.width || 0) * (b.data.height || 0);
          return bPixels - aPixels;
        }
        case 'waifu_pillow': {
          const aRatio = (a.data.width || 0) / (a.data.height || 1);
          const bRatio = (b.data.width || 0) / (b.data.height || 1);
          const aIsWaifu = aRatio > 2 ? 1 : 0;
          const bIsWaifu = bRatio > 2 ? 1 : 0;
          if (aIsWaifu !== bIsWaifu) return bIsWaifu - aIsWaifu;
          return bRatio - aRatio;
        }
        case 'shuffle': {
          const seedA = (a.id || 0) * 9301 + 49297;
          const seedB = (b.id || 0) * 9301 + 49297;
          return (seedA % 233280) - (seedB % 233280);
        }
        default:
          return 0;
      }
    });
  }, [posts, sortOption, postsLikeState]);

  // Tags
  const currentPageTags = useMemo(() => {
    if (!postsForGrid?.length) return [];
    return extractTagsFromPosts(postsForGrid);
  }, [postsForGrid, extractTagsFromPosts]);

  useEffect(() => {
    if (currentPageTags.length > 0) addTagsToCache(currentPageTags);
  }, [currentPageTags, addTagsToCache]);

  const availableTags = useMemo(() => {
    return mergeTagsWithCache(currentPageTags);
  }, [currentPageTags, mergeTagsWithCache]);

  // --- PHOTOSWIPE (no groupMap) ---
  const { onImageClick } = usePhotoSwipe({
    displayPosts: postsForGrid,
    allPosts: postsForGrid,
    groupMap: null,
    handleTagClick,
    handleLikeChange,
    postsLikeState,
    posts,
  });

  // --- RENDER ---
  const renderContent = () => {
    if (isLoading) return <CircularProgress />;
    if (isError) return <Typography color="error">Error loading favorites.</Typography>;

    return (
      <>
        <PaginationControls
          currentPage={currentPage}
          totalPages={totalPages}
          perPage={perPage}
          onPageChange={handlePageChange}
          onPerPageChange={(newPerPage) => { setPerPage(newPerPage); setCurrentPage(1); }}
          isLoading={isLoading}
          totalItems={totalPosts}
          sortOption={sortOption}
          onSortChange={setSortOption}
        />
        {isLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px', flexDirection: 'column', gap: 2 }}>
            <CircularProgress size={60} />
            <Typography variant="body1" color="text.secondary">Loading favorites...</Typography>
          </Box>
        ) : (
          <MasonryGrid
            posts={postsForGrid}
            onImageClick={onImageClick}
            LazyImageCard={LazyImageCard}
            isLoading={isLoading}
            onLikeChange={handleLikeChange}
          />
        )}
        <SimplePagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={handlePageChange}
          isLoading={isLoading}
        />
      </>
    );
  };

  return (
    <AppLayout>
      <SearchBar
        onSearch={handleSearch}
        searchQuery={searchQuery}
        onClearSearch={clearSearch}
        totalPosts={totalPosts}
        availableTags={availableTags}
      />

      <Box sx={{
        mx: 'auto',
        maxWidth: '100%',
        minWidth: '100%',
        width: '100%',
        overflow: 'hidden',
        px: { xs: 1, sm: 2, md: 3 },
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'stretch',
      }}>
        {renderContent()}
      </Box>

      {/* Hidden caption content for PhotoSwipe */}
      {postsForGrid.map((post) => (
        <CaptionContent
          key={`caption-${post.id}`}
          post={post}
          postsLikeState={postsLikeState}
          getTagColors={getTagColors}
          getTagTranslation={getTagTranslation}
          handleTagClick={handleTagClick}
        />
      ))}
    </AppLayout>
  );
};

export default FavoritesPage;
