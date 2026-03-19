import React from 'react';
import Masonry from '@mui/lab/Masonry';
import { Box, Fade, Zoom } from '@mui/material';

const MasonryGrid = ({ posts, onImageClick, LazyImageCard, isLoading, onLikeChange }) => {
  // 使用传入的LazyImageCard组件
  const CardComponent = LazyImageCard;

  return (
    <Box 
      sx={{ 
        width: '100%',
        overflow: 'hidden', // 防止内容溢出
        px: { xs: 1, sm: 2 }, // 添加左右内边距
      }}
    >
      <Fade in={!isLoading} timeout={500}>
        <Masonry 
          columns={{ xs: 2, sm: 3, md: 4, lg: 5 }} 
          spacing={2}
          sx={{
            width: '100%',
            margin: 0, // 重置margin
            '& .MuiMasonry-root': {
              maxWidth: '100%', // 确保不超出容器宽度
            }
          }}
        >
          {posts.map((post, index) => (
            <Zoom 
              key={post.id}
              in={true} 
              timeout={400}
              style={{ 
                transitionDelay: `${Math.min(index * 80, 1200)}ms` // 增加延迟，让刷新效果更明显
              }}
            >
              <Box
                sx={{
                  width: '100%',
                  transition: 'transform 0.3s ease, box-shadow 0.3s ease',
                  '&:hover': {
                    transform: 'translateY(-4px)',
                    boxShadow: '0 8px 25px rgba(0,0,0,0.15)',
                  }
                }}
              >
                <CardComponent
                  post={post}
                  index={index}
                  onImageClick={onImageClick}
                  onLikeChange={onLikeChange}
                />
              </Box>
            </Zoom>
          ))}
        </Masonry>
      </Fade>
    </Box>
  );
};

export default MasonryGrid;