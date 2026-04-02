import React, { useState, useMemo, useEffect, useCallback, useTransition } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';

import SearchBar from '../components/SearchBar';
import MasonryGrid from '../components/MasonryGrid';
import AppLayout from '../components/AppLayout';
import PaginationControls from '../components/PaginationControls';
import SimplePagination from '../components/SimplePagination';
import LazyImageCard from '../components/LazyImageCard';
import { getPosts, searchTags } from '../api';
import { useTag } from '../contexts/TagContext';
import { tagManager } from '../utils/TagManager';
import { Box, CircularProgress, Typography, Snackbar, Alert, Button } from '@mui/material';
import { ErrorOutline as ErrorIcon, SearchOff as EmptyIcon } from '@mui/icons-material';
import ExcludedTagsModal from '../components/ExcludedTagsModal';
import RelevanceFilterModal from '../components/RelevanceFilterModal';
import ImageSizeModal from '../components/ImageSizeModal';
import { usePhotoSwipe } from '../hooks/usePhotoSwipe';
import { usePostsProcessing } from '../hooks/usePostsProcessing';
import CaptionContent from '../components/CaptionContent';
import { useTranslation } from 'react-i18next';

const HomePage = () => {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [perPage, setPerPage] = useState(100);
  const [sortOption, setSortOption] = useState('id');
  const [postsLikeState, setPostsLikeState] = useState({});
  const [excludedTagsOpen, setExcludedTagsOpen] = useState(false);
  const [relevanceFilterOpen, setRelevanceFilterOpen] = useState(false);
  const [weightMap, setWeightMap] = useState(new Map());
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

  // 排除标签和相关度阈值，从 tagManager 初始化
  const [excludedTags, setExcludedTags] = useState(() => {
    const config = tagManager.getExcludedPostTagsConfig();
    return Array.isArray(config?.tags) ? config.tags : [];
  });
  const [relevanceThreshold, setRelevanceThreshold] = useState(() => {
    const config = tagManager.getRelevanceFilterConfig();
    return Number(config?.threshold) || 0;
  });

  const {
    fetchTagInfo,
    addTagsToCache,
    extractTagsFromPosts,
    mergeTagsWithCache,
    getTagColors,
    getTagTranslation,
    isLoading: tagsLoading
  } = useTag();

  // 从后端获取 TF-IDF 权重
  useEffect(() => {
    let cancelled = false;
    tagManager.fetchRelevanceWeights().then(weights => {
      if (!cancelled && weights?.size) {
        setWeightMap(weights);
      }
    });
    return () => { cancelled = true; };
  }, []);

  // 当页面或筛选条件变化时，获取并缓存tag信息
  useEffect(() => {
    const fetchTagInfoData = async () => {
      try {
        await fetchTagInfo(currentPage, perPage, null);
      } catch (error) {
        console.warn('Failed to fetch tag info:', error);
      }
    };
    const timeoutId = setTimeout(fetchTagInfoData, 300);
    return () => clearTimeout(timeoutId);
  }, [currentPage, perPage, fetchTagInfo]);

  const handleLikeChange = useCallback((postId, isLiked) => {
    setPostsLikeState(prev => ({ ...prev, [postId]: isLiked }));
  }, []);

  // --- DATA FETCHING ---
  const postsQuery = useQuery({
    queryKey: ['posts', currentPage, perPage],
    queryFn: () => getPosts(currentPage, perPage),
    enabled: !searchQuery,
    staleTime: 5 * 60 * 1000,
  });

  const searchQueryResults = useQuery({
    queryKey: ['search', searchQuery, currentPage, perPage],
    queryFn: () => searchTags(searchQuery, currentPage, perPage),
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

  const handlePerPageChange = (newPerPage) => {
    setPerPage(newPerPage);
    setCurrentPage(1);
  };

  const handleSortChange = (newSortOption) => {
    setSortOption(newSortOption);
  };


  const handleExcludedTagsChange = (newTags) => {
    setExcludedTags(newTags);
    tagManager.setExcludedPostTagsConfig({ tags: newTags });
  };

  const [, startTransition] = useTransition();
  const handleRelevanceThresholdChange = useCallback((newThreshold) => {
    startTransition(() => {
      setRelevanceThreshold(newThreshold);
      tagManager.setRelevanceFilterConfig({ threshold: newThreshold });
    });
  }, []);

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

  // 预计算所有 post 的相关度分数（使用后端 TF-IDF 权重）
  const postScoresMap = useMemo(() => {
    const map = new Map();
    if (!posts?.length || !weightMap.size) return map;
    posts.forEach(post => {
      map.set(post.id, tagManager.scorePost(post, weightMap));
    });
    return map;
  }, [posts, weightMap]);

  // --- MEMOIZED DATA FOR RENDERING ---
  const {
    postsForGrid,
    displayPosts: groupedDisplayPosts,
    groupMap,
    excludedCountOnPage,
    relevanceRemovedCount,
  } = usePostsProcessing({
    posts,
    sortOption,
    postsLikeState,
    excludedTags,
    relevanceThreshold,
    postScoresMap,
    enableGrouping: true,
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

  // --- PHOTOSWIPE ---
  const { onImageClick, activePostId, captionContainerRef, closeLightboxAndSearch } = usePhotoSwipe({
    displayPosts: groupedDisplayPosts,
    allPosts: postsForGrid,
    groupMap: groupMap,
    handleTagClick,
    handleLikeChange,
    postsLikeState,
    posts,
  });

  // 找到当前 caption 对应的 post（从所有 posts 中查找，包括分组中的）
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
          onPerPageChange={handlePerPageChange}
          isLoading={isLoading}
          totalItems={totalPosts}
          sortOption={sortOption}
          onSortChange={handleSortChange}
          onOpenExcludedTags={() => setExcludedTagsOpen(true)}
          onOpenRelevanceFilter={() => setRelevanceFilterOpen(true)}
          excludedCountOnPage={excludedCountOnPage}
          relevanceRemovedCount={relevanceRemovedCount}
          onOpenImageSize={() => setImageSizeOpen(true)}
        />
        {groupedDisplayPosts.length > 0 ? (
          <MasonryGrid
            posts={groupedDisplayPosts}
            onImageClick={onImageClick}
            LazyImageCard={LazyImageCard}
            isLoading={isLoading}
            onLikeChange={handleLikeChange}
            onNotify={handleNotify}
            groupMap={groupMap}
            columnWidth={columnWidth}
          />
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, py: 8 }}>
            <EmptyIcon sx={{ fontSize: 48, color: 'text.disabled' }} />
            <Typography color="text.secondary">{t('status.noResults')}</Typography>
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
      <ExcludedTagsModal
        open={excludedTagsOpen}
        onClose={() => setExcludedTagsOpen(false)}
        excludedTags={excludedTags}
        onExcludedTagsChange={handleExcludedTagsChange}
        excludedCountOnPage={excludedCountOnPage}
      />
      <RelevanceFilterModal
        open={relevanceFilterOpen}
        onClose={() => setRelevanceFilterOpen(false)}
        posts={posts}
        totalPosts={totalPosts}
        threshold={relevanceThreshold}
        onThresholdChange={handleRelevanceThresholdChange}
        postScoresMap={postScoresMap}
      />
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

export default HomePage;
