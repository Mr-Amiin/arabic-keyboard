// Ties scene.js (what to save), project-store.js (where to save it),
// and history.js (undo/redo must not survive a New/Open) into the
// single source of truth for "what project is this, and is it dirty".
//
// Phase 5 points 10 + 11: New / Save / Open / Rename / Duplicate, and
// an unsaved-changes indicator that must be able to warn before
// abandoning unsaved work.

import * as scene from './scene.js';
import * as store from './project-store.js';
import { resetHistory } from './history.js';

const UNTITLED = 'تكوين بدون عنوان';

let currentId = null;
let currentName = UNTITLED;
let dirty = false;
let suppressDirty = false; // true only while WE are the ones repopulating the scene

const listeners = new Set();
function notify() {
  const state = getState();
  listeners.forEach((fn) => fn(state));
}

export function onProjectChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getState() {
  return { id: currentId, name: currentName, dirty };
}

export function isDirty() {
  return dirty;
}

// Wired once at boot: any real scene mutation (not a mere selection
// change — scene.onChange only fires from render(), which only runs
// after actual object changes) marks the project modified, unless it's
// OUR OWN load that's causing the render.
export function initProjectTracking() {
  scene.onChange(() => {
    if (suppressDirty || dirty) return;
    dirty = true;
    notify();
  });

  // The one place a native browser prompt is unavoidable: leaving/
  // reloading the TAB itself. Everything else (New/Open while dirty)
  // uses the app's own confirmation panel instead.
  window.addEventListener('beforeunload', (e) => {
    if (!dirty) return;
    e.preventDefault();
    e.returnValue = '';
  });
}

function loadInto(data, id, name) {
  suppressDirty = true;
  try {
    scene.loadProjectScene(data);
  } finally {
    // Whatever happens inside loadProjectScene, we must never leave
    // suppressDirty stuck "on" — that would silently swallow every
    // future real edit's dirty-flag until the next reload (Phase 6,
    // point 9: fail gracefully, not into a DIFFERENT silent failure).
    suppressDirty = false;
  }
  resetHistory();
  scene.clearSelection();
  currentId = id;
  currentName = name;
  dirty = false;
  notify();
}

// Every destructive entry point (New / Open / the "discard and
// continue" path) takes { confirmed }: callers check isDirty() first
// and show their own confirmation UI, then call again with
// confirmed:true. Kept here (not silently auto-confirmed) so no
// caller can accidentally blow away unsaved work.
export function newProject({ confirmed = false } = {}) {
  if (dirty && !confirmed) return { needsConfirm: true };
  loadInto(null, null, UNTITLED);
  return { ok: true };
}

export function openProject(id, { confirmed = false } = {}) {
  if (dirty && !confirmed) return { needsConfirm: true };
  const record = store.loadProject(id);
  if (!record) return { ok: false, error: 'تعذّر فتح هذا المشروع' };

  // Validate BEFORE touching the live scene at all -- a corrupt/
  // incompatible saved file must never wipe the canvas the user is
  // currently looking at just because we started an Open we then
  // couldn't finish (Phase 6, point 9).
  const validation = scene.validateProjectData(record.data);
  if (!validation.ok) return { ok: false, error: validation.error };

  try {
    loadInto(record.data, record.id, record.name);
  } catch (err) {
    console.error('[calligraphy-editor] Unexpected error while opening project:', err);
    return { ok: false, error: 'حدث خطأ غير متوقع أثناء فتح المشروع' };
  }
  return { ok: true };
}

export function saveProject() {
  const data = scene.serializeProject();
  let saved;
  try {
    saved = store.saveProject({ id: currentId, name: currentName, data });
  } catch (err) {
    return { ok: false, error: err.message };
  }
  currentId = saved.id;
  currentName = saved.name;
  dirty = false;
  notify();
  return { ok: true, saved };
}

// Always creates a NEW stored project (never overwrites the one you
// duplicated from), and switches the editor to be that new copy going
// forward — matches "Duplicate project" in every real design tool.
export function duplicateProject(name) {
  const data = scene.serializeProject();
  let saved;
  try {
    saved = store.saveProject({ id: null, name: name || `${currentName} (نسخة)`, data });
  } catch (err) {
    return { ok: false, error: err.message };
  }
  currentId = saved.id;
  currentName = saved.name;
  dirty = false;
  notify();
  return { ok: true, saved };
}

export function renameProject(newName) {
  const finalName = (newName || '').trim();
  if (!finalName) return { ok: false, error: 'الاسم لا يمكن أن يكون فارغًا' };
  currentName = finalName;
  if (currentId) store.renameProject(currentId, finalName);
  else dirty = true; // an untitled-but-unsaved project's rename should still count as "modified"
  notify();
  return { ok: true };
}

export function listProjects() {
  return store.listProjects();
}

export function deleteProject(id) {
  store.deleteProject(id);
}
