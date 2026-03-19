import React, { useState } from 'react';
import { Autocomplete, TextField, Box, Chip } from '@mui/material';

const SearchBar = ({ onSearch, searchQuery, onClearSearch, totalPosts, availableTags = [], showLikedOnly = false }) => {
  const [inputValue, setInputValue] = useState('');

  const handleInputChange = (event, newInputValue) => {
    setInputValue(newInputValue);
  };

  const handleChange = (event, newValue) => {
    if (Array.isArray(newValue)) {
      // multiple模式下的处理
      if (newValue.length > 0) {
        const newTag = newValue[newValue.length - 1];
        onSearch(newTag);
        setInputValue('');
      } else {
        onClearSearch();
      }
    } else if (newValue) {
      // 单选模式下直接搜索
      onSearch(newValue);
      setInputValue('');
    }
  };

  const handleKeyDown = (event) => {
    if (event.key === 'Enter' && inputValue.trim()) {
      event.preventDefault();
      onSearch(inputValue.trim());
      setInputValue('');
    }
  };

  return (
    <Box sx={{ mb: 4, width: '100%' }}>
      <Autocomplete
        multiple={!!searchQuery}
        value={searchQuery ? [searchQuery] : null}
        inputValue={inputValue}
        onInputChange={handleInputChange}
        onChange={handleChange}
        options={availableTags}
        freeSolo
        autoHighlight
        openOnFocus
        getOptionLabel={(option) => {
          return typeof option === 'string' ? option : String(option || '');
        }}
        isOptionEqualToValue={(option, value) => option === value}
        filterOptions={(options, { inputValue }) => {
          if (!inputValue) {
            // 无输入时显示前15个，优先显示常用的
            return options.slice(0, 15);
          }
          
          // 有输入时进行模糊匹配
          const filtered = options.filter(option => 
            option.toLowerCase().includes(inputValue.toLowerCase())
          );
          
          // 排序：以输入开头的优先，然后是包含输入的
          const sorted = filtered.sort((a, b) => {
            const aStarts = a.toLowerCase().startsWith(inputValue.toLowerCase());
            const bStarts = b.toLowerCase().startsWith(inputValue.toLowerCase());
            
            if (aStarts && !bStarts) return -1;
            if (!aStarts && bStarts) return 1;
            return a.localeCompare(b);
          });
          
          return sorted.slice(0, 25);
        }}
        renderTags={(tagValue, getTagProps) =>
          tagValue.map((option, index) => (
            <Chip
              key={index}
              label={option}
              {...getTagProps({ index })}
              onDelete={() => onClearSearch()}
              color="primary"
              variant="outlined"
              sx={{
                margin: '2px',
                '& .MuiChip-deleteIcon': {
                  color: 'primary.main',
                  '&:hover': {
                    color: 'primary.dark',
                  }
                }
              }}
            />
          ))
        }
        renderInput={(params) => (
          <TextField
            {...params}
            label={searchQuery ? "" : "搜索标签..."}
            variant="outlined"
            placeholder={searchQuery ? "输入新标签搜索" : "输入标签名称"}
            onKeyDown={handleKeyDown}
            helperText=""
          />
        )}
        sx={{
          '& .MuiAutocomplete-inputRoot': {
            minHeight: '56px',
            paddingTop: searchQuery ? '8px' : '16.5px',
            paddingBottom: searchQuery ? '8px' : '16.5px',
          }
        }}
      />
    </Box>
  );
};

export default SearchBar;
