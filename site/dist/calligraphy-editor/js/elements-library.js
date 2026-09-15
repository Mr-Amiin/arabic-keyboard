// Phase 7, point 2: the "Elements" (عناصر) library — a distinct set of
// original, hand-authored vector ornaments (dots, circles, dividers,
// flourishes, geometric frames, swashes) from the Phase 4 Decorations
// library. Every entry below is plain geometric/curve path data I
// drew myself for this editor in each shape's own 100x100 authoring
// box — nothing here is derived from any third-party asset —
// and scene.addElementUndoable() turns a click into a genuine scene
// object with full move/rotate/scale/color/opacity/duplicate/delete/
// lock/layers/undo-redo, never a raster decal.

export const ELEMENTS = [
  {
    id: 'ring',
    label: 'Ring',
    viewW: 100, viewH: 100,
    d: 'M 50 8 A 42 42 0 1 1 49.9 8 Z M 50 26 A 24 24 0 1 0 50.1 26 Z',
    fill: '#161616', stroke: 'none', strokeWidth: 0,
  },
  {
    id: 'triple-dot',
    label: 'Triple dot',
    viewW: 100, viewH: 100,
    d: 'M 50 20 A 8 8 0 1 0 50.1 20 M 22 68 A 8 8 0 1 0 22.1 68 M 78 68 A 8 8 0 1 0 78.1 68',
    fill: '#161616', stroke: 'none', strokeWidth: 0,
  },
  {
    id: 'diamond-frame',
    label: 'Diamond frame',
    viewW: 100, viewH: 100,
    d: 'M 50 5 L 95 50 L 50 95 L 5 50 Z M 50 20 L 80 50 L 50 80 L 20 50 Z',
    fill: 'none', stroke: '#161616', strokeWidth: 4,
  },
  {
    id: 'corner-frame',
    label: 'Corner frame',
    viewW: 100, viewH: 100,
    d: 'M 8 30 L 8 8 L 30 8 M 70 8 L 92 8 L 92 30 M 92 70 L 92 92 L 70 92 M 30 92 L 8 92 L 8 70',
    fill: 'none', stroke: '#161616', strokeWidth: 5,
  },
  {
    id: 'wave-flourish',
    label: 'Wave flourish',
    viewW: 100, viewH: 100,
    d: 'M 4 60 C 20 30 30 80 46 50 C 62 20 72 70 96 40',
    fill: 'none', stroke: '#161616', strokeWidth: 5,
  },
  {
    id: 'hex-ornament',
    label: 'Hex ornament',
    viewW: 100, viewH: 100,
    d: 'M 50 6 L 88 28 L 88 72 L 50 94 L 12 28 Z M 50 6 L 88 72 M 50 6 L 12 72 M 12 28 L 88 28',
    fill: 'none', stroke: '#8a6d1c', strokeWidth: 3,
  },
  {
    id: 'teardrop',
    label: 'Teardrop',
    viewW: 100, viewH: 100,
    d: 'M 50 6 C 78 40 84 58 84 70 A 34 34 0 1 1 16 70 C 16 58 22 40 50 6 Z',
    fill: '#2f6f7a', stroke: 'none', strokeWidth: 0,
  },
  {
    id: 'arabesque-curl',
    label: 'Arabesque curl',
    viewW: 100, viewH: 100,
    d: 'M 10 85 C 10 45 45 55 45 30 C 45 12 25 12 20 25 M 45 30 C 45 55 80 45 80 85',
    fill: 'none', stroke: '#7a2f5a', strokeWidth: 5,
  },
  {
    id: 'divider-bar',
    label: 'Divider bar',
    viewW: 100, viewH: 100,
    d: 'M 6 47 L 40 47 L 50 35 L 60 47 L 94 47 L 94 53 L 60 53 L 50 65 L 40 53 L 6 53 Z',
    fill: '#161616', stroke: 'none', strokeWidth: 0,
  },
];
