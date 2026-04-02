import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import './i18n';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CssBaseline, ThemeProvider, createTheme, GlobalStyles } from '@mui/material';

const queryClient = new QueryClient();

const darkTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#7C4DFF',
      light: '#B388FF',
      dark: '#651FFF',
    },
    secondary: {
      main: '#FF6D00',
      light: '#FF9E40',
      dark: '#E65100',
    },
    background: {
      default: '#121212',
      paper: '#1E1E1E',
    },
    caption: {
      link: 'rgba(121, 85, 72, 0.8)',
      file: 'rgba(76, 175, 80, 0.8)',
      size: 'rgba(156, 39, 176, 0.8)',
      score: 'rgba(255, 152, 0, 0.8)',
      date: 'rgba(96, 125, 139, 0.8)',
      liked: 'rgba(244, 67, 54, 0.8)',
    },
  },
  typography: {
    fontFamily: '"Roboto", "Noto Sans SC", system-ui, sans-serif',
  },
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={darkTheme}>
        <CssBaseline />
        <GlobalStyles styles={{ '#root': { margin: '0 auto' } }} />
        <App />
      </ThemeProvider>
    </QueryClientProvider>
  </React.StrictMode>
);