// prototype-backend — Users (IAM) main view
//
// Prototype-only IAM — the roles shown here (viewer / editor / admin) are
// stored in localStorage and have NO actual auth enforcement. In a real
// backend these would be enforced via Supabase Auth + Row-Level-Security
// policies. This view is for demoing the shape of the admin surface only.

import * as api from './api.js';
import { ApiError } from './api.js';
import { el, toast, openModal, closeModal, confirmModal, formatRelativeTime, submitForm, safeUnsubscribe } from './utils.js';
import { renderViewHeader } from './app.js';
import { bus, isAllowed } from './state.js';

const ROLES = ['viewer', 'editor', 'admin'];
const ROLE_GATED_TITLE = 'Requires admin role';

let root = null;
let users = [];
let roleUnsub = null;

export async function mount(container) {
  root = container;
  root.innerHTML = '<div class="loading-state"><div class="loading-spinner"></div><div class="loading-text">Loading users…</div></div>';
  roleUnsub = safeUnsubscribe(roleUnsub);
  roleUnsub = bus.on('user:role-changed', () => { if (root) render(); });
  await refresh();
}

export function unmount() {
  roleUnsub = safeUnsubscribe(roleUnsub);
  if (root) root.innerHTML = '';
  root = null;
  users = [];
}

async function refresh() {
  try { users = await api.listUsers(); }
  catch { users = []; }
  render();
}

function render() {
  if (!root) return;
  root.innerHTML = '';

  const canAdmin = isAllowed('admin');

  const inviteBtn = el('button', {
    type: 'button',
    class: 'btn-primary',
    disabled: !canAdmin ? true : false,
    title: canAdmin ? '' : ROLE_GATED_TITLE
  }, [
    el('span', { class: 'material-symbols-outlined pb-icon-sm' }, 'person_add'),
    ' Invite user'
  ]);
  inviteBtn.addEventListener('click', openInviteModal);

  const count = users.length;
  root.appendChild(renderViewHeader({
    title: 'Members',
    subtitle: `${count} member${count === 1 ? '' : 's'}`,
    description: 'Prototype-only IAM — roles are stored but not enforced. The real backend would use Supabase Auth + RLS.',
    actions: inviteBtn
  }));

  if (!users.length) {
    root.appendChild(el('div', { class: 'empty-state' }, [
      el('span', { class: 'material-symbols-outlined' }, 'group'),
      el('div', { class: 'empty-state-title' }, 'No users yet'),
      el('div', { class: 'empty-state-description' }, 'Invite a user to get started.')
    ]));
    return;
  }

  const head = el('tr', {}, [
    el('th', {}, 'Email'),
    el('th', {}, 'Name'),
    el('th', { style: { width: '140px' } }, 'Role'),
    el('th', { style: { width: '160px' } }, 'Last sign-in'),
    el('th', { style: { width: '1%' } }, '')
  ]);

  const tbody = el('tbody', {});
  users.forEach((u) => tbody.appendChild(renderRow(u)));

  const card = el('div', { class: 'pb-card' }, [
    el('table', { class: 'pb-table' }, [
      el('thead', {}, [head]),
      tbody
    ])
  ]);
  root.appendChild(card);
}

function renderRow(user) {
  const canAdmin = isAllowed('admin');
  const roleSelect = el('select', {
    class: 'pb-inline-input',
    'aria-label': `Role for ${user.email}`,
    disabled: !canAdmin ? true : false,
    title: canAdmin ? '' : ROLE_GATED_TITLE
  },
    ROLES.map((r) => el('option', { value: r, selected: r === user.role ? true : undefined }, r))
  );
  roleSelect.addEventListener('change', async () => {
    const nextRole = roleSelect.value;
    try {
      await api.updateUser(user.id, { role: nextRole });
      user.role = nextRole;
      toast('Role updated', 'success');
    } catch (err) {
      roleSelect.value = user.role;
      toast(err?.message || 'Failed to update role', 'error');
    }
  });

  const deleteBtn = el('button', {
    type: 'button',
    class: 'pb-sidebar-item-action',
    disabled: !canAdmin ? true : false,
    title: canAdmin ? `Delete ${user.email}` : ROLE_GATED_TITLE,
    'aria-label': `Delete ${user.email}`,
    style: { display: 'inline-flex' }
  }, [el('span', { class: 'material-symbols-outlined' }, 'delete')]);
  deleteBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    handleDelete(user);
  });

  return el('tr', { dataset: { id: user.id } }, [
    el('td', {}, [el('span', { class: 'pb-name-mono' }, user.email)]),
    el('td', {}, user.name || el('span', { class: 'pb-muted' }, '—')),
    el('td', {}, [roleSelect]),
    el('td', {}, user.last_sign_in_at ? formatRelativeTime(user.last_sign_in_at) : el('span', { class: 'pb-muted' }, 'never')),
    el('td', { class: 'pb-row-actions' }, [deleteBtn])
  ]);
}

