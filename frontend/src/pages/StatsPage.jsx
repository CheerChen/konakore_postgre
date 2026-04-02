import React, { useMemo, useRef, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  Box, Typography, CircularProgress, Button, Paper,
} from '@mui/material';
import { ErrorOutline as ErrorIcon } from '@mui/icons-material';
import AppLayout from '../components/AppLayout';
import { getStatsOverview, getUserPreferences } from '../api';

// ============================================================
// Sub-components
// ============================================================

/** Summary Cards */
function SummaryCards({ totalPosts, totalLiked, ratio, t }) {
  const cards = [
    { value: totalPosts.toLocaleString(), label: t('stats.totalPosts'), color: '#B388FF' },
    { value: totalLiked.toLocaleString(), label: t('stats.favorites'), color: '#FF9E40' },
    { value: (ratio * 100).toFixed(2) + '%', label: t('stats.overallRatio'), color: '#69F0AE' },
  ];
  return (
    <Box sx={{ display: 'flex', gap: 2, mb: 4, flexWrap: 'wrap' }}>
      {cards.map((c, i) => (
        <Paper key={i} sx={{ flex: 1, minWidth: 140, p: '20px 24px', bgcolor: 'background.paper', borderRadius: 3 }}>
          <Typography sx={{ fontSize: 28, fontWeight: 700, color: c.color }}>{c.value}</Typography>
          <Typography sx={{ fontSize: 13, color: 'text.secondary', mt: 0.5 }}>{c.label}</Typography>
        </Paper>
      ))}
    </Box>
  );
}

/** Ratio Heat Map */
function HeatMap({ buckets, t }) {
  const maxRatio = useMemo(() => Math.max(...buckets.map(b => b.liked_count / Math.max(b.total_count, 1)), 0.001), [buckets]);
  const tooltipRef = useRef(null);

  const showTip = useCallback((e, b) => {
    const tip = tooltipRef.current;
    if (!tip) return;
    const ratio = b.liked_count / Math.max(b.total_count, 1);
    tip.innerHTML = `<b>${t('stats.idRange', { start: b.id_start.toLocaleString(), end: b.id_end.toLocaleString() })}</b><br>${t('stats.favoritesLegend')}: ${b.liked_count} / ${b.total_count.toLocaleString()}<br>${t('stats.ratio')}: ${(ratio * 100).toFixed(2)}%`;
    tip.style.display = 'block';
    tip.style.left = Math.min(e.clientX + 12, window.innerWidth - 220) + 'px';
    tip.style.top = (e.clientY - 10) + 'px';
  }, [t]);
  const hideTip = useCallback(() => { if (tooltipRef.current) tooltipRef.current.style.display = 'none'; }, []);

  return (
    <>
      <Box sx={{ display: 'flex', height: 28, borderRadius: 1.5, overflow: 'hidden', cursor: 'crosshair' }}>
        {buckets.map((b, i) => {
          const intensity = (b.liked_count / Math.max(b.total_count, 1)) / maxRatio;
          const bg = intensity < 0.01
            ? '#1a1a1a'
            : `hsl(265, ${60 + intensity * 40}%, ${10 + intensity * 45}%)`;
          return (
            <Box
              key={i}
              onMouseMove={e => showTip(e, b)}
              onMouseLeave={hideTip}
              sx={{ flex: 1, bgcolor: bg, '&:hover': { opacity: 0.75 } }}
            />
          );
        })}
      </Box>
      <AxisLabels buckets={buckets} />
      <Tooltip ref={tooltipRef} />
    </>
  );
}

/** Distribution Density Bar Chart */
function DensityChart({ buckets, t }) {
  const maxTotal = useMemo(() => Math.max(...buckets.map(b => b.total_count)), [buckets]);
  const maxLiked = useMemo(() => Math.max(...buckets.map(b => b.liked_count), 1), [buckets]);
  const tooltipRef = useRef(null);

  const showTip = useCallback((e, b) => {
    const tip = tooltipRef.current;
    if (!tip) return;
    const ratio = b.liked_count / Math.max(b.total_count, 1);
    tip.innerHTML = `<b>${t('stats.idRange', { start: b.id_start.toLocaleString(), end: b.id_end.toLocaleString() })}</b><br>${t('stats.total')}: ${b.total_count.toLocaleString()}<br><span style="color:#B388FF">${t('stats.favoritesLegend')}: ${b.liked_count}</span><br>${t('stats.ratio')}: ${(ratio * 100).toFixed(2)}%`;
    tip.style.display = 'block';
    tip.style.left = Math.min(e.clientX + 12, window.innerWidth - 220) + 'px';
    tip.style.top = (e.clientY - 10) + 'px';
  }, [t]);
  const hideTip = useCallback(() => { if (tooltipRef.current) tooltipRef.current.style.display = 'none'; }, []);

  return (
    <>
      <Box sx={{ display: 'flex', alignItems: 'flex-end', height: 180, gap: '1px' }}>
        {buckets.map((b, i) => (
          <Box
            key={i}
            onMouseMove={e => showTip(e, b)}
            onMouseLeave={hideTip}
            sx={{ flex: 1, height: '100%', position: 'relative', cursor: 'crosshair' }}
          >
            <Box sx={{
              width: '100%', position: 'absolute', bottom: 0,
              height: `${(b.total_count / maxTotal) * 100}%`,
              bgcolor: '#2a2a2a', borderRadius: '2px 2px 0 0',
              '&:hover': { bgcolor: '#3a3a3a' },
            }} />
            <Box sx={{
              width: '100%', position: 'absolute', bottom: 0, zIndex: 1,
              height: `${(b.liked_count / maxLiked) * 80}%`,
              bgcolor: 'primary.main', borderRadius: '2px 2px 0 0',
              '&:hover': { bgcolor: 'primary.light' },
            }} />
          </Box>
        ))}
      </Box>
      <AxisLabels buckets={buckets} />
      <Tooltip ref={tooltipRef} />
    </>
  );
}

