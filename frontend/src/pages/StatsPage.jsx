import React, { useMemo, useRef, useCallback, useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Box, Typography, CircularProgress, Button, Paper, ButtonGroup,
} from '@mui/material';
import {
  ErrorOutline as ErrorIcon,
  ZoomOut as ZoomOutIcon,
  RestartAlt as ResetIcon,
  ArrowForward as ArrowForwardIcon,
} from '@mui/icons-material';
import AppLayout from '../components/AppLayout';
import { getStatsOverview, getUserPreferences, getStatsDistribution } from '../api';

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

/** Distribution Density Bar Chart with Brush-select Zoom & Range Popover */
function DensityChart({ buckets: initialBuckets, t }) {
  const navigate = useNavigate();
  const [zoomRange, setZoomRange] = useState(null);
  const [brush, setBrush] = useState(null);
  const [selectedSelection, setSelectedSelection] = useState(null); // { lo, hi, idStart, idEnd, totalCount, likedCount }
  const isDragging = useRef(false);
  const hasDragged = useRef(false); // true if mouse moved during drag
  const dragStartIdx = useRef(null);
  const chartRef = useRef(null);
  const popoverRef = useRef(null);

  const distQuery = useQuery({
    queryKey: ['stats-distribution', zoomRange?.idMin ?? null, zoomRange?.idMax ?? null],
    queryFn: () => getStatsDistribution(zoomRange?.idMin, zoomRange?.idMax),
    staleTime: 5 * 60 * 1000,
    keepPreviousData: true,
  });

  const distData = distQuery.data;
  const buckets = distData?.buckets ?? initialBuckets;
  const isZoomed = zoomRange !== null;
  const numBuckets = buckets.length;

  const maxTotal = useMemo(() => Math.max(...buckets.map(b => b.total_count), 1), [buckets]);
  const maxLiked = useMemo(() => Math.max(...buckets.map(b => b.liked_count), 1), [buckets]);
  const tooltipRef = useRef(null);

  const buildSelection = useCallback((lo, hi) => {
    const selectedBuckets = buckets.slice(lo, hi + 1);
    return {
      lo,
      hi,
      idStart: buckets[hi].id_start,
      idEnd: buckets[lo].id_end,
      totalCount: selectedBuckets.reduce((sum, bucket) => sum + bucket.total_count, 0),
      likedCount: selectedBuckets.reduce((sum, bucket) => sum + bucket.liked_count, 0),
    };
  }, [buckets]);

  const showTip = useCallback((e, b) => {
    if (isDragging.current || selectedSelection) return;
    const tip = tooltipRef.current;
    if (!tip) return;
    const ratio = b.liked_count / Math.max(b.total_count, 1);
    tip.innerHTML = `<b>${t('stats.idRange', { start: b.id_start.toLocaleString(), end: b.id_end.toLocaleString() })}</b><br>${t('stats.total')}: ${b.total_count.toLocaleString()}<br><span style="color:#B388FF">${t('stats.favoritesLegend')}: ${b.liked_count}</span><br>${t('stats.ratio')}: ${(ratio * 100).toFixed(2)}%`;
    tip.style.display = 'block';
    tip.style.left = Math.min(e.clientX + 12, window.innerWidth - 220) + 'px';
    tip.style.top = (e.clientY - 10) + 'px';
  }, [t, selectedSelection]);
  const hideTip = useCallback(() => { if (tooltipRef.current) tooltipRef.current.style.display = 'none'; }, []);

  // --- Brush select helpers ---
  const getBucketIndex = useCallback((clientX) => {
    const chart = chartRef.current;
    if (!chart) return 0;
    const rect = chart.getBoundingClientRect();
    const ratio = (clientX - rect.left) / rect.width;
    return Math.max(0, Math.min(numBuckets - 1, Math.floor(ratio * numBuckets)));
  }, [numBuckets]);

  const handleMouseDown = useCallback((e) => {
    if (distQuery.isFetching) return;
    e.preventDefault();
    isDragging.current = true;
    hasDragged.current = false;
    dragStartIdx.current = getBucketIndex(e.clientX);
    setBrush({ startIdx: dragStartIdx.current, endIdx: dragStartIdx.current });
    setSelectedSelection(null);
    hideTip();
  }, [distQuery.isFetching, getBucketIndex, hideTip]);

  const handleMouseMove = useCallback((e) => {
    if (!isDragging.current) return;
    const idx = getBucketIndex(e.clientX);
    if (idx !== dragStartIdx.current) hasDragged.current = true;
    setBrush({ startIdx: dragStartIdx.current, endIdx: idx });
  }, [getBucketIndex]);

  const handleMouseUp = useCallback(() => {
    if (!isDragging.current || !brush) {
      isDragging.current = false;
      setBrush(null);
      return;
    }
    isDragging.current = false;

    const lo = Math.min(brush.startIdx, brush.endIdx);
    const hi = Math.max(brush.startIdx, brush.endIdx);
    const span = hi - lo + 1;

    // Single click (no drag movement) → show popover
    if (!hasDragged.current) {
      setBrush(null);
      const clickIdx = brush.startIdx;
      setSelectedSelection(prev =>
        prev?.lo === clickIdx && prev?.hi === clickIdx ? null : buildSelection(clickIdx, clickIdx)
      );
      return;
    }

    // Buckets are newest-first (reversed), so index 0 = highest ID
    const selection = buildSelection(lo, hi);

    // Check if zoom would result in bucket_width < 300
    const projectedBucketWidth = (selection.idEnd - selection.idStart + 1) / 80;
    setBrush(null);

    if (projectedBucketWidth < 300) {
      setSelectedSelection(selection);
      return;
    }

    // Drag with < 3 buckets → ignore unless we're already at sandbox granularity
    if (span < 3) {
      return;
    }

    setSelectedSelection(null);
    setZoomRange({ idMin: selection.idStart, idMax: selection.idEnd });
  }, [brush, buildSelection]);

  // Global mouseup listener
  useEffect(() => {
    const onUp = () => { if (isDragging.current) handleMouseUp(); };
    window.addEventListener('mouseup', onUp);
    return () => window.removeEventListener('mouseup', onUp);
  }, [handleMouseUp]);

  // Close popover when clicking outside
  useEffect(() => {
    if (!selectedSelection) return;
    const onClick = (e) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target) &&
          chartRef.current && !chartRef.current.contains(e.target)) {
        setSelectedSelection(null);
      }
    };
    // Delay to avoid closing on the same click that opened it
    const timer = setTimeout(() => window.addEventListener('click', onClick), 0);
    return () => { clearTimeout(timer); window.removeEventListener('click', onClick); };
  }, [selectedSelection]);

  const handleGoToGallery = useCallback(() => {
    if (!selectedSelection) return;
    navigate(`/?id_min=${selectedSelection.idStart}&id_max=${selectedSelection.idEnd}`);
  }, [selectedSelection, navigate]);

  const handleGoToFavorites = useCallback(() => {
    if (!selectedSelection) return;
    navigate(`/favorites?id_min=${selectedSelection.idStart}&id_max=${selectedSelection.idEnd}`);
  }, [selectedSelection, navigate]);

  const handleZoomOut = useCallback(() => {
    if (!distData || !isZoomed) return;
    const curMin = distData.id_min;
    const curMax = distData.id_max;
    const range = curMax - curMin;
    const newMin = Math.max(distData.global_id_min, curMin - range);
    setSelectedSelection(null);
    setZoomRange({ idMin: newMin, idMax: curMax });
  }, [distData, isZoomed]);

  const handleReset = useCallback(() => {
    setSelectedSelection(null);
    setZoomRange(null);
  }, []);

  // Brush overlay range (sorted)
  const brushLo = brush ? Math.min(brush.startIdx, brush.endIdx) : -1;
  const brushHi = brush ? Math.max(brush.startIdx, brush.endIdx) : -1;
  const selectedLo = selectedSelection ? selectedSelection.lo : -1;
  const selectedHi = selectedSelection ? selectedSelection.hi : -1;

  // Popover position: anchored above the selected bucket/range
  const popoverPos = useMemo(() => {
    if (!selectedSelection || !chartRef.current) return null;
    const chartRect = chartRef.current.getBoundingClientRect();
    const bucketW = chartRect.width / numBuckets;
    const centerX = chartRect.left + ((selectedSelection.lo + selectedSelection.hi + 1) / 2) * bucketW;
    return {
      left: Math.max(10, Math.min(centerX - 100, window.innerWidth - 210)),
      top: chartRect.top - 8,
    };
  }, [selectedSelection, numBuckets]);

  return (
    <>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
        <Box sx={{ fontSize: 11, color: '#555' }}>
          {distData && (
            <span>{t('stats.bucketWidth')}: ~{Math.round(distData.bucket_width).toLocaleString()} IDs</span>
          )}
        </Box>
        <ButtonGroup size="small" variant="outlined" sx={{
          '& .MuiButton-root': {
            fontSize: 11, py: 0.25, px: 1, minWidth: 0,
            borderColor: '#444', color: 'text.secondary',
            '&:hover': { borderColor: '#666', bgcolor: 'rgba(255,255,255,0.04)' },
            '&.Mui-disabled': { borderColor: '#333', color: '#555' },
          },
        }}>
          <Button onClick={handleZoomOut} disabled={!isZoomed || distQuery.isFetching} startIcon={<ZoomOutIcon sx={{ fontSize: '14px !important' }} />}>
            {t('stats.zoomOut')}
          </Button>
          <Button onClick={handleReset} disabled={!isZoomed || distQuery.isFetching} startIcon={<ResetIcon sx={{ fontSize: '14px !important' }} />}>
            {t('stats.resetZoom')}
          </Button>
        </ButtonGroup>
      </Box>
      <Box
        ref={chartRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        sx={{
          display: 'flex', alignItems: 'flex-end', height: 180, gap: '1px',
          position: 'relative', userSelect: 'none',
          opacity: distQuery.isFetching ? 0.5 : 1,
          transition: 'opacity 0.3s ease',
          cursor: !distQuery.isFetching ? 'crosshair' : 'default',
        }}
      >
        {buckets.map((b, i) => {
          const inBrush = brush && i >= brushLo && i <= brushHi;
          const inSelectedSelection = selectedSelection && i >= selectedLo && i <= selectedHi;
          const isSingleSelectedBucket = selectedSelection && selectedLo === selectedHi;
          return (
            <Box
              key={`${b.id_start}-${b.id_end}`}
              onMouseMove={e => { if (!isDragging.current) showTip(e, b); }}
              onMouseLeave={hideTip}
              sx={{ flex: 1, height: '100%', position: 'relative' }}
            >
              <Box sx={{
                width: '100%', position: 'absolute', bottom: 0,
                height: `${(b.total_count / maxTotal) * 100}%`,
                bgcolor: '#2a2a2a', borderRadius: '2px 2px 0 0',
                transition: 'height 0.4s ease',
                '&:hover': { bgcolor: isDragging.current ? undefined : '#3a3a3a' },
              }} />
              <Box sx={{
                width: '100%', position: 'absolute', bottom: 0, zIndex: 1,
                height: `${(b.liked_count / maxLiked) * 80}%`,
                bgcolor: 'primary.main', borderRadius: '2px 2px 0 0',
                transition: 'height 0.4s ease',
                '&:hover': { bgcolor: isDragging.current ? undefined : 'primary.light' },
              }} />
              {inBrush && (
                <Box sx={{
                  position: 'absolute', inset: 0, zIndex: 2,
                  bgcolor: 'rgba(179, 136, 255, 0.2)',
                  borderLeft: i === brushLo ? '2px solid' : 'none',
                  borderRight: i === brushHi ? '2px solid' : 'none',
                  borderColor: 'primary.main',
                  transition: 'background-color 0.2s ease',
                }} />
              )}
              {inSelectedSelection && (
                <Box sx={{
                  position: 'absolute', inset: 0, zIndex: 2,
                  bgcolor: 'rgba(255, 158, 64, 0.3)',
                  borderTop: '2px solid #FF9E40',
                  borderLeft: i === selectedLo ? '2px solid #FF9E40' : 'none',
                  borderRight: i === selectedHi ? '2px solid #FF9E40' : 'none',
                  borderRadius: isSingleSelectedBucket ? '2px 2px 0 0' : 0,
                  ...(isSingleSelectedBucket ? { border: '2px solid #FF9E40' } : {}),
                }} />
              )}
            </Box>
          );
        })}
      </Box>
      {/* Selection popover */}
      {selectedSelection && popoverPos && (
        <Box
          ref={popoverRef}
          sx={{
            position: 'fixed',
            left: popoverPos.left,
            top: popoverPos.top,
            transform: 'translateY(-100%)',
            zIndex: 1300,
            bgcolor: 'rgba(0,0,0,0.92)',
            border: '1px solid #444',
            borderRadius: 2,
            p: '10px 14px',
            fontSize: 12,
            lineHeight: 1.7,
            color: '#fff',
            minWidth: 180,
            pointerEvents: 'auto',
          }}
        >
          <Box sx={{ fontWeight: 700, mb: 0.5 }}>
            {t('stats.idRange', {
              start: selectedSelection.idStart.toLocaleString(),
              end: selectedSelection.idEnd.toLocaleString(),
            })}
          </Box>
          <Box>{t('stats.total')}: {selectedSelection.totalCount.toLocaleString()}</Box>
          <Box sx={{ color: '#B388FF' }}>
            {t('stats.favoritesLegend')}: {selectedSelection.likedCount}
          </Box>
          <Box sx={{ mb: 1 }}>
            {t('stats.ratio')}: {(selectedSelection.likedCount / Math.max(selectedSelection.totalCount, 1) * 100).toFixed(2)}%
          </Box>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button
              size="small"
              variant="contained"
              onClick={handleGoToGallery}
              endIcon={<ArrowForwardIcon sx={{ fontSize: '14px !important' }} />}
              sx={{
                fontSize: 11, py: 0.5, px: 1.5,
                textTransform: 'none',
                bgcolor: '#FF9E40',
                '&:hover': { bgcolor: '#FFB74D' },
              }}
            >
              {t('stats.goToGallery')}
            </Button>
            <Button
              size="small"
              variant="contained"
              onClick={handleGoToFavorites}
              endIcon={<ArrowForwardIcon sx={{ fontSize: '14px !important' }} />}
              sx={{
                fontSize: 11, py: 0.5, px: 1.5,
                textTransform: 'none',
                bgcolor: '#B388FF',
                '&:hover': { bgcolor: '#CE93D8' },
              }}
            >
              {t('stats.goToFavorites')}
            </Button>
          </Box>
        </Box>
      )}
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
