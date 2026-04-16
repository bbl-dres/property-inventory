// prototype-backend — Schema tab
// View/Edit toggle. In edit mode: descriptions inline-editable, drag handle
// reorder (native HTML5 DnD), "+ Add column" visible, per-row delete icon
// (gated behind a type-to-confirm modal). Locked columns stay at top, are
// NOT draggable, and cannot be deleted.

import * as api from './api.js';
import { ApiError } from './api.js';
import { el, toast, openModal, closeModal, confirmModal, safeUnsubscribe } from './utils.js';
import { bus, isAllowed } from './state.js';
import { COLUMN_NAME_RE, COLUMN_TYPES as TYPES } from './constants.js';

const ROLE_GATED_TITLE = 'Requires editor or admin role';

let root = null;
let layer = null;
let columns = [];
let mode = 'view'; // 'view' | 'edit'

// DnD state
let dragIdx = -1;
let dropIndicator = null;
let keyboardDragIdx = -1;

// Delegation root for drag-handle events. We attach dragstart/dragend/keydown
// ONCE to the tbody per render (via `wireHandleDelegation`) and resolve the
// handle from `event.target.closest('.pb-drag-handle')`. Previously
// `bindHandleDnd` attached three listeners per-handle on every render, which
// accumulated stale listeners on orphaned DOM nodes after each reorder.
let delegationRoot = null;

// Keyboard shortcut: "E" toggles edit mode when schema tab is active.
let keydownHandler = null;
let roleUnsub = null;

export async function mount(container, { layer: l }) {
  // Refetch to avoid rendering against a stale cached layer from the parent.
  try { l = await api.getLayer(l.name); } catch {}
  root = container;
  layer = l;
  columns = Array.isArray(layer.columns) ? layer.columns.slice() : [];
  mode = 'view';
  render();

  keydownHandler = (e) => {
    // Ignore when typing in inputs.
    const tag = (e.target && e.target.tagName) || '';
    if (/input|textarea|select/i.test(tag) || e.target?.isContentEditable) return;
    if (e.key === 'e' || e.key === 'E') {
      e.preventDefault();
      toggleMode();
    }
  };
  document.addEventListener('keydown', keydownHandler);

  roleUnsub = safeUnsubscribe(roleUnsub);
  roleUnsub = bus.on('user:role-changed', () => {
    // Force viewers out of edit mode and re-render with disabled affordances.
    if (!isAllowed('write')) mode = 'view';
    if (root) render();
  });
}

export function unmount() {
  if (keydownHandler) document.removeEventListener('keydown', keydownHandler);
  keydownHandler = null;
  roleUnsub = safeUnsubscribe(roleUnsub);
  if (root) root.innerHTML = '';
  root = null;
  layer = null;
  columns = [];
  dragIdx = -1;
  keyboardDragIdx = -1;
  dropIndicator = null;
  delegationRoot = null;
}

async function refresh() {
  try {
    columns = await api.listColumns(layer.name);
    render();
  } catch (err) {
    toast(err?.message || 'Failed to reload columns', 'error');
  }
}

function toggleMode() {
  // viewer role: refuse to enter edit mode. The button is disabled too, but
  // the keyboard shortcut (E) also funnels here so we gate in both paths.
  if (mode === 'view' && !isAllowed('write')) {
    announce('Edit mode requires editor or admin role.');
    return;
  }
  mode = mode === 'view' ? 'edit' : 'view';
  render();
  announce(`Schema ${mode} mode`);
}

