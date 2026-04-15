// prototype-backend — tiny pub/sub + shared state
// Events: 'layer:created', 'layer:deleted', 'schema:changed', 'data:changed', 'toast'

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

// (Removed `state` cache: it was write-only. All views call api.* directly.)
