import React, { useState, useEffect } from 'react';
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

const MIN_SIZE = 150;
const MAX_SIZE = 500;

export default function ImageSizeModal({ open, onClose, imageMinWidth, onImageMinWidthChange }) {
  const { t } = useTranslation();
  const [localValue, setLocalValue] = useState(imageMinWidth);

  useEffect(() => {
    if (open) setLocalValue(imageMinWidth);
  }, [open, imageMinWidth]);

  const handleChange = (_, value) => {
    setLocalValue(value);
  };

  const handleChangeCommitted = (_, value) => {
    onImageMinWidthChange(value);
  };

  const handleReset = () => {
    const defaultValue = 260;
    setLocalValue(defaultValue);
    onImageMinWidthChange(defaultValue);
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{t('grid.sizeTitle')}</DialogTitle>
      <DialogContent>
        <Stack spacing={3} sx={{ mt: 1 }}>
          <Typography variant="body2" color="text.secondary">
            {t('grid.sizeDesc')}
          </Typography>
          <Box sx={{ px: 1 }}>
            <Slider
              value={localValue}
              onChange={handleChange}
              onChangeCommitted={handleChangeCommitted}
              min={MIN_SIZE}
              max={MAX_SIZE}
              step={10}
              marks={[
                { value: MIN_SIZE, label: t('grid.small') },
                { value: 260, label: t('grid.default') },
                { value: MAX_SIZE, label: t('grid.large') },
              ]}
              valueLabelDisplay="auto"
              valueLabelFormat={(v) => `${v}px`}
            />
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleReset} color="inherit" disabled={localValue === 260}>
          {t('actions.reset')}
        </Button>
        <Button onClick={onClose} variant="contained">
          {t('actions.close')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