function render() {
  if (!root) return;
  root.innerHTML = '';

  const lockedCount = columns.filter((c) => c.locked).length;
  const editableCount = columns.length - lockedCount;

  const canWrite = isAllowed('write');

  // Single toggle button. View mode = outline/secondary ("Edit schema").
  // Edit mode = primary filled ("Done editing") to signal active state.
  const toggleBtn = el('button', {
    type: 'button',
    class: mode === 'edit' ? 'btn-primary pb-schema-edit-btn is-editing' : 'btn-secondary pb-schema-edit-btn',
    'aria-pressed': mode === 'edit' ? 'true' : 'false',
    disabled: (!canWrite && mode === 'view') ? true : false,
    title: !canWrite ? ROLE_GATED_TITLE : (mode === 'edit' ? 'Done editing (E)' : 'Edit schema (E)')
  }, [
    el('span', { class: 'material-symbols-outlined pb-icon-sm' },
      mode === 'edit' ? 'check' : 'edit'),
    ' ',
    mode === 'edit' ? 'Done editing' : 'Edit schema'
  ]);
  toggleBtn.addEventListener('click', () => toggleMode());

  // Subtle "Editing" pill, visible only in edit mode.
  const editingPill = mode === 'edit'
    ? el('span', { class: 'pb-editing-pill', 'aria-live': 'polite' }, 'Editing')
    : null;

  const addBtn = el('button', {
    type: 'button',
    class: 'btn-primary',
    disabled: !canWrite ? true : false,
    title: canWrite ? '' : ROLE_GATED_TITLE
  }, [
    el('span', { class: 'material-symbols-outlined pb-icon-sm' }, 'add'),
    ' Add column'
  ]);
  addBtn.addEventListener('click', openAddColumnModal);

  // In view mode we show only the total column count to avoid the confusing
  // "N users" wording that read as "users of this layer". In edit mode,
  // the editable/locked breakdown is genuinely useful (you can only reorder
  // editable ones), so we show it there.
  const toolbarTitle = mode === 'edit'
    ? `${columns.length} columns · ${editableCount} editable · ${lockedCount} locked`
    : `${columns.length} column${columns.length === 1 ? '' : 's'}`;

  // "+ Add column" lives behind edit mode along with reorder + delete.
  // Schema changes are treated as a single "editing the schema" mode — the
  // user explicitly enters it and commits (or exits). Keeps the resting
  // view read-only, which is the safer default for a production-minded
  // schema tool.
  const toolbar = el('div', { class: 'pb-toolbar pb-schema-toolbar' }, [
    el('div', { class: 'pb-toolbar-title' }, toolbarTitle),
    editingPill,
    el('div', { style: { flex: '1' } }),
    mode === 'edit' ? addBtn : null,
    toggleBtn
  ].filter(Boolean));

  const head = el('tr', {}, [
    mode === 'edit' ? el('th', { style: { width: '32px' }, 'aria-label': 'Drag' }, '') : null,
    el('th', { style: { width: '48px' } }, '#'),
    el('th', {}, 'Name'),
    el('th', {}, 'Type'),
    el('th', {}, 'Description'),
    el('th', { style: { width: '80px' } }, '')
  ].filter(Boolean));

  const tbody = el('tbody', {});
  columns.forEach((c, i) => tbody.appendChild(renderRow(c, i)));

  // Attach drag/keyboard handlers ONCE per render, delegated on the tbody.
  // Old tbody (with its listeners) is discarded by root.innerHTML reset.
  if (mode === 'edit') wireHandleDelegation(tbody);

  const tableCard = el('div', { class: 'pb-card' }, [
    el('table', { class: 'pb-table pb-schema-table' + (mode === 'edit' ? ' is-edit' : ''), id: 'pb-schema-table' }, [
      el('thead', {}, [head]),
      tbody
    ])
  ]);

  root.appendChild(toolbar);
  root.appendChild(tableCard);

  // Drop indicator container (absolute, one per render).
  if (mode === 'edit') {
    dropIndicator = el('div', { class: 'pb-drop-indicator', style: { display: 'none' } });
    tableCard.appendChild(dropIndicator);
  }
}

