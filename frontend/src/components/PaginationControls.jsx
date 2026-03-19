import React, { useState } from 'react';
import { Box, Pagination, Typography, Select, MenuItem, FormControl, InputLabel, FormControlLabel, Switch, TextField, Button, Stack } from '@mui/material';

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
  onLikedFilterChange,
  showLikedArtistsOnly = false,
  onLikedArtistsFilterChange,
  currentPageLikedCount = 0
}) => {
  const [jumpToPage, setJumpToPage] = useState('');

  // 总是显示控件，即使只有一页（因为有排序和liked过滤功能）
  const showPagination = totalPages > 1;

  const handleJumpToPage = () => {
    const pageNumber = parseInt(jumpToPage, 10);
    if (pageNumber >= 1 && pageNumber <= totalPages) {
      onPageChange(pageNumber);
      setJumpToPage('');
    }
  };

  const handleInputKeyPress = (event) => {
    if (event.key === 'Enter') {
      handleJumpToPage();
    }
  };

  const handleInputChange = (event) => {
    const value = event.target.value;
    if (value === '' || /^\d+$/.test(value)) {
      setJumpToPage(value);
    }
  };

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        mt: 4,
        mb: 2,
        gap: 2
      }}
    >
      {/* 第一行：页面导航 */}
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'row',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 2
        }}
      >
        {/* 分页信息 */}
        <Typography variant="body2" color="text.secondary">
          显示第 {((currentPage - 1) * perPage) + 1} - {Math.min(currentPage * perPage, totalItems)} 项，
          共 {totalItems} 项
        </Typography>

        {/* 右侧导航控件组 */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
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

          {/* 跳转到指定页面 */}
          {showPagination && (
            <Stack direction="row" spacing={1} alignItems="center">
              <Typography variant="body2" color="text.secondary">
                跳转到
              </Typography>
              <TextField
                size="small"
                value={jumpToPage}
                onChange={handleInputChange}
                onKeyPress={handleInputKeyPress}
                placeholder="页码"
                disabled={isLoading}
                sx={{
                  width: '70px',
                  '& .MuiOutlinedInput-root': {
                    height: '32px'
                  }
                }}
                inputProps={{
                  min: 1,
                  max: totalPages,
                  style: { textAlign: 'center' }
                }}
              />
              <Typography variant="body2" color="text.secondary">
                页
              </Typography>
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
      <Box
        sx={{
          display: 'flex',
          flexDirection: { xs: 'column', sm: 'row' },
          alignItems: { xs: 'flex-start', sm: 'center' },
          justifyContent: 'flex-end',
          gap: 2,
          flexWrap: 'wrap'
        }}
      >
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
              <MenuItem value="relevance">按相关度排序</MenuItem>
              <MenuItem value="score">Score (高到低)</MenuItem>
              <MenuItem value="id">ID (新到旧)</MenuItem>
              <MenuItem value="file_size">文件大小 (大到小)</MenuItem>
              <MenuItem value="resolution">分辨率 (大到小)</MenuItem>
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
                onChange={(e) => {
                  const newValue = e.target.checked;
                  onLikedFilterChange(newValue);
                  // 如果打开"仅收藏"，则关闭"仅收藏画师"
                  if (newValue && showLikedArtistsOnly && onLikedArtistsFilterChange) {
                    onLikedArtistsFilterChange(false);
                  }
                }}
                disabled={isLoading}
                color="primary"
                size="small"
              />
            }
            label={`仅收藏${currentPageLikedCount > 0 ? ` (${currentPageLikedCount})` : ''}`}
            sx={{
              m: 0,
              '& .MuiFormControlLabel-label': {
                fontSize: '0.875rem',
                color: showLikedOnly ? 'primary.main' : 'text.secondary'
              }
            }}
          />
        )}

        {/* 仅收藏画师过滤开关 */}
        {onLikedArtistsFilterChange && (
          <FormControlLabel
            control={
              <Switch
                checked={showLikedArtistsOnly}
                onChange={(e) => {
                  const newValue = e.target.checked;
                  onLikedArtistsFilterChange(newValue);
                  // 如果打开"仅收藏画师"，则关闭"仅收藏"
                  if (newValue && showLikedOnly && onLikedFilterChange) {
                    onLikedFilterChange(false);
                  }
                }}
                disabled={isLoading}
                color="secondary"
                size="small"
              />
            }
            label="仅收藏画师"
            sx={{
              m: 0,
              '& .MuiFormControlLabel-label': {
                fontSize: '0.875rem',
                color: showLikedArtistsOnly ? 'secondary.main' : 'text.secondary'
              }
            }}
          />
        )}
      </Box>
    </Box>
  );
};

export default PaginationControls;
