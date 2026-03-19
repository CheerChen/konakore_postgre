import React from 'react';
import Masonry from '@mui/lab/Masonry';
import { Box, Fade, Zoom } from '@mui/material';

const MasonryGrid = ({ posts, onImageClick, LazyImageCard, isLoading, onLikeChange }) => {
  // 使用传入的LazyImageCard组件
  const CardComponent = LazyImageCard;

  // 动态计算列数配置
  const getColumns = () => {
    const baseColumns = { xs: 2, sm: 3, md: 4, lg: 5 };
    // 如果结果数量少于最大列数，则使用结果数量作为列数
    const maxColumns = Math.max(...Object.values(baseColumns));
    if (posts.length > 0 && posts.length < maxColumns) {
      return {
        xs: Math.min(posts.length, baseColumns.xs),
        sm: Math.min(posts.length, baseColumns.sm), 
        md: Math.min(posts.length, baseColumns.md),
        lg: Math.min(posts.length, baseColumns.lg)
      };
    }
    return baseColumns;
  };

  const columns = getColumns();

  return (
    <Box 
      sx={{ 
        width: '100%',
        minWidth: '100%', // 确保最小宽度是100%
        overflow: 'hidden', // 防止内容溢出
        px: { xs: 1, sm: 2 }, // 添加左右内边距
      }}
    >
      <Fade in={!isLoading} timeout={500}>
        <Masonry 
          columns={columns} 
          spacing={2}
          sx={{
            width: '100%',
            minWidth: '100%', // 确保最小宽度是100%
            margin: 0, // 重置margin
            display: 'flex', // 强制使用flex布局
            justifyContent: 'flex-start', // 始终左对齐
            '& .MuiMasonry-root': {
              maxWidth: '100%', // 确保不超出容器宽度
              minWidth: '100%', // 确保最小宽度是100%
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