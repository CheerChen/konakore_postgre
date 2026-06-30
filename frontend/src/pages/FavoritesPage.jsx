import React, { useState, useReducer, useMemo, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';

import SearchBar from '../components/SearchBar';
import MasonryGrid from '../components/MasonryGrid';
import AppLayout from '../components/AppLayout';
import PaginationControls from '../components/PaginationControls';
import SimplePagination from '../components/SimplePagination';
import LazyImageCard from '../components/LazyImageCard';
import CaptionContent from '../components/CaptionContent';
import { getPosts, searchTags, getSandboxPosts } from '../api';
import { useTag } from '../contexts/TagContext';
import { Box, CircularProgress, Typography, Snackbar, Alert, Button } from '@mui/material';
import { ErrorOutline as ErrorIcon, SearchOff as EmptyIcon } from '@mui/icons-material';
import { usePhotoSwipe } from '../hooks/usePhotoSwipe';
import ImageSizeModal from '../components/ImageSizeModal';
import { usePostsProcessing } from '../hooks/usePostsProcessing';
import { useTranslation } from 'react-i18next';

// Content body extracted so React preserves its identity across renders.
function FavoritesContent({
  isLoading, isError, postsForGrid, currentPage, totalPages, perPage, totalPosts,
  sortOption, setSortOption, setPerPage, setCurrentPage, handlePageChange,
  setImageSizeOpen, isSandbox, sandboxMin, sandboxMax, handleClearSandbox,
  onImageClick, handleLikeChange, handleNotify, columnWidth, searchQuery,
  clearSearch, handleRetry, t,
}) {
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
        visibleCount={postsForGrid.length}
        sortOption={sortOption}
        onSortChange={setSortOption}
        onOpenImageSize={() => setImageSizeOpen(true)}
        sandboxMin={isSandbox ? sandboxMin : null}
        sandboxMax={isSandbox ? sandboxMax : null}
        onClearSandbox={handleClearSandbox}
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
}

// UI state grouped so one logical update is one render.
const uiStateInit = () => ({
  searchQuery: '',
  currentPage: 1,
  perPage: 100,
  sortOption: 'id',
  imageSizeOpen: false,
  columnWidth: Number(localStorage.getItem('konakore_column_width')) || 260,
  snackbar: { open: false, message: '', severity: 'success' },
});

function uiStateReducer(state, action) {
  switch (action.type) {
    case 'SEARCH':
      return { ...state, searchQuery: action.query, currentPage: 1, sortOption: 'id' };
    case 'CLEAR_SEARCH':
      return { ...state, searchQuery: '', currentPage: 1 };
    case 'SET_PAGE':
      return { ...state, currentPage: action.page };
    case 'SET_PER_PAGE':
      return { ...state, perPage: action.perPage, currentPage: 1 };
    case 'SET_SORT':
      return { ...state, sortOption: action.sortOption };
    case 'OPEN_IMAGE_SIZE':
      return { ...state, imageSizeOpen: true };
    case 'CLOSE_IMAGE_SIZE':
      return { ...state, imageSizeOpen: false };
    case 'SET_COLUMN_WIDTH':
      return { ...state, columnWidth: action.width };
    case 'NOTIFY':
      return { ...state, snackbar: { open: true, message: action.message, severity: action.severity } };
    case 'CLOSE_SNACKBAR':
      return { ...state, snackbar: { ...state.snackbar, open: false } };
    case 'CLEAR_SANDBOX':
      return { ...state, currentPage: 1 };
    default:
      return state;
  }
}

const FavoritesPage = () => {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [ui, dispatch] = useReducer(uiStateReducer, undefined, uiStateInit);
  const [postsLikeState, setPostsLikeState] = useState({});

  const handleNotify = useCallback(({ message, severity }) => {
    dispatch({ type: 'NOTIFY', message, severity });
  }, []);
  const handleCloseSnackbar = useCallback((_, reason) => {
    if (reason === 'clickaway') return;
    dispatch({ type: 'CLOSE_SNACKBAR' });
  }, []);

  const {
    extractTagsFromPosts,
    addTagsToCache,
    mergeTagsWithCache,
    getTagColors,
    getTagTranslation,
  } = useTag();

  // Sandbox mode: derived from URL params
  const sandboxMin = searchParams.has('id_min') ? parseInt(searchParams.get('id_min'), 10) : null;
  const sandboxMax = searchParams.has('id_max') ? parseInt(searchParams.get('id_max'), 10) : null;
  const isSandbox = sandboxMin !== null && sandboxMax !== null && !isNaN(sandboxMin) && !isNaN(sandboxMax);

  const handleClearSandbox = useCallback(() => {
    setSearchParams({}, { replace: true });
    dispatch({ type: 'CLEAR_SANDBOX' });
  }, [setSearchParams]);

  const handleLikeChange = useCallback((postId, isLiked) => {
    setPostsLikeState(prev => ({ ...prev, [postId]: isLiked }));
  }, []);

  const { searchQuery, currentPage, perPage, sortOption, imageSizeOpen, columnWidth, snackbar } = ui;

  // --- DATA FETCHING (always liked=true) ---
  const { data: postsData, isLoading: postsLoading, isError: postsErr, refetch: refetchPosts } = useQuery({
    queryKey: ['favorites', currentPage, perPage],
    queryFn: () => getPosts(currentPage, perPage, true),
    enabled: !searchQuery && !isSandbox,
    staleTime: 5 * 60 * 1000,
  });

  const { data: sandboxData, isLoading: sandboxLoading, isError: sandboxErr } = useQuery({
    queryKey: ['favorites-sandbox', sandboxMin, sandboxMax, currentPage, perPage],
    queryFn: () => getSandboxPosts(sandboxMin, sandboxMax, currentPage, perPage, true),
    enabled: isSandbox && !searchQuery,
    staleTime: 5 * 60 * 1000,
  });

  const { data: searchData, isLoading: searchLoading, isError: searchErr, refetch: refetchSearch } = useQuery({
    queryKey: ['favorites-search', searchQuery, currentPage, perPage],
    queryFn: () => searchTags(searchQuery, currentPage, perPage, true),
    enabled: !!searchQuery,
  });

  // --- EVENT HANDLERS ---
  const handleSearch = (query) => dispatch({ type: 'SEARCH', query });
  const clearSearch = () => dispatch({ type: 'CLEAR_SEARCH' });

  const handleTagClick = useCallback((tag) => {
    dispatch({ type: 'SEARCH', query: tag });
  }, []);

  const handlePageChange = (page) => {
    dispatch({ type: 'SET_PAGE', page });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleColumnWidthChange = useCallback((value) => {
    dispatch({ type: 'SET_COLUMN_WIDTH', width: value });
    localStorage.setItem('konakore_column_width', String(value));
  }, []);


  // --- DATA PROCESSING ---
  let posts = [];
  let isLoading = false;
  let isError = false;
  let totalPages = 0;
  let totalPosts = 0;

  if (searchQuery) {
    posts = searchData?.posts || [];
    isLoading = searchLoading;
    isError = searchErr;
    totalPages = searchData?.pagination?.total_pages || 0;
    totalPosts = searchData?.pagination?.total_items || 0;
  } else if (isSandbox) {
    posts = sandboxData?.posts || [];
    isLoading = sandboxLoading;
    isError = sandboxErr;
    totalPages = sandboxData?.pagination?.total_pages || 0;
    totalPosts = sandboxData?.pagination?.total_items || 0;
  } else {
    posts = postsData?.posts || [];
    isLoading = postsLoading;
    isError = postsErr;
    totalPages = postsData?.pagination?.total_pages || 0;
    totalPosts = postsData?.pagination?.total_items || 0;
  }

  // 合并本地收藏状态 + 排序（无过滤、无分组）
  const { postsForGrid } = usePostsProcessing({
    posts,
    sortOption,
    postsLikeState,
  });

  // Tags — sync to cache on change (ref-based dedup, no effect).
  const currentPageTags = useMemo(() => {
    if (!postsForGrid?.length) return [];
    return extractTagsFromPosts(postsForGrid);
  }, [postsForGrid, extractTagsFromPosts]);

  const lastSyncedTagsRef = useRef([]);
  if (currentPageTags.length > 0 && currentPageTags !== lastSyncedTagsRef.current) {
    lastSyncedTagsRef.current = currentPageTags;
    addTagsToCache(currentPageTags);
  }

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
      refetchSearch();
    } else {
      refetchPosts();
    }
  }, [searchQuery, refetchSearch, refetchPosts]);

  // --- RENDER ---

  return (
    <AppLayout>
      <ImageSizeModal
        open={imageSizeOpen}
        onClose={() => dispatch({ type: 'CLOSE_IMAGE_SIZE' })}
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
        overflow: 'visible',
        px: { xs: 1, sm: 2, md: 3 },
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'stretch',
      }}>
        <FavoritesContent
          isLoading={isLoading}
          isError={isError}
          postsForGrid={postsForGrid}
          currentPage={currentPage}
          totalPages={totalPages}
          perPage={perPage}
          totalPosts={totalPosts}
          sortOption={sortOption}
          setSortOption={(v) => dispatch({ type: 'SET_SORT', sortOption: v })}
          setPerPage={(v) => dispatch({ type: 'SET_PER_PAGE', perPage: v })}
          setCurrentPage={(p) => dispatch({ type: 'SET_PAGE', page: p })}
          handlePageChange={handlePageChange}
          setImageSizeOpen={(open) => open ? dispatch({ type: 'OPEN_IMAGE_SIZE' }) : dispatch({ type: 'CLOSE_IMAGE_SIZE' })}
          isSandbox={isSandbox}
          sandboxMin={sandboxMin}
          sandboxMax={sandboxMax}
          handleClearSandbox={handleClearSandbox}
          onImageClick={onImageClick}
          handleLikeChange={handleLikeChange}
          handleNotify={handleNotify}
          columnWidth={columnWidth}
          searchQuery={searchQuery}
          clearSearch={clearSearch}
          handleRetry={handleRetry}
          t={t}
        />
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
