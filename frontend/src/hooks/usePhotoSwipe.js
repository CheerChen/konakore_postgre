import { useEffect, useRef, useCallback, useState } from 'react';
import PhotoSwipeLightbox from 'photoswipe/lightbox';
import 'photoswipe/style.css';
import PhotoSwipeFullscreen from '../utils/photoswipe-fullscreen.esm';
import { toggleLike } from '../api';
import { getImageUrl } from '../utils/imageUtils';

/**
 * PhotoSwipe lightbox hook，封装初始化、slideshow、like 按钮、caption（Portal）、分组浏览。
 *
 * @param {Object} options
 * @param {Array} options.displayPosts - 网格中实际显示的帖子（分组后）
 * @param {Array} options.allPosts - 全部帖子（含被分组隐藏的）
 * @param {Map}   options.groupMap - parentId → [group members]，可选
 * @param {Function} options.handleTagClick - 点击 caption 中 tag 的回调
 * @param {Function} options.handleLikeChange - (postId, isLiked) => void
 * @param {Object} options.postsLikeState - { [postId]: boolean }
 * @param {Array}  options.posts - 原始 posts（用于查找 liked 状态）
 */
export function usePhotoSwipe({
  displayPosts,
  // allPosts — kept in API for future use
  groupMap,
  handleTagClick,
  handleLikeChange,
  postsLikeState,
  posts,
}) {
  const lightboxRef = useRef(null);
  const slideshowRef = useRef({ interval: null, isPlaying: false });
  const groupMapRef = useRef(new Map());
  const fullDataSourceRef = useRef([]);
  const postsLikeStateRef = useRef({});
  const postsRef = useRef([]);

  // Portal 状态：当前激活的 postId 和 caption 容器 DOM 节点
  const [activePostId, setActivePostId] = useState(null);
  const captionContainerRef = useRef(null);

  // 同步 refs
  useEffect(() => { groupMapRef.current = groupMap || new Map(); }, [groupMap]);
  useEffect(() => { postsLikeStateRef.current = postsLikeState; }, [postsLikeState]);
  useEffect(() => { postsRef.current = posts; }, [posts]);

  // PhotoSwipe 初始化（仅一次）
  useEffect(() => {
    const slideshowState = slideshowRef.current;
    const SLIDESHOW_DELAY = 3000;

    const lightbox = new PhotoSwipeLightbox({
      pswpModule: () => import('photoswipe'),
      showHideAnimationType: 'fade',
      bgOpacity: 0.8,
      dataSource: [],
    });

    new PhotoSwipeFullscreen(lightbox);

    // --- Slideshow ---
    const startSlideshow = (pswp) => {
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
            pswp.next();
          } else {
            stopSlideshow(pswp);
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

    const toggleSlideshowFn = (pswp) => {
      if (slideshowState.isPlaying) stopSlideshow(pswp);
      else startSlideshow(pswp);
    };

    const updateSlideshowButton = (pswp, playing) => {
      const button = pswp.element?.querySelector('.pswp__button--slideshow');
      if (!button) return;
      button.classList.toggle('pswp__button--playing', playing);
      button.setAttribute('aria-pressed', playing ? 'true' : 'false');
      const svg = button.querySelector('svg');
      if (svg) {
        if (playing) {
          svg.innerHTML = `
            <rect x="11" y="8" width="3" height="16" class="pswp__icn-shadow"/>
            <rect x="18" y="8" width="3" height="16" class="pswp__icn-shadow"/>
            <rect x="11" y="8" width="3" height="16"/>
            <rect x="18" y="8" width="3" height="16"/>`;
        } else {
          svg.innerHTML = `
            <path d="M12 8 L24 16 L12 24 Z" class="pswp__icn-shadow"/>
            <path d="M12 8 L24 16 L12 24 Z"/>`;
        }
      }
    };

    // --- UI Registration ---
    lightbox.on('uiRegister', () => {
      const { pswp } = lightbox;

      // Slideshow button
      pswp.ui.registerElement({
        name: 'slideshow-button',
        className: 'pswp__button--slideshow',
        order: 8,
        isButton: true,
        html: `<svg aria-hidden="true" class="pswp__icn" viewBox="0 0 32 32" width="32" height="32">
          <path d="M12 8 L24 16 L12 24 Z" class="pswp__icn-shadow"/>
          <path d="M12 8 L24 16 L12 24 Z"/>
        </svg>`,
        title: 'Toggle Slideshow',
        onClick: (event) => {
          event.preventDefault();
          event.stopPropagation();
          toggleSlideshowFn(pswp);
          return false;
        }
      });

      // Like button
      const HEART_PATH = 'M16 28.5l-1.8-1.6C7.4 20.8 3 16.8 3 12c0-3.9 3.1-7 7-7 2.2 0 4.3 1 5.6 2.7L16 8l.4-.3C17.7 6 19.8 5 22 5c3.9 0 7 3.1 7 7 0 4.8-4.4 8.8-11.2 14.9L16 28.5z';

      const updateLikeButton = (liked) => {
        const button = pswp.element?.querySelector('.pswp__button--like');
        if (!button) return;
        const fgPath = button.querySelector('svg path:not(.pswp__icn-shadow)');
        if (fgPath) {
          fgPath.setAttribute('fill', liked ? '#f44336' : 'var(--pswp-icon-color, #fff)');
        }
      };

      pswp.ui.registerElement({
        name: 'like-button',
        className: 'pswp__button--like',
        order: 7,
        isButton: true,
        html: `<svg aria-hidden="true" class="pswp__icn" viewBox="0 0 32 32" width="32" height="32">
          <path d="${HEART_PATH}" class="pswp__icn-shadow"/>
          <path d="${HEART_PATH}"/>
        </svg>`,
        title: 'Toggle Like',
        onClick: (event) => {
          event.preventDefault();
          event.stopPropagation();
          const postId = pswp.currSlide?.data?.postId;
          if (!postId) return false;

          const post = postsRef.current.find(p => p.id === postId);
          const currentLiked = postsLikeStateRef.current.hasOwnProperty(postId)
            ? postsLikeStateRef.current[postId]
            : post?.liked || false;

          toggleLike(postId, currentLiked).then(() => {
            const newLiked = !currentLiked;
            handleLikeChange(postId, newLiked);
            updateLikeButton(newLiked);
          }).catch(err => console.error('Like toggle failed:', err));

          return false;
        }
      });

      // Update like button on slide change
      pswp.on('change', () => {
        const postId = pswp.currSlide?.data?.postId;
        if (!postId) return;
        const post = postsRef.current.find(p => p.id === postId);
        const isLiked = postsLikeStateRef.current.hasOwnProperty(postId)
          ? postsLikeStateRef.current[postId]
          : post?.liked || false;
        updateLikeButton(isLiked);
      });

      // Caption container (auto-hide: desktop hot zone + mobile tap toggle)
      // Content is rendered via React Portal from the parent component
      pswp.ui.registerElement({
        name: 'custom-caption',
        order: 9,
        isButton: false,
        appendTo: 'root',
        html: '',
        onInit: (el, pswp) => {
          el.style.cssText = `
            position: absolute;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%) translateY(20px);
            z-index: 1000;
            max-width: 90vw;
            opacity: 0;
            transition: opacity 0.3s ease, transform 0.3s ease;
            pointer-events: none;
          `;

          // 保存 caption 容器引用，供 Portal 使用
          captionContainerRef.current = el;

          const showCaption = () => {
            el.style.opacity = '1';
            el.style.transform = 'translateX(-50%) translateY(0)';
            el.style.pointerEvents = 'auto';
          };
          const hideCaption = () => {
            el.style.opacity = '0';
            el.style.transform = 'translateX(-50%) translateY(20px)';
            el.style.pointerEvents = 'none';
          };

          // Desktop: mouse hot zone
          let hideTimer = null;
          const HOT_ZONE_HEIGHT = 120;
          const HIDE_DELAY = 1500;
          const handleMouseMove = (e) => {
            if (e.clientY > window.innerHeight - HOT_ZONE_HEIGHT) {
              if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
              showCaption();
            } else if (!hideTimer) {
              hideTimer = setTimeout(() => { hideCaption(); hideTimer = null; }, HIDE_DELAY);
            }
          };

          const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

          if (!isTouchDevice) {
            pswp.element.addEventListener('mousemove', handleMouseMove);
          } else {
            const observer = new MutationObserver(() => {
              if (pswp.element.classList.contains('pswp--ui-visible')) {
                showCaption();
              } else {
                hideCaption();
              }
            });
            observer.observe(pswp.element, { attributes: true, attributeFilter: ['class'] });
            pswp.on('close', () => observer.disconnect());
          }

          pswp.on('close', () => {
            if (!isTouchDevice) {
              pswp.element.removeEventListener('mousemove', handleMouseMove);
            }
            if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
          });

          // 通过 setState 触发 Portal 渲染，代替 innerHTML
          pswp.on('change', () => {
            const postId = pswp.currSlide?.data?.postId || null;
            setActivePostId(postId);
          });
          setTimeout(() => pswp.dispatch('change'), 50);
        },
      });

      // Clear activePostId on close
      pswp.on('close', () => {
        setActivePostId(null);
        captionContainerRef.current = null;
      });

      // Pause slideshow on drag
      pswp.on('pointerMove', (e) => {
        if (e.originalEvent && slideshowState.isPlaying) {
          stopSlideshow(pswp);
        }
      });

      // Spacebar toggle
      pswp.on('keydown', (e) => {
        if (e.originalEvent.key === ' ' || e.originalEvent.code === 'Space') {
          e.originalEvent.preventDefault();
          toggleSlideshowFn(pswp);
        }
      });

      // Close cleanup
      pswp.on('close', () => {
        stopSlideshow(pswp);
        if (fullDataSourceRef.current && fullDataSourceRef.current.length > 0) {
          lightbox.options.dataSource = fullDataSourceRef.current;
          fullDataSourceRef.current = [];
        }
      });
    });

    lightbox.init();
    lightboxRef.current = lightbox;
    window.currentLightbox = lightbox;

    return () => {
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
      captionContainerRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync dataSource when displayPosts change
  useEffect(() => {
    if (lightboxRef.current && displayPosts.length > 0) {
      lightboxRef.current.options.dataSource = displayPosts.map(post => ({
        src: getImageUrl(post.data?.sample_url || post.data?.jpeg_url || post.data?.file_url),
        msrc: getImageUrl(post.data?.preview_url),
        w: post.data.width,
        h: post.data.height,
        alt: post.data.tags,
        postId: post.id,
      }));
    }
  }, [displayPosts]);

  // onImageClick with group support
  const onImageClick = useCallback((index) => {
    const lightbox = window.currentLightbox;
    if (!lightbox) return;

    const clickedPost = displayPosts[index];
    const groupMembers = groupMapRef.current.get(clickedPost?.id);

    if (groupMembers && groupMembers.length > 1) {
      fullDataSourceRef.current = lightbox.options.dataSource;
      lightbox.options.dataSource = groupMembers.map(post => ({
        src: getImageUrl(post.data?.sample_url || post.data?.jpeg_url || post.data?.file_url),
        msrc: getImageUrl(post.data?.preview_url),
        w: post.data.width,
        h: post.data.height,
        alt: post.data.tags,
        postId: post.id,
      }));
      lightbox.loadAndOpen(0);
    } else {
      fullDataSourceRef.current = [];
      const realIndex = lightbox.options.dataSource.findIndex(
        item => item.postId === clickedPost?.id
      );
      lightbox.loadAndOpen(realIndex >= 0 ? realIndex : index);
    }
  }, [displayPosts]);

  // 关闭 PhotoSwipe 并触发 tag 搜索
  const closeLightboxAndSearch = useCallback((tag) => {
    const lightbox = window.currentLightbox;
    if (lightbox?.pswp) {
      lightbox.pswp.close();
    }
    setTimeout(() => handleTagClick(tag), 100);
  }, [handleTagClick]);

  return {
    onImageClick,
    activePostId,
    captionContainerRef,
    closeLightboxAndSearch,
  };
}