async function handleDelete(user) {
  const ok = await confirmModal({
    title: `Delete user "${user.email}"?`,
    message: 'This removes the user from the prototype. It cannot be undone.',
    requireText: user.email,
    confirmLabel: 'Delete',
    danger: true
  });
  if (!ok) return;
  try {
    await api.deleteUser(user.id);
    toast(`Deleted "${user.email}"`, 'success');
    await refresh();
  } catch (err) {
    toast(err?.message || 'Delete failed', 'error');
  }
}

function openInviteModal() {
  const emailInput = el('input', { type: 'email', autocomplete: 'off', placeholder: 'user@example.ch' });
  const nameInput = el('input', { type: 'text', autocomplete: 'off', placeholder: 'Full name' });
  const roleSelect = el('select', {},
    ROLES.map((r) => el('option', { value: r, selected: r === 'viewer' ? true : undefined }, r))
  );

  const submitErr = el('div', { class: 'pb-field-error', style: { display: 'none' } });
  const cancelBtn = el('button', { type: 'button', class: 'btn-secondary' }, 'Cancel');
  const submitBtn = el('button', { type: 'submit', class: 'btn-primary' }, 'Invite');

  const form = el('form', { class: 'pb-form', novalidate: true }, [
    el('div', { class: 'pb-field' }, [el('label', {}, 'Email'), emailInput]),
    el('div', { class: 'pb-field' }, [el('label', {}, 'Name'), nameInput]),
    el('div', { class: 'pb-field' }, [
      el('label', {}, 'Role'),
      roleSelect,
      el('div', { class: 'pb-field-hint' }, 'viewer: read-only · editor: can edit layers · admin: full access')
    ]),
    submitErr
  ]);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    submitErr.style.display = 'none';
    // Client-side duplicate-email guard so the user gets immediate feedback
    // rather than a round-tripped 409 from the mock API. The API still
    // enforces uniqueness server-side — this is just the friendlier path.
    const candidate = emailInput.value.trim().toLowerCase();
    if (candidate && users.some((u) => (u.email || '').toLowerCase() === candidate)) {
      submitErr.textContent = 'This user is already a member.';
      submitErr.style.display = '';
      emailInput.focus();
      return;
    }
    submitBtn.disabled = true;
    try {
      await api.createUser({
        email: emailInput.value.trim(),
        name: nameInput.value.trim(),
        role: roleSelect.value
      });
      closeModal();
      toast('User invited', 'success');
      await refresh();
    } catch (err) {
      const msg = err instanceof ApiError ? `${err.code}: ${err.message}` : (err?.message || 'Failed to invite');
      submitErr.textContent = msg;
      submitErr.style.display = '';
      submitBtn.disabled = false;
    }
  });
  cancelBtn.addEventListener('click', () => closeModal());

  // Submit button lives outside the form (modal footer) — bridge the click.
  submitBtn.addEventListener('click', (e) => { e.preventDefault(); submitForm(form); });

  openModal(el('div', {}, [
    el('div', { class: 'pb-modal-header' }, 'Invite user'),
    el('div', { class: 'pb-modal-body' }, [form]),
    el('div', { class: 'pb-modal-footer' }, [cancelBtn, submitBtn])
  ]));
}
