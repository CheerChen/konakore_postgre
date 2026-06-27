import React, { useState } from 'react';
import { Box, Typography, Container, ToggleButtonGroup, ToggleButton, Paper } from '@mui/material';
import { Swiper, SwiperSlide } from 'swiper/react';
import { EffectCards } from 'swiper/modules';
import 'swiper/css';
import 'swiper/css/effect-cards';

// ---------------------------------------------------------------------------
// Stack demo page — compare three stacking visuals side by side.
// Each effect renders a "group" of 4 sample images (depth = 3 back layers
// + 1 main). Depth is capped at 3 regardless of group size.
// ---------------------------------------------------------------------------

const STACK_DEPTH = 3; // back layers behind the main image

// Sample images — use konachan-proxy (works when dev server is running).
// Fall back to CSS gradients if images fail to load.
const SAMPLE_IMAGES = [
  { src: '/konachan-proxy/jpeg/123456/sample.jpg', w: 600, h: 800, label: 'A' },
  { src: '/konachan-proxy/jpeg/234567/sample.jpg', w: 600, h: 800, label: 'B' },
  { src: '/konachan-proxy/jpeg/345678/sample.jpg', w: 600, h: 800, label: 'C' },
  { src: '/konachan-proxy/jpeg/456789/sample.jpg', w: 600, h: 800, label: 'D' },
];

// Shared gradient fallback so the demo is visible even without API access.
const GRADIENTS = [
  'linear-gradient(135deg, #7C4DFF, #651FFF)',
  'linear-gradient(135deg, #FF6D00, #E65100)',
  'linear-gradient(135deg, #00BFA5, #00897B)',
  'linear-gradient(135deg, #EC407A, #C2185B)',
];

