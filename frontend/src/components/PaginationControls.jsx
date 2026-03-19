import React from 'react';
import { Box, Pagination, Typography, Select, MenuItem, FormControl, InputLabel, FormControlLabel, Switch } from '@mui/material';

const PaginationControls = ({ 
  currentPage, 
  totalPages, 
  onPageChange, 
  perPage, 
  onPerPageChange, 
  totalItems,
  isLoading = false,
  sortOption,
  onSortChange,
  showLikedOnly = false,
  onLikedFilterChange
}) => {
  // 总是显示控件，即使只有一页（因为有排序和liked过滤功能）
  const showPagination = totalPages > 1;

  return (
    <Box 
      sx={{ 
        display: 'flex', 
        flexDirection: { xs: 'column', sm: 'row' },
        justifyContent: 'space-between', 
        alignItems: 'center', 
        mt: 4, 
        mb: 2,
        gap: 2
      }}
    >
      {/* 分页信息 */}
      <Typography variant="body2" color="text.secondary">
        显示第 {((currentPage - 1) * perPage) + 1} - {Math.min(currentPage * perPage, totalItems)} 项，
        共 {totalItems} 项
      </Typography>

      {/* 分页控件 */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        {/* 每页条数选择 */}
        <FormControl size="small" sx={{ minWidth: 120 }}>
          <InputLabel>每页显示</InputLabel>
          <Select
            value={perPage}
            label="每页显示"
            onChange={(e) => onPerPageChange(Number(e.target.value))}
            disabled={isLoading}
          >
            <MenuItem value={100}>100 条</MenuItem>
            <MenuItem value={200}>200 条</MenuItem>
            <MenuItem value={300}>300 条</MenuItem>
            <MenuItem value={500}>500 条</MenuItem>
          </Select>
        </FormControl>

        {/* 排序选择 */}
        {sortOption && onSortChange && (
          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel>排序方式</InputLabel>
            <Select
              value={sortOption}
              label="排序方式"
              onChange={(e) => onSortChange(e.target.value)}
              disabled={isLoading}
            >
              <MenuItem value="score">Score (高到低)</MenuItem>
              <MenuItem value="id">ID (新到旧)</MenuItem>
              <MenuItem value="file_size">文件大小 (大到小)</MenuItem>
              <MenuItem value="waifu_pillow">宽屏优先</MenuItem>
              <MenuItem value="shuffle">随机排序</MenuItem>
            </Select>
          </FormControl>
        )}

        {/* 仅收藏过滤开关 */}
        {onLikedFilterChange && (
          <FormControlLabel
            control={
              <Switch
                checked={showLikedOnly}
                onChange={(e) => onLikedFilterChange(e.target.checked)}
                disabled={isLoading}
                color="primary"
                size="small"
              />
            }
            label="仅收藏"
            sx={{ 
              ml: 1,
              '& .MuiFormControlLabel-label': {
                fontSize: '0.875rem',
                color: showLikedOnly ? 'primary.main' : 'text.secondary'
              }
            }}
          />
        )}

        {/* 分页按钮 - 只在多页时显示 */}
        {showPagination && (
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
          />
        )}
      </Box>
    </Box>
  );
};

export default PaginationControls;