function renderRow(column, idx) {
  const locked = !!column.locked;
  const editing = mode === 'edit';

  const handle = editing
    ? (() => {
        const h = el('td', { class: 'pb-drag-cell' }, [
          locked
            ? el('span', { class: 'pb-drag-handle is-disabled', title: 'Locked' }, '⋮⋮')
            : el('span', {
                class: 'pb-drag-handle',
                tabindex: '0',
                role: 'button',
                draggable: 'true',
                'aria-label': `Reorder ${column.name}. Press Space to grab, arrow keys to move, Space to drop, Escape to cancel.`,
                title: 'Drag to reorder',
                // dataset hooks so the delegated handler can resolve the
                // column's index/name without a closure reference.
                dataset: { idx: String(idx), col: column.name }
              }, '⋮⋮')
        ]);
        return h;
      })()
    : null;

  const desc = locked
    ? (column.description || el('span', { class: 'pb-muted' }, '—'))
    : (editing ? renderEditableDescription(column) : (column.description || el('span', { class: 'pb-muted' }, '—')));

  let actions;
  if (locked) {
    actions = el('td', {}, [el('span', { class: 'pb-muted' }, '(locked)')]);
  } else if (editing) {
    // Delete is destructive (drops the column + wipes it from every row).
    // Gate behind a type-to-confirm modal so a misclick can't nuke a
    // column. Only surfaced in edit mode — rest state is read-only.
    const delBtn = el('button', {
      type: 'button',
      class: 'icon-btn icon-btn--danger',
      'aria-label': `Delete column ${column.name}`,
      title: `Delete column "${column.name}"`
    }, [el('span', { class: 'material-symbols-outlined pb-icon-sm' }, 'delete')]);
    delBtn.addEventListener('click', () => deleteColumnFlow(column));
    actions = el('td', { class: 'pb-actions-cell' }, [delBtn]);
  } else {
    actions = el('td', {}, []);
  }

  const tr = el('tr', {
    dataset: { col: column.name, idx: String(idx) },
    draggable: false
  }, [
    handle,
    el('td', {}, String(idx + 1)),
    el('td', {}, [el('span', { class: 'pb-name-mono' }, column.name)]),
    el('td', {}, [el('span', { class: 'pb-badge' }, column.type)]),
    el('td', { class: 'pb-desc-cell' }, [desc]),
    actions
  ].filter(Boolean));

  if (editing && !locked) {
    tr.addEventListener('dragover', (e) => onRowDragOver(e, idx));
    tr.addEventListener('drop', (e) => onRowDrop(e, idx));
  }

  return tr;
}

// ===== Description inline edit (edit mode only) =====

function renderEditableDescription(column) {
  const input = el('input', {
    type: 'text',
    class: 'pb-inline-input',
    value: column.description || '',
    placeholder: '— add description —'
  });
  let current = column.description || '';
  input.addEventListener('blur', async () => {
    const next = input.value.trim();
    if (next === current) return;
    try {
      await api.setColumnDescription(layer.name, column.name, next);
      current = next;
      column.description = next;
      toast('Description saved', 'success');
      bus.emit('schema:changed');
    } catch (err) {
      toast(err?.message || 'Save failed', 'error');
      input.value = current;
    }
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
    else if (e.key === 'Escape') { e.preventDefault(); input.value = current; input.blur(); }
  });
  return input;
}

// ===== Drag-and-drop (mouse) =====
//
// We use EVENT DELEGATION on the tbody rather than per-handle listeners.
// Each call to `render()` builds a fresh tbody, so attaching listeners on
// the tbody attaches them at most once per render (and the old tbody is
// dropped wholesale, taking its listeners with it). This avoids the stale
// listener accumulation we hit previously with per-handle `addEventListener`
// calls, which kept piling up on orphaned DOM nodes after each reorder.

