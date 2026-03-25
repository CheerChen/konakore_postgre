import React from 'react';
import { AppBar, Toolbar, Container, Box, Tab, Tabs } from '@mui/material';
import { PhotoLibrary as GalleryIcon, Favorite as FavoriteIcon } from '@mui/icons-material';
import { useLocation, useNavigate } from 'react-router-dom';

const AppLayout = ({ children }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const currentTab = location.pathname === '/favorites' ? '/favorites' : '/';

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <AppBar position="static" elevation={1} color="default" sx={{ mb: 3 }}>
        <Container maxWidth="xl" sx={{ maxWidth: '100%', px: { xs: 1, sm: 2, md: 3 } }}>
          <Toolbar disableGutters sx={{ minHeight: { xs: 48 } }}>
            <Tabs
              value={currentTab}
              onChange={(_, val) => navigate(val)}
              textColor="inherit"
              indicatorColor="primary"
              sx={{ minHeight: 48 }}
            >
              <Tab
                icon={<GalleryIcon sx={{ fontSize: 20 }} />}
                iconPosition="start"
                label="Gallery"
                value="/"
                sx={{ minHeight: 48, textTransform: 'none', fontWeight: 500 }}
              />
              <Tab
                icon={<FavoriteIcon sx={{ fontSize: 20 }} />}
                iconPosition="start"
                label="Favorites"
                value="/favorites"
                sx={{ minHeight: 48, textTransform: 'none', fontWeight: 500 }}
              />
            </Tabs>
          </Toolbar>
        </Container>
      </AppBar>

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
        <Box component="main" sx={{ mb: 4, width: '100%', overflow: 'hidden', flex: 1 }}>
          {children}
        </Box>
      </Container>
    </Box>
  );
};

export default AppLayout;
