import React, { useCallback } from 'react';
import { useWindowSize } from '@react-hook/window-size';
import { Masonry } from 'masonic';
import { Box, useMediaQuery } from '@mui/material';

const MasonryGrid = ({ posts, onImageClick, LazyImageCard, isLoading, onLikeChange, onNotify, groupMap, columnWidth = 260 }) => {
  const prefersReducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const [windowWidth] = useWindowSize();
  const CardComponent = LazyImageCard;

  const renderItem = useCallback(({ data: post, index }) => (
    <Box
      sx={{
        width: '100%',
        transition: prefersReducedMotion ? 'none' : 'transform 0.3s ease, box-shadow 0.3s ease',
        '&:hover': prefersReducedMotion ? {} : {
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
        groupCount={groupMap?.get(post.id)?.length || 0}
        onNotify={onNotify}
      />
    </Box>
  ), [prefersReducedMotion, CardComponent, onImageClick, onLikeChange, groupMap, onNotify]);

  if (!posts.length || isLoading) return null;

  return (
    <Box sx={{ width: '100%', overflow: 'hidden', px: { xs: 1, sm: 2 } }}>
      <Masonry
        key={columnWidth}
        items={posts}
        columnWidth={columnWidth}
        columnGutter={16}
        overscanBy={2}
        render={renderItem}
      />
    </Box>
  );
};

export default MasonryGrid;
