import React from 'react';
import { AppBar, Toolbar, Container, Box, Tab, Tabs, IconButton, Tooltip } from '@mui/material';
import { PhotoLibrary as GalleryIcon, Favorite as FavoriteIcon, BarChart as StatsIcon, Translate as TranslateIcon } from '@mui/icons-material';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

const AppLayout = ({ children }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const currentTab = ['/favorites', '/stats'].includes(location.pathname) ? location.pathname : '/';

  const toggleLanguage = () => {
    const newLang = i18n.language === 'zh-CN' ? 'en' : 'zh-CN';
    i18n.changeLanguage(newLang);
    localStorage.setItem('konakore_language', newLang);
  };

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
                label={t('nav.gallery')}
                value="/"
                sx={{ minHeight: 48, textTransform: 'none', fontWeight: 500 }}
              />
              <Tab
                icon={<FavoriteIcon sx={{ fontSize: 20 }} />}
                iconPosition="start"
                label={t('nav.favorites')}
                value="/favorites"
                sx={{ minHeight: 48, textTransform: 'none', fontWeight: 500 }}
              />
              <Tab
                icon={<StatsIcon sx={{ fontSize: 20 }} />}
                iconPosition="start"
                label={t('nav.stats')}
                value="/stats"
                sx={{ minHeight: 48, textTransform: 'none', fontWeight: 500 }}
              />
            </Tabs>
            <Box sx={{ flexGrow: 1 }} />
            <Tooltip title={i18n.language === 'zh-CN' ? 'English' : '中文'}>
              <IconButton onClick={toggleLanguage} size="small" sx={{ ml: 1 }}>
                <TranslateIcon fontSize="small" />
              </IconButton>
            </Tooltip>
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
