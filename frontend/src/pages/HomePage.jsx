import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import PhotoSwipeLightbox from 'photoswipe/lightbox';
import 'photoswipe/style.css';
import PhotoSwipeFullscreen from 'photoswipe-fullscreen';
import { filesize } from 'filesize';
import { format, fromUnixTime, isValid } from 'date-fns';

import SearchBar from '../components/SearchBar';
import MasonryGrid from '../components/MasonryGrid';
import AppLayout from '../components/AppLayout';
import PaginationControls from '../components/PaginationControls';
import SimplePagination from '../components/SimplePagination';
import LazyImageCard from '../components/LazyImageCard';
import { getPosts, searchTags } from '../api';
import { Box, CircularProgress, Typography, Chip } from '@mui/material';
import { Link as LinkIcon, AspectRatio as SizeIcon, Star as ScoreIcon, DateRange as DateIcon, Storage as FileIcon, Favorite as FavoriteIcon } from '@mui/icons-material';

// 全局tags缓存，只追加不删除
const globalTagsCache = new Set();

// 从localStorage恢复缓存
const loadTagsFromStorage = () => {
  try {
    const saved = localStorage.getItem('konakore_tags_cache');
    if (saved) {
      const tags = JSON.parse(saved);
      tags.forEach(tag => globalTagsCache.add(tag));
    }
  } catch (error) {
    console.warn('Failed to load tags from localStorage:', error);
  }
};

// 保存缓存到localStorage
const saveTagsToStorage = () => {
  try {
    const tags = Array.from(globalTagsCache);
    localStorage.setItem('konakore_tags_cache', JSON.stringify(tags));
  } catch (error) {
    console.warn('Failed to save tags to localStorage:', error);
  }
};

// 添加tags到缓存
const addTagsToCache = (tags) => {
  let added = false;
  tags.forEach(tag => {
    if (!globalTagsCache.has(tag)) {
      globalTagsCache.add(tag);
      added = true;
    }
  });
  if (added) {
    saveTagsToStorage();
  }
  return added;
};

