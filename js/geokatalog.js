// Geokatalog tree and layer catalog management

import { state } from './state.js';
import { addSwisstopoLayer, removeSwisstopoLayer, showLayerInfo } from './swisstopo.js';

// ===== GEOKATALOG =====

// Sync Geokatalog checkboxes with active layers
export function updateGeokatalogCheckboxes() {
  var checkboxes = document.querySelectorAll('.node-checkbox[data-layer-id]');
  checkboxes.forEach(function(checkbox) {
    var layerId = checkbox.getAttribute('data-layer-id');
    var isActive = state.activeSwisstopoLayers.some(function(l) { return l.id === layerId; });
    checkbox.checked = isActive;
  });
}

export function loadGeokatalog() {
  if (state.geokatalogLoaded) return;

  var treeContainer = document.getElementById('geokatalog-tree');

  fetch('https://api3.geo.admin.ch/rest/services/ech/CatalogServer?lang=de')
    .then(function(response) {
      if (!response.ok) throw new Error('API nicht erreichbar');
      return response.json();
    })
    .then(function(data) {
      state.geokatalogLoaded = true;
      treeContainer.innerHTML = '';

      if (data.results && data.results.root && data.results.root.children) {
        renderCatalogTree(data.results.root.children, treeContainer);
      } else {
        treeContainer.innerHTML = '<div class="geokatalog-error">Keine Daten verfügbar</div>';
      }

      if (typeof window.updateMenuTogglePositionDebounced === 'function') {
        window.updateMenuTogglePositionDebounced();
      }
    })
    .catch(function(error) {
      console.error('Geokatalog Fehler:', error);
      treeContainer.innerHTML = '<div class="geokatalog-error">Fehler beim Laden des Katalogs</div>';
    });
}

export function renderCatalogTree(items, container) {
  items.forEach(function(item) {
    var itemEl = document.createElement('div');
    itemEl.className = 'catalog-item';

    var hasChildren = item.children && item.children.length > 0;

    var nodeEl = document.createElement('div');
    nodeEl.className = 'catalog-node' + (hasChildren ? '' : ' leaf');

    if (hasChildren) {
      // Category node with arrow
      var arrowEl = document.createElement('span');
      arrowEl.className = 'node-arrow';
      arrowEl.innerHTML = '<span class="material-symbols-outlined">chevron_right</span>';
      nodeEl.appendChild(arrowEl);
    } else {
      // Leaf node with checkbox (native input for reliable checked state)
      var checkboxEl = document.createElement('input');
      checkboxEl.type = 'checkbox';
      checkboxEl.className = 'node-checkbox';
      // Store layer ID for later reference
      if (item.layerBodId) {
        checkboxEl.setAttribute('data-layer-id', item.layerBodId);
        // Check if layer is already active
        var isActive = state.activeSwisstopoLayers.some(function(l) { return l.id === item.layerBodId; });
        if (isActive) {
          checkboxEl.checked = true;
        }
      }
      nodeEl.appendChild(checkboxEl);
    }

    var labelEl = document.createElement('span');
    labelEl.className = 'node-label';
    labelEl.textContent = item.label || item.category || 'Unbekannt';
    nodeEl.appendChild(labelEl);

    // Add info icon to leaf nodes
    if (!hasChildren && item.layerBodId) {
      var infoEl = document.createElement('span');
      infoEl.className = 'node-info';
      infoEl.innerHTML = '<span class="material-symbols-outlined">info</span>';
      infoEl.setAttribute('data-layer-id', item.layerBodId);
      nodeEl.appendChild(infoEl);

      // Click on info icon shows layer info modal
      infoEl.addEventListener('click', function(e) {
        e.stopPropagation();
        var lid = this.getAttribute('data-layer-id');
        if (lid) showLayerInfo(lid);
      });
    }

    itemEl.appendChild(nodeEl);

    if (hasChildren) {
      var childrenEl = document.createElement('div');
      childrenEl.className = 'catalog-children';
      renderCatalogTree(item.children, childrenEl);
      itemEl.appendChild(childrenEl);

      nodeEl.addEventListener('click', function(e) {
        e.stopPropagation();
        itemEl.classList.toggle('expanded');
        nodeEl.classList.toggle('expanded');
        if (typeof window.updateMenuTogglePositionDebounced === 'function') {
          window.updateMenuTogglePositionDebounced();
        }
      });
    } else {
      // Click on leaf node toggles layer
      var layerId = item.layerBodId;
      var layerTitle = item.label || item.category || layerId;

      nodeEl.addEventListener('click', function(e) {
        e.stopPropagation();
        // Don't toggle if clicking on info icon
        if (e.target.closest('.node-info')) return;
        if (!layerId) return;

        var checkboxEl = nodeEl.querySelector('.node-checkbox');
        var isActive = state.activeSwisstopoLayers.some(function(l) { return l.id === layerId; });

        if (isActive) {
          removeSwisstopoLayer(layerId);
          if (checkboxEl) checkboxEl.checked = false;
        } else {
          addSwisstopoLayer(layerId, layerTitle, false);
          if (checkboxEl) checkboxEl.checked = true;
        }
      });
    }

    container.appendChild(itemEl);
  });
}
