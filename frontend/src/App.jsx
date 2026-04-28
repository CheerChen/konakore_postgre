import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import HomePage from './pages/HomePage';
import FavoritesPage from './pages/FavoritesPage';
import StatsPage from './pages/StatsPage';
import TasksPage from './pages/TasksPage';
import { TagProvider } from './contexts/TagContext';

function App() {
  return (
    <TagProvider>
      <Router>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/favorites" element={<FavoritesPage />} />
          <Route path="/stats" element={<StatsPage />} />
          <Route path="/tasks" element={<TasksPage />} />
        </Routes>
      </Router>
    </TagProvider>
  );
}

export default App;
