import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import PhotoSwipeLightbox from 'photoswipe/lightbox';
import 'photoswipe/style.css';
import PhotoSwipeFullscreen from '../utils/photoswipe-fullscreen.esm';

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
import ExcludedTagsModal from '../components/ExcludedTagsModal';

const HomePage = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [perPage, setPerPage] = useState(100);
  const [sortOption, setSortOption] = useState('id'); // 默认按ID降序
  const [showLikedOnly, setShowLikedOnly] = useState(false);
  const [showLikedArtistsOnly, setShowLikedArtistsOnly] = useState(false);
  const [postsLikeState, setPostsLikeState] = useState({}); // 本地收藏状态缓存
  const lightboxRef = useRef(null); // 用于存储PhotoSwipe实例
  const slideshowRef = useRef({ interval: null, isPlaying: false }); // 幻灯片播放状态
  const [excludedTagsOpen, setExcludedTagsOpen] = useState(false);

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

  // 初始化 TagManager 加载liked posts数据（用于TF-IDF排序）
  useEffect(() => {
    const initializeLikedPosts = async () => {
      try {
        await tagManager.fetchLikedPosts();
      } catch (error) {
        console.warn('Failed to fetch liked posts:', error);
      }
    };

    initializeLikedPosts();
  }, []); // 只在组件挂载时执行一次

  // 当页面或筛选条件变化时，获取并缓存tag信息
  useEffect(() => {
    const fetchTagInfoData = async () => {
      try {
        // 根据过滤条件确定liked参数
        const likedParam = showLikedOnly ? true : (showLikedArtistsOnly ? true : null);
        await fetchTagInfo(currentPage, perPage, likedParam);
      } catch (error) {
        console.warn('Failed to fetch tag info:', error);
      }
    };

    // 延迟执行以避免过于频繁的API调用
    const timeoutId = setTimeout(fetchTagInfoData, 300);
    return () => clearTimeout(timeoutId);
  }, [currentPage, perPage, showLikedOnly, showLikedArtistsOnly, fetchTagInfo]);

  // 处理来自LazyImageCard的收藏状态变化
  const handleLikeChange = (postId, isLiked) => {
    setPostsLikeState(prev => ({
      ...prev,
      [postId]: isLiked
    }));
  };

  // --- DATA FETCHING ---
  const postsQuery = useQuery({
    queryKey: ['posts', currentPage, perPage, showLikedOnly, showLikedArtistsOnly],
    queryFn: () => getPosts(currentPage, perPage, showLikedOnly ? true : null, showLikedArtistsOnly ? true : null),
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

    // 如果搜索标签，自动关闭"仅收藏画师"开关
    if (query && showLikedArtistsOnly) {
      setShowLikedArtistsOnly(false);
    }
  };

  const clearSearch = () => {
    setSearchQuery('');
    setCurrentPage(1); // 重置到第一页
  };

  const handleTagClick = (tag) => {
    setSearchQuery(tag);
    setCurrentPage(1); // 重置到第一页
    setSortOption('id'); // 搜索时重置排序为id desc

    // 点击标签搜索时，自动关闭"仅收藏画师"开关
    if (showLikedArtistsOnly) {
      setShowLikedArtistsOnly(false);
    }
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
    // 如果打开"仅收藏"，则关闭"仅收藏画师"
    if (newShowLikedOnly && showLikedArtistsOnly) {
      setShowLikedArtistsOnly(false);
    }
    setCurrentPage(1); // 重置到第一页
    // 保持当前搜索和排序选项不变，实现联动
  };

  const handleLikedArtistsFilterChange = (newShowLikedArtistsOnly) => {
    setShowLikedArtistsOnly(newShowLikedArtistsOnly);
    // 如果打开"仅收藏画师"，则关闭"仅收藏"
    if (newShowLikedArtistsOnly && showLikedOnly) {
      setShowLikedOnly(false);
    }
    setCurrentPage(1); // 重置到第一页
    // 保持当前搜索和排序选项不变，实现联动
  };
  const onImageClick = (index) => {
    // 使用PhotoSwipe API直接打开指定索引的图片
    if (window.currentLightbox) {
      // PhotoSwipeLightbox 实例方法：loadAndOpen(index, dataSource?)
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
    totalPosts = searchData?.pagination?.total_items || 0;
  } else {
    const postsData = postsQuery.data;
    posts = postsData?.posts || [];
    isLoading = postsQuery.isLoading;
    isError = postsQuery.isError;
    totalPages = postsData?.pagination?.total_pages || 0;
    totalPosts = postsData?.pagination?.total_items || 0;
  }

  // 当前页过滤统计（基于过滤规则与当前页 posts）
  const excludedCountOnPage = useMemo(() => {
    if (!posts?.length) return 0;
    // 统计应被排除的数量（以当前页原始 posts 为准）
    return posts.reduce((acc, post) => acc + (tagManager.shouldExcludePost(post) ? 1 : 0), 0);
  }, [posts]);

  // --- MEMOIZED DATA FOR RENDERING ---
  const postsForGrid = useMemo(() => {
    if (!posts.length) return posts;

    // 合并本地收藏状态到posts数据
    const postsWithUpdatedLikes = posts.map(post => ({
      ...post,
      liked: postsLikeState.hasOwnProperty(post.id)
        ? postsLikeState[post.id]
        : post.liked
    }));

    // 排序逻辑
    let sortedPosts;

    if (sortOption === 'relevance') {
      // TF-IDF混合排序：使用新的TF-IDF算法
      sortedPosts = tagManager.sortPostsByTfIdfHybrid(postsWithUpdatedLikes, 'desc', totalPosts);
    } else {
      // 其他排序方式：先应用排除标签过滤，再按选项排序
      sortedPosts = tagManager.sortPosts(postsWithUpdatedLikes, (a, b) => {
        switch (sortOption) {
          case 'score':
            return (b.data.score || 0) - (a.data.score || 0);

          case 'id':
            return (b.id || 0) - (a.id || 0);

          case 'file_size':
            return (b.data.file_size || 0) - (a.data.file_size || 0);

          case 'resolution':
            // 按分辨率（像素总数）从大到小排序
            const aPixels = (a.data.width || 0) * (a.data.height || 0);
            const bPixels = (b.data.width || 0) * (b.data.height || 0);
            return bPixels - aPixels;

          case 'waifu_pillow':
            // waifu_pillow: 宽高比 > 2 的图片靠前 (width > height * 2)
            const aRatio = (a.data.width || 0) / (a.data.height || 1);
            const bRatio = (b.data.width || 0) / (b.data.height || 1);
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

  // 计算当前页面的收藏数
  const currentPageLikedCount = useMemo(() => {
    return postsForGrid.filter(post => post.liked).length;
  }, [postsForGrid]);

  // --- PHOTOSWIPE SETUP ---
  // 仅在组件挂载时初始化PhotoSwipe
  useEffect(() => {
    // 使用 ref 来持久化幻灯片播放状态，避免闭包问题
    const slideshowState = slideshowRef.current;
    const SLIDESHOW_DELAY = 3000; // 3秒切换间隔

    const lightbox = new PhotoSwipeLightbox({
      pswpModule: () => import('photoswipe'),
      showHideAnimationType: 'fade',
      bgOpacity: 0.8,
      dataSource: [], // 初始为空，后续动态更新
    });

    // 初始化全屏插件
    new PhotoSwipeFullscreen(lightbox);

    // 幻灯片播放功能
    const startSlideshow = (pswp) => {
      // 先清理可能存在的旧定时器
      if (slideshowState.interval) {
        clearInterval(slideshowState.interval);
        slideshowState.interval = null;
      }

      if (slideshowState.isPlaying) return;

      slideshowState.isPlaying = true;
      updateSlideshowButton(pswp, true);

      slideshowState.interval = setInterval(() => {
        const numItems = pswp.getNumItems();
        if (pswp.currIndex === numItems - 1) {
          if (pswp.options.loop) {
            pswp.next(); // 循环播放
          } else {
            stopSlideshow(pswp); // 到达最后一张停止
          }
        } else {
          pswp.next();
        }
      }, SLIDESHOW_DELAY);
    };

    const stopSlideshow = (pswp) => {
      if (!slideshowState.isPlaying) return;

      slideshowState.isPlaying = false;
      updateSlideshowButton(pswp, false);

      if (slideshowState.interval) {
        clearInterval(slideshowState.interval);
        slideshowState.interval = null;
      }
    };

    const toggleSlideshow = (pswp) => {
      if (slideshowState.isPlaying) {
        stopSlideshow(pswp);
      } else {
        startSlideshow(pswp);
      }
    };

    const updateSlideshowButton = (pswp, playing) => {
      const button = pswp.element?.querySelector('.pswp__button--slideshow');
      if (button) {
        button.classList.toggle('pswp__button--playing', playing);
        button.setAttribute('aria-pressed', playing ? 'true' : 'false');

        // 更新 SVG 图标而不破坏事件监听器
        const svg = button.querySelector('svg');
        if (svg) {
          if (playing) {
            // 暂停图标
            svg.innerHTML = `<rect x="11" y="8" width="3" height="16"></rect>
              <rect x="18" y="8" width="3" height="16"></rect>`;
          } else {
            // 播放图标
            svg.innerHTML = `<path d="M12 8 L24 16 L12 24 Z"></path>`;
          }
        }
      }
    };

    lightbox.on('uiRegister', () => {
      const { pswp } = lightbox;

      // 注册幻灯片播放按钮
      pswp.ui.registerElement({
        name: 'slideshow-button',
        className: 'pswp__button--slideshow',
        order: 8,
        isButton: true,
        html: `<svg aria-hidden="true" class="pswp__icn" viewBox="0 0 32 32" width="32" height="32">
          <path d="M12 8 L24 16 L12 24 Z"></path>
        </svg>`,
        title: 'Toggle Slideshow',
        onClick: (event, el) => {
          event.preventDefault();
          event.stopPropagation();
          toggleSlideshow(pswp);
          return false;
        }
      });

      // 注册自定义标题
      pswp.ui.registerElement({
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

      // 监听用户手动操作（拖动图片），暂停幻灯片播放
      // 注意：不要监听 pointerDown，因为按钮点击也会触发
      pswp.on('pointerMove', (e) => {
        // 只在实际拖动时才暂停
        if (e.originalEvent && slideshowState.isPlaying) {
          stopSlideshow(pswp);
        }
      });

      // 监听键盘事件（空格键控制播放/暂停）
      pswp.on('keydown', (e) => {
        if (e.originalEvent.key === ' ' || e.originalEvent.code === 'Space') {
          e.originalEvent.preventDefault();
          toggleSlideshow(pswp);
        }
      });

      // PhotoSwipe 关闭时清理
      pswp.on('close', () => {
        stopSlideshow(pswp);
      });
    });

    lightbox.init();
    lightboxRef.current = lightbox;
    window.currentLightbox = lightbox; // 保持对window的引用

    return () => {
      // 清理幻灯片定时器（使用 ref 确保清理正确的定时器）
      if (slideshowRef.current.interval) {
        clearInterval(slideshowRef.current.interval);
        slideshowRef.current.interval = null;
        slideshowRef.current.isPlaying = false;
      }

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
        src: getImageUrl(post.data?.sample_url || post.data?.jpeg_url || post.data?.file_url),
        msrc: getImageUrl(post.data?.preview_url),
        w: post.data.width,
        h: post.data.height,
        alt: post.data.tags,
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
          showLikedArtistsOnly={showLikedArtistsOnly}
          onLikedArtistsFilterChange={handleLikedArtistsFilterChange}
          currentPageLikedCount={currentPageLikedCount}
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
    <AppLayout onOpenSettings={() => setExcludedTagsOpen(true)}>
      <ExcludedTagsModal
        open={excludedTagsOpen}
        onClose={() => setExcludedTagsOpen(false)}
        excludedCountOnPage={excludedCountOnPage}
      />
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
              {post.data.tags?.split(' ').filter(Boolean).map((tag, tagIndex) => {
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
                label={post.data.jpeg_file_size === 0 ?
                  formatFileSize(post.data.file_size) :
                  `${formatFileSize(post.data.jpeg_file_size)} / ${formatFileSize(post.data.file_size)}`
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
                label={getImageDimensionsText(post.data)}
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
                label={post.data.score !== undefined ? post.data.score : 'N/A'}
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
                label={formatDate(post.data.created_at)}
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
              {(postsLikeState.hasOwnProperty(post.id) ? postsLikeState[post.id] : post.liked) && (
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