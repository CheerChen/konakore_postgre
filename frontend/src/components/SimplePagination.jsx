import React from 'react';
import {
  Box,
  Pagination,
  Typography
} from '@mui/material';
import { useTranslation } from 'react-i18next';

const SimplePagination = ({
  currentPage,
  totalPages,
  onPageChange,
  isLoading = false
}) => {
  // 只在有多页时显示
  const { t } = useTranslation();

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
        {t('pagination.pageInfo', { current: currentPage, total: totalPages })}
      </Typography>
    </Box>
  );
};

export default SimplePagination;
