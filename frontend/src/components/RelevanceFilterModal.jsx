import React, { lazy, Suspense, useMemo, useRef, useState } from 'react';
import {
    Box,
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Slider,
    Stack,
    Typography,
} from '@mui/material';
import { useTranslation } from 'react-i18next';

const RelevanceChart = lazy(() => import('./RelevanceChart'));

const EMPTY_POSTS = [];
const EMPTY_SCORES = new Map();

export default function RelevanceFilterModal({
    open,
    onClose,
    posts = EMPTY_POSTS,
    totalPosts = 0,
    threshold = 0,
    onThresholdChange,
    postScoresMap = EMPTY_SCORES,
}) {
    const { t } = useTranslation();
    // Local draft of the threshold prop so the slider feels responsive.
    const [sliderValue, setSliderValue] = useState(() => threshold);

    // Sync the local draft when the source prop changes (ref-based prev
    // comparison, no effect — e.g. when the parent resets the threshold).
    const prevThresholdRef = useRef(threshold);
    if (threshold !== prevThresholdRef.current) {
        prevThresholdRef.current = threshold;
        setSliderValue(threshold);
    }

    // Build a histogram from the precomputed postScoresMap.
    const { histogram, scores } = useMemo(() => {
        if (!open || !posts.length || !postScoresMap.size) return { histogram: [], scores: postScoresMap };

        const positiveScores = [];
        posts.forEach(post => {
            const s = postScoresMap.get(post.id) || 0;
            if (s > 0) positiveScores.push(s);
        });
        if (!positiveScores.length) return { histogram: [], scores: postScoresMap };

        const max = Math.max(...positiveScores);
        if (max === 0) return { histogram: [], scores: postScoresMap };

        const buckets = 30;
        const width = max / buckets;
        const hist = Array.from({ length: buckets }, (_, i) => ({
            min: +(i * width).toFixed(2),
            max: +((i + 1) * width).toFixed(2),
            count: 0,
        }));
        positiveScores.forEach(s => {
            const idx = Math.min(Math.floor(s / width), buckets - 1);
            hist[idx].count++;
        });

        return { histogram: hist, scores: postScoresMap };
    }, [open, posts, postScoresMap]);

    const maxScore = useMemo(() => {
        if (!histogram.length) return 0;
        return histogram[histogram.length - 1].max;
    }, [histogram]);

    // Cheap expression — no useMemo needed.
    const sliderMax = maxScore > 0 ? maxScore : 100;

    // How many posts the current draft threshold would remove.
    const filteredStats = useMemo(() => {
        if (!scores || scores.size === 0) return { pass: posts.length, removed: 0 };
        let removed = 0;
        posts.forEach(post => {
            if ((scores.get(post.id) || 0) < sliderValue) removed++;
        });
        return { pass: posts.length - removed, removed };
    }, [scores, sliderValue, posts]);

    // Histogram data shaped for recharts (with log scale).
    const chartData = useMemo(() => {
        return histogram.map((bucket) => ({
            name: `${bucket.min}`,
            range: `${bucket.min} - ${bucket.max}`,
            count: bucket.count,
            logCount: bucket.count > 0 ? Math.log10(bucket.count) + 1 : 0,
            midpoint: (bucket.min + bucket.max) / 2,
        }));
    }, [histogram]);

    const handleReset = () => {
        onThresholdChange?.(0);
    };

    const hasWeights = postScoresMap.size > 0;

    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
            <DialogTitle>{t('filter.relevanceFilterTitle')}</DialogTitle>
            <DialogContent>
                <Stack spacing={2} sx={{ mt: 1 }}>
                    {!hasWeights ? (
                        <Typography variant="body2" color="warning.main">
                            {t('filter.relevanceNoWeights')}
                        </Typography>
                    ) : (
                        <>
                            <Typography variant="body2" color="text.secondary">
                                {t('filter.relevanceFilterDesc')}
                            </Typography>

                            {/* Histogram (recharts is lazy-loaded on demand) */}
                            {chartData.length > 0 ? (
                                <Suspense fallback={null}>
                                    <RelevanceChart
                                        chartData={chartData}
                                        sliderValue={sliderValue}
                                        t={t}
                                    />
                                </Suspense>
                            ) : (
                                <Typography variant="body2" color="text.secondary">
                                    {t('filter.relevanceNoScores')}
                                </Typography>
                            )}

                            {/* Threshold slider */}
                            <Box sx={{ px: 1 }}>
                                <Typography variant="body2" gutterBottom>
                                    {t('filter.relevanceThreshold', {
                                        value: sliderValue.toFixed(2),
                                        pass: filteredStats.pass,
                                        removed: filteredStats.removed
                                    })}
                                </Typography>
                                <Slider
                                    value={sliderValue}
                                    onChange={(_, v) => {
                                        setSliderValue(v);
                                        onThresholdChange?.(v);
                                    }}
                                    min={0}
                                    max={sliderMax}
                                    step={sliderMax / 100 || 0.01}
                                    valueLabelDisplay="auto"
                                    valueLabelFormat={(v) => v.toFixed(2)}
                                    disabled={!chartData.length}
                                />
                            </Box>
                        </>
                    )}
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button onClick={handleReset} color="inherit" disabled={threshold === 0}>
                    {t('actions.reset')}
                </Button>
                <Button onClick={onClose} variant="contained">
                    {t('actions.close')}
                </Button>
            </DialogActions>
        </Dialog>
    );
}
