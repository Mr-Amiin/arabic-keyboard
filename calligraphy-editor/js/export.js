// Phase 6, point 1: real production export — SVG (true vector), PNG
// (1x/2x/3x/4x, transparent/white/custom background), JPG (white/
// custom background). This reads directly from the live #scene SVG —
// the actual object-model artwork already rendered as real SVG
// elements with real d/fill/stroke/opacity/transform attributes — and
// never rasterizes the page UI (no html2canvas-style DOM screenshot of
// the workspace chrome, panels, or selection handles).
//
// Every glyph/shape/decoration in #scene is pure inline vector
// geometry (no external image refs, no external font/CSS references —
// HarfBuzz shaping already baked every glyph down to a literal path
// "d" string at creation time), so the serialized SVG is fully
// self-contained. That in turn means rasterizing it via new Image() +
// <canvas> never taints the canvas with a cross-origin security error,
// and the exported SVG file itself never breaks if opened somewhere
// that can't reach this app's fonts or server.

import { toast } from './toast.js';
import * as pc from './project-controller.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

function getSceneEl() {
  return document.getElementById('scene');
}

function getArtboardSize() {
  const sceneEl = getSceneEl();
  const w = Number(sceneEl?.getAttribute('width')) || 1600;
  const h = Number(sceneEl?.getAttribute('height')) || 1000;
  return { w, h };
}

// Every hit-rect scene.js ever creates (per-glyph, per-drawing-object,
// or a multi-glyph patch's catch-all) uses this exact, deliberately
// distinctive attribute pair and nothing else in the real artwork
// does — so this one selector reliably strips ALL of them, wherever
// in the tree they live, without needing to know scene.js's internals.
const HIT_RECT_SELECTOR = 'rect[fill="transparent"][pointer-events="all"]';

// Phase 7, Trace Image: every reference-image object's own <g> carries
// this attribute (set by scene.js's render(), only while the object's
// own `excludeFromExport` field is true — the Trace Image panel's
// "include in export" toggle is what flips that field, via
// scene.setExcludeFromExportForSelection) — stripped here unless
// export-time inclusion was chosen, so a photo the user is tracing
// over never silently ends up baked into an exported SVG/PNG/JPG/PDF
// just because it happened to still be on the canvas.
const EXPORT_EXCLUDE_SELECTOR = '[data-export-exclude="true"]';

function cloneArtworkOnly() {
  const sceneEl = getSceneEl();
  if (!sceneEl) throw new Error('Canvas not ready');
  const clone = sceneEl.cloneNode(true);
  clone.querySelectorAll(HIT_RECT_SELECTOR).forEach((n) => n.remove());
  clone.querySelectorAll(EXPORT_EXCLUDE_SELECTOR).forEach((n) => n.remove());
  return clone;
}

// ---- Outline SVG: the same real artwork, with every primitive shape
// (rect/ellipse/triangle/diamond/line/arrow) converted to an explicit
// <path> outline via real geometry — not a re-approximation, not a
// rasterization. Glyphs, decorations/elements/designs, and pen strokes
// are already <path> (HarfBuzz/hand-authored data), so they pass
// through untouched. This is genuinely useful beyond regular SVG
// export for pipelines (cutters, some CAM/plotting tools) that only
// accept path outlines — and, like every other export path in this
// app, never depends on a live @font-face or installed font: nothing
// in #scene has ever been a real SVG <text> element. ----
const BEZIER_CIRCLE_K = 0.5522847498307936;

