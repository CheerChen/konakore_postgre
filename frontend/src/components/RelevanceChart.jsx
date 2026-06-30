import React, { useEffect, useState } from 'react';
import { Box, Typography } from '@mui/material';

// Chart sub-component extracted so recharts can be code-split.
// recharts is imported on demand (dynamic import) so it never ships up front.
export default function RelevanceChart({ chartData, sliderValue, t }) {
    const [charts, setCharts] = useState(null);

    useEffect(() => {
        let mounted = true;
        import('recharts').then((mod) => {
            if (mounted) setCharts(mod);
        });
        return () => { mounted = false; };
    }, []);

    if (!charts) return null;

    const {
        BarChart,
        Bar,
        XAxis,
        YAxis,
        Tooltip,
        ReferenceLine,
        ResponsiveContainer,
        Cell,
    } = charts;

    return (
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
                        {chartData.map((entry) => (
                            <Cell
                                key={entry.midpoint}
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
    );
}
