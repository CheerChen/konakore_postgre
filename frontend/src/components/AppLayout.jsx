import React from 'react';
import { AppBar, Toolbar, Typography, Container, Box, IconButton, Tooltip, Badge } from '@mui/material';
import { FilterAlt as FilterAltIcon, AutoAwesome as AutoAwesomeIcon } from '@mui/icons-material';

const AppLayout = ({ children, onOpenSettings, onOpenRelevanceFilter, relevanceRemovedCount = 0, excludedCountOnPage = 0 }) => {
  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Header区域 */}
      <AppBar position="static" elevation={1} color="default" sx={{ mb: 3 }}>
        <Container maxWidth="xl" sx={{ maxWidth: '100%', px: { xs: 1, sm: 2, md: 3 } }}>
          <Toolbar disableGutters>
            <Typography variant="h6" component="div" sx={{ flex: 1 }}>
              Konakore Gallery
            </Typography>

            {onOpenRelevanceFilter && (
              <Tooltip title={relevanceRemovedCount > 0 ? `相关度过滤（本页已过滤 ${relevanceRemovedCount} 条）` : '相关度过滤'}>
                <IconButton onClick={onOpenRelevanceFilter} size="small" aria-label="relevance filter" sx={{ mr: 0.5 }}>
                  <Badge
                    badgeContent={relevanceRemovedCount > 0 ? relevanceRemovedCount : null}
                    color="error"
                    max={999}
                  >
                    <AutoAwesomeIcon />
                  </Badge>
                </IconButton>
              </Tooltip>
            )}

            {onOpenSettings && (
              <Tooltip title={excludedCountOnPage > 0 ? `排除标签（本页已过滤 ${excludedCountOnPage} 条）` : '排除标签'}>
                <IconButton onClick={onOpenSettings} size="small" aria-label="excluded tags filter">
                  <Badge
                    badgeContent={excludedCountOnPage > 0 ? excludedCountOnPage : null}
                    color="warning"
                    max={999}
                  >
                    <FilterAltIcon />
                  </Badge>
                </IconButton>
              </Tooltip>
            )}
          </Toolbar>
        </Container>
      </AppBar>

      {/* 主内容区域 - 顶部对齐，不居中 */}
      <Container
        maxWidth="xl"
        sx={{
          maxWidth: '100%',
          overflow: 'hidden',
          px: { xs: 1, sm: 2, md: 3 },
          flex: 1,
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        <Box
          component="main"
          sx={{
            mb: 4,
            width: '100%',
            overflow: 'hidden',
            flex: 1
          }}
        >
          {children}
        </Box>
      </Container>
    </Box>
  );
};

export default AppLayout;