function wireHandleDelegation(tbody) {
  delegationRoot = tbody;

  tbody.addEventListener('dragstart', (e) => {
    const handleEl = e.target.closest('.pb-drag-handle');
    if (!handleEl || handleEl.classList.contains('is-disabled')) return;
    const idx = Number(handleEl.dataset.idx);
    const colName = handleEl.dataset.col || '';
    dragIdx = idx;
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', colName); } catch {}
    }
    handleEl.closest('tr')?.classList.add('is-dragging');
  });

  tbody.addEventListener('dragend', (e) => {
    const handleEl = e.target.closest('.pb-drag-handle');
    if (!handleEl) return;
    handleEl.closest('tr')?.classList.remove('is-dragging');
    hideDropIndicator();
    dragIdx = -1;
  });

  // Keyboard a11y
  tbody.addEventListener('keydown', (e) => {
    const handleEl = e.target.closest('.pb-drag-handle');
    if (!handleEl || handleEl.classList.contains('is-disabled')) return;
    const idx = Number(handleEl.dataset.idx);
    const colName = handleEl.dataset.col || '';

    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      if (keyboardDragIdx === -1) {
        keyboardDragIdx = idx;
        handleEl.closest('tr')?.classList.add('is-dragging');
        announce(`Grabbed ${colName}. Use arrow keys to move.`);
      } else {
        // drop
        announce(`Dropped ${colName}.`);
        handleEl.closest('tr')?.classList.remove('is-dragging');
        keyboardDragIdx = -1;
        // Persist the current order.
        persistOrder();
      }
    } else if (e.key === 'Escape' && keyboardDragIdx !== -1) {
      e.preventDefault();
      handleEl.closest('tr')?.classList.remove('is-dragging');
      announce('Cancelled.');
      keyboardDragIdx = -1;
      refresh();
    } else if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && keyboardDragIdx !== -1) {
      e.preventDefault();
      const delta = e.key === 'ArrowUp' ? -1 : 1;
      const target = keyboardDragIdx + delta;
      if (!canSwap(keyboardDragIdx, target)) return;
      swapColumns(keyboardDragIdx, target);
      keyboardDragIdx = target;
      // Re-render then re-focus the handle at the new index.
      render();
      const row = root.querySelector(`tr[data-idx="${target}"]`);
      const h = row?.querySelector('.pb-drag-handle');
      if (h) { h.classList.add('is-grabbed'); h.focus(); row.classList.add('is-dragging'); }
    }
  });
}

function canSwap(from, to) {
  if (to < 0 || to >= columns.length) return false;
  if (columns[to]?.locked) return false;
  if (columns[from]?.locked) return false;
  return true;
}

function swapColumns(from, to) {
  const [moved] = columns.splice(from, 1);
  columns.splice(to, 0, moved);
}

function onRowDragOver(e, idx) {
  if (dragIdx === -1) return;
  if (columns[idx]?.locked) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  showDropIndicator(e, idx);
}

function onRowDrop(e, idx) {
  if (dragIdx === -1) return;
  if (columns[idx]?.locked) return;
  e.preventDefault();
  const from = dragIdx;
  let to = idx;
  // If dropping onto the lower half of a row, insert after.
  const tr = e.currentTarget;
  const rect = tr.getBoundingClientRect();
  const after = (e.clientY - rect.top) > rect.height / 2;
  if (after && to < columns.length - 1) to = to + 1;
  if (from < to) to -= 1; // account for removal
  if (from === to) { hideDropIndicator(); return; }
  const prevOrder = columns.slice();
  swapColumns(from, to);
  hideDropIndicator();
  render();
  persistOrder(prevOrder);
}

function showDropIndicator(e, idx) {
  if (!dropIndicator) return;
  const table = root.querySelector('#pb-schema-table');
  const row = table.querySelector(`tr[data-idx="${idx}"]`);
  if (!row) return;
  const tableRect = table.parentElement.getBoundingClientRect();
  const rect = row.getBoundingClientRect();
  const after = (e.clientY - rect.top) > rect.height / 2;
  const y = (after ? rect.bottom : rect.top) - tableRect.top;
  dropIndicator.style.display = 'block';
  dropIndicator.style.top = y + 'px';
}

function hideDropIndicator() {
  if (dropIndicator) dropIndicator.style.display = 'none';
}

async function persistOrder(prevOrder) {
  const names = columns.filter((c) => !c.locked).map((c) => c.name);
  try {
    await api.reorderColumns(layer.name, names);
    announce('Column order saved.');
  } catch (err) {
    toast(err?.message || 'Reorder failed', 'error');
    if (prevOrder) { columns = prevOrder; render(); }
  }
}

function announce(msg) {
  const live = document.getElementById('aria-live');
  if (live) { live.textContent = ''; setTimeout(() => { live.textContent = msg; }, 20); }
}

// ===== Delete column flow =====

