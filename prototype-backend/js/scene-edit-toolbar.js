// prototype-backend — Scene edit toolbar (floating top-center).
//
// A single-row pill of tool buttons. All tools except "Select" are stubs
// that route to onTool(id); the parent toasts "<Tool> — coming soon" for
// anything other than select. Select is the implicit default — clicking
// it just re-asserts the "pan/select" active state.

import { el } from './utils.js';

const TOOLS = [
  { id: 'point',     icon: 'location_on', label: 'Point' },
  { id: 'line',      icon: 'timeline',    label: 'Line' },
  { id: 'polygon',   icon: 'hexagon',     label: 'Polygon' },
  { id: 'rectangle', icon: 'rectangle',   label: 'Rectangle' },
  { id: 'select',    icon: 'pan_tool',    label: 'Select' },
  { id: 'delete',    icon: 'delete',      label: 'Delete selected' },
  { divider: true },
  { id: 'undo',      icon: 'undo',        label: 'Undo' },
  { id: 'redo',      icon: 'redo',        label: 'Redo' }
];

let root = null;
let opts = null;
let activeTool = 'select';
let buttonEls = new Map(); // toolId -> <button>

export function mount(container, options) {
  root = container;
  opts = options || {};
  render();
}

export function unmount() {
  if (root) root.innerHTML = '';
  root = null;
  opts = null;
  activeTool = 'select';
  buttonEls = new Map();
}

export function setTool(id) {
  activeTool = id;
  for (const [toolId, btn] of buttonEls.entries()) {
    btn.classList.toggle('is-active', toolId === activeTool);
    btn.setAttribute('aria-pressed', toolId === activeTool ? 'true' : 'false');
  }
}

function render() {
  if (!root) return;
  root.innerHTML = '';
  buttonEls = new Map();

  for (const t of TOOLS) {
    if (t.divider) {
      root.appendChild(el('span', { class: 'pb-scene-toolbar-divider', 'aria-hidden': 'true' }));
      continue;
    }
    const btn = el('button', {
      type: 'button',
      class: 'pb-scene-toolbar-btn' + (t.id === activeTool ? ' is-active' : ''),
      title: t.label,
      'aria-label': t.label,
      'aria-pressed': t.id === activeTool ? 'true' : 'false',
      dataset: { tool: t.id }
    }, [
      el('span', { class: 'material-symbols-outlined', 'aria-hidden': 'true' }, t.icon)
    ]);
    btn.addEventListener('click', () => {
      if (t.id === 'select') {
        // Re-assert the default state. Cosmetic only.
        setTool('select');
        opts.onTool?.('select');
      } else {
        // Don't latch mocked tools — just fire the callback (parent toasts).
        opts.onTool?.(t.id);
      }
    });
    buttonEls.set(t.id, btn);
    root.appendChild(btn);
  }
}
