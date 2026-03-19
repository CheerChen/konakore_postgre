import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    Autocomplete,
    Box,
    Button,
    Chip,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Divider,
    FormControlLabel,
    Stack,
    Switch,
    TextField,
    Typography
} from '@mui/material';

import { tagManager } from '../utils/TagManager';

export default function ExcludedTagsModal({ open, onClose, excludedCountOnPage = 0 }) {
    const [enabled, setEnabled] = useState(false);
    const [selectedTags, setSelectedTags] = useState([]);

    const [inputValue, setInputValue] = useState('');
    const [suggestions, setSuggestions] = useState([]);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        if (!open) return;
        const config = tagManager.getExcludedPostTagsConfig();
        setEnabled(Boolean(config?.enabled));
        setSelectedTags(Array.isArray(config?.tags) ? config.tags : []);
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

    const normalizedSelectedTags = useMemo(() => {
        const cleaned = selectedTags
            .map(t => (typeof t === 'string' ? t : String(t || '')).trim())
            .filter(Boolean);
        return Array.from(new Set(cleaned));
    }, [selectedTags]);

    const handleSave = () => {
        tagManager.setExcludedPostTagsConfig({
            enabled,
            tags: normalizedSelectedTags
        });
        onClose?.();
    };

    const handleDisable = () => {
        setEnabled(false);
        tagManager.setExcludedPostTagsConfig({ enabled: false, tags: normalizedSelectedTags });
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
            <DialogTitle>排除标签（过滤 Post）</DialogTitle>
            <DialogContent>
                <Stack spacing={2} sx={{ mt: 1 }}>
                    <FormControlLabel
                        control={<Switch checked={enabled} onChange={e => setEnabled(e.target.checked)} />}
                        label="启用排除过滤"
                    />

                    <Typography variant="body2" color="text.secondary">
                        启用后：任何包含下列标签的 post 都会从列表中直接移除（包括 TF-IDF 排序与其他排序）。
                    </Typography>

                    <Typography variant="body2" color="text.secondary">
                        当前页预计过滤：{excludedCountOnPage} 张
                    </Typography>

                    <Divider />

                    <Autocomplete
                        multiple
                        freeSolo
                        autoHighlight
                        openOnFocus
                        value={normalizedSelectedTags}
                        inputValue={inputValue}
                        onInputChange={(_, v) => setInputValue(v)}
                        onChange={(_, newValue) => setSelectedTags(newValue)}
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
                                label="要排除的标签"
                                placeholder="输入标签名称（可多选）"
                                helperText="不会实时生效，点击“保存”后应用"
                            />
                        )}
                        fullWidth
                    />

                    <Box>
                        <Typography variant="subtitle2" sx={{ mb: 1 }}>
                            预览（{normalizedSelectedTags.length}）
                        </Typography>
                        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                            {normalizedSelectedTags.length === 0 ? (
                                <Typography variant="body2" color="text.secondary">
                                    暂无标签
                                </Typography>
                            ) : (
                                normalizedSelectedTags.map(tag => <Chip key={tag} label={tag} size="small" />)
                            )}
                        </Stack>
                    </Box>
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button onClick={handleDisable} color="inherit">
                    仅关闭
                </Button>
                <Button onClick={onClose} color="inherit">
                    取消
                </Button>
                <Button onClick={handleSave} variant="contained">
                    保存
                </Button>
            </DialogActions>
        </Dialog>
    );
}
