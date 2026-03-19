import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import PhotoSwipeLightbox from 'photoswipe/lightbox';
import 'photoswipe/style.css';
import PhotoSwipeFullscreen from 'photoswipe-fullscreen';

import SearchBar from '../components/SearchBar';
import MasonryGrid from '../components/MasonryGrid';
import AppLayout from '../components/AppLayout';
import PaginationControls from '../components/PaginationControls';
import SimplePagination from '../components/SimplePagination';
import LazyImageCard from '../components/LazyImageCard';
import { getPosts, searchTags, getTags } from '../api';
import { formatFileSize, formatDate } from '../utils/formatters';
import { getImageUrl, getImageDimensionsText } from '../utils/imageUtils';
import { useTag } from '../contexts/TagContext';
import { tagManager } from '../utils/TagManager';
import { Box, CircularProgress, Typography, Chip } from '@mui/material';
import { Link as LinkIcon, AspectRatio as SizeIcon, Star as ScoreIcon, DateRange as DateIcon, Storage as FileIcon, Favorite as FavoriteIcon } from '@mui/icons-material';

const HomePage = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [perPage, setPerPage] = useState(100);
  const [sortOption, setSortOption] = useState('id'); // 默认按ID降序
  const [showLikedOnly, setShowLikedOnly] = useState(false);
  const [postsLikeState, setPostsLikeState] = useState({}); // 本地收藏状态缓存
  const lightboxRef = useRef(null); // 用于存储PhotoSwipe实例
  
  const queryClient = useQueryClient();
  
  // 使用新的 useTag Hook
  const {
    fetchTagInfo,
    addTagsToCache,
    extractTagsFromPosts,
    mergeTagsWithCache,
    getTagColors,
    getTagTranslation,
    isLoading: tagsLoading
  } = useTag();

  // 初始化TagManager用户偏好数据
  useEffect(() => {
    const initializeUserPreferences = async () => {
      try {
        await tagManager.fetchUserPreferences();
      } catch (error) {
        console.warn('Failed to fetch user preferences:', error);
      }
    };

    initializeUserPreferences();
  }, []); // 只在组件挂载时执行一次

  // 当页面或筛选条件变化时，获取并缓存tag信息
  useEffect(() => {
    const fetchTagInfoData = async () => {
      try {
        await fetchTagInfo(currentPage, perPage, showLikedOnly ? true : null);
      } catch (error) {
        console.warn('Failed to fetch tag info:', error);
      }
    };

    // 延迟执行以避免过于频繁的API调用
    const timeoutId = setTimeout(fetchTagInfoData, 300);
    return () => clearTimeout(timeoutId);
  }, [currentPage, perPage, showLikedOnly, fetchTagInfo]);

  // 处理来自LazyImageCard的收藏状态变化
  const handleLikeChange = (postId, isLiked) => {
    setPostsLikeState(prev => ({
      ...prev,
      [postId]: isLiked
    }));
  };

  // --- DATA FETCHING ---
  const postsQuery = useQuery({
    queryKey: ['posts', currentPage, perPage, showLikedOnly],
    queryFn: () => getPosts(currentPage, perPage, showLikedOnly ? true : null),
    enabled: !searchQuery,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const searchQueryResults = useQuery({
    queryKey: ['search', searchQuery, currentPage, perPage, showLikedOnly],
    queryFn: () => searchTags(searchQuery, currentPage, perPage, showLikedOnly ? true : null),
    enabled: !!searchQuery,
  });

  // --- EVENT HANDLERS ---
  const handleSearch = (query) => {
    setSearchQuery(query);
    setCurrentPage(1); // 重置到第一页
    setSortOption('id'); // 搜索时重置排序为id desc
  };
  
  const clearSearch = () => {
    setSearchQuery('');
    setCurrentPage(1); // 重置到第一页
  };
  
  const handleTagClick = (tag) => {
    setSearchQuery(tag);
    setCurrentPage(1); // 重置到第一页
    setSortOption('id'); // 搜索时重置排序为id desc
  };

  const handlePageChange = (page) => {
    setCurrentPage(page);
    // 滚动到顶部
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handlePerPageChange = (newPerPage) => {
    setPerPage(newPerPage);
    setCurrentPage(1); // 重置到第一页
  };

  const handleSortChange = (newSortOption) => {
    setSortOption(newSortOption);
  };

  const handleLikedFilterChange = (newShowLikedOnly) => {
    setShowLikedOnly(newShowLikedOnly);
    setCurrentPage(1); // 重置到第一页
    // 保持当前搜索和排序选项不变，实现联动
  };
  const onImageClick = (index) => {
    // 使用PhotoSwipe API直接打开指定索引的图片
    if (window.currentLightbox) {
      window.currentLightbox.loadAndOpen(index);
    } else {
      console.log('PhotoSwipe lightbox not ready');
    }
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
    totalPosts = searchData?.pagination?.total_posts || 0;
  } else {
    const postsData = postsQuery.data;
    posts = postsData?.posts || [];
    isLoading = postsQuery.isLoading;
    isError = postsQuery.isError;
    totalPages = postsData?.pagination?.total_pages || 0;
    totalPosts = postsData?.pagination?.total_posts || 0;
  }

  // --- MEMOIZED DATA FOR RENDERING ---
  const postsForGrid = useMemo(() => {
    if (!posts.length) return posts;

    // 合并本地收藏状态到posts数据
    const postsWithUpdatedLikes = posts.map(post => ({
      ...post,
      is_liked: postsLikeState.hasOwnProperty(post.id) 
        ? postsLikeState[post.id] 
        : post.is_liked
    }));

    // 排序逻辑
    let sortedPosts;
    
    if (sortOption === 'relevance') {
      // 相关度排序：使用TagManager（已经包含置底标签后置逻辑）
      sortedPosts = tagManager.sortPostsByRelevance(postsWithUpdatedLikes, 'desc');
    } else {
      // 其他排序方式：使用通用置底标签后置排序
      sortedPosts = tagManager.sortPostsWithBottomPriorityLast(postsWithUpdatedLikes, (a, b) => {
        switch (sortOption) {
          case 'score':
            return (b.raw_data.score || 0) - (a.raw_data.score || 0);
          
          case 'id':
            return (b.id || 0) - (a.id || 0);
          
          case 'file_size':
            return (b.raw_data.file_size || 0) - (a.raw_data.file_size || 0);
          
          case 'resolution':
            // 按分辨率（像素总数）从大到小排序
            const aPixels = (a.raw_data.width || 0) * (a.raw_data.height || 0);
            const bPixels = (b.raw_data.width || 0) * (b.raw_data.height || 0);
            return bPixels - aPixels;
          
          case 'waifu_pillow':
            // waifu_pillow: 宽高比 > 2 的图片靠前 (width > height * 2)
            const aRatio = (a.raw_data.width || 0) / (a.raw_data.height || 1);
            const bRatio = (b.raw_data.width || 0) / (b.raw_data.height || 1);
            const aIsWaifu = aRatio > 2 ? 1 : 0;
            const bIsWaifu = bRatio > 2 ? 1 : 0;
            
            if (aIsWaifu !== bIsWaifu) {
              return bIsWaifu - aIsWaifu; // waifu图片靠前
            }
            // 如果都是或都不是waifu，按宽高比降序
            return bRatio - aRatio;
          
          case 'shuffle':
            // 随机排序 - 使用post id作为seed保证相同数据的排序一致性
            const seedA = (a.id || 0) * 9301 + 49297;
            const seedB = (b.id || 0) * 9301 + 49297;
            return (seedA % 233280) - (seedB % 233280);
          
          default:
            return 0;
        }
      });
    }

    return sortedPosts;
  }, [posts, sortOption, postsLikeState]);

  // 提取当前页面所有tags并更新缓存
  const currentPageTags = useMemo(() => {
    if (!postsForGrid?.length) return [];
    
    const result = extractTagsFromPosts(postsForGrid);
    
    // 添加到全局缓存
    if (result.length > 0) {
      addTagsToCache(result);
    }
    
    return result;
  }, [postsForGrid, extractTagsFromPosts, addTagsToCache]);

  // 智能的tags数据源：缓存标签优先，当前页面标签次之
  const availableTags = useMemo(() => {
    return mergeTagsWithCache(currentPageTags);
  }, [currentPageTags, mergeTagsWithCache]);

  // --- PHOTOSWIPE SETUP ---
  // 仅在组件挂载时初始化PhotoSwipe
  useEffect(() => {
    const lightbox = new PhotoSwipeLightbox({
      pswpModule: () => import('photoswipe'),
      showHideAnimationType: 'fade',
      bgOpacity: 0.8,
      dataSource: [], // 初始为空，后续动态更新
    });

    new PhotoSwipeFullscreen(lightbox);

    lightbox.on('uiRegister', () => {
      lightbox.pswp.ui.registerElement({
        name: 'custom-caption',
        order: 9,
        isButton: false,
        appendTo: 'root',
        html: 'Caption text',
        onInit: (el, pswp) => {
          el.style.cssText = `
            position: absolute;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%);
            z-index: 1000;
            max-width: 90vw;
          `;
          pswp.on('change', () => {
            const slideData = pswp.currSlide?.data;
            const postId = slideData?.postId;
            if (postId) {
              const captionEl = document.querySelector(`[data-caption-id="${postId}"]`);
              if (captionEl) {
                el.innerHTML = captionEl.innerHTML;
                const tagElements = el.querySelectorAll('[data-tag]');
                tagElements.forEach(tagEl => {
                  const tag = tagEl.getAttribute('data-tag');
                  tagEl.addEventListener('click', (e) => {
                    e.stopPropagation();
                    pswp.close();
                    setTimeout(() => handleTagClick(tag), 100);
                  });
                });
              } else {
                el.innerHTML = '';
              }
            } else {
              el.innerHTML = '';
            }
          });
          setTimeout(() => pswp.dispatch('change'), 50);
        },
      });
    });

    lightbox.init();
    lightboxRef.current = lightbox;
    window.currentLightbox = lightbox; // 保持对window的引用

    return () => {
      if (lightboxRef.current) {
        lightboxRef.current.destroy();
        lightboxRef.current = null;
      }
      window.currentLightbox = null;
    };
  }, []); // 空依赖数组，确保只执行一次

  // 当图片数据更新时，动态更新PhotoSwipe的数据源
  useEffect(() => {
    if (lightboxRef.current && postsForGrid.length > 0) {
      const newDataSource = postsForGrid.map(post => ({
        src: getImageUrl(post.raw_data?.sample_url || post.raw_data?.jpeg_url || post.raw_data?.file_url),
        msrc: getImageUrl(post.raw_data?.preview_url),
        w: post.raw_data.width,
        h: post.raw_data.height,
        alt: post.raw_data.tags,
        postId: post.id,
      }));
      lightboxRef.current.options.dataSource = newDataSource;
    }
  }, [postsForGrid]);

  // --- RENDER LOGIC ---
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
          showLikedOnly={showLikedOnly}
          onLikedFilterChange={handleLikedFilterChange}
        />
        {isLoading ? (
          <Box sx={{ 
            display: 'flex', 
            justifyContent: 'center', 
            alignItems: 'center', 
            minHeight: '400px',
            flexDirection: 'column',
            gap: 2 
          }}>
            <CircularProgress size={60} />
            <Typography variant="body1" color="text.secondary">
              Loading images...
            </Typography>
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
        showLikedOnly={showLikedOnly}
      />

      <Box sx={{ 
        mx: 'auto',
        maxWidth: '100%',
        minWidth: '100%', // 确保最小宽度
        width: '100%',
        overflow: 'hidden',
        px: { xs: 1, sm: 2, md: 3 },
        // 确保即使内容少也占满宽度
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'stretch', // 子元素拉伸占满宽度
      }}>
        {renderContent()}
      </Box>
      
      {/* Hidden caption content for each image */}
      {postsForGrid.map((post, index) => (
        <div 
          key={`caption-${post.id}`}
          data-caption-id={post.id} 
          className="hidden-caption-content" 
          style={{ display: 'none' }}
        >
          <div style={{ 
            padding: '16px',
            background: 'rgba(0, 0, 0, 0.8)',
            backdropFilter: 'blur(15px)',
            borderRadius: '12px',
            margin: '8px',
            color: 'white',
            minWidth: '320px'
          }}>
            {/* Tags section */}
            <div style={{
              display: 'flex',
              gap: '4px',
              justifyContent: 'center',
              flexWrap: 'wrap',
              maxWidth: '80vw',
              marginBottom: '16px'
            }}>
              {post.raw_data.tags?.split(' ').filter(Boolean).map((tag, tagIndex) => {
                const tagColors = getTagColors(tag);
                const translatedTag = getTagTranslation(tag);
                return (
                  <Chip
                    key={tagIndex}
                    label={translatedTag}
                    size="small"
                    clickable
                    data-tag={tag}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleTagClick(tag);
                    }}
                    sx={{
                      fontSize: '11px',
                      height: '20px',
                      cursor: 'pointer',
                      backgroundColor: tagColors.backgroundColor,
                      color: tagColors.color,
                      border: tagColors.border,
                      fontFamily: '"Inter", "Roboto", "Noto Sans SC", sans-serif',
                      fontWeight: 400,
                      '&:hover': {
                        backgroundColor: tagColors.hoverColor,
                      },
                      '& .MuiChip-label': {
                        px: 1,
                        fontFamily: '"Inter", "Roboto", "Noto Sans SC", sans-serif'
                      }
                    }}
                  />
                );
              })}
            </div>
            
            {/* Info section */}
            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '8px',
              justifyContent: 'center',
              alignItems: 'center'
            }}>
              {/* ID with link */}
              <Chip
                icon={<LinkIcon sx={{ color: '#fff !important' }} />}
                label={
                  <a 
                    href={`https://konachan.com/post/show/${post.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      color: '#fff',
                      textDecoration: 'none',
                      fontFamily: '"Inter", "Roboto", "Noto Sans SC", sans-serif',
                      fontWeight: 500
                    }}
                  >
                    {post.id}
                  </a>
                }
                size="small"
                sx={{
                  backgroundColor: 'rgba(121, 85, 72, 0.8)',
                  color: '#fff',
                  fontFamily: '"Inter", "Roboto", "Noto Sans SC", sans-serif',
                  fontWeight: 500,
                  '&:hover': {
                    backgroundColor: 'rgba(121, 85, 72, 1)',
                  },
                  '& .MuiChip-label': {
                    fontFamily: '"Inter", "Roboto", "Noto Sans SC", sans-serif',
                    fontWeight: 500
                  }
                }}
              />

              {/* File Size */}
              <Chip
                icon={<FileIcon sx={{ color: '#fff !important' }} />}
                label={post.raw_data.jpeg_file_size === 0 ? 
                  formatFileSize(post.raw_data.file_size) : 
                  `${formatFileSize(post.raw_data.jpeg_file_size)} / ${formatFileSize(post.raw_data.file_size)}`
                }
                size="small"
                sx={{
                  backgroundColor: 'rgba(76, 175, 80, 0.8)',
                  color: '#fff',
                  fontFamily: '"Inter", "Roboto", "Noto Sans SC", sans-serif',
                  fontWeight: 500,
                  fontSize: '12px',
                  '& .MuiChip-label': {
                    fontFamily: '"Inter", "Roboto", "Noto Sans SC", sans-serif',
                    fontWeight: 500
                  }
                }}
              />

              {/* Dimensions */}
              <Chip
                icon={<SizeIcon sx={{ color: '#fff !important' }} />}
                label={getImageDimensionsText(post.raw_data)}
                size="small"
                sx={{
                  backgroundColor: 'rgba(156, 39, 176, 0.8)',
                  color: '#fff',
                  fontFamily: '"Inter", "Roboto", "Noto Sans SC", sans-serif',
                  fontWeight: 500,
                  fontSize: '12px',
                  '& .MuiChip-label': {
                    fontFamily: '"Inter", "Roboto", "Noto Sans SC", sans-serif',
                    fontWeight: 500
                  }
                }}
              />

              {/* Score */}
              <Chip
                icon={<ScoreIcon sx={{ color: '#fff !important' }} />}
                label={post.raw_data.score !== undefined ? post.raw_data.score : 'N/A'}
                size="small"
                sx={{
                  backgroundColor: 'rgba(255, 152, 0, 0.8)',
                  color: '#fff',
                  fontFamily: '"Inter", "Roboto", "Noto Sans SC", sans-serif',
                  fontWeight: 500,
                  fontSize: '12px',
                  '& .MuiChip-label': {
                    fontFamily: '"Inter", "Roboto", "Noto Sans SC", sans-serif',
                    fontWeight: 500
                  }
                }}
              />

              {/* Create Date */}
              <Chip
                icon={<DateIcon sx={{ color: '#fff !important' }} />}
                label={formatDate(post.raw_data.created_at)}
                size="small"
                sx={{
                  backgroundColor: 'rgba(96, 125, 139, 0.8)',
                  color: '#fff',
                  fontFamily: '"Inter", "Roboto", "Noto Sans SC", sans-serif',
                  fontWeight: 500,
                  fontSize: '12px',
                  '& .MuiChip-label': {
                    fontFamily: '"Inter", "Roboto", "Noto Sans SC", sans-serif',
                    fontWeight: 500
                  }
                }}
              />

              {/* Liked Status - 只显示状态，不提供交互 */}
              {(postsLikeState.hasOwnProperty(post.id) ? postsLikeState[post.id] : post.is_liked) && (
                <Chip
                  icon={<FavoriteIcon sx={{ color: '#fff !important' }} />}
                  label="已收藏"
                  size="small"
                  sx={{
                    backgroundColor: 'rgba(244, 67, 54, 0.8)',
                    color: '#fff',
                    fontFamily: '"Inter", "Roboto", "Noto Sans SC", sans-serif',
                    fontWeight: 500,
                    fontSize: '12px',
                    '& .MuiChip-label': {
                      fontFamily: '"Inter", "Roboto", "Noto Sans SC", sans-serif',
                      fontWeight: 500
                    }
                  }}
                />
              )}
            </div>
          </div>
        </div>
      ))}

    </AppLayout>
  );
};

export default HomePage;