function rectToPathD(x, y, w, h) {
  return `M ${x} ${y} H ${x + w} V ${y + h} H ${x} Z`;
}
function ellipseToPathD(cx, cy, rx, ry) {
  const kx = rx * BEZIER_CIRCLE_K, ky = ry * BEZIER_CIRCLE_K;
  return [
    `M ${cx - rx} ${cy}`,
    `C ${cx - rx} ${cy - ky} ${cx - kx} ${cy - ry} ${cx} ${cy - ry}`,
    `C ${cx + kx} ${cy - ry} ${cx + rx} ${cy - ky} ${cx + rx} ${cy}`,
    `C ${cx + rx} ${cy + ky} ${cx + kx} ${cy + ry} ${cx} ${cy + ry}`,
    `C ${cx - kx} ${cy + ry} ${cx - rx} ${cy + ky} ${cx - rx} ${cy}`,
    'Z',
  ].join(' ');
}
function pointsToPathD(pointsAttr) {
  const pts = pointsAttr.trim().split(/\s+/).map((pair) => pair.split(',').map(Number));
  if (!pts.length) return '';
  const [first, ...rest] = pts;
  return `M ${first[0]} ${first[1]} ${rest.map((p) => `L ${p[0]} ${p[1]}`).join(' ')} Z`;
}
function lineToPathD(x1, y1, x2, y2) {
  return `M ${x1} ${y1} L ${x2} ${y2}`;
}

function convertPrimitivesToPaths(root) {
  root.querySelectorAll('rect').forEach((rectEl) => {
    const x = Number(rectEl.getAttribute('x') || 0), y = Number(rectEl.getAttribute('y') || 0);
    const w = Number(rectEl.getAttribute('width') || 0), h = Number(rectEl.getAttribute('height') || 0);
    const pathEl = document.createElementNS(SVG_NS, 'path');
    pathEl.setAttribute('d', rectToPathD(x, y, w, h));
    for (const attr of rectEl.attributes) {
      if (!['x', 'y', 'width', 'height'].includes(attr.name)) pathEl.setAttribute(attr.name, attr.value);
    }
    rectEl.replaceWith(pathEl);
  });
  root.querySelectorAll('ellipse').forEach((ellEl) => {
    const cx = Number(ellEl.getAttribute('cx') || 0), cy = Number(ellEl.getAttribute('cy') || 0);
    const rx = Number(ellEl.getAttribute('rx') || 0), ry = Number(ellEl.getAttribute('ry') || 0);
    const pathEl = document.createElementNS(SVG_NS, 'path');
    pathEl.setAttribute('d', ellipseToPathD(cx, cy, rx, ry));
    for (const attr of ellEl.attributes) {
      if (!['cx', 'cy', 'rx', 'ry'].includes(attr.name)) pathEl.setAttribute(attr.name, attr.value);
    }
    ellEl.replaceWith(pathEl);
  });
  root.querySelectorAll('polygon').forEach((polyEl) => {
    const pathEl = document.createElementNS(SVG_NS, 'path');
    pathEl.setAttribute('d', pointsToPathD(polyEl.getAttribute('points') || ''));
    for (const attr of polyEl.attributes) {
      if (attr.name !== 'points') pathEl.setAttribute(attr.name, attr.value);
    }
    polyEl.replaceWith(pathEl);
  });
  root.querySelectorAll('line').forEach((lineEl) => {
    const x1 = Number(lineEl.getAttribute('x1') || 0), y1 = Number(lineEl.getAttribute('y1') || 0);
    const x2 = Number(lineEl.getAttribute('x2') || 0), y2 = Number(lineEl.getAttribute('y2') || 0);
    const pathEl = document.createElementNS(SVG_NS, 'path');
    pathEl.setAttribute('d', lineToPathD(x1, y1, x2, y2));
    pathEl.setAttribute('fill', 'none');
    for (const attr of lineEl.attributes) {
      if (!['x1', 'y1', 'x2', 'y2'].includes(attr.name)) pathEl.setAttribute(attr.name, attr.value);
    }
    lineEl.replaceWith(pathEl);
  });
}