// A single demo card image with gradient fallback.
// `hovered` swaps between rest and hover transforms (fan-out on hover).
function DemoImg({ src, gradient, label, radius, shadow, rotation, offset, hoverRotation, hoverOffset, zIndex, hovered }) {
  const [err, setErr] = useState(false);
  const rot = hovered ? (hoverRotation ?? rotation) : rotation;
  const off = hovered ? (hoverOffset ?? offset) : offset;
  return (
    <Box
      sx={{
        position: 'absolute',
        top: off?.y || 0,
        left: off?.x || 0,
        right: -(off?.x || 0),
        bottom: -(off?.y || 0),
        borderRadius: radius,
        overflow: 'hidden',
        boxShadow: shadow,
        transform: `rotate(${rot}deg)`,
        zIndex,
        background: gradient,
        transition: 'transform 0.28s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.28s ease',
      }}
    >
      {!err && src && (
        <Box
          component="img"
          src={src}
          alt={`sample-${label}`}
          onError={() => setErr(true)}
          sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      )}
      <Box
        sx={{
          position: 'absolute',
          top: 8,
          left: 10,
          color: 'rgba(255,255,255,0.85)',
          fontWeight: 700,
          fontSize: 14,
          textShadow: '0 1px 4px rgba(0,0,0,0.6)',
          pointerEvents: 'none',
        }}
      >
        {label}
      </Box>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Effect 1: Pure CSS — Tilted Stack with hover fan-out
// Rest: back layers peek slightly behind main (small offset + rotation).
// Hover: back layers fan out sideways like dealt cards, revealing the count.
// ---------------------------------------------------------------------------
function TiltedStackCard({ group, depth }) {
  const [hovered, setHovered] = useState(false);
  const backCount = Math.min(group.length - 1, depth);
  const children = group.slice(1);
  const layers = [];
  // Render from deepest (back) to front
  for (let i = backCount; i >= 1; i--) {
    const k = backCount - i; // 0..backCount-1 (0 = closest to main)
    const child = children[k];
    // Rest: subtle peek; Hover: fan out to the right with increasing rotation
    layers.push(
      <DemoImg
        key={`back-${i}`}
        src={child?.src}
        gradient={GRADIENTS[(i) % GRADIENTS.length]}
        label={child?.label}
        radius="10px"
        shadow="0 6px 16px rgba(0,0,0,0.6)"
        rotation={2 + k * 3}
        offset={{ x: 6 + k * 4, y: 4 + k * 3 }}
        hoverRotation={-8 - k * 10}
        hoverOffset={{ x: 30 + k * 28, y: 4 + k * 3 }}
        zIndex={10 - i}
        hovered={hovered}
      />
    );
  }
  // Main image on top
  layers.push(
    <DemoImg
      key="main"
      src={group[0]?.src}
      gradient={GRADIENTS[0]}
      label={group[0]?.label}
      radius="10px"
      shadow="0 10px 24px rgba(0,0,0,0.7)"
      rotation={-1}
      offset={{ x: 0, y: 0 }}
      hoverRotation={2}
      hoverOffset={{ x: 0, y: 0 }}
      zIndex={20}
      hovered={hovered}
    />
  );
  return (
    <Box
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      sx={{ position: 'relative', width: 220, height: 290, marginBottom: '20px', cursor: 'pointer' }}
    >
      {layers}
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Effect 2: Pure CSS — Offset Pile with hover spread
// Rest: back layers peek down-right behind main.
// Hover: back layers spread further out, revealing the count.
// ---------------------------------------------------------------------------
function OffsetPileCard({ group, depth }) {
  const [hovered, setHovered] = useState(false);
  const backCount = Math.min(group.length - 1, depth);
  const children = group.slice(1);
  const PEEK = 10;
  const layers = [];
  for (let i = backCount; i >= 1; i--) {
    const k = backCount - i;
    const child = children[k];
    layers.push(
      <DemoImg
        key={`back-${i}`}
        src={child?.src}
        gradient={GRADIENTS[(i) % GRADIENTS.length]}
        label={child?.label}
        radius="8px"
        shadow="0 4px 12px rgba(0,0,0,0.55)"
        rotation={0}
        offset={{ x: PEEK * (k + 1), y: PEEK * (k + 1) }}
        hoverOffset={{ x: PEEK * (k + 1) * 2.4, y: PEEK * (k + 1) * 2.4 }}
        zIndex={10 - i}
        hovered={hovered}
      />
    );
  }
  layers.push(
    <DemoImg
      key="main"
      src={group[0]?.src}
      gradient={GRADIENTS[0]}
      label={group[0]?.label}
      radius="8px"
      shadow="0 8px 20px rgba(0,0,0,0.65)"
      rotation={0}
      offset={{ x: 0, y: 0 }}
      zIndex={20}
      hovered={hovered}
    />
  );
  return (
    <Box
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      sx={{ position: 'relative', width: 220, height: 290, marginBottom: '20px', cursor: 'pointer' }}
    >
      {layers}
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Effect 3: Swiper effect-cards
// Interactive carousel with built-in stack + shadow + rotation.
// Slides per-card; we render the group as slides.
// ---------------------------------------------------------------------------
function SwiperCardsCard({ group }) {
  return (
    <Box sx={{ width: 220, height: 290, marginBottom: '20px', '& .swiper': { width: '100%', height: '100%' } }}>
      <Swiper
        effect="cards"
        grabCursor
        modules={[EffectCards]}
        cardsEffect={{
          slideShadows: true,
          rotate: true,
          perSlideRotate: 6,
          perSlideOffset: 12,
        }}
      >
        {group.map((item, idx) => (
          <SwiperSlide key={idx}>
            <DemoImgSlide src={item.src} gradient={GRADIENTS[idx % GRADIENTS.length]} label={item.label} />
          </SwiperSlide>
        ))}
      </Swiper>
    </Box>
  );
}

function DemoImgSlide({ src, gradient, label }) {
  const [err, setErr] = useState(false);
  return (
    <Box
      sx={{
        width: '100%',
        height: '100%',
        borderRadius: '12px',
        overflow: 'hidden',
        background: gradient,
        position: 'relative',
      }}
    >
      {!err && src && (
        <Box
          component="img"
          src={src}
          alt={`sample-${label}`}
          onError={() => setErr(true)}
          sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      )}
      <Box
        sx={{
          position: 'absolute',
          top: 10,
          left: 12,
          color: 'rgba(255,255,255,0.9)',
          fontWeight: 700,
          fontSize: 16,
          textShadow: '0 1px 4px rgba(0,0,0,0.7)',
        }}
      >
        {label}
      </Box>
    </Box>
  );
}

// ---------------------------------------------------------------------------

const EFFECTS = [
  { id: 'tilted', label: 'CSS 倾斜叠卡', Component: TiltedStackCard },
  { id: 'pile', label: 'CSS 偏移堆叠', Component: OffsetPileCard },
  { id: 'swiper', label: 'Swiper effect-cards', Component: SwiperCardsCard },
];

const StackDemo = () => {
  const [effectId, setEffectId] = useState('tilted');
  const effect = EFFECTS.find(e => e.id === effectId) || EFFECTS[0];
  const CardComp = effect.Component;

  // Build sample groups: each group is a "parent + children" set.
  // Depth = min(len-1, STACK_DEPTH). Hover to fan out and see the count.
  const groups = [
    { name: 'group-2 (depth 1)', items: SAMPLE_IMAGES.slice(0, 2) },
    { name: 'group-4 (depth 3)', items: SAMPLE_IMAGES.slice(0, 4) },
    { name: 'group-6 (depth 3, capped)', items: [...SAMPLE_IMAGES, ...SAMPLE_IMAGES] },
  ];

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Typography variant="h4" gutterBottom>
        叠卡效果对比 Demo
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        深度上限 = {STACK_DEPTH}（超过也封顶 {STACK_DEPTH}）。鼠标 hover 会把后方卡片扇形展开，提示分组内总数。
        示范图片走 konachan-proxy，无网络时显示渐变色 fallback。Swiper 效果可拖拽。
      </Typography>

      <ToggleButtonGroup
        value={effectId}
        exclusive
        onChange={(_, v) => v && setEffectId(v)}
        sx={{ mb: 4, flexWrap: 'wrap', gap: 1 }}
      >
        {EFFECTS.map(e => (
          <ToggleButton key={e.id} value={e.id}>
            {e.label}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>

      <Box sx={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {groups.map(g => (
          <Paper key={g.name} elevation={3} sx={{ p: 3, backgroundColor: 'background.paper' }}>
            <Typography variant="caption" color="text.secondary" sx={{ mb: 2, display: 'block' }}>
              {g.name} — {g.items.length} items
            </Typography>
            <CardComp group={g.items} depth={STACK_DEPTH} />
          </Paper>
        ))}
      </Box>

      <Box sx={{ mt: 5, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {EFFECTS.map(e => (
          <Paper key={e.id} elevation={2} sx={{ p: 2 }}>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>{e.label}</Typography>
            <e.Component group={SAMPLE_IMAGES} depth={STACK_DEPTH} />
          </Paper>
        ))}
      </Box>
    </Container>
  );
};

export default StackDemo;
