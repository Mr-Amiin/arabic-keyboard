// Phase 7, point 3: the "Designs" (تصاميم) starter library — a small
// set of reusable, ORIGINAL vector compositions (several real path
// pieces authored together, sharing one design canvas), never a raster
// screenshot of anything. scene.insertDesignUndoable() drops a whole
// design in as one undo step, sharing one fresh groupId so it behaves
// as one coherent object right after insertion — Ungroup (Phase 7
// Arrange menu) breaks it back into its individual real path objects
// for detailed per-piece editing. Every `d` here is plain geometric/
// curve path data I drew myself for this editor; nothing is copied
// from any third-party asset.
//
// Each design's `pieces` share one design-space canvas: every piece
// carries its own small authoring box (boxX/boxY/viewW/viewH, exactly
// like a Decorations/Elements entry) placed at its own offset within
// that shared canvas, so insertDesignUndoable can compute one overall
// bounding box and scale the WHOLE composition uniformly while
// preserving every piece's position and size relative to the others.

export const DESIGNS = [
  {
    id: 'medallion',
    label: 'Medallion',
    previewViewBox: '0 0 200 200',
    pieces: [
      // Outer ring.
      { d: 'M 100 12 A 88 88 0 1 1 99.9 12 Z M 100 34 A 66 66 0 1 0 100.1 34 Z', boxX: 0, boxY: 0, viewW: 200, viewH: 200, fill: '#8a6d1c', stroke: 'none', strokeWidth: 0 },
      // Four petals at the cardinal points.
      { d: 'M 20 0 C 32 6 32 24 20 30 C 8 24 8 6 20 0 Z', boxX: 90, boxY: 4, viewW: 40, viewH: 32, fill: '#c9a227', stroke: 'none', strokeWidth: 0 },
      { d: 'M 20 32 C 32 26 32 8 20 2 C 8 8 8 26 20 32 Z', boxX: 90, boxY: 164, viewW: 40, viewH: 32, fill: '#c9a227', stroke: 'none', strokeWidth: 0 },
      { d: 'M 0 20 C 6 8 24 8 30 20 C 24 32 6 32 0 20 Z', boxX: 4, boxY: 90, viewW: 32, viewH: 40, fill: '#c9a227', stroke: 'none', strokeWidth: 0 },
      { d: 'M 32 20 C 26 8 8 8 2 20 C 8 32 26 32 32 20 Z', boxX: 164, boxY: 90, viewW: 32, viewH: 40, fill: '#c9a227', stroke: 'none', strokeWidth: 0 },
      // Center dot.
      { d: 'M 20 2 A 18 18 0 1 1 19.9 2 Z', boxX: 80, boxY: 80, viewW: 40, viewH: 40, fill: '#161616', stroke: 'none', strokeWidth: 0 },
    ],
  },
  {
    id: 'divider-set',
    label: 'Divider set',
    previewViewBox: '0 0 220 60',
    pieces: [
      { d: 'M 4 26 L 84 26 L 84 34 L 4 34 Z', boxX: 0, boxY: 0, viewW: 90, viewH: 60, fill: '#161616', stroke: 'none', strokeWidth: 0 },
      { d: 'M 20 2 L 38 20 L 20 38 L 2 20 Z', boxX: 90, boxY: 10, viewW: 40, viewH: 40, fill: 'none', stroke: '#8a6d1c', strokeWidth: 4 },
      { d: 'M 136 26 L 216 26 L 216 34 L 136 34 Z', boxX: 0, boxY: 0, viewW: 220, viewH: 60, fill: '#161616', stroke: 'none', strokeWidth: 0 },
    ],
  },
  {
    id: 'frame-accent',
    label: 'Frame accent',
    previewViewBox: '0 0 180 180',
    pieces: [
      // Square frame drawn as one path with two opposite-wound subpaths
      // (outer clockwise, inner counter-clockwise) so the default
      // nonzero fill rule punches a real hole through the middle —
      // a genuine frame shape, not a stroke-only rectangle outline.
      { d: 'M 4 4 L 176 4 L 176 176 L 4 176 Z M 16 16 L 16 164 L 164 164 L 164 16 Z', boxX: 0, boxY: 0, viewW: 180, viewH: 180, fill: '#2f6f7a', stroke: 'none', strokeWidth: 0 },
      { d: 'M 30 0 L 60 30 L 30 60 L 0 30 Z', boxX: 60, boxY: 60, viewW: 60, viewH: 60, fill: '#c9a227', stroke: 'none', strokeWidth: 0 },
    ],
  },
];
