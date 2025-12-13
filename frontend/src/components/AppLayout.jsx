import React from 'react';
import { AppBar, Toolbar, Typography, Container, Box, IconButton, Tooltip } from '@mui/material';
import { Settings as SettingsIcon } from '@mui/icons-material';

const AppLayout = ({ children, onOpenSettings }) => {
  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Header区域 */}
      <AppBar position="static" elevation={1} color="default" sx={{ mb: 3 }}>
        <Container maxWidth="xl" sx={{ maxWidth: '100%', px: { xs: 1, sm: 2, md: 3 } }}>
          <Toolbar disableGutters>
            <Typography variant="h6" component="div" sx={{ flex: 1 }}>
              Konakore Gallery
            </Typography>

            {onOpenSettings && (
              <Tooltip title="设置">
                <IconButton onClick={onOpenSettings} size="small" aria-label="settings">
                  <SettingsIcon />
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