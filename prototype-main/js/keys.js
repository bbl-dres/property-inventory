// Escape key registry (shared). One document listener instead of a dozen competing
// keydown handlers that rely on registration order and stopImmediatePropagation().
// Handlers run from the highest priority down; the first one that returns true wins.

const handlers = [];

// Suggested priorities: lightbox 100, modals 90, context menu 80, measure tool 70,
// search scope menu 60, search results 50, mobile menu 40, filter drawer 30.
export function onEscape(handler, priority) {
  handlers.push({ handler: handler, priority: priority || 0 });
  handlers.sort(function(a, b) { return b.priority - a.priority; });
}

document.addEventListener('keydown', function(e) {
  if (e.key !== 'Escape') return;
  for (let i = 0; i < handlers.length; i++) {
    if (handlers[i].handler(e) === true) return;
  }
});
