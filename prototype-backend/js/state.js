// prototype-backend — tiny pub/sub + shared state
// Events: 'layer:created', 'layer:deleted', 'schema:changed', 'data:changed',
//         'toast', 'user:role-changed'

const listeners = new Map(); // event -> Set<fn>

export const bus = {
  on(event, fn) {
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event).add(fn);
    return () => bus.off(event, fn);
  },
  off(event, fn) {
    const set = listeners.get(event);
    if (set) set.delete(fn);
  },
  emit(event, payload) {
    const set = listeners.get(event);
    if (!set) return;
    for (const fn of set) {
      try { fn(payload); } catch (err) { console.error('[bus]', event, err); }
    }
  }
};

// ===== Current user (prototype-only) =====
//
// Single-user prototype: the role is chosen from a dropdown in Settings →
// Connection, stored in-memory only. There is NO auth enforcement; this is a
// purely cosmetic affordance so UI code can disable mutation buttons for the
// `viewer` role and demo what a role-gated admin would look like. In the real
// Supabase build, enforcement happens server-side via Row-Level-Security
// policies, not in the browser.

export const state = {
  currentUser: { role: 'admin', name: 'local', email: 'local@dev' }
};

/** Set the current role. Emits `user:role-changed` with the new role. */
export function setCurrentRole(role) {
  if (!['viewer', 'editor', 'admin'].includes(role)) return;
  if (state.currentUser.role === role) return;
  state.currentUser.role = role;
  bus.emit('user:role-changed', role);
}

/**
 * Permission check for UI gating only.
 *   - viewer : read
 *   - editor : read + write
 *   - admin  : read + write + admin (user management etc.)
 */
export function isAllowed(action) {
  const role = state.currentUser?.role || 'viewer';
  if (action === 'read') return true;
  if (action === 'write') return role === 'editor' || role === 'admin';
  if (action === 'admin') return role === 'admin';
  return false;
}
