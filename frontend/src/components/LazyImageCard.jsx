import React, { useState, useEffect } from 'react';
import { Card, CardMedia, IconButton, Box, Skeleton, Fade, Grow, Snackbar, Alert } from '@mui/material';
import FavoriteBorderIcon from '@mui/icons-material/FavoriteBorder';
import FavoriteIcon from '@mui/icons-material/Favorite';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useInView } from 'react-intersection-observer';
import { toggleLike } from '../api';
import { getImageUrl, imageRetryHelper } from '../utils/imageUtils';

const LazyImageCard = ({ post, index, onImageClick, onLikeChange }) => {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [isLiked, setIsLiked] = useState(post.is_liked);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
  const [shouldLoadImage, setShouldLoadImage] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [isRetrying, setIsRetrying] = useState(false);
  const queryClient = useQueryClient();

  const maxRetries = 2; // 最大重试次数

  // 处理图片 URL
  const getImageUrl = (url) => {
    if (!url) return 'https://via.placeholder.com/300';
    
    return url.replace('konachan.com', 'konachan.net');
  };

  // 懒加载监听
  const { ref, inView } = useInView({
    triggerOnce: true,
    threshold: 0.1,
    rootMargin: '50px'
  });

  // 当图片进入视口时，直接开始加载
  useEffect(() => {
    if (inView && !shouldLoadImage && !imageError && !isRetrying) {
      setShouldLoadImage(true);
    }
  }, [inView, shouldLoadImage, imageError, isRetrying]);

  // 重试加载图片的函数
  const retryLoadImage = async () => {
    if (retryCount >= maxRetries) {
      console.warn(`Max retries reached for image: ${post.id}`);
      return;
    }

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

          img.src = getImageUrl(post.raw_data?.preview_url);
        });
      }, 1); // 只重试1次，因为组件本身会管理重试次数

      setRetryCount(prev => prev + 1);
      setShouldLoadImage(false);
      setTimeout(() => {
        setShouldLoadImage(true);
        setIsRetrying(false);
      }, 100);
    } catch (error) {
      console.error('Image retry failed:', error);
      if (retryCount >= maxRetries) {
        setImageError(true);
      }
      setIsRetrying(false);
    }
  };

  // 处理图片加载错误
  const handleImageError = () => {
    console.warn(`Image load failed for post ${post.id}, retry count: ${retryCount}`);
    
    if (retryCount < maxRetries) {
      // 自动重试
      retryLoadImage();
    } else {
      // 达到最大重试次数，标记为错误
      setImageError(true);
      setIsRetrying(false);
    }
  };

  const mutation = useMutation({
    mutationFn: toggleLike,
    onSuccess: (data) => {
      // 更新本地状态而不是重新获取数据
      setIsLiked(data.is_liked);
      
      // 通知父组件状态变化
      if (onLikeChange) {
        onLikeChange(post.id, data.is_liked);
      }
      
      // 显示成功消息
      setSnackbar({
        open: true,
        message: data.is_liked ? '已添加到收藏' : '已从收藏中移除',
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
    mutation.mutate(post.id);
  };

  const handleCloseSnackbar = (event, reason) => {
    if (reason === 'clickaway') {
      return;
    }
    setSnackbar({ ...snackbar, open: false });
  };

  const imageUrl = getImageUrl(post.raw_data?.preview_url);

  return (
    <>
      <Card 
        ref={ref}
        sx={{ 
          position: 'relative', 
          cursor: 'pointer', 
          lineHeight: 0,
          aspectRatio: post.raw_data?.width && post.raw_data?.height 
            ? `${post.raw_data.width} / ${post.raw_data.height}` 
            : '4 / 3'
        }}
      >
      {inView ? (
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
                image={imageUrl}
                alt="image"
                onClick={() => onImageClick(index)}
                onLoad={() => setImageLoaded(true)}
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
                  cursor: 'pointer'
                }}
                onClick={() => {
                  if (retryCount < maxRetries) {
                    retryLoadImage();
                  }
                }}
              >
                <div>图片加载失败</div>
                {retryCount < maxRetries && (
                  <div style={{ fontSize: '12px', marginTop: '4px' }}>
                    点击重试 ({retryCount}/{maxRetries})
                  </div>
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
