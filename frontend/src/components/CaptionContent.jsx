import React from 'react';
import { Chip } from '@mui/material';
import { Link as LinkIcon, AspectRatio as SizeIcon, Star as ScoreIcon, DateRange as DateIcon, Storage as FileIcon, Favorite as FavoriteIcon } from '@mui/icons-material';
import { formatFileSize, formatDate } from '../utils/formatters';
import { getImageDimensionsText } from '../utils/imageUtils';

const chipSx = (bg) => ({
  backgroundColor: bg,
  color: '#fff',
  fontFamily: '"Inter", "Roboto", "Noto Sans SC", sans-serif',
  fontWeight: 500,
  fontSize: '12px',
  '& .MuiChip-label': {
    fontFamily: '"Inter", "Roboto", "Noto Sans SC", sans-serif',
    fontWeight: 500,
  }
});

const CaptionContent = ({ post, postsLikeState, getTagColors, getTagTranslation, handleTagClick }) => {
  const isLiked = postsLikeState.hasOwnProperty(post.id) ? postsLikeState[post.id] : post.liked;

  return (
    <div
      data-caption-id={post.id}
      className="hidden-caption-content"
      style={{ display: 'none' }}
    >
      <div style={{
        padding: '16px',
        background: 'rgba(0, 0, 0, 0.8)',
        backdropFilter: 'blur(15px)',
        borderRadius: '12px',
        margin: '8px',
        color: 'white',
        minWidth: '320px'
      }}>
        {/* Tags */}
        <div style={{
          display: 'flex',
          gap: '4px',
          justifyContent: 'center',
          flexWrap: 'wrap',
          maxWidth: '80vw',
          marginBottom: '16px'
        }}>
          {post.data.tags?.split(' ').filter(Boolean).map((tag, tagIndex) => {
            const tagColors = getTagColors(tag);
            const translatedTag = getTagTranslation(tag);
            return (
              <Chip
                key={tagIndex}
                label={translatedTag}
                size="small"
                clickable
                data-tag={tag}
                onClick={(e) => { e.stopPropagation(); handleTagClick(tag); }}
                sx={{
                  fontSize: '11px',
                  height: '20px',
                  cursor: 'pointer',
                  backgroundColor: tagColors.backgroundColor,
                  color: tagColors.color,
                  border: tagColors.border,
                  fontFamily: '"Inter", "Roboto", "Noto Sans SC", sans-serif',
                  fontWeight: 400,
                  '&:hover': { backgroundColor: tagColors.hoverColor },
                  '& .MuiChip-label': { px: 1, fontFamily: '"Inter", "Roboto", "Noto Sans SC", sans-serif' }
                }}
              />
            );
          })}
        </div>

        {/* Info */}
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '8px',
          justifyContent: 'center',
          alignItems: 'center'
        }}>
          <Chip
            icon={<LinkIcon sx={{ color: '#fff !important' }} />}
            label={
              <a
                href={`https://konachan.com/post/show/${post.id}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: '#fff', textDecoration: 'none', fontFamily: '"Inter", "Roboto", "Noto Sans SC", sans-serif', fontWeight: 500 }}
              >
                {post.id}
              </a>
            }
            size="small"
            sx={{ ...chipSx('rgba(121, 85, 72, 0.8)'), '&:hover': { backgroundColor: 'rgba(121, 85, 72, 1)' } }}
          />
          <Chip
            icon={<FileIcon sx={{ color: '#fff !important' }} />}
            label={post.data.jpeg_file_size === 0
              ? formatFileSize(post.data.file_size)
              : `${formatFileSize(post.data.jpeg_file_size)} / ${formatFileSize(post.data.file_size)}`
            }
            size="small"
            sx={chipSx('rgba(76, 175, 80, 0.8)')}
          />
          <Chip
            icon={<SizeIcon sx={{ color: '#fff !important' }} />}
            label={getImageDimensionsText(post.data)}
            size="small"
            sx={chipSx('rgba(156, 39, 176, 0.8)')}
          />
          <Chip
            icon={<ScoreIcon sx={{ color: '#fff !important' }} />}
            label={post.data.score !== undefined ? post.data.score : 'N/A'}
            size="small"
            sx={chipSx('rgba(255, 152, 0, 0.8)')}
          />
          <Chip
            icon={<DateIcon sx={{ color: '#fff !important' }} />}
            label={formatDate(post.data.created_at)}
            size="small"
            sx={chipSx('rgba(96, 125, 139, 0.8)')}
          />
          {isLiked && (
            <Chip
              icon={<FavoriteIcon sx={{ color: '#fff !important' }} />}
              label="已收藏"
              size="small"
              sx={chipSx('rgba(244, 67, 54, 0.8)')}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default CaptionContent;
