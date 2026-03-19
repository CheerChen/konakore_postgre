import React, { useState } from 'react';
import { Card, CardMedia, IconButton, Box, Skeleton, Fade, Grow, Snackbar, Alert } from '@mui/material';
import FavoriteBorderIcon from '@mui/icons-material/FavoriteBorder';
import FavoriteIcon from '@mui/icons-material/Favorite';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useInView } from 'react-intersection-observer';
import { toggleLike } from '../api';

const LazyImageCard = ({ post, index, onImageClick, onLikeChange }) => {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [isLiked, setIsLiked] = useState(post.is_liked);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
  const queryClient = useQueryClient();

  // 懒加载监听
  const { ref, inView } = useInView({
    triggerOnce: true,
    threshold: 0.1,
    rootMargin: '50px'
  });

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

  // 处理图片 URL
  const getImageUrl = (url) => {
    if (!url) return 'https://via.placeholder.com/300';
    
    return url.replace('konachan.com', 'konachan.net');
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
          {!imageLoaded && !imageError && (
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
                image={imageUrl}
                alt="image"
                onClick={() => onImageClick(index)}
                onLoad={() => setImageLoaded(true)}
                onError={() => setImageError(true)}
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
                  height: 200,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: 'grey.200',
                  color: 'grey.500'
                }}
              >
                图片加载失败
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