const HomePage = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [perPage, setPerPage] = useState(100);
  const [sortOption, setSortOption] = useState('id'); // 默认按ID降序
  const [showLikedOnly, setShowLikedOnly] = useState(false);
  const [postsLikeState, setPostsLikeState] = useState({}); // 本地收藏状态缓存
  
  const queryClient = useQueryClient();

  // 初始化时从localStorage加载缓存
  useEffect(() => {
    loadTagsFromStorage();
  }, []);

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
  // 处理图片 URL
  const getImageUrl = (url) => {
    if (!url) return '';
    
    const konachanUrl = url.replace('konachan.com', 'konachan.net');
    return konachanUrl.replace('https://konachan.net', '/konachan-proxy');
  };

  const onImageClick = (index) => {
    // 使用PhotoSwipe API直接打开指定索引的图片
    if (window.currentLightbox) {
      window.currentLightbox.loadAndOpen(index);
    } else {
      console.log('PhotoSwipe lightbox not ready');
    }
  };

  // --- UTILITY FUNCTIONS ---
  const formatFileSize = (bytes) => {
    if (!bytes) return 'N/A';
    return filesize(bytes, { 
      standard: 'jedec',  // 使用 MB 而不是 MiB
      round: 1 
    });
  };

  const formatDate = (dateValue) => {
    if (!dateValue && dateValue !== 0) return 'N/A';
    
    try {
      // 将Unix时间戳转换为Date对象
      const date = fromUnixTime(dateValue);
      
      // 检查日期是否有效
      if (!isValid(date)) {
        return 'Invalid';
      }
      
      // 格式化为 YYYY/MM/DD HH:mm:ss
      return format(date, 'yyyy/MM/dd HH:mm:ss');
    } catch (error) {
      console.warn('Date formatting error:', error, 'Input:', dateValue);
      return 'Error';
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
    const sortedPosts = [...postsWithUpdatedLikes].sort((a, b) => {
      switch (sortOption) {
        case 'score':
          return (b.raw_data.score || 0) - (a.raw_data.score || 0);
        
        case 'id':
          return (b.id || 0) - (a.id || 0);
        
        case 'file_size':
          return (b.raw_data.file_size || 0) - (a.raw_data.file_size || 0);
        
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

    return sortedPosts;
  }, [posts, sortOption, postsLikeState]);

  // 提取当前页面所有tags并更新缓存
  const currentPageTags = useMemo(() => {
    if (!postsForGrid?.length) return [];
    
    const tagSet = new Set();
    postsForGrid.forEach(post => {
      // 检查两种可能的tags格式
      let tags = [];
      
      // 格式1: post.tags (数组)
      if (post.tags && Array.isArray(post.tags)) {
        tags = post.tags;
      }
      // 格式2: post.raw_data.tags (空格分隔的字符串)
      else if (post.raw_data?.tags && typeof post.raw_data.tags === 'string') {
        tags = post.raw_data.tags.split(' ').filter(Boolean);
      }
      
      // 添加到Set中去重
      tags.forEach(tag => {
        if (tag && typeof tag === 'string' && tag.trim().length > 0) {
          tagSet.add(tag.trim());
        }
      });
    });
    
    // 转换为数组并过滤空值
    const result = Array.from(tagSet).filter(tag => tag && tag.length > 0);
    
    // 添加到全局缓存
    if (result.length > 0) {
      addTagsToCache(result);
    }
    
    return result;
  }, [postsForGrid]);

  // 智能的tags数据源：缓存标签优先，当前页面标签次之
  const availableTags = useMemo(() => {
    const cachedTags = Array.from(globalTagsCache);
    const currentTags = currentPageTags;
    
    // 合并并去重：缓存的tags在前，当前页面新的tags在后
    const tagSet = new Set();
    
    // 先添加缓存中的tags
    cachedTags.forEach(tag => tagSet.add(tag));
    
    // 再添加当前页面的tags（如果不在缓存中）
    currentTags.forEach(tag => tagSet.add(tag));
    
    // 转换为数组并排序
    return Array.from(tagSet).sort();
  }, [currentPageTags]);

  // --- PHOTOSWIPE SETUP ---
  useEffect(() => {
    if (!postsForGrid.length) {
      return;
    }

    // 延迟初始化，确保数据已经准备好
    const timeoutId = setTimeout(() => {
      // 检查是否有数据
      if (!postsForGrid.length) {
        return;
      }

      const lightbox = new PhotoSwipeLightbox({
        pswpModule: () => import('photoswipe'),
        // 显式启用所有UI元素
        showHideAnimationType: 'fade',
        bgOpacity: 0.8,
        // 自定义数据源解析
        dataSource: postsForGrid.map((post, index) => ({
          src: getImageUrl(post.raw_data?.sample_url || post.raw_data?.jpeg_url || post.raw_data?.file_url),
          msrc: getImageUrl(post.raw_data?.preview_url), // 微图占位符
          w: post.raw_data.width,
          h: post.raw_data.height,
          alt: post.raw_data.tags,
          postId: post.id
        }))
      });

      // 添加全屏插件
      const fullscreenPlugin = new PhotoSwipeFullscreen(lightbox);

      // 确保PhotoSwipe初始化时全屏按钮可用
      lightbox.on('init', () => {
        console.log('PhotoSwipe initialized with fullscreen plugin');
      });

      lightbox.on('uiRegister', () => {
        console.log('PhotoSwipe UI registered');
        
        // 注册自定义标题元素
        lightbox.pswp.ui.registerElement({
          name: 'custom-caption',
          order: 9,
          isButton: false,
          appendTo: 'root',
          html: 'Caption text',
          onInit: (el, pswp) => {
            // 设置标题容器样式
            el.style.cssText = `
              position: absolute;
              bottom: 20px;
              left: 50%;
              transform: translateX(-50%);
              z-index: 1000;
              max-width: 90vw;
            `;
            
            pswp.on('change', () => {
              // 获取当前幻灯片数据
              const currentSlide = pswp.currSlide;
              const slideData = currentSlide?.data;
              const postId = slideData?.postId;
              
              if (postId) {
                // 找到对应的隐藏标题内容
                const captionEl = document.querySelector(`[data-caption-id="${postId}"]`);
                if (captionEl) {
                  el.innerHTML = captionEl.innerHTML;
                  
                  // 重新绑定标签点击事件
                  const tagElements = el.querySelectorAll('[data-tag]');
                  tagElements.forEach(tagEl => {
                    const tag = tagEl.getAttribute('data-tag');
                    tagEl.addEventListener('click', (e) => {
                      e.stopPropagation();
                      // 关闭 PhotoSwipe 并在关闭后触发搜索
                      pswp.close();
                      // 延迟执行搜索以确保 PhotoSwipe 完全关闭
                      setTimeout(() => {
                        handleTagClick(tag);
                      }, 100);
                    });
                  });
                  
                  console.log('Caption updated for image:', postId);
                } else {
                  el.innerHTML = '';
                  console.log('No caption found for image:', postId);
                }
              } else {
                el.innerHTML = '';
                console.log('No ID found for current slide');
              }
            });
            
            // 初始化时也执行一次
            setTimeout(() => {
              pswp.dispatch('change');
            }, 50);
          },
        });
      });

      lightbox.on('change', () => {
        console.log('PhotoSwipe slide changed');
      });

      lightbox.on('openingAnimationStart', () => {
        console.log('PhotoSwipe opening animation started');
      });

      lightbox.init();

      // 存储 lightbox 引用以便清理和调用
      window.currentLightbox = lightbox;
      
      console.log('PhotoSwipe initialized and stored in window.currentLightbox');
    }, 100); // 延迟 100ms

    return () => {
      clearTimeout(timeoutId);
      if (window.currentLightbox) {
        window.currentLightbox.destroy();
        window.currentLightbox = null;
      }
    };
  }, [postsForGrid]); // 当postsForGrid内容变化时重新初始化PhotoSwipe

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
        width: '100%',
        overflow: 'hidden',
        px: { xs: 1, sm: 2, md: 3 }
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
              {post.raw_data.tags?.split(' ').filter(Boolean).map((tag, tagIndex) => (
                <Chip
                  key={tagIndex}
                  label={tag}
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
                    backgroundColor: 'rgba(144, 202, 249, 0.2)',
                    color: '#90caf9',
                    border: '1px solid rgba(144, 202, 249, 0.3)',
                    fontFamily: '"Inter", "Roboto", "Noto Sans SC", sans-serif',
                    fontWeight: 400,
                    '&:hover': {
                      backgroundColor: 'rgba(144, 202, 249, 0.3)',
                    },
                    '& .MuiChip-label': {
                      px: 1,
                      fontFamily: '"Inter", "Roboto", "Noto Sans SC", sans-serif'
                    }
                  }}
                />
              ))}
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
                label={formatFileSize(post.raw_data.file_size)}
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
                label={`${post.raw_data.width}x${post.raw_data.height}`}
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