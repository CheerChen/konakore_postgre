import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
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
import { Box, CircularProgress, Typography, Snackbar, Alert, Button } from '@mui/material';
import { ErrorOutline as ErrorIcon, SearchOff as EmptyIcon } from '@mui/icons-material';
import { usePhotoSwipe } from '../hooks/usePhotoSwipe';
import ImageSizeModal from '../components/ImageSizeModal';
import { usePostsProcessing } from '../hooks/usePostsProcessing';
import { useTranslation } from 'react-i18next';

const FavoritesPage = () => {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [perPage, setPerPage] = useState(100);
  const [sortOption, setSortOption] = useState('id');
  const [postsLikeState, setPostsLikeState] = useState({});
  const [imageSizeOpen, setImageSizeOpen] = useState(false);
  const [columnWidth, setColumnWidth] = useState(() => {
    const saved = localStorage.getItem('konakore_column_width');
    return saved ? Number(saved) : 260;
  });
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });

  const handleNotify = useCallback(({ message, severity }) => {
    setSnackbar({ open: true, message, severity });
  }, []);
  const handleCloseSnackbar = useCallback((_, reason) => {
    if (reason === 'clickaway') return;
    setSnackbar(prev => ({ ...prev, open: false }));
  }, []);

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

  const handleColumnWidthChange = useCallback((value) => {
    setColumnWidth(value);
    localStorage.setItem('konakore_column_width', String(value));
  }, []);


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
  const { postsForGrid } = usePostsProcessing({
    posts,
    sortOption,
    postsLikeState,
  });

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
  const { onImageClick, activePostId, captionContainerRef, closeLightboxAndSearch } = usePhotoSwipe({
    displayPosts: postsForGrid,
    allPosts: postsForGrid,
    groupMap: null,
    handleTagClick,
    handleLikeChange,
    postsLikeState,
    posts,
  });

  const activePost = useMemo(() => {
    if (!activePostId) return null;
    return postsForGrid.find(p => p.id === activePostId) || null;
  }, [activePostId, postsForGrid]);

  const handleRetry = useCallback(() => {
    if (searchQuery) {
      searchQueryResults.refetch();
    } else {
      postsQuery.refetch();
    }
  }, [searchQuery, searchQueryResults, postsQuery]);

  // --- RENDER ---
  const renderContent = () => {
    if (isLoading) {
      return (
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '300px' }}>
          <CircularProgress />
        </Box>
      );
    }
    if (isError) {
      return (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, py: 8 }}>
          <ErrorIcon sx={{ fontSize: 48, color: 'error.main' }} />
          <Typography color="error">{t('status.loadError')}</Typography>
          <Button variant="outlined" onClick={handleRetry}>{t('actions.retry')}</Button>
        </Box>
      );
    }

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
          onOpenImageSize={() => setImageSizeOpen(true)}
        />
        {postsForGrid.length > 0 ? (
          <MasonryGrid
            posts={postsForGrid}
            onImageClick={onImageClick}
            LazyImageCard={LazyImageCard}
            isLoading={isLoading}
            onLikeChange={handleLikeChange}
            onNotify={handleNotify}
            columnWidth={columnWidth}
          />
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, py: 8 }}>
            <EmptyIcon sx={{ fontSize: 48, color: 'text.disabled' }} />
            <Typography color="text.secondary">{t('status.noFavorites')}</Typography>
            {searchQuery && (
              <Button variant="outlined" size="small" onClick={clearSearch}>{t('actions.clearSearch')}</Button>
            )}
          </Box>
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
      <ImageSizeModal
        open={imageSizeOpen}
        onClose={() => setImageSizeOpen(false)}
        imageMinWidth={columnWidth}
        onImageMinWidthChange={handleColumnWidthChange}
      />
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

      {/* PhotoSwipe caption via Portal */}
      {activePost && captionContainerRef.current && createPortal(
        <CaptionContent
          post={activePost}
          postsLikeState={postsLikeState}
          getTagColors={getTagColors}
          getTagTranslation={getTagTranslation}
          handleTagClick={closeLightboxAndSearch}
        />,
        captionContainerRef.current
      )}

      <Snackbar
        open={snackbar.open}
        autoHideDuration={3000}
        onClose={handleCloseSnackbar}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      >
        <Alert onClose={handleCloseSnackbar} severity={snackbar.severity} variant="filled" sx={{ width: '100%' }}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </AppLayout>
  );
};

export default FavoritesPage;
