import React from 'react';
import { Box, Pagination } from '@mui/material';

const SimplePagination = ({ 
  currentPage, 
  totalPages, 
  onPageChange,
  isLoading = false
}) => {
  // 只在有多页时显示
  if (!totalPages || totalPages <= 1) {
    return null;
  }

  return (
    <Box 
      sx={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        mt: 4, 
        mb: 2
      }}
    >
      <Pagination
        count={totalPages}
        page={currentPage}
        onChange={(event, value) => onPageChange(value)}
        disabled={isLoading}
        color="primary"
        showFirstButton
        showLastButton
        siblingCount={1}
        boundaryCount={1}
        size="large"
      />
    </Box>
  );
};

export default SimplePagination;