/** Rating Breakdown Stacked Bars */
function RatingBreakdown({ ratings, t }) {
  const RATING_COLORS = { s: '#4CAF50', q: '#FF9800', e: '#F44336' };
  const RATING_NAMES = { s: t('stats.safe'), q: t('stats.questionable'), e: t('stats.explicit') };

  const allTotal = useMemo(() => ratings.reduce((acc, r) => acc + r.total_count, 0), [ratings]);
  const likedTotal = useMemo(() => ratings.reduce((acc, r) => acc + r.liked_count, 0), [ratings]);
  const tooltipRef = useRef(null);

  const showTip = useCallback((e, name, count, total) => {
    const tip = tooltipRef.current;
    if (!tip) return;
    const pct = ((count / Math.max(total, 1)) * 100).toFixed(1);
    tip.innerHTML = `<b>${name}</b><br>${count.toLocaleString()} (${pct}%)`;
    tip.style.display = 'block';
    tip.style.left = Math.min(e.clientX + 12, window.innerWidth - 220) + 'px';
    tip.style.top = (e.clientY - 10) + 'px';
  }, []);
  const hideTip = useCallback(() => { if (tooltipRef.current) tooltipRef.current.style.display = 'none'; }, []);

  const renderBar = (label, getCount, total) => (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
      <Typography sx={{ fontSize: 13, color: 'text.secondary', width: 70, flexShrink: 0 }}>{label}</Typography>
      <Box sx={{ flex: 1, height: 28, borderRadius: 1.5, overflow: 'hidden', display: 'flex', cursor: 'crosshair' }}>
        {ratings.map(r => {
          const count = getCount(r);
          const pct = (count / Math.max(total, 1)) * 100;
          return (
            <Box
              key={r.rating}
              onMouseMove={e => showTip(e, RATING_NAMES[r.rating], count, total)}
              onMouseLeave={hideTip}
              sx={{
                width: `${pct}%`, height: '100%',
                bgcolor: RATING_COLORS[r.rating],
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, color: '#fff', fontWeight: 500,
                '&:hover': { opacity: 0.8 },
              }}
            >
              {pct > 8 ? `${pct.toFixed(1)}%` : ''}
            </Box>
          );
        })}
      </Box>
    </Box>
  );

  return (
    <Paper sx={{ bgcolor: 'background.paper', borderRadius: 3, p: 2.5, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      {renderBar(t('stats.allPosts'), r => r.total_count, allTotal)}
      {renderBar(t('stats.favorites'), r => r.liked_count, likedTotal)}
      <Tooltip ref={tooltipRef} />
    </Paper>
  );
}

/** Top Rankings from preferences data */
function TopRankings({ preferences, t }) {
  const TYPES = [
    { key: 'ARTIST', title: t('stats.topArtists'), color: '#FF6D00' },
    { key: 'CHARACTER', title: t('stats.topCharacters'), color: '#7C4DFF' },
    { key: 'COPYRIGHT', title: t('stats.topCopyrights'), color: '#00BFA5' },
  ];

  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 2.5 }}>
      {TYPES.map(({ key, title, color }) => {
        const items = (preferences[key] || []).slice(0, 10);
        if (!items.length) return null;
        const maxCount = items[0].liked_count;
        return (
          <Paper key={key} sx={{ bgcolor: 'background.paper', borderRadius: 3, p: 2.5 }}>
            <Typography sx={{ fontSize: 14, color: 'text.secondary', mb: 1.5 }}>{title}</Typography>
            {items.map((item, i) => (
              <Box key={item.name} sx={{ display: 'flex', alignItems: 'center', gap: 1.25, mb: 1 }}>
                <Typography sx={{ fontSize: 12, color: 'text.disabled', width: 20, textAlign: 'right', fontWeight: 700 }}>{i + 1}</Typography>
                <Box sx={{ flex: 1, height: 22, bgcolor: '#2a2a2a', borderRadius: 1, overflow: 'hidden', position: 'relative' }}>
                  <Box sx={{
                    height: '100%', borderRadius: 1,
                    width: `${(item.liked_count / maxCount) * 100}%`,
                    bgcolor: i < 3 ? color : `${color}99`,
                    display: 'flex', alignItems: 'center', pl: 1,
                    fontSize: 11, color: '#fff', fontWeight: 500, whiteSpace: 'nowrap',
                    minWidth: 'fit-content',
                  }}>
                    {item.name.replace(/_/g, ' ')}
                  </Box>
                </Box>
                <Typography sx={{ fontSize: 11, color: 'text.disabled', width: 36, textAlign: 'right' }}>{item.liked_count}</Typography>
              </Box>
            ))}
          </Paper>
        );
      })}
    </Box>
  );
}

