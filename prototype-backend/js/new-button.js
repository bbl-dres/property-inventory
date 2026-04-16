// prototype-backend — Unified "+ New ▾" button factory
//
// Both the Maps & Apps catalogue and the Layers catalogue show the same
// dropdown — independent of which section the user is on — so they
// don't have to back out of Layers to register an app, or vice versa.
// After any creation the user is routed to where the new thing lives:
//   - new map                 → scene viewer (#/maps/:slug)
//   - new map from data       → scene viewer (#/maps/:slug)
//   - register app            → Maps & Apps catalogue (#/maps)
//   - new layer               → Layers catalogue (#/features)
// so the result is always visible without relying on the caller to know.

import * as api from './api.js';
import { el, toast, wireMenu } from './utils.js';

/**
 * Returns a DOM node — the `<div class="pb-menu-wrap">` — that callers
 * drop into their view-header's `actions` slot.
 *
 * @param {object} [opts]
 * @param {() => Promise<void> | void} [opts.onRefresh]  Called when a
 *   creation keeps the user on the current page (i.e. register-app when
 *   standing on the Maps & Apps catalogue). Optional; defaults to no-op.
 *   Navigation paths bypass this.
 * @param {boolean} [opts.canWrite]  Whether the current user is allowed
 *   to create. Disables the trigger button when false.
 * @param {string} [opts.roleGatedTitle]  Tooltip for the disabled state.
 */
export function buildNewButton(opts = {}) {
  const { onRefresh, canWrite = true, roleGatedTitle = 'Requires editor or admin role' } = opts;

  const trigger = el('button', {
    type: 'button',
    class: 'btn-primary',
    disabled: !canWrite ? true : false,
    title: canWrite ? 'New map, app, or layer' : roleGatedTitle,
    'aria-haspopup': 'menu',
    'aria-expanded': 'false'
  }, [
    el('span', { class: 'material-symbols-outlined pb-icon-sm' }, 'add'),
    ' New ',
    el('span', { class: 'material-symbols-outlined pb-icon-md' }, 'arrow_drop_down')
  ]);

  const menu = el('div', { class: 'pb-menu', role: 'menu', hidden: true });
  const wrap = el('div', { class: 'pb-menu-wrap' }, [trigger, menu]);
  const ctl = wireMenu(trigger, menu, wrap);

  const item = (icon, label, handler) => {
    const b = el('button', { type: 'button', class: 'pb-menu-item', role: 'menuitem' }, [
      el('span', { class: 'material-symbols-outlined' }, icon),
      el('span', {}, label)
    ]);
    b.addEventListener('click', () => { ctl.close(); handler(); });
    return b;
  };

  menu.append(
    item('map',         'New map',            openNewMap),
    item('upload_file', 'New map from data',  openNewMapFromData),
    item('link',        'Register app',       openRegisterApp),
    item('layers',      'New layer',          openNewLayer)
  );

  function openNewMap() {
    import('./new-product-modal.js').then((m) => {
      m.open({
        kind: 'map',
        onCreated: (created) => {
          location.hash = `#/maps/${encodeURIComponent(created.slug)}`;
        }
      });
    });
  }

  function openRegisterApp() {
    import('./new-product-modal.js').then((m) => {
      m.open({
        kind: 'app',
        onCreated: async () => {
          // Stay on whichever catalogue the user is on; the new app shows
          // up in Maps & Apps anyway. Let caller refresh if appropriate.
          if (typeof onRefresh === 'function') {
            try { await onRefresh(); } catch {}
          }
          // If we're not already on the Maps & Apps catalogue, nudge there
          // so the user sees the new card.
          if (!location.hash.startsWith('#/maps')) location.hash = '#/maps';
        }
      });
    });
  }

  function openNewMapFromData() {
    import('./new-feature-drawer.js').then((m) => {
      m.open({
        onCreated: async ({ name: layerName, title }) => {
          const baseLabel = (title || layerName).trim();
          const mapName = `${baseLabel} map`;
          const mapSlug = `${layerName}-map-${Date.now().toString(36).slice(-5)}`;
          try {
            const created = await api.createProduct({
              slug: mapSlug,
              name: mapName,
              kind: 'map',
              tags: ['map'],
              consumed_layers: [layerName]
            });
            toast(`Created layer "${layerName}" and map "${mapName}"`, 'success');
            location.hash = `#/maps/${encodeURIComponent(created.slug)}`;
          } catch (err) {
            toast(`Layer created, but map wrapper failed: ${err?.message || err}`, 'error');
          }
        }
      });
    });
  }

  function openNewLayer() {
    import('./new-feature-drawer.js').then((m) => {
      m.open({
        onCreated: async ({ name }) => {
          // Jump straight into the new layer's detail view — the user just
          // created this thing, show it to them rather than sending them
          // back to the catalogue to find it. The schema tab is the
          // default landing (see router), which is the first thing you
          // want to look at on a freshly-created layer.
          location.hash = `#/features/${encodeURIComponent(name)}`;
        }
      });
    });
  }

  return wrap;
}
