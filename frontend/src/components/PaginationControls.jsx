import React, { useState } from 'react';
import { Box, Pagination, Typography, Select, MenuItem, FormControl, InputLabel, TextField, Button, Stack, IconButton, Tooltip, Badge } from '@mui/material';
import { FilterAlt as FilterAltIcon, AutoAwesome as AutoAwesomeIcon } from '@mui/icons-material';

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
  // 过滤入口（Gallery 专用，Favorites 不传）
  onOpenExcludedTags,
  onOpenRelevanceFilter,
  excludedCountOnPage = 0,
  relevanceRemovedCount = 0,
}) => {
  const [jumpToPage, setJumpToPage] = useState('');

  const showPagination = totalPages > 1;

  const handleJumpToPage = () => {
    const pageNumber = parseInt(jumpToPage, 10);
    if (pageNumber >= 1 && pageNumber <= totalPages) {
      onPageChange(pageNumber);
      setJumpToPage('');
    }
  };

  const handleInputKeyPress = (event) => {
    if (event.key === 'Enter') handleJumpToPage();
  };

  const handleInputChange = (event) => {
    const value = event.target.value;
    if (value === '' || /^\d+$/.test(value)) setJumpToPage(value);
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', mt: 4, mb: 2, gap: 2 }}>
      {/* 第一行：页面导航 */}
      <Box sx={{ display: 'flex', flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 2 }}>
        <Typography variant="body2" color="text.secondary">
          显示第 {((currentPage - 1) * perPage) + 1} - {Math.min(currentPage * perPage, totalItems)} 项，
          共 {totalItems} 项
        </Typography>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
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

          {showPagination && (
            <Stack direction="row" spacing={1} alignItems="center">
              <Typography variant="body2" color="text.secondary">跳转到</Typography>
              <TextField
                size="small"
                value={jumpToPage}
                onChange={handleInputChange}
                onKeyPress={handleInputKeyPress}
                placeholder="页码"
                disabled={isLoading}
                sx={{ width: '70px', '& .MuiOutlinedInput-root': { height: '32px' } }}
                inputProps={{ min: 1, max: totalPages, style: { textAlign: 'center' } }}
              />
              <Typography variant="body2" color="text.secondary">页</Typography>
              <Button
                size="small"
                variant="outlined"
                onClick={handleJumpToPage}
                disabled={isLoading || !jumpToPage || parseInt(jumpToPage, 10) < 1 || parseInt(jumpToPage, 10) > totalPages}
                sx={{ minWidth: '50px', height: '32px' }}
              >
                跳转
              </Button>
            </Stack>
          )}
        </Box>
      </Box>

      {/* 第二行：筛选和排序 */}
      <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, alignItems: { xs: 'flex-start', sm: 'center' }, justifyContent: 'flex-end', gap: 2, flexWrap: 'wrap' }}>
        <FormControl size="small" sx={{ minWidth: 120 }}>
          <InputLabel>每页显示</InputLabel>
          <Select value={perPage} label="每页显示" onChange={(e) => onPerPageChange(Number(e.target.value))} disabled={isLoading}>
            <MenuItem value={100}>100 条</MenuItem>
            <MenuItem value={200}>200 条</MenuItem>
            <MenuItem value={300}>300 条</MenuItem>
            <MenuItem value={500}>500 条</MenuItem>
          </Select>
        </FormControl>

        {sortOption && onSortChange && (
          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel>排序方式</InputLabel>
            <Select value={sortOption} label="排序方式" onChange={(e) => onSortChange(e.target.value)} disabled={isLoading}>
              <MenuItem value="score">Score (高到低)</MenuItem>
              <MenuItem value="id">ID (新到旧)</MenuItem>
              <MenuItem value="file_size">文件大小 (大到小)</MenuItem>
              <MenuItem value="resolution">分辨率 (大到小)</MenuItem>
              <MenuItem value="waifu_pillow">宽屏优先</MenuItem>
              <MenuItem value="shuffle">随机排序</MenuItem>
            </Select>
          </FormControl>
        )}

        {/* 过滤按钮（仅 Gallery 页传入） */}
        {onOpenRelevanceFilter && (
          <Tooltip title={relevanceRemovedCount > 0 ? `相关度过滤（本页已过滤 ${relevanceRemovedCount} 条）` : '相关度过滤'}>
            <IconButton onClick={onOpenRelevanceFilter} size="small" aria-label="relevance filter">
              <Badge badgeContent={relevanceRemovedCount > 0 ? relevanceRemovedCount : null} color="error" max={999}>
                <AutoAwesomeIcon />
              </Badge>
            </IconButton>
          </Tooltip>
        )}

        {onOpenExcludedTags && (
          <Tooltip title={excludedCountOnPage > 0 ? `排除标签（本页已过滤 ${excludedCountOnPage} 条）` : '排除标签'}>
            <IconButton onClick={onOpenExcludedTags} size="small" aria-label="excluded tags filter">
              <Badge badgeContent={excludedCountOnPage > 0 ? excludedCountOnPage : null} color="warning" max={999}>
                <FilterAltIcon />
              </Badge>
            </IconButton>
          </Tooltip>
        )}
      </Box>
    </Box>
  );
};

export default PaginationControls;
