import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Paper,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import { Refresh as RefreshIcon } from '@mui/icons-material';
import { keyframes } from '@mui/system';
import AppLayout from '../components/AppLayout';
import { getTasks } from '../api';

const STATUS_ORDER = { error: 0, running: 1, scheduled: 2, completed: 3, stopped: 4 };

const DETAIL_KEYS = [
  'current_step',
  'current_page',
  'last_page_count',
  'remaining_count',
  'pending_liked_posts',
  'pending_count',
  'downloading_count',
  'complete_count',
  'deleted_count',
  'failed_count',
  'new_count',
  'updated_count',
  'last_batch_processed',
  'idle_count',
  'sleep_seconds',
  'run_id',
];

const STATUS_COLORS = {
  error: '#dc2626',
  running: '#2563eb',
  scheduled: '#64748b',
  completed: '#16a34a',
  stopped: '#94a3b8',
};

const STATUS_BAR_COLOR = {
  error: STATUS_COLORS.error,
  running: STATUS_COLORS.running,
};

const MONO_FONT = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';

const pulse = keyframes`
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.55; transform: scale(0.82); }
`;

function fmtNum(value) {
  if (value === null || value === undefined || value === '') return '—';
  const num = Number(value);
  if (Number.isNaN(num)) return String(value);
  return num.toLocaleString();
}

function fmtAbs(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString();
}

function relTime(value, now = Date.now()) {
  if (!value) return null;
  const t = new Date(value).getTime();
  if (Number.isNaN(t)) return null;
  const diff = (now - t) / 1000;
  const future = diff < 0;
  const abs = Math.abs(diff);
  let val;
  let unit;
  if (abs < 45) {
    val = Math.max(1, Math.round(abs));
    unit = 's';
  } else if (abs < 3600) {
    val = Math.round(abs / 60);
    unit = 'm';
  } else if (abs < 86400) {
    val = Math.round(abs / 3600);
    unit = 'h';
  } else {
    val = Math.round(abs / 86400);
    unit = 'd';
  }
  return future ? `in ${val}${unit}` : `${val}${unit} ago`;
}

function StatusDot({ status }) {
  const color = STATUS_COLORS[status] || STATUS_COLORS.stopped;
  const isRunning = status === 'running';
  const isScheduled = status === 'scheduled';
  const isStopped = status === 'stopped';
  return (
    <Box
      sx={{
        width: 8,
        height: 8,
        borderRadius: '50%',
        flexShrink: 0,
        bgcolor: isStopped ? 'transparent' : color,
        border: isStopped ? `1.5px solid ${color}` : 'none',
        boxShadow: isScheduled ? `0 0 0 3px ${color}1f` : 'none',
        animation: isRunning ? `${pulse} 1.6s ease-in-out infinite` : 'none',
      }}
    />
  );
}

function TimeCell({ label, value }) {
  const rel = relTime(value);
  const abs = fmtAbs(value);
  const muted = !rel;
  const cell = (
    <Stack sx={{ minWidth: 0, gap: '1px' }}>
      <Typography
        sx={{
          fontSize: 10.5,
          color: 'text.disabled',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          fontWeight: 500,
          lineHeight: 1.4,
        }}
      >
        {label}
      </Typography>
      <Typography
        sx={{
          fontSize: 13,
          color: muted ? 'text.disabled' : 'text.primary',
          fontVariantNumeric: 'tabular-nums',
          whiteSpace: 'nowrap',
          lineHeight: 1.4,
        }}
      >
        {rel || '—'}
      </Typography>
    </Stack>
  );
  if (muted) return cell;
  return (
    <Tooltip title={abs} placement="top" enterDelay={300}>
      {cell}
    </Tooltip>
  );
}

function MetaItem({ label, value }) {
  return (
    <Typography component="span" sx={{ fontSize: 12, color: 'text.disabled' }}>
      <Box component="span" sx={{ color: 'text.secondary', fontWeight: 500 }}>{label}:</Box>{' '}
      {value}
    </Typography>
  );
}

