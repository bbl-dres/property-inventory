// One info control for internal, external and mobile layer lists.
import { escapeHtml } from './utils.js';
import { t } from './i18n.js';

export function layerInfoButton({ layerId, layerKey, mobile = false }) {
  const label = escapeHtml(t('accordion.layers.info'));
  const action = layerKey ? 'showInternalLayerInfo' : 'showLayerInfo';
  const data = layerKey ? 'data-layer-key="' + escapeHtml(layerKey) : 'data-layer-id="' + escapeHtml(layerId);
  return '<button type="button" class="icon-btn icon-btn--xs layer-info-button ' +
    (mobile ? 'mobile-layer-info' : 'active-layer-info') + '" data-action="' + action + '" ' + data +
    '" title="' + label + '" aria-label="' + label + '">' +
    '<span class="material-symbols-outlined" aria-hidden="true">info</span></button>';
}

export function renderInternalInfoButtons() {
  document.querySelectorAll('[data-internal-layer-info]').forEach(host => {
    host.innerHTML = layerInfoButton({ layerKey: host.dataset.internalLayerInfo });
  });
}
