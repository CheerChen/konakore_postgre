import React, { useEffect, useMemo, useState } from 'react';
import {
    Autocomplete,
    Box,
    Button,
    Chip,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Stack,
    TextField,
    Typography
} from '@mui/material';

import { useTranslation } from 'react-i18next';
import { tagManager } from '../utils/TagManager';

export default function ExcludedTagsModal({ open, onClose, excludedTags = [], onExcludedTagsChange, excludedCountOnPage = 0 }) {
    const { t } = useTranslation();
    const [inputValue, setInputValue] = useState('');
    const [suggestions, setSuggestions] = useState([]);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        if (!open) return;
        setInputValue('');
        setSuggestions([]);
    }, [open]);

    // 过滤 Modal 的建议：只查本地缓存（不走 API）
    useEffect(() => {
        if (!open) return;

        const query = inputValue.trim().toLowerCase();
        if (!query) {
            setSuggestions([]);
            setIsLoading(false);
            return;
        }

        setIsLoading(true);
        const t = setTimeout(() => {
            const cached = tagManager.getCachedTags();
            const match = cached
                .filter(tg => typeof tg === 'string' && tg.toLowerCase().includes(query))
                .sort((a, b) => {
                    const aStarts = a.toLowerCase().startsWith(query);
                    const bStarts = b.toLowerCase().startsWith(query);
                    if (aStarts && !bStarts) return -1;
                    if (!aStarts && bStarts) return 1;
                    return a.localeCompare(b);
                })
                .slice(0, 50);

            setSuggestions(match);
            setIsLoading(false);
        }, 150);

        return () => clearTimeout(t);
    }, [open, inputValue]);

    const normalizedTags = useMemo(() => {
        const cleaned = excludedTags
            .map(t => (typeof t === 'string' ? t : String(t || '')).trim())
            .filter(Boolean);
        return Array.from(new Set(cleaned));
    }, [excludedTags]);

    const handleTagsChange = (_, newValue) => {
        const cleaned = newValue
            .map(t => (typeof t === 'string' ? t : String(t || '')).trim())
            .filter(Boolean);
        const unique = Array.from(new Set(cleaned));
        onExcludedTagsChange?.(unique);
    };

    const handleClear = () => {
        onExcludedTagsChange?.([]);
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
            <DialogTitle>{t('filter.excludedTagsTitle')}</DialogTitle>
            <DialogContent>
                <Stack spacing={2} sx={{ mt: 1 }}>
                    <Typography variant="body2" color="text.secondary">
                        {t('filter.excludedTagsDesc')}
                    </Typography>

                    {excludedCountOnPage > 0 && (
                        <Typography variant="body2" color="warning.main">
                            {t('filter.excludedTagsFiltered', { count: excludedCountOnPage })}
                        </Typography>
                    )}

                    <Autocomplete
                        multiple
                        freeSolo
                        autoHighlight
                        openOnFocus
                        value={normalizedTags}
                        inputValue={inputValue}
                        onInputChange={(_, v) => setInputValue(v)}
                        onChange={handleTagsChange}
                        options={suggestions}
                        loading={isLoading}
                        getOptionLabel={(option) => (typeof option === 'string' ? option : String(option || ''))}
                        isOptionEqualToValue={(option, value) => option === value}
                        filterOptions={(options, { inputValue: fv }) => {
                            if (!fv) return options.slice(0, 15);
                            const f = options.filter(option => option.toLowerCase().includes(fv.toLowerCase()));
                            const sorted = f.sort((a, b) => {
                                const aStarts = a.toLowerCase().startsWith(fv.toLowerCase());
                                const bStarts = b.toLowerCase().startsWith(fv.toLowerCase());
                                if (aStarts && !bStarts) return -1;
                                if (!aStarts && bStarts) return 1;
                                return a.localeCompare(b);
                            });
                            return sorted.slice(0, 25);
                        }}
                        renderTags={(tagValue, getTagProps) =>
                            tagValue.map((option, index) => (
                                <Chip
                                    key={`${option}-${index}`}
                                    label={option}
                                    {...getTagProps({ index })}
                                    size="small"
                                />
                            ))
                        }
                        renderInput={(params) => (
                            <TextField
                                {...params}
                                label={t('filter.excludedTagsInput')}
                                placeholder={t('filter.excludedTagsPlaceholder')}
                            />
                        )}
                        fullWidth
                    />
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button onClick={handleClear} color="inherit" disabled={normalizedTags.length === 0}>
                    {t('actions.clear')}
                </Button>
                <Button onClick={onClose} variant="contained">
                    {t('actions.close')}
                </Button>
            </DialogActions>
        </Dialog>
    );
}
