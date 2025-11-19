import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardMedia, IconButton, Box, Skeleton, Fade, Grow, Snackbar, Alert } from '@mui/material';
import FavoriteBorderIcon from '@mui/icons-material/FavoriteBorder';
import FavoriteIcon from '@mui/icons-material/Favorite';
import CloudOffIcon from '@mui/icons-material/CloudOff';
import ImageNotSupportedIcon from '@mui/icons-material/ImageNotSupported';
import { useMutation } from '@tanstack/react-query';
import { useInView } from 'react-intersection-observer';
import { toggleLike } from '../api';
import { getImageUrl } from '../utils/imageUtils';
import { connectivityService } from '../utils/ConnectivityService';

const LazyImageCard = ({ post, index, onImageClick, onLikeChange }) => {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [isLiked, setIsLiked] = useState(post.liked);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
  const [shouldLoadImage, setShouldLoadImage] = useState(false);
  const [isOffline, setIsOffline] = useState(!connectivityService.isOnline);

  // 懒加载监听
  const { ref, inView } = useInView({
    triggerOnce: false,
    threshold: 0,
    rootMargin: '400px 0px'
  });

  // 防抖加载逻辑
  useEffect(() => {
    let timerId;
    if (inView && !shouldLoadImage) {
      timerId = setTimeout(() => {
        setShouldLoadImage(true);
      }, 200);
    }
    return () => clearTimeout(timerId);
  }, [inView, shouldLoadImage]);

  // 监听连通性服务
  useEffect(() => {
    const handleConnectivityChange = (online) => {
      setIsOffline(!online);

      // 如果网络恢复，且当前图片处于错误状态，且在视野内，则重试
      if (online && imageError && inView) {
        console.log(`Network restored, retrying image for post ${post.id}`);
        setImageError(false);
        setImageLoaded(false);
        // 强制重新渲染图片
        setShouldLoadImage(false);
        setTimeout(() => setShouldLoadImage(true), 50);
      }
    };

    // 订阅状态变化
    const unsubscribe = connectivityService.subscribe(handleConnectivityChange);
    return unsubscribe;
  }, [imageError, inView, post.id]);

  // 重置状态当 post id 变化
  useEffect(() => {
    setImageLoaded(false);
    setImageError(false);
  }, [post.id]);

  const handleImageLoad = () => {
    setImageLoaded(true);
    setImageError(false);
  };

  const handleImageError = () => {
    console.warn(`Image load failed for post ${post.id}`);
    setImageError(true);
    setImageLoaded(false);
    connectivityService.reportFailure();
  };

  const mutation = useMutation({
    mutationFn: () => toggleLike(post.id, isLiked),
    onSuccess: (data) => {
      const newLikedState = !isLiked;
      setIsLiked(newLikedState);
      if (onLikeChange) {
        onLikeChange(post.id, newLikedState);
      }
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
    if (reason === 'clickaway') return;
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
            {(!imageLoaded && !imageError) && (
              <Skeleton
                variant="rectangular"
                width="100%"
                height="100%"
                animation="wave"
              />
            )}

            {!imageError && (
              <Fade in={imageLoaded} timeout={600}>
                <CardMedia
                  component="img"
                  decoding="async"
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

            {imageError && (
              <Grow in={true} timeout={400}>
                <Box
                  sx={{
                    width: '100%',
                    height: '100%',
                    minHeight: 200,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: 'grey.200',
                    color: 'grey.500',
                    cursor: 'default',
                    textAlign: 'center',
                    px: 2,
                    gap: 1
                  }}
                >
                  {isOffline ? (
                    <CloudOffIcon sx={{ fontSize: 52, color: 'grey.500' }} />
                  ) : (
                    <ImageNotSupportedIcon sx={{ fontSize: 52, color: 'grey.500' }} />
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
            height="100%"
            animation="wave"
          />
        )}
      </Card>

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
