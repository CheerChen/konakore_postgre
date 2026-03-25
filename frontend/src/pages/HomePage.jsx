import React, { useState, useMemo, useEffect, useCallback, useTransition } from 'react';
import { useQuery } from '@tanstack/react-query';

import SearchBar from '../components/SearchBar';
import MasonryGrid from '../components/MasonryGrid';
import AppLayout from '../components/AppLayout';
import PaginationControls from '../components/PaginationControls';
import SimplePagination from '../components/SimplePagination';
import LazyImageCard from '../components/LazyImageCard';
import { getPosts, searchTags } from '../api';
import { formatFileSize, formatDate } from '../utils/formatters';
import { getImageUrl, getImageDimensionsText } from '../utils/imageUtils';
import { useTag } from '../contexts/TagContext';
import { tagManager } from '../utils/TagManager';
import { Box, CircularProgress, Typography, Chip } from '@mui/material';
import { Link as LinkIcon, AspectRatio as SizeIcon, Star as ScoreIcon, DateRange as DateIcon, Storage as FileIcon, Favorite as FavoriteIcon } from '@mui/icons-material';
import ExcludedTagsModal from '../components/ExcludedTagsModal';
import RelevanceFilterModal from '../components/RelevanceFilterModal';
import { usePhotoSwipe } from '../hooks/usePhotoSwipe';
import CaptionContent from '../components/CaptionContent';

const HomePage = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [perPage, setPerPage] = useState(100);
  const [sortOption, setSortOption] = useState('id');
  const [postsLikeState, setPostsLikeState] = useState({});
  const [excludedTagsOpen, setExcludedTagsOpen] = useState(false);
  const [relevanceFilterOpen, setRelevanceFilterOpen] = useState(false);
  const [weightMap, setWeightMap] = useState(new Map());

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

  // 当前页排除标签过滤统计
  const excludedCountOnPage = useMemo(() => {
    if (!posts?.length || !excludedTags.length) return 0;
    return posts.reduce((acc, post) => {
      const tagsString = tagManager.getPostTagsString(post);
      if (!tagsString) return acc;
      const postTags = tagsString.split(' ').filter(Boolean);
      return acc + (excludedTags.some(t => postTags.includes(t)) ? 1 : 0);
    }, 0);
  }, [posts, excludedTags]);

  // 预计算所有 post 的相关度分数（使用后端 TF-IDF 权重）
  const postScoresMap = useMemo(() => {
    const map = new Map();
    if (!posts?.length || !weightMap.size) return map;
    posts.forEach(post => {
      map.set(post.id, tagManager.scorePost(post, weightMap));
    });
    return map;
  }, [posts, weightMap]);

  // 相关度过滤统计
  const relevanceRemovedCount = useMemo(() => {
    if (!posts?.length || relevanceThreshold <= 0 || !postScoresMap.size) return 0;
    let removed = 0;
    posts.forEach(post => {
      if ((postScoresMap.get(post.id) || 0) < relevanceThreshold) removed++;
    });
    return removed;
  }, [posts, relevanceThreshold, postScoresMap]);

  // --- MEMOIZED DATA FOR RENDERING ---
  const postsForGrid = useMemo(() => {
    if (!posts.length) return posts;

    const postsWithUpdatedLikes = posts.map(post => ({
      ...post,
      liked: postsLikeState.hasOwnProperty(post.id)
        ? postsLikeState[post.id]
        : post.liked
    }));

    // 排除标签过滤
    let filteredPosts = postsWithUpdatedLikes;
    if (excludedTags.length > 0) {
      filteredPosts = filteredPosts.filter(post => {
        const tagsString = tagManager.getPostTagsString(post);
        if (!tagsString) return true;
        const postTags = tagsString.split(' ').filter(Boolean);
        return !excludedTags.some(t => postTags.includes(t));
      });
    }

    // 排序
    let sortedPosts = [...filteredPosts].sort((a, b) => {
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

    // 相关度阈值过滤
    if (relevanceThreshold > 0 && postScoresMap.size > 0) {
      sortedPosts = sortedPosts.filter(post => (postScoresMap.get(post.id) || 0) >= relevanceThreshold);
    }

    return sortedPosts;
  }, [posts, sortOption, postsLikeState, excludedTags, relevanceThreshold, postScoresMap]);

  // 帖子分组
  const groupedPostsForGrid = useMemo(() => {
    if (!postsForGrid.length) return { displayPosts: postsForGrid, groupMap: new Map() };

    const childrenByParent = new Map();
    const postById = new Map();

    postsForGrid.forEach(post => {
      postById.set(post.id, post);
      const parentId = post.data?.parent_id;
      if (parentId && parentId !== post.id) {
        if (!childrenByParent.has(parentId)) childrenByParent.set(parentId, []);
        childrenByParent.get(parentId).push(post);
      }
    });

    const hiddenIds = new Set();
    const groupMap = new Map();
    childrenByParent.forEach((children, parentId) => {
      if (postById.has(parentId)) {
        children.forEach(child => hiddenIds.add(child.id));
        groupMap.set(parentId, [postById.get(parentId), ...children]);
      }
    });

    const displayPosts = postsForGrid.filter(post => !hiddenIds.has(post.id));
    return { displayPosts, groupMap };
  }, [postsForGrid]);

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
  const { onImageClick } = usePhotoSwipe({
    displayPosts: groupedPostsForGrid.displayPosts,
    allPosts: postsForGrid,
    groupMap: groupedPostsForGrid.groupMap,
    handleTagClick,
    handleLikeChange,
    postsLikeState,
    posts,
  });

  // --- RENDER ---
  const renderContent = () => {
    if (isLoading) return <CircularProgress />;
    if (isError) return <Typography color="error">Error loading posts.</Typography>;

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
        />
        {isLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px', flexDirection: 'column', gap: 2 }}>
            <CircularProgress size={60} />
            <Typography variant="body1" color="text.secondary">Loading images...</Typography>
          </Box>
        ) : (
          <MasonryGrid
            posts={groupedPostsForGrid.displayPosts}
            onImageClick={onImageClick}
            LazyImageCard={LazyImageCard}
            isLoading={isLoading}
            onLikeChange={handleLikeChange}
            groupMap={groupedPostsForGrid.groupMap}
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

export default HomePage;
