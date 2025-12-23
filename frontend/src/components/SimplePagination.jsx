import React from 'react';
import {
  Box,
  Pagination,
  Typography
} from '@mui/material';

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
        flexDirection: 'column',
        alignItems: 'center',
        gap: 2,
        mt: 4,
        mb: 2
      }}
    >
      {/* 主分页控件 */}
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
        size="medium"
      />

      {/* 页面信息 */}
      <Typography variant="caption" color="text.secondary">
        第 {currentPage} 页，共 {totalPages} 页
      </Typography>
    </Box>
  );
};

export default SimplePagination;