function sanitizeFilename(name) {
  const base = (name || 'تكوين بدون عنوان').trim().replace(/[\\/:*?"<>|]/g, '-');
  return base || 'calligraphy';
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Give the browser a moment to actually start the download before revoking.
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// Builds a complete, standalone <svg>...</svg> string: real viewBox/
// width/height, an optional solid background rect UNDER the artwork
// (never over it), and every real object exactly as scene.js drew it
// (paths, transforms, colors, opacity — nothing re-derived, nothing
// approximated).
function buildStandaloneSVGString({ background = 'white', customColor = '#ffffff', outline = false } = {}) {
  const { w, h } = getArtboardSize();
  const artwork = cloneArtworkOnly();
  if (outline) convertPrimitivesToPaths(artwork);

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('xmlns', SVG_NS);
  // scene.js's <image> elements (Trace Image reference layers) carry
  // both a bare `href` and an `xlink:href` for older-renderer
  // compatibility (see scene.js's render()). The live #scene root is
  // never serialized through an XML parser so the missing namespace
  // declaration is invisible there, but this standalone exported
  // string IS re-parsed as strict XML by some downstream tools -- and
  // without this declaration, "xlink:href" is a namespace prefix with
  // no defined namespace, making the exported file invalid XML for any
  // project containing a Trace Image layer. Verified via Phase 8's
  // export test: DOMParser flagged exactly this ("Namespace prefix
  // xlink for href on image is not defined") until this line was added.
  svg.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  svg.setAttribute('width', String(w));
  svg.setAttribute('height', String(h));

  if (background !== 'transparent') {
    const bgColor = background === 'custom' ? customColor : '#ffffff';
    const bgRect = document.createElementNS(SVG_NS, 'rect');
    bgRect.setAttribute('x', '0');
    bgRect.setAttribute('y', '0');
    bgRect.setAttribute('width', String(w));
    bgRect.setAttribute('height', String(h));
    bgRect.setAttribute('fill', bgColor);
    svg.appendChild(bgRect);
  }

  // Move (not copy) the artwork clone's own children straight into the
  // new root — this preserves every attribute on every real object
  // node untouched, rather than re-serializing/re-parsing them.
  while (artwork.firstChild) svg.appendChild(artwork.firstChild);

  const xml = new XMLSerializer().serializeToString(svg);
  return `<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n${xml}`;
}

// Rasterizes the CURRENT artwork (background always composited
// separately on the destination canvas, never baked into the source
// image) at `scale`x the artboard's real 1600x1000 size, and hands the
// resulting canvas back — used by both PNG and JPG export so the two
// share one code path and can only ever differ in mime type/quality
// and whether transparency is allowed.
async function rasterize({ scale = 1, background = 'white', customColor = '#ffffff' } = {}) {
  const { w, h } = getArtboardSize();
  // Source image is always rendered with NO background baked in — the
  // destination canvas below is what actually decides transparent vs
  // solid, so a PNG asked for "transparent" never has to fight a white
  // rect burned into the vector source first.
  const svgString = buildStandaloneSVGString({ background: 'transparent' });
  const svgDataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgString)}`;

  const img = await new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('SVG failed to rasterize'));
    image.src = svgDataUrl;
  });

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');

  if (background !== 'transparent') {
    ctx.fillStyle = background === 'custom' ? customColor : '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function canvasToBlob(canvas, mime, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob); else reject(new Error('Failed to encode image'));
    }, mime, quality);
  });
}

// ---- public API: each one is self-contained, catches its own
// failures, and always leaves the user with a clear human-readable
// message rather than a silent no-op or a raw stack trace (Phase 6,
// point 8). ----

export async function exportSVG({ background = 'white', customColor = '#ffffff' } = {}) {
  try {
    const svgString = buildStandaloneSVGString({ background, customColor });
    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    downloadBlob(blob, `${sanitizeFilename(pc.getState().name)}.svg`);
    return { ok: true };
  } catch (err) {
    toast('تعذّر تصدير SVG — حاول مرة أخرى');
    return { ok: false, error: err?.message || String(err) };
  }
}

export async function exportPNG({ scale = 1, background = 'transparent', customColor = '#ffffff' } = {}) {
  try {
    const canvas = await rasterize({ scale, background, customColor });
    const blob = await canvasToBlob(canvas, 'image/png');
    const suffix = scale === 1 ? '' : `@${scale}x`;
    downloadBlob(blob, `${sanitizeFilename(pc.getState().name)}${suffix}.png`);
    return { ok: true };
  } catch (err) {
    toast('تعذّر تصدير PNG — حاول مرة أخرى');
    return { ok: false, error: err?.message || String(err) };
  }
}

export async function exportJPG({ background = 'white', customColor = '#ffffff' } = {}) {
  try {
    // JPG has no alpha channel at all — "transparent" is never a valid
    // choice here, so a caller that somehow passes it still gets a
    // real (white) background rather than a broken/undefined result.
    const safeBackground = background === 'transparent' ? 'white' : background;
    const canvas = await rasterize({ scale: 1, background: safeBackground, customColor });
    const blob = await canvasToBlob(canvas, 'image/jpeg', 0.92);
    downloadBlob(blob, `${sanitizeFilename(pc.getState().name)}.jpg`);
    return { ok: true };
  } catch (err) {
    toast('تعذّر تصدير JPG — حاول مرة أخرى');
    return { ok: false, error: err?.message || String(err) };
  }
}

// Phase 7, point 10: "Outline SVG" — identical pipeline to exportSVG,
// just with every primitive shape pre-converted to an explicit <path>
// (see convertPrimitivesToPaths above). Glyphs/decorations/elements/
// designs/pen strokes are unaffected since they're already paths.
export async function exportOutlineSVG({ background = 'white', customColor = '#ffffff' } = {}) {
  try {
    const svgString = buildStandaloneSVGString({ background, customColor, outline: true });
    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    downloadBlob(blob, `${sanitizeFilename(pc.getState().name)}-outline.svg`);
    return { ok: true };
  } catch (err) {
    toast('تعذّر تصدير الخطوط التفصيلية (Outline SVG) — حاول مرة أخرى');
    return { ok: false, error: err?.message || String(err) };
  }
}

// Phase 7, point 10: real vector PDF export via the vendored jsPDF +
// svg2pdf.js (both loaded as classic/UMD <script> tags in index.html,
// exposing window.jspdf.jsPDF with a genuine .svg() method patched in
// by svg2pdf — verified end-to-end with a standalone smoke test before
// ever vendoring these into the project). This preserves the artwork
// as real vector path/fill/stroke operators inside the PDF content
// stream — not a rasterized image embedded in a PDF wrapper — for
// every shape svg2pdf supports (paths, and the outline pass's
// converted primitives). A background rect is baked in exactly like
// every other export path (never transparent for PDF, since PDF has
// no universal alpha-canvas concept the way PNG does — "transparent"
// here safely falls back to white, mirroring exportJPG's own rule).
export async function exportPDF({ background = 'white', customColor = '#ffffff', outline = false } = {}) {
  try {
    if (!window.jspdf || typeof window.jspdf.jsPDF !== 'function') {
      throw new Error('PDF engine not loaded');
    }
    const { w, h } = getArtboardSize();
    const safeBackground = background === 'transparent' ? 'white' : background;
    const svgString = buildStandaloneSVGString({ background: safeBackground, customColor, outline });

    // svg2pdf needs a real, attached (but off-screen) DOM element — it
    // reads computed geometry from it, which a detached-from-document
    // parse via DOMParser cannot always provide correctly.
    const container = document.createElement('div');
    container.style.position = 'fixed';
    container.style.left = '-99999px';
    container.style.top = '0';
    container.innerHTML = svgString.replace(/^<\?xml[^>]*\?>\s*/, '');
    document.body.appendChild(container);
    const svgEl = container.querySelector('svg');

    try {
      const orientation = w >= h ? 'landscape' : 'portrait';
      const pdf = new window.jspdf.jsPDF({ orientation, unit: 'pt', format: [w, h] });
      await pdf.svg(svgEl, { x: 0, y: 0, width: w, height: h });
      const blob = pdf.output('blob');
      downloadBlob(blob, `${sanitizeFilename(pc.getState().name)}.pdf`);
      return { ok: true };
    } finally {
      container.remove();
    }
  } catch (err) {
    toast('تعذّر تصدير PDF — حاول مرة أخرى');
    return { ok: false, error: err?.message || String(err) };
  }
}
