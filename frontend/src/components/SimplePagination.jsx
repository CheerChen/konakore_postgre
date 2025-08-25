import React, { useState } from 'react';
import { 
  Box, 
  Pagination, 
  TextField, 
  Button, 
  Typography,
  Stack
} from '@mui/material';

const SimplePagination = ({ 
  currentPage, 
  totalPages, 
  onPageChange,
  isLoading = false
}) => {
  const [jumpToPage, setJumpToPage] = useState('');

  // 只在有多页时显示
  if (!totalPages || totalPages <= 1) {
    return null;
  }

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
    // 只允许数字输入
    if (value === '' || /^\d+$/.test(value)) {
      setJumpToPage(value);
    }
  };

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
        size="large"
      />
      
      {/* 跳转到指定页面 */}
      <Stack 
        direction="row" 
        spacing={1} 
        alignItems="center"
        sx={{ mt: 1 }}
      >
        <Typography variant="body2" color="text.secondary">
          跳转到第
        </Typography>
        <TextField
          size="small"
          value={jumpToPage}
          onChange={handleInputChange}
          onKeyPress={handleInputKeyPress}
          placeholder="页码"
          disabled={isLoading}
          sx={{
            width: '80px',
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
      
      {/* 页面信息 */}
      <Typography variant="caption" color="text.secondary">
        第 {currentPage} 页，共 {totalPages} 页
      </Typography>
    </Box>
  );
};

export default SimplePagination;