function TaskRow({ task, expanded, onToggle }) {
  const status = task.status;
  const barColor = STATUS_BAR_COLOR[status] || 'transparent';
  const statusTextColor = STATUS_COLORS[status] || 'text.secondary';
  const progress = Math.max(0, Math.min(100, Number(task.progress_pct || 0)));
  const state = task.state || {};
  const details = DETAIL_KEYS
    .filter((k) => state[k] !== null && state[k] !== undefined && state[k] !== '')
    .map((k) => [k, state[k]]);
  const hasTotal =
    task.total_value !== null && task.total_value !== undefined && Number(task.total_value) > 0;

  const handleCopyRunId = (event) => {
    event.stopPropagation();
    if (state.run_id && navigator.clipboard) {
      navigator.clipboard.writeText(String(state.run_id));
    }
  };

  return (
    <Box
      sx={{
        position: 'relative',
        borderBottom: '1px solid',
        borderColor: 'divider',
        '&:last-of-type': { borderBottom: 'none' },
      }}
    >
      <Box
        sx={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: 0,
          width: '3px',
          bgcolor: barColor,
          zIndex: 1,
          pointerEvents: 'none',
        }}
      />

      <Box
        onClick={onToggle}
        sx={{
          display: 'grid',
          gridTemplateColumns: '132px 1fr 96px 96px 36px',
          alignItems: 'center',
          height: 56,
          pr: 2,
          pl: '19px',
          gap: 2,
          cursor: 'pointer',
          transition: 'background-color 120ms',
          bgcolor: expanded ? 'action.hover' : 'transparent',
          '&:hover': { bgcolor: 'action.hover' },
        }}
      >
        <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0 }}>
          <StatusDot status={status} />
          <Typography
            sx={{
              fontSize: 13,
              color: statusTextColor,
              fontWeight: 500,
              textTransform: 'capitalize',
              whiteSpace: 'nowrap',
            }}
          >
            {status}
          </Typography>
        </Stack>

        <Stack direction="row" spacing={1.25} alignItems="baseline" sx={{ minWidth: 0 }}>
          <Typography
            sx={{
              fontWeight: 600,
              fontSize: 14,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {task.name}
          </Typography>
          <Typography
            sx={{
              fontSize: 12,
              color: 'text.disabled',
              fontFamily: MONO_FONT,
              whiteSpace: 'nowrap',
            }}
          >
            {task.type}
          </Typography>
        </Stack>

        <TimeCell label="last" value={task.last_run_at} />
        <TimeCell label="next" value={task.next_run_at} />

        <Box
          component="span"
          sx={{
            justifySelf: 'end',
            width: 32,
            height: 32,
            borderRadius: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'text.disabled',
            transition: 'transform 220ms ease',
            transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
            fontSize: 14,
          }}
        >
          ▾
        </Box>
      </Box>

      {status === 'running' && (
        <Box
          sx={{
            position: 'absolute',
            bottom: 0,
            left: '3px',
            right: 0,
            height: '2px',
            bgcolor: 'rgba(37, 99, 235, 0.12)',
            overflow: 'hidden',
          }}
        >
          <Box
            sx={{
              height: '100%',
              width: `${progress}%`,
              bgcolor: STATUS_COLORS.running,
              transition: 'width 600ms ease',
            }}
          />
        </Box>
      )}

      <Box
        sx={{
          overflow: 'hidden',
          maxHeight: expanded ? 800 : 0,
          opacity: expanded ? 1 : 0,
          transition: 'max-height 240ms ease, opacity 200ms ease',
          bgcolor: 'action.hover',
        }}
      >
        <Box
          sx={{
            pr: 2,
            pl: '19px',
            pt: 1.75,
            pb: 2,
            borderTop: '1px dashed',
            borderColor: 'divider',
          }}
        >
          {task.error_message && (
            <Stack
              direction="row"
              spacing={1.5}
              alignItems="flex-start"
              sx={{
                bgcolor: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: 1,
                px: 1.5,
                py: 1.25,
                mb: 1.75,
              }}
            >
              <Typography
                sx={{
                  flex: 1,
                  fontFamily: MONO_FONT,
                  fontSize: 12.5,
                  lineHeight: 1.55,
                  color: STATUS_COLORS.error,
                  wordBreak: 'break-all',
                }}
              >
                {task.error_message}
              </Typography>
              {state.run_id && (
                <Button
                  size="small"
                  variant="outlined"
                  color="error"
                  onClick={handleCopyRunId}
                  sx={{
                    fontSize: 12,
                    py: 0.25,
                    px: 1.25,
                    minWidth: 0,
                    borderColor: '#fca5a5',
                    flexShrink: 0,
                  }}
                >
                  Copy run_id
                </Button>
              )}
            </Stack>
          )}

          {hasTotal && (
            <Box sx={{ pb: 1 }}>
              <Typography
                sx={{
                  fontSize: 11,
                  color: 'text.disabled',
                  textTransform: 'capitalize',
                  letterSpacing: '0.02em',
                }}
              >
                progress
              </Typography>
              <Typography sx={{ fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>
                {fmtNum(task.current_value)} / {fmtNum(task.total_value)} {task.unit || ''} ·{' '}
                {progress.toFixed(progress < 1 ? 3 : 1)}%
              </Typography>
            </Box>
          )}

          {details.length > 0 && (
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
                columnGap: 2,
                rowGap: 0.5,
                mb: 1.5,
              }}
            >
              {details.map(([k, v]) => (
                <Box key={k} sx={{ py: 0.75 }}>
                  <Typography
                    sx={{
                      fontSize: 11,
                      color: 'text.disabled',
                      textTransform: 'capitalize',
                      letterSpacing: '0.02em',
                    }}
                  >
                    {k.replaceAll('_', ' ')}
                  </Typography>
                  <Tooltip title={String(v)} placement="top" enterDelay={300}>
                    <Typography
                      sx={{
                        fontSize: 13,
                        fontVariantNumeric: 'tabular-nums',
                        fontFamily: k === 'run_id' ? MONO_FONT : undefined,
                        wordBreak: 'break-all',
                      }}
                    >
                      {fmtNum(v)}
                    </Typography>
                  </Tooltip>
                </Box>
              ))}
            </Box>
          )}

          <Stack
            direction="row"
            spacing={2}
            flexWrap="wrap"
            useFlexGap
            sx={{
              pt: 1.25,
              borderTop: '1px dashed',
              borderColor: 'divider',
            }}
          >
            <MetaItem label="category" value={task.category || '—'} />
            <MetaItem label="updated" value={fmtAbs(task.updated_at)} />
            {task.desired_status && task.desired_status !== task.status && (
              <MetaItem label="target" value={task.desired_status} />
            )}
          </Stack>
        </Box>
      </Box>
    </Box>
  );
}

