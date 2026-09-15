// Phase 4's decorative-element library: a small set of hand-authored,
// original vector motifs (a star, a sunburst, a dot divider, a corner
// flourish, a leaf, and a swash) — plain geometric/curve shapes I drew
// myself for this editor, not derived from any font's glyph
// outlines. Each entry is real vector path data (an SVG `d` string in
// its own 100x100 authoring box) that scene.addDecorationUndoable()
// turns into a genuine scene object with the same move/rotate/scale/
// color/opacity/duplicate/delete/lock/layers/undo-redo every other
// drawing object gets for free — nothing here is a decal or a raster
// image standing in for "real vector".

export const DECORATIONS = [
  {
    id: 'star',
    label: 'Star',
    viewW: 100, viewH: 100,
    d: 'M 50 3 L 58.34 24.32 L 77.63 11.98 L 71.84 34.13 L 94.7 35.48 L 77 50 L 94.7 64.52 L 71.84 65.87 L 77.63 88.02 L 58.34 75.68 L 50 97 L 41.66 75.68 L 22.37 88.02 L 28.16 65.87 L 5.3 64.52 L 23 50 L 5.3 35.48 L 28.16 34.13 L 22.37 11.98 L 41.66 24.32 Z',
    fill: '#c9a227', stroke: 'none', strokeWidth: 0,
  },
  {
    id: 'burst',
    label: 'Sunburst',
    viewW: 100, viewH: 100,
    d: 'M 50 3 L 60.58 35.44 L 93.75 35.79 L 67.12 55.56 L 77.04 87.21 L 50 68 L 22.96 87.21 L 32.88 55.56 L 6.25 35.79 L 39.42 35.44 Z',
    fill: '#b8860b', stroke: 'none', strokeWidth: 0,
  },
  {
    id: 'dots',
    label: 'Dot divider',
    viewW: 100, viewH: 100,
    d: 'M 11 50 A 9 9 0 1 0 29 50 A 9 9 0 1 0 11 50 M 41 50 A 9 9 0 1 0 59 50 A 9 9 0 1 0 41 50 M 71 50 A 9 9 0 1 0 89 50 A 9 9 0 1 0 71 50',
    fill: '#161616', stroke: 'none', strokeWidth: 0,
  },
  {
    id: 'bracket',
    label: 'Corner flourish',
    viewW: 100, viewH: 100,
    d: 'M 12 92 L 12 26 Q 12 12 26 12 L 58 12 M 51 20 A 7 7 0 1 0 65 20 A 7 7 0 1 0 51 20',
    fill: 'none', stroke: '#161616', strokeWidth: 5,
  },
  {
    id: 'leaf',
    label: 'Leaf',
    viewW: 100, viewH: 100,
    d: 'M 50 92 C 18 70 18 18 50 8 C 82 18 82 70 50 92 Z',
    fill: '#2f7a3d', stroke: 'none', strokeWidth: 0,
  },
  {
    id: 'swash',
    label: 'Swash',
    viewW: 100, viewH: 100,
    d: 'M 8 80 C 30 20 70 20 60 55 C 55 68 40 68 42 55 C 43 48 50 47 54 52',
    fill: 'none', stroke: '#161616', strokeWidth: 5,
  },
];
