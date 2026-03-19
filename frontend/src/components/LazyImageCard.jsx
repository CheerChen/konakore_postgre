import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Card, CardMedia, IconButton, Box, Skeleton, Fade, Grow, Snackbar, Alert, CircularProgress } from '@mui/material';
import FavoriteBorderIcon from '@mui/icons-material/FavoriteBorder';
import FavoriteIcon from '@mui/icons-material/Favorite';
import CloudOffIcon from '@mui/icons-material/CloudOff';
import ImageNotSupportedIcon from '@mui/icons-material/ImageNotSupported';
import RefreshIcon from '@mui/icons-material/Refresh';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useInView } from 'react-intersection-observer';
import { toggleLike } from '../api';
import { getImageUrl, imageRetryHelper } from '../utils/imageUtils';

const LazyImageCard = ({ post, index, onImageClick, onLikeChange }) => {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [isLiked, setIsLiked] = useState(post.liked);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
  const [shouldLoadImage, setShouldLoadImage] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [isRetrying, setIsRetrying] = useState(false);
  const [sourceUnavailable, setSourceUnavailable] = useState(false);
  const retryCountRef = useRef(0);
  const queryClient = useQueryClient();

  const maxRetries = 2; // 最大重试次数

  const resetRetryState = useCallback(() => {
    retryCountRef.current = 0;
    setRetryCount(0);
    setSourceUnavailable(false);
  }, [setRetryCount, setSourceUnavailable]);

  const incrementRetryCount = () => {
    retryCountRef.current += 1;
    setRetryCount(retryCountRef.current);
    return retryCountRef.current;
  };

  // 懒加载监听
  const { ref, inView } = useInView({
    triggerOnce: false, // 允许多次触发，用于防抖
    threshold: 0, // 元素一出现就触发
    rootMargin: '400px 0px' // 上下预加载区域扩大到400px
  });

  // 防抖加载逻辑
  useEffect(() => {
    let timerId;
    // 当图片进入预加载区域，且尚未决定加载时
    if (inView && !shouldLoadImage) {
      // 启动一个计时器
      timerId = setTimeout(() => {
        setShouldLoadImage(true);
      }, 200); // 200毫秒防抖延迟
    }

    // 清理函数：当组件卸载或inView变化时，清除计时器
    return () => {
      clearTimeout(timerId);
    };
  }, [inView, shouldLoadImage]);

  useEffect(() => {
    resetRetryState();
    setImageLoaded(false);
    setImageError(false);
    setIsRetrying(false);
  }, [post.id, resetRetryState]);

  useEffect(() => {
    if (!sourceUnavailable) {
      return;
    }

    const checkCooldown = () => {
      if (!imageRetryHelper.isInCooldown()) {
        resetRetryState();
      }
    };

    checkCooldown();
    const intervalId = setInterval(checkCooldown, 1000);
    return () => clearInterval(intervalId);
  }, [sourceUnavailable, resetRetryState]);

  // 重试加载图片的函数
  const retryLoadImage = async () => {
    if (isRetrying) return;

    if (sourceUnavailable) {
      if (imageRetryHelper.isInCooldown()) {
        return;
      }
      setSourceUnavailable(false);
    }

    if (retryCountRef.current >= maxRetries) {
      console.warn(`Max retries reached for image: ${post.id}`);
      setImageError(true);
      return;
    }

    const nextRetryCount = incrementRetryCount();

    setIsRetrying(true);
    setImageError(false);
    setImageLoaded(false);

    try {
      // 使用重试助手
      await imageRetryHelper.withRetry(async () => {
        return new Promise((resolve, reject) => {
          const img = new Image();
          
          const timeout = setTimeout(() => {
            img.onload = null;
            img.onerror = null;
            reject(new Error('Image load timeout'));
          }, 10000);

          img.onload = () => {
            clearTimeout(timeout);
            resolve();
          };

          img.onerror = () => {
            clearTimeout(timeout);
            reject(new Error('Image load failed'));
          };

          img.src = getImageUrl(post.data?.preview_url);
        });
      }, 1); // 只重试1次，因为组件本身会管理重试次数

      setShouldLoadImage(false);
      setTimeout(() => {
        setShouldLoadImage(true);
        setIsRetrying(false);
      }, 100);
    } catch (error) {
      console.error('Image retry failed:', error);
      if (error.code === 'IMAGE_SOURCE_COOLDOWN') {
        setSourceUnavailable(true);
        setImageError(true);
      } else if (nextRetryCount >= maxRetries) {
        setImageError(true);
      }
      setIsRetrying(false);
    }
  };

  const handleImageLoad = () => {
    setImageLoaded(true);
    setImageError(false);
    setIsRetrying(false);
    resetRetryState();
  };

  // 处理图片加载错误
  const handleImageError = () => {
    console.warn(`Image load failed for post ${post.id}, retry count: ${retryCountRef.current}`);
    
    if (sourceUnavailable) {
      setImageError(true);
      setIsRetrying(false);
      return;
    }

    if (retryCountRef.current >= maxRetries) {
      setImageError(true);
      setIsRetrying(false);
      return;
    }
    
    retryLoadImage();
  };

  const mutation = useMutation({
    mutationFn: () => toggleLike(post.id, isLiked),
    onSuccess: (data) => {
      // 更新本地状态而不是重新获取数据
      const newLikedState = !isLiked; // 切换状态
      setIsLiked(newLikedState);
      
      // 通知父组件状态变化
      if (onLikeChange) {
        onLikeChange(post.id, newLikedState);
      }
      
      // 显示成功消息
      setSnackbar({
        open: true,
        message: data.message || (newLikedState ? '已添加到收藏' : '已从收藏中移除'),
        severity: 'success'
      });
    },
    onError: (error) => {
      console.error('Toggle like error:', error);
      setSnackbar({
        open: true,
        message: '操作失败，请重试',
        severity: 'error'
      });
    }
  });

  const handleLike = (e) => {
    e.stopPropagation();
    mutation.mutate();
  };

  const handleCloseSnackbar = (event, reason) => {
    if (reason === 'clickaway') {
      return;
    }
    setSnackbar({ ...snackbar, open: false });
  };

  const imageUrl = getImageUrl(post.data?.preview_url);

  return (
    <>
      <Card 
        ref={ref}
        sx={{ 
          position: 'relative', 
          cursor: 'pointer', 
          lineHeight: 0,
          aspectRatio: post.data?.width && post.data?.height 
            ? `${post.data.width} / ${post.data.height}` 
            : '4 / 3'
        }}
      >
      {shouldLoadImage ? (
        <>
          {(!imageLoaded && !imageError) || isRetrying ? (
            <Skeleton 
              variant="rectangular" 
              width="100%" 
              height="100%" 
              animation="wave"
            />
          ) : null}
          
          {shouldLoadImage && !imageError && !isRetrying && (
            <Fade in={imageLoaded} timeout={600}>
              <CardMedia
                component="img"
                decoding="async" // 异步解码图片
                image={imageUrl}
                alt="image"
                onClick={() => onImageClick(index)}
                onLoad={handleImageLoad}
                onError={handleImageError}
                sx={{
                  display: imageLoaded ? 'block' : 'none',
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  cursor: 'pointer',
                  transition: 'transform 0.3s ease',
                  '&:hover': {
                    transform: 'scale(1.02)',
                  }
                }}
              />
            </Fade>
          )}
          
          {imageError && !isRetrying && (
            <Grow in={true} timeout={400}>
              <Box
                sx={{
                  width: '100%',
                  height: 200,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: 'grey.200',
                  color: 'grey.500',
                  cursor: sourceUnavailable ? 'default' : 'pointer',
                  textAlign: 'center',
                  px: 2,
                  gap: 1
                }}
                onClick={() => {
                  if (sourceUnavailable) return;
                  if (retryCount < maxRetries) {
                    retryLoadImage();
                  }
                }}
              >
                {sourceUnavailable ? (
                  <>
                    <CloudOffIcon sx={{ fontSize: 52, color: 'grey.500' }} />
                    <CircularProgress
                      size={28}
                      thickness={4}
                      sx={{ color: 'grey.400' }}
                    />
                  </>
                ) : (
                  <>
                    <ImageNotSupportedIcon sx={{ fontSize: 52, color: 'grey.500' }} />
                    {retryCount < maxRetries && (
                      <RefreshIcon sx={{ fontSize: 28, color: 'grey.400' }} />
                    )}
                  </>
                )}
              </Box>
            </Grow>
          )}
          
          <Fade in={imageLoaded} timeout={800}>
            <Box
              sx={{
                position: 'absolute',
                bottom: 8,
                right: 8,
                backgroundColor: 'rgba(0, 0, 0, 0.4)',
                borderRadius: '50%',
              }}
            >
              <IconButton
                aria-label="add to favorites"
                onClick={handleLike}
                disabled={mutation.isPending}
                size="small"
                sx={{
                  transition: 'transform 0.2s ease',
                  '&:hover': {
                    transform: 'scale(1.1)',
                  }
                }}
              >
                {isLiked ? (
                  <FavoriteIcon sx={{ color: 'red' }} fontSize="inherit" />
                ) : (
                  <FavoriteBorderIcon sx={{ color: 'white' }} fontSize="inherit" />
                )}
              </IconButton>
            </Box>
          </Fade>
        </>
      ) : (
        <Skeleton 
          variant="rectangular" 
          width="100%" 
          height={200} 
          animation="wave"
        />
      )}
      </Card>

      {/* Snackbar for like/unlike feedback */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={3000}
        onClose={handleCloseSnackbar}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      >
        <Alert
          onClose={handleCloseSnackbar}
          severity={snackbar.severity}
          variant="filled"
          sx={{ width: '100%' }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </>
  );
};

export default LazyImageCard;
