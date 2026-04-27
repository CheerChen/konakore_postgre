import React, { useMemo, useState, useEffect } from 'react';
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
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    Tooltip,
    ReferenceLine,
    ResponsiveContainer,
    Cell,
} from 'recharts';


export default function RelevanceFilterModal({
    open,
    onClose,
    posts = [],
    totalPosts = 0,
    threshold = 0,
    onThresholdChange,
    postScoresMap = new Map(),
}) {
    const { t } = useTranslation();
    // 本地 sliderValue 控制滑块视觉位置（紧急更新，不阻塞）
    const [sliderValue, setSliderValue] = useState(threshold);

    // 当外部 threshold 变化时同步本地值（如重置时）
    useEffect(() => {
        setSliderValue(threshold);
    }, [threshold]);

    // 基于预计算的 postScoresMap 构建直方图（不重新调 learnTfIdf）
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

    // 阈值滑块范围
    const sliderMax = useMemo(() => {
        return maxScore > 0 ? maxScore : 100;
    }, [maxScore]);

    // 当前阈值会过滤多少条（基于本地 sliderValue 实时计算）
    const filteredStats = useMemo(() => {
        if (!scores || scores.size === 0) return { pass: posts.length, removed: 0 };
        let removed = 0;
        posts.forEach(post => {
            if ((scores.get(post.id) || 0) < sliderValue) removed++;
        });
        return { pass: posts.length - removed, removed };
    }, [scores, sliderValue, posts]);

    // 直方图数据：为 recharts 转换，加 log scale
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

                            {/* 直方图 */}
                            {chartData.length > 0 ? (
                                <Box sx={{ width: '100%', height: 200 }}>
                                    <Typography
                                        variant="caption"
                                        color="text.secondary"
                                        sx={{ mb: 0.5, display: 'block' }}
                                    >
                                        {t('filter.relevanceDistribution')}
                                    </Typography>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart
                                            data={chartData}
                                            margin={{ top: 5, right: 10, left: 0, bottom: 5 }}
                                        >
                                            <XAxis
                                                dataKey="name"
                                                tick={{ fontSize: 10 }}
                                                interval="preserveStartEnd"
                                            />
                                            <YAxis
                                                dataKey="logCount"
                                                tick={{ fontSize: 10 }}
                                                tickFormatter={(v) =>
                                                    v > 0 ? Math.round(10 ** (v - 1)) : 0
                                                }
                                            />
                                            <Tooltip
                                                formatter={(value, name, props) => [
                                                    t('filter.relevanceCount', { count: props.payload.count }),
                                                    t('filter.relevanceCountLabel'),
                                                ]}
                                                labelFormatter={(label, payload) =>
                                                    payload?.[0]
                                                        ? t('filter.relevanceScoreRange', { range: payload[0].payload.range })
                                                        : label
                                                }
                                            />
                                            <ReferenceLine
                                                x={
                                                    chartData.find(
                                                        (d) => d.midpoint >= sliderValue
                                                    )?.name ?? chartData[0]?.name
                                                }
                                                stroke="#f44336"
                                                strokeWidth={2}
                                                strokeDasharray="4 2"
                                                label={{
                                                    value: t('filter.relevanceThresholdLabel'),
                                                    position: 'top',
                                                    fill: '#f44336',
                                                    fontSize: 12,
                                                }}
                                            />
                                            <Bar dataKey="logCount" radius={[2, 2, 0, 0]}>
                                                {chartData.map((entry, index) => (
                                                    <Cell
                                                        key={index}
                                                        fill={
                                                            entry.midpoint < sliderValue
                                                                ? 'rgba(244, 67, 54, 0.4)'
                                                                : 'rgba(33, 150, 243, 0.7)'
                                                        }
                                                    />
                                                ))}
                                            </Bar>
                                        </BarChart>
                                    </ResponsiveContainer>
                                </Box>
                            ) : (
                                <Typography variant="body2" color="text.secondary">
                                    {t('filter.relevanceNoScores')}
                                </Typography>
                            )}

                            {/* 阈值滑块 */}
                            <Box sx={{ px: 1 }}>
                                <Typography variant="body2" gutterBottom>
                                    {t('filter.relevanceThreshold', {
                                        value: sliderValue.toFixed(1),
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
                                    step={sliderMax / 100 || 1}
                                    valueLabelDisplay="auto"
                                    valueLabelFormat={(v) => v.toFixed(1)}
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
