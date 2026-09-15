// Project persistence storage (Phase 5, point 10).
//
// This is a static file server with no backend (see server.js) — there
// is nowhere to POST a save to — so the only honest place to persist a
// project IN THE BROWSER is the browser's own storage. localStorage is
// used (not IndexedDB): every project this editor saves is a single
// JSON document of modest size (a scene's worth of vector objects),
// well within localStorage's per-origin quota, and localStorage's
// synchronous API keeps Save/Open/Duplicate/Rename simple and testable
// without an extra async storage layer for what is, structurally, just
// "read/write a JSON blob by key".
//
// Two kinds of keys:
//   INDEX_KEY                 -> [{ id, name, updatedAt }, ...]   (for the Open list)
//   PROJECT_KEY_PREFIX + id   -> { id, name, updatedAt, data }    (the full saved scene)
// The index is kept in sync with the per-project records on every
// write so listProjects() never has to read every project just to show
// its name/date in the Open panel.

const INDEX_KEY = 'calligraphyEditor.projects.v1';
const PROJECT_KEY_PREFIX = 'calligraphyEditor.project.v1.';

// A well-formed index entry is what saveProject()/renameProject() ever
// actually write: { id, name, updatedAt }. Anything else in the array
// (null, a string, an object missing/mistyped these fields) is dropped
// rather than trusted -- an index entry an attacker or a hand-edit could
// have corrupted must never crash listProjects()'s sort (Phase 8, point
// 6: malformed data must degrade safely, not throw uncaught).
function isWellFormedIndexEntry(entry) {
  return !!entry && typeof entry === 'object' && !Array.isArray(entry)
    && typeof entry.id === 'string' && entry.id.length > 0
    && typeof entry.updatedAt === 'number' && Number.isFinite(entry.updatedAt);
}

function readIndex() {
  try {
    const raw = localStorage.getItem(INDEX_KEY);
    const list = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(list)) return [];
    return list.filter(isWellFormedIndexEntry);
  } catch (err) {
    console.error('[calligraphy-editor] Could not read project index:', err);
    return [];
  }
}

function writeIndex(list) {
  localStorage.setItem(INDEX_KEY, JSON.stringify(list));
}

function generateId() {
  return `proj-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// Newest-first, ready to render directly into an Open list.
export function listProjects() {
  return readIndex()
    .slice()
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

// id === null/undefined creates a brand-new project record (used by
// both the very first Save of an untitled project AND Duplicate, which
// always wants a fresh id even though it's saving an existing scene).
export function saveProject({ id, name, data }) {
  const realId = id || generateId();
  const updatedAt = Date.now();
  const finalName = (name || '').trim() || 'تكوين بدون عنوان';
  const record = { id: realId, name: finalName, updatedAt, data };

  try {
    localStorage.setItem(PROJECT_KEY_PREFIX + realId, JSON.stringify(record));
  } catch (err) {
    // Never fail silently — a full quota or a private-browsing storage
    // block must surface to the user as a real error, not a fake "Saved".
    console.error('[calligraphy-editor] Could not save project:', err);
    throw new Error('تعذّر حفظ المشروع (قد تكون مساحة التخزين ممتلئة)');
  }

  const idx = readIndex();
  const existingAt = idx.findIndex((p) => p.id === realId);
  const entry = { id: realId, name: finalName, updatedAt };
  if (existingAt >= 0) idx[existingAt] = entry;
  else idx.push(entry);
  writeIndex(idx);

  return entry;
}

export function loadProject(id) {
  try {
    const raw = localStorage.getItem(PROJECT_KEY_PREFIX + id);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    console.error('[calligraphy-editor] Could not read project:', id, err);
    return null;
  }
}

export function renameProject(id, newName) {
  const record = loadProject(id);
  if (!record) return false;
  const finalName = (newName || '').trim() || record.name;
  record.name = finalName;
  record.updatedAt = Date.now();
  localStorage.setItem(PROJECT_KEY_PREFIX + id, JSON.stringify(record));

  const idx = readIndex();
  const entry = idx.find((p) => p.id === id);
  if (entry) {
    entry.name = finalName;
    entry.updatedAt = record.updatedAt;
    writeIndex(idx);
  }
  return true;
}

export function deleteProject(id) {
  localStorage.removeItem(PROJECT_KEY_PREFIX + id);
  writeIndex(readIndex().filter((p) => p.id !== id));
}