async function deleteColumnFlow(column) {
  const ok = await confirmModal({
    title: `Delete column "${column.name}"?`,
    message: `This permanently drops the column from the schema and wipes its values from every record in this layer. This cannot be undone.`,
    requireText: column.name,
    confirmLabel: 'Delete column',
    danger: true
  });
  if (!ok) return;
  try {
    await api.dropColumn(layer.name, column.name);
    toast(`Column "${column.name}" deleted`, 'success');
    bus.emit('schema:changed');
    await refresh();
  } catch (err) {
    const msg = err instanceof ApiError ? `${err.code}: ${err.message}` : (err?.message || 'Failed to delete column');
    toast(msg, 'error');
  }
}

// ===== Add column modal =====

function openAddColumnModal() {
  const nameInput = el('input', { type: 'text', autocomplete: 'off', placeholder: 'e.g. parcel_no' });
  const typeSelect = el('select', {}, TYPES.map((t) => el('option', { value: t }, t)));
  const descInput = el('textarea', { rows: '3', placeholder: 'Optional description' });

  const nameErr = el('div', { class: 'pb-field-error', style: { display: 'none' } });
  const submitErr = el('div', { class: 'pb-field-error', style: { display: 'none' } });

  function validateName() {
    const v = nameInput.value.trim();
    if (!v) { nameInput.classList.remove('is-invalid'); nameErr.style.display = 'none'; return false; }
    const ok = COLUMN_NAME_RE.test(v);
    nameInput.classList.toggle('is-invalid', !ok);
    nameErr.textContent = ok ? '' : 'Must match ^[a-z][a-z0-9_]{0,62}$';
    nameErr.style.display = ok ? 'none' : '';
    return ok;
  }
  nameInput.addEventListener('input', validateName);

  const cancelBtn = el('button', { type: 'button', class: 'btn-secondary' }, 'Cancel');
  // The submit button lives in the modal footer (outside the <form>), so
  // `type="submit"` alone won't wire up — clicking would do nothing. Use
  // `type="button"` and bridge to the form via `requestSubmit()` so both
  // the button click and Enter-in-field paths fire the same handler.
  const submitBtn = el('button', { type: 'button', class: 'btn-primary' }, 'Add column');

  const form = el('form', { class: 'pb-form', novalidate: true }, [
    el('div', { class: 'pb-field' }, [
      el('label', {}, 'Name'),
      nameInput,
      el('div', { class: 'pb-field-hint' }, 'Lowercase, digits and underscore. Starts with a letter.'),
      nameErr
    ]),
    el('div', { class: 'pb-field' }, [el('label', {}, 'Type'), typeSelect]),
    el('div', { class: 'pb-field' }, [el('label', {}, 'Description'), descInput]),
    submitErr,
    // Hidden submit so pressing Enter inside any field triggers form submit
    // (default browser behavior for implicit submission).
    el('button', { type: 'submit', style: { display: 'none' } }, '')
  ]);
  submitBtn.addEventListener('click', () => form.requestSubmit());

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    submitErr.style.display = 'none';
    const name = nameInput.value.trim();
    if (!validateName() || !name) {
      if (!name) { nameErr.textContent = 'Name is required'; nameErr.style.display = ''; }
      return;
    }
    submitBtn.disabled = true;
    try {
      await api.addColumn(layer.name, { name, type: typeSelect.value, description: descInput.value.trim() });
      closeModal();
      toast('Column added', 'success');
      bus.emit('schema:changed');
      await refresh();
    } catch (err) {
      const msg = err instanceof ApiError ? `${err.code}: ${err.message}` : (err?.message || 'Failed to add column');
      submitErr.textContent = msg;
      submitErr.style.display = '';
      submitBtn.disabled = false;
    }
  });

  cancelBtn.addEventListener('click', () => closeModal());

  const content = el('div', {}, [
    el('div', { class: 'pb-modal-header' }, 'Add column'),
    el('div', { class: 'pb-modal-body' }, [form]),
    el('div', { class: 'pb-modal-footer' }, [cancelBtn, submitBtn])
  ]);
  openModal(content);
}