/** Shared axis labels */
function AxisLabels({ buckets }) {
  if (!buckets.length) return null;
  const first = buckets[0];
  const last = buckets[buckets.length - 1];
  const mid = Math.round((first.id_end + last.id_start) / 2);
  return (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.5, fontSize: 11, color: '#555' }}>
      <span>{first.id_end.toLocaleString()}</span>
      <span>{mid.toLocaleString()}</span>
      <span>{last.id_start.toLocaleString()}</span>
    </Box>
  );
}

/** Shared tooltip */
const Tooltip = React.forwardRef((_, ref) => (
  <Box
    ref={ref}
    sx={{
      position: 'fixed', display: 'none', pointerEvents: 'none', zIndex: 1200,
      bgcolor: 'rgba(0,0,0,0.92)', color: '#fff', p: '10px 14px',
      borderRadius: 2, fontSize: 12, lineHeight: 1.7, border: '1px solid #333',
    }}
  />
));

/** Legend row */
function Legend({ items }) {
  return (
    <Box sx={{ display: 'flex', gap: 2, mb: 1.25, fontSize: 12, color: 'text.secondary' }}>
      {items.map(({ color, label }) => (
        <Box key={label} component="span" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Box sx={{ width: 10, height: 10, borderRadius: 0.5, bgcolor: color }} />
          {label}
        </Box>
      ))}
    </Box>
  );
}

// ============================================================
// Main Page
// ============================================================

const StatsPage = () => {
  const { t } = useTranslation();

  const statsQuery = useQuery({
    queryKey: ['stats-overview'],
    queryFn: getStatsOverview,
    staleTime: 5 * 60 * 1000,
  });

  const prefsQuery = useQuery({
    queryKey: ['user-preferences'],
    queryFn: getUserPreferences,
    staleTime: 5 * 60 * 1000,
  });

  const isLoading = statsQuery.isLoading || prefsQuery.isLoading;
  const isError = statsQuery.isError;

  if (isLoading) {
    return (
      <AppLayout>
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}>
          <CircularProgress />
        </Box>
      </AppLayout>
    );
  }

  if (isError) {
    return (
      <AppLayout>
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, py: 8 }}>
          <ErrorIcon sx={{ fontSize: 48, color: 'error.main' }} />
          <Typography color="error">{t('status.loadError')}</Typography>
          <Button variant="outlined" onClick={() => statsQuery.refetch()}>{t('actions.retry')}</Button>
        </Box>
      </AppLayout>
    );
  }

  const stats = statsQuery.data;
  const prefs = prefsQuery.data?.preferences_by_type || {};

  return (
    <AppLayout>
      <Box sx={{ width: '100%', minWidth: '100%', px: { xs: 1, sm: 2, md: 3 } }}>
        <Typography variant="h6" sx={{ mb: 2, fontWeight: 500 }}>{t('stats.title')}</Typography>

        <SummaryCards
          totalPosts={stats.total_posts}
          totalLiked={stats.total_liked}
          ratio={stats.ratio}
          t={t}
        />

        {/* Ratio Heat Map */}
        <Box sx={{ mb: 6 }}>
          <Typography sx={{ fontSize: 14, color: 'text.secondary', mb: 1 }}>{t('stats.ratioHeatMap')}</Typography>
          <HeatMap buckets={stats.buckets} t={t} />
        </Box>

        {/* Distribution Density */}
        <Box sx={{ mb: 6 }}>
          <Typography sx={{ fontSize: 14, color: 'text.secondary', mb: 1 }}>{t('stats.distributionDensity')}</Typography>
          <Legend items={[
            { color: '#3a3a3a', label: t('stats.totalPostsLegend') },
            { color: 'primary.main', label: t('stats.favoritesLegend') },
          ]} />
          <DensityChart buckets={stats.buckets} t={t} />
        </Box>

        {/* Rating Breakdown */}
        <Box sx={{ mb: 6 }}>
          <Typography sx={{ fontSize: 14, color: 'text.secondary', mb: 1 }}>{t('stats.ratingBreakdown')}</Typography>
          <Legend items={[
            { color: '#4CAF50', label: t('stats.safe') },
            { color: '#FF9800', label: t('stats.questionable') },
            { color: '#F44336', label: t('stats.explicit') },
          ]} />
          <RatingBreakdown ratings={stats.ratings} t={t} />
        </Box>

        {/* Top Favorites */}
        <Box sx={{ mb: 6 }}>
          <Typography sx={{ fontSize: 14, color: 'text.secondary', mb: 1.5 }}>{t('stats.topFavorites')}</Typography>
          <TopRankings preferences={prefs} t={t} />
        </Box>
      </Box>
    </AppLayout>
  );
};

export default StatsPage;
