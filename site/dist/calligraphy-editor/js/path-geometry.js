// A small, honest SVG path parser/serializer for editing REAL glyph
// outlines (Phase 5's "Edit Path"). HarfBuzz's own font.glyphToPath()
// (see glyph-shaper.js) emits absolute M/L/Q/Z commands for every font
// in this project's registry (verified directly against every font
// file, not assumed) plus C for completeness in case a CFF/cubic font
// is ever added. This module only PARSES an existing path into its
// real anchor/control points and SERIALIZES the same structure back —
// it never simplifies, re-triangulates, or converts curve types, so a
// glyph's winding direction, closed subpaths, multiple subpaths (a
// letter's own holes/counters), and curve shapes survive an edit
// exactly except for the specific point(s) the user dragged.
//
// Structure: an array of subpaths; each subpath is
//   { closed: boolean, segments: [Segment, ...] }
// Segment is one of:
//   { cmd: 'M', x, y }
//   { cmd: 'L', x, y }
//   { cmd: 'Q', cx, cy, x, y }
//   { cmd: 'C', c1x, c1y, c2x, c2y, x, y }
// ('Z' isn't its own segment — it's folded into the subpath's `closed`
// flag, since it carries no point of its own to edit.)

const ARITY = { M: 2, L: 2, Q: 4, C: 6 };

export function parsePath(d) {
  const tokens = String(d).match(/[MLQCZ]|-?\d*\.?\d+(?:e-?\d+)?/gi) || [];
  const subpaths = [];
  let current = null;
  let i = 0;
  let cmd = null;

  function pushSubpath() {
    if (current && current.segments.length) subpaths.push(current);
  }

  while (i < tokens.length) {
    const tok = tokens[i];
    if (/^[MLQCZ]$/i.test(tok)) {
      cmd = tok.toUpperCase();
      i++;
      if (cmd === 'Z') {
        if (current) current.closed = true;
        continue;
      }
      if (cmd === 'M') {
        pushSubpath();
        current = { closed: false, segments: [] };
      }
    }
    if (!cmd || cmd === 'Z' || !current) break; // malformed input — stop rather than guess
    const arity = ARITY[cmd];
    const nums = tokens.slice(i, i + arity).map(Number);
    if (nums.length < arity || nums.some((n) => Number.isNaN(n))) break;
    i += arity;
    if (cmd === 'M') current.segments.push({ cmd: 'M', x: nums[0], y: nums[1] });
    else if (cmd === 'L') current.segments.push({ cmd: 'L', x: nums[0], y: nums[1] });
    else if (cmd === 'Q') current.segments.push({ cmd: 'Q', cx: nums[0], cy: nums[1], x: nums[2], y: nums[3] });
    else if (cmd === 'C') current.segments.push({ cmd: 'C', c1x: nums[0], c1y: nums[1], c2x: nums[2], c2y: nums[3], x: nums[4], y: nums[5] });
    // Implicit repeats (SVG allows extra coordinate groups without
    // restating the letter) fall through the loop naturally since `cmd`
    // stays the same and `i` has already advanced.
  }
  pushSubpath();
  return subpaths;
}

function fmt(n) {
  // Match HarfBuzz's own number formatting closely enough to stay
  // clean: integers stay bare, fractional values keep up to 2 decimals.
  const r = Math.round(n * 100) / 100;
  return Number.isInteger(r) ? String(r) : String(r);
}

export function serializePath(subpaths) {
  let d = '';
  for (const sp of subpaths) {
    for (const seg of sp.segments) {
      if (seg.cmd === 'M') d += `M${fmt(seg.x)},${fmt(seg.y)}`;
      else if (seg.cmd === 'L') d += `L${fmt(seg.x)},${fmt(seg.y)}`;
      else if (seg.cmd === 'Q') d += `Q${fmt(seg.cx)},${fmt(seg.cy)} ${fmt(seg.x)},${fmt(seg.y)}`;
      else if (seg.cmd === 'C') d += `C${fmt(seg.c1x)},${fmt(seg.c1y)} ${fmt(seg.c2x)},${fmt(seg.c2y)} ${fmt(seg.x)},${fmt(seg.y)}`;
    }
    if (sp.closed) d += 'Z';
  }
  return d;
}

// Flattens parsed subpaths into a list of every draggable point, each
// tagged with enough addressing info to write it back:
//   { kind: 'anchor' | 'control', subpathIndex, segmentIndex,
//     field ('x'/'y' for anchor; 'cx'/'cy' or 'c1x'/'c1y'/'c2x'/'c2y'
//       for a control point — always the x-field; y is field+... },
//     x, y,            // the point's own font-unit coordinates
//     anchorX, anchorY // for a control point, its owning segment's
//                       // end anchor (for drawing the guide line)
// A control point never overlaps an anchor id-wise: anchors and
// controls are addressed independently so dragging one never disturbs
// the other.
export function listEditablePoints(subpaths) {
  const points = [];
  subpaths.forEach((sp, si) => {
    sp.segments.forEach((seg, gi) => {
      if (seg.cmd === 'Q') {
        points.push({ kind: 'control', subpathIndex: si, segmentIndex: gi, xField: 'cx', yField: 'cy', x: seg.cx, y: seg.cy, anchorX: seg.x, anchorY: seg.y });
      } else if (seg.cmd === 'C') {
        const prevAnchor = prevAnchorOf(sp, gi);
        points.push({ kind: 'control', subpathIndex: si, segmentIndex: gi, xField: 'c1x', yField: 'c1y', x: seg.c1x, y: seg.c1y, anchorX: prevAnchor.x, anchorY: prevAnchor.y });
        points.push({ kind: 'control', subpathIndex: si, segmentIndex: gi, xField: 'c2x', yField: 'c2y', x: seg.c2x, y: seg.c2y, anchorX: seg.x, anchorY: seg.y });
      }
      if (seg.cmd !== 'Z') {
        points.push({ kind: 'anchor', subpathIndex: si, segmentIndex: gi, xField: 'x', yField: 'y', x: seg.x, y: seg.y });
      }
    });
  });
  return points;
}

function prevAnchorOf(subpath, segmentIndex) {
  const prev = subpath.segments[segmentIndex - 1];
  return prev ? { x: prev.x, y: prev.y } : { x: subpath.segments[0]?.x ?? 0, y: subpath.segments[0]?.y ?? 0 };
}

// Applies one point's new font-unit position back into the parsed
// structure (mutates in place) — used both live (while dragging, for
// the preview) and on commit (for the undo/redo snapshot diff).
export function applyPointEdit(subpaths, point, nx, ny) {
  const seg = subpaths[point.subpathIndex].segments[point.segmentIndex];
  seg[point.xField] = nx;
  seg[point.yField] = ny;
}
