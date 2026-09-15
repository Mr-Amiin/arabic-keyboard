// The "Project" floating panel (Phase 5, point 10 + 11): New / Save /
// Open / Rename / Duplicate, plus the confirmation step before any of
// these would discard unsaved work.
//
// This is the ONLY place in the editor that shows a confirmation UI —
// deliberately built as part of this same panel (not a native
// confirm()) so it matches the rest of the app's own visual language,
// and so "Save first, then continue" can be offered as a real third
// option a native browser dialog could never provide.

import * as pc from './project-controller.js';
import { toast } from './toast.js';

function timeAgoLabel(ts) {
  const diffSec = Math.max(0, (Date.now() - ts) / 1000);
  if (diffSec < 60) return 'الآن';
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `قبل ${diffMin} د`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `قبل ${diffHr} س`;
  const diffDay = Math.round(diffHr / 24);
  return `قبل ${diffDay} يوم`;
}

export function createProjectPanel() {
  const root = document.createElement('div');
  root.id = 'project-panel';
  root.className = 'floating-panel panel-project';
  root.hidden = true;
  root.innerHTML = `
    <div class="project-panel-inner">
      <div class="text-panel-header">
        <span class="text-panel-title">المشروع • Project</span>
        <button type="button" class="icon-btn sm text-panel-close" title="إغلاق">
          <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>
        </button>
      </div>

      <div class="project-panel-body">
        <div class="project-panel-actions">
          <button type="button" class="text-btn" data-action="new">جديد</button>
          <button type="button" class="text-btn" data-action="save">حفظ</button>
          <button type="button" class="text-btn" data-action="duplicate">نسخ باسم</button>
        </div>

        <label class="text-panel-label">اسم المشروع</label>
        <div class="project-rename-row">
          <input type="text" class="project-rename-input" dir="rtl" />
          <button type="button" class="icon-btn sm" data-action="rename" title="إعادة تسمية">
            <svg viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg>
          </button>
        </div>

        <label class="text-panel-label">فتح مشروعًا محفوظًا</label>
        <div class="project-list"></div>
      </div>

      <div class="project-panel-confirm" hidden>
        <p class="project-confirm-msg">لديك تغييرات غير محفوظة في «<span class="project-confirm-name"></span>». ماذا تريد أن تفعل؟</p>
        <div class="project-confirm-actions">
          <button type="button" class="text-btn" data-action="confirm-save">حفظ ثم المتابعة</button>
          <button type="button" class="text-btn" data-action="confirm-discard">تجاهل والمتابعة</button>
          <button type="button" class="text-btn text-btn-ghost" data-action="confirm-cancel">إلغاء</button>
        </div>
      </div>
    </div>
  `;
  document.getElementById('app').appendChild(root);

  const bodyEl = root.querySelector('.project-panel-body');
  const confirmEl = root.querySelector('.project-panel-confirm');
  const confirmNameEl = root.querySelector('.project-confirm-name');
  const closeBtn = root.querySelector('.text-panel-close');
  const renameInput = root.querySelector('.project-rename-input');
  const listEl = root.querySelector('.project-list');

  let pendingAction = null; // { type: 'new' } | { type: 'open', id }

  function showConfirm(label) {
    confirmNameEl.textContent = label;
    bodyEl.hidden = true;
    confirmEl.hidden = false;
  }
  function hideConfirm() {
    confirmEl.hidden = true;
    bodyEl.hidden = false;
    pendingAction = null;
  }

  function renderList() {
    const projects = pc.listProjects();
    listEl.innerHTML = '';
    if (!projects.length) {
      const empty = document.createElement('div');
      empty.className = 'project-list-empty';
      empty.textContent = 'لا توجد مشاريع محفوظة بعد';
      listEl.appendChild(empty);
      return;
    }
    const current = pc.getState();
    for (const p of projects) {
      const row = document.createElement('div');
      row.className = 'project-list-row' + (p.id === current.id ? ' active' : '');
      // Phase 30 (release-candidate security audit): p.id comes back out
      // of localStorage via JSON.parse (project-store.js), so it must be
      // treated as untrusted data, not just this app's own generateId()
      // output -- tampered/malformed storage (or any future
      // import/sync feature) could otherwise smuggle an id like
      // `x"><img onerror=...>` through this template-string interpolation
      // and break out of the attribute into real, executing HTML. Setting
      // it via .setAttribute (like p.name already goes through
      // .textContent below) keeps it a literal attribute value no matter
      // what characters it contains.
      row.innerHTML = `
        <button type="button" class="project-list-open">
          <span class="project-list-name"></span>
          <span class="project-list-time"></span>
        </button>
        <button type="button" class="icon-btn sm project-list-delete" title="حذف">
          <svg viewBox="0 0 24 24"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
        </button>
      `;
      row.querySelector('.project-list-open').setAttribute('data-id', p.id);
      row.querySelector('.project-list-delete').setAttribute('data-id', p.id);
      row.querySelector('.project-list-name').textContent = p.name;
      row.querySelector('.project-list-time').textContent = timeAgoLabel(p.updatedAt);
      listEl.appendChild(row);
    }
  }

  function refresh() {
    const state = pc.getState();
    renameInput.value = state.name;
    renderList();
  }

  function runOrConfirm(type, extra, action) {
    if (pc.isDirty()) {
      pendingAction = { type, ...extra };
      showConfirm(pc.getState().name);
      return;
    }
    action();
  }

  root.querySelector('[data-action="new"]').addEventListener('click', () => {
    runOrConfirm('new', {}, () => {
      pc.newProject({ confirmed: true });
      refresh();
      close();
    });
  });

  root.querySelector('[data-action="save"]').addEventListener('click', () => {
    const result = pc.saveProject();
    if (result.ok) { toast('تم حفظ المشروع'); refresh(); }
    else toast(result.error || 'تعذّر الحفظ');
  });

  root.querySelector('[data-action="duplicate"]').addEventListener('click', () => {
    const result = pc.duplicateProject(`${pc.getState().name} (نسخة)`);
    if (result.ok) { toast('تم إنشاء نسخة جديدة'); refresh(); }
    else toast(result.error || 'تعذّر إنشاء نسخة');
  });

  root.querySelector('[data-action="rename"]').addEventListener('click', () => {
    const result = pc.renameProject(renameInput.value);
    if (result.ok) { toast('تم تحديث الاسم'); refresh(); }
    else toast(result.error || 'تعذّر إعادة التسمية');
  });
  renameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') root.querySelector('[data-action="rename"]').click();
  });

  listEl.addEventListener('click', (e) => {
    const openBtn = e.target.closest('.project-list-open');
    const delBtn = e.target.closest('.project-list-delete');
    if (openBtn) {
      const id = openBtn.getAttribute('data-id');
      runOrConfirm('open', { id }, () => {
        const result = pc.openProject(id, { confirmed: true });
        if (result.ok) { refresh(); close(); } else toast(result.error || 'تعذّر الفتح');
      });
    } else if (delBtn) {
      const id = delBtn.getAttribute('data-id');
      pc.deleteProject(id);
      renderList();
    }
  });

  root.querySelector('[data-action="confirm-save"]').addEventListener('click', () => {
    const saveResult = pc.saveProject();
    if (!saveResult.ok) { toast(saveResult.error || 'تعذّر الحفظ'); return; }
    const action = pendingAction;
    hideConfirm();
    if (action?.type === 'new') { pc.newProject({ confirmed: true }); refresh(); close(); }
    else if (action?.type === 'open') {
      const result = pc.openProject(action.id, { confirmed: true });
      if (result.ok) { refresh(); close(); } else toast(result.error || 'تعذّر الفتح');
    }
  });
  root.querySelector('[data-action="confirm-discard"]').addEventListener('click', () => {
    const action = pendingAction;
    hideConfirm();
    if (action?.type === 'new') { pc.newProject({ confirmed: true }); refresh(); close(); }
    else if (action?.type === 'open') {
      const result = pc.openProject(action.id, { confirmed: true });
      if (result.ok) { refresh(); close(); } else toast(result.error || 'تعذّر الفتح');
    }
  });
  root.querySelector('[data-action="confirm-cancel"]').addEventListener('click', () => hideConfirm());

  closeBtn.addEventListener('click', () => close());

  pc.onProjectChange(refresh);

  function open() {
    hideConfirm();
    refresh();
    root.hidden = false;
  }
  function close() {
    root.hidden = true;
  }

  return { open, close, isOpen: () => !root.hidden, toggle: () => (root.hidden ? open() : close()) };
}