export default function TasksPage() {
  const { t } = useTranslation();
  const tasksQuery = useQuery({
    queryKey: ['tasks'],
    queryFn: getTasks,
    refetchInterval: 5000,
  });
  const tasks = tasksQuery.data || [];
  const [overrides, setOverrides] = useState(() => new Map());

  const sorted = useMemo(() => {
    return [...tasks].sort((a, b) => {
      const sa = STATUS_ORDER[a.status] ?? 99;
      const sb = STATUS_ORDER[b.status] ?? 99;
      if (sa !== sb) return sa - sb;
      if (a.status === 'scheduled') {
        return new Date(a.next_run_at || 0) - new Date(b.next_run_at || 0);
      }
      return new Date(b.last_run_at || 0) - new Date(a.last_run_at || 0);
    });
  }, [tasks]);

  const errorCount = useMemo(
    () => tasks.filter((task) => task.status === 'error').length,
    [tasks],
  );

  const isExpanded = (task) =>
    overrides.has(task.id) ? overrides.get(task.id) : task.status === 'error';

  const toggle = (task) => {
    setOverrides((prev) => {
      const next = new Map(prev);
      next.set(task.id, !isExpanded(task));
      return next;
    });
  };

  return (
    <AppLayout>
      <Stack
        direction="row"
        alignItems="flex-end"
        justifyContent="space-between"
        sx={{ mb: 2.5 }}
      >
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 600, letterSpacing: '-0.01em' }}>
            {t('tasks.title')}
          </Typography>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.5 }} flexWrap="wrap" useFlexGap>
            <Typography variant="body2" color="text.secondary">
              {t('tasks.subtitle')}
            </Typography>
            {tasks.length > 0 && (
              <Typography variant="body2" color="text.secondary">
                · {tasks.length} tasks
              </Typography>
            )}
            {errorCount > 0 && (
              <Typography variant="body2" sx={{ color: STATUS_COLORS.error }}>
                · {errorCount} error{errorCount > 1 ? 's' : ''}
              </Typography>
            )}
          </Stack>
        </Box>
        <Button
          variant="outlined"
          size="small"
          startIcon={
            tasksQuery.isFetching ? <CircularProgress size={14} /> : <RefreshIcon />
          }
          onClick={() => tasksQuery.refetch()}
        >
          {t('tasks.refresh')}
        </Button>
      </Stack>

      {tasksQuery.isError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {t('status.loadError')}
        </Alert>
      )}

      {tasksQuery.isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      ) : sorted.length === 0 ? (
        <Paper sx={{ p: 4, textAlign: 'center', color: 'text.secondary' }}>
          {t('tasks.empty')}
        </Paper>
      ) : (
        <Paper sx={{ borderRadius: 2, overflow: 'hidden' }}>
          {sorted.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              expanded={isExpanded(task)}
              onToggle={() => toggle(task)}
            />
          ))}
        </Paper>
      )}
    </AppLayout>
  );
}
