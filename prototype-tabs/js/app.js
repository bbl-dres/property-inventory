// BBL GIS Immobilienportfolio - Main Application Script
// Extracted from index.html for better maintainability

// Map library: MapLibre GL JS (vendor/maplibre-gl), no access token required
        
        // Status Farben (synchronized with CSS --status-* variables)
        var statusColors = {
            'In Betrieb': '#2e7d32',      // --status-active
            'In Renovation': '#ef6c00',   // --status-renovation
            'In Planung': '#1976d2',      // --status-planning
            'Ausser Betrieb': '#6C757D'   // --status-inactive
        };
        
        // Placeholder images
        var placeholderImages = [
            'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=800&h=600&fit=crop',
            'https://images.unsplash.com/photo-1554435493-93422e8220c8?w=800&h=600&fit=crop',
            'https://images.unsplash.com/photo-1577495508048-b635879837f1?w=800&h=600&fit=crop',
            'https://images.unsplash.com/photo-1497366216548-37526070297c?w=800&h=600&fit=crop'
        ];
        
        // Variables
        var portfolioData = null;
        var parcelData = null;
        var filteredData = null;
        var currentDetailBuilding = null;

        // Entity data stores (loaded from separate JSON files)
        var allAreaMeasurements = [];
        var allDocuments = [];
        var allContacts = [];
        var allContracts = [];
        var allAssets = [];
        var allCosts = [];
        var currentCarouselIndex = 0;
        var miniMap = null;
        var previousView = 'gallery';
        var selectedBuildingId = null;
        var selectedParcelId = null;
        var searchMarker = null;

        // Active Swisstopo layers added from search
        var activeSwisstopoLayers = [];
        // Track pending layer fetch requests for cancellation
        var pendingLayerFetches = {};

        // View dirty flags - track if view needs re-render after filter change
        var listViewDirty = false;
        var galleryViewDirty = false;

        // List View Pagination State
        var listCurrentPage = 1;
        var listRowsPerPage = 50;
        var listSearchTerm = '';

        // ===== LAYOUT QUERIES =====
        // Mirror the media queries in css/main.css (Responsive Design section). Change both places together.
        var MOBILE_LAYOUT_QUERY = '(max-width: 767px), (max-height: 500px) and (pointer: coarse)';
        var LANDSCAPE_PHONE_QUERY = '(max-height: 500px) and (pointer: coarse) and (min-width: 600px)';
        var COMPACT_LAYOUT_QUERY = '(max-width: 1024px)';

        function mediaMatches(query) {
            return typeof window.matchMedia === 'function' && window.matchMedia(query).matches;
        }

        // Phones in portrait and landscape: bottom sheets, full-screen drawer, two-row header
        function isMobileLayout() { return mediaMatches(MOBILE_LAYOUT_QUERY); }
        // Landscape phones: info panel and tools panel dock to the sides instead of the bottom
        function isLandscapePhone() { return mediaMatches(LANDSCAPE_PHONE_QUERY); }
        // Tablets and phones: the map tools panel starts collapsed
        function isCompactLayout() { return mediaMatches(COMPACT_LAYOUT_QUERY); }

        // ===== UTILITY FUNCTIONS =====

        function escapeHtml(text) {
            if (text == null) return '';
            var div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }

        // Escape for use in JS strings within HTML attributes (e.g., onclick handlers)
        function escapeForJs(text) {
            if (text == null) return '';
            return String(text)
                .replace(/\\/g, '\\\\')
                .replace(/'/g, "\\'")
                .replace(/"/g, '\\"');
        }

        // ===== TOAST NOTIFICATION SYSTEM =====

        var toastIcons = {
            error: 'error',
            warning: 'warning',
            success: 'check_circle',
            info: 'info'
        };

        function showToast(options) {
            var container = document.getElementById('toast-container');
            if (!container) return;

            var type = options.type || 'info';
            var title = options.title || '';
            var message = options.message || '';
            var duration = options.duration !== undefined ? options.duration : 5000;
            var actions = options.actions || [];

            var toast = document.createElement('div');
            toast.className = 'toast toast-' + type;

            var html = '<div class="toast-icon"><span class="material-symbols-outlined">' + toastIcons[type] + '</span></div>';
            html += '<div class="toast-content">';
            if (title) {
                html += '<div class="toast-title">' + escapeHtml(title) + '</div>';
            }
            if (message) {
                html += '<div class="toast-message">' + escapeHtml(message) + '</div>';
            }
            if (actions.length > 0) {
                html += '<div class="toast-actions">';
                actions.forEach(function(action, index) {
                    html += '<button class="toast-action-btn ' + (action.primary ? 'primary' : 'secondary') + '" data-action="' + index + '">' + escapeHtml(action.label) + '</button>';
                });
                html += '</div>';
            }
            html += '</div>';
            html += '<button class="toast-close" aria-label="Schliessen"><span class="material-symbols-outlined">close</span></button>';

            toast.innerHTML = html;
            container.appendChild(toast);

            // Handle close button
            var closeBtn = toast.querySelector('.toast-close');
            closeBtn.addEventListener('click', function() {
                hideToast(toast);
            });

            // Handle action buttons
            actions.forEach(function(action, index) {
                var btn = toast.querySelector('[data-action="' + index + '"]');
                if (btn && action.onClick) {
                    btn.addEventListener('click', function() {
                        action.onClick();
                        hideToast(toast);
                    });
                }
            });

            // Auto-hide after duration (if not 0)
            if (duration > 0) {
                setTimeout(function() {
                    hideToast(toast);
                }, duration);
            }

            return toast;
        }

        function hideToast(toast) {
            if (!toast || !toast.parentNode) return;
            toast.classList.add('hiding');
            setTimeout(function() {
                if (toast.parentNode) {
                    toast.parentNode.removeChild(toast);
                }
            }, 300);
        }

        function showError(title, message, retryCallback) {
            var actions = [];
            if (retryCallback) {
                actions.push({
                    label: 'Erneut versuchen',
                    primary: true,
                    onClick: retryCallback
                });
            }
            return showToast({
                type: 'error',
                title: title,
                message: message,
                duration: retryCallback ? 0 : 8000,
                actions: actions
            });
        }

        function showWarning(title, message) {
            return showToast({
                type: 'warning',
                title: title,
                message: message,
                duration: 6000
            });
        }

        function showSuccess(title, message) {
            return showToast({
                type: 'success',
                title: title,
                message: message,
                duration: 4000
            });
        }

        function showInfo(title, message) {
            return showToast({
                type: 'info',
                title: title,
                message: message,
                duration: 5000
            });
        }

        // ===== LOADING OVERLAY =====

        function showLoadingOverlay(text) {
            var overlay = document.getElementById('loading-overlay');
            if (overlay) {
                var textEl = overlay.querySelector('.loading-text');
                if (textEl && text) {
                    textEl.textContent = text;
                }
                overlay.classList.remove('hidden');
            }
        }

        function hideLoadingOverlay() {
            var overlay = document.getElementById('loading-overlay');
            if (overlay) {
                overlay.classList.add('hidden');
            }
        }

        // ===== FETCH WITH ERROR HANDLING =====

        function fetchWithErrorHandling(url, options) {
            return fetch(url, options)
                .then(function(response) {
                    if (!response.ok) {
                        throw new Error('HTTP ' + response.status + ': ' + response.statusText);
                    }
                    return response.json();
                });
        }

        // ===== FILTER STATE =====
        var activeFilters = {
            status: [],
            eigentum: [],
            teilportfolio: [],
            gebaeudeart: [],
            land: [],
            region: []
        };

        // Filter configuration - maps filter keys to data properties
        var filterConfig = {
            status: { property: 'status', label: 'Status' },
            eigentum: { property: 'typeOfOwnership', label: 'Art Eigentum' },
            teilportfolio: { property: 'extensionData.portfolio', label: 'Teilportfolio' },
            gebaeudeart: { property: 'primaryTypeOfBuilding', label: 'Gebäudeart' },
            land: { property: 'country', label: 'Land' },
            region: { property: 'stateProvincePrefecture', label: 'Region' }
        };

        // ===== FILTER FUNCTIONS =====

        function getFiltersFromURL() {
            var params = new URLSearchParams(window.location.search);
            var filters = {
                status: [],
                eigentum: [],
                teilportfolio: [],
                gebaeudeart: [],
                land: [],
                region: []
            };

            Object.keys(filters).forEach(function(key) {
                var value = params.get('filter_' + key);
                if (value) {
                    filters[key] = value.split(',').map(function(v) {
                        return decodeURIComponent(v);
                    });
                }
            });

            return filters;
        }

        function setFiltersInURL(filters) {
            var url = new URL(window.location);

            // Remove all filter params first
            Object.keys(filters).forEach(function(key) {
                url.searchParams.delete('filter_' + key);
            });

            // Add active filters
            Object.keys(filters).forEach(function(key) {
                if (filters[key].length > 0) {
                    var encoded = filters[key].map(function(v) {
                        return encodeURIComponent(v);
                    }).join(',');
                    url.searchParams.set('filter_' + key, encoded);
                }
            });

            window.history.pushState({}, '', url);
        }

        function getActiveFilterCount() {
            var count = 0;
            Object.keys(activeFilters).forEach(function(key) {
                count += activeFilters[key].length;
            });
            return count;
        }

        // Helper: Get nested property value (e.g., "extensionData.portfolio")
        function getNestedProperty(obj, path) {
            var parts = path.split('.');
            var current = obj;
            for (var i = 0; i < parts.length; i++) {
                if (current == null) return undefined;
                current = current[parts[i]];
            }
            return current;
        }

        function applyFilters() {
            if (!portfolioData) return;

            // Reset list pagination to page 1 when filters change
            listCurrentPage = 1;

            // Filter the data
            filteredData = {
                type: portfolioData.type,
                name: portfolioData.name,
                features: portfolioData.features.filter(function(feature) {
                    var props = feature.properties;

                    // Check each filter category (AND between categories)
                    for (var filterKey in activeFilters) {
                        var filterValues = activeFilters[filterKey];
                        if (filterValues.length === 0) continue;

                        var propKey = filterConfig[filterKey].property;
                        var propValue = getNestedProperty(props, propKey);

                        // OR within category - at least one must match
                        var matches = filterValues.some(function(filterValue) {
                            return propValue === filterValue;
                        });

                        if (!matches) return false;
                    }

                    return true;
                })
            };

            // Update URL
            setFiltersInURL(activeFilters);

            // Update object count
            updateObjectCount();

            // Update export count
            updateExportCount();

            // Update filter button state
            updateFilterButtonState();

            // Re-render current view
            renderCurrentView();

            // Update map layer filter if on map view
            if (currentView === 'map' && window.map && map.getLayer('portfolio-points')) {
                updateMapFilter();
            }
        }

        function updateMapFilter() {
            if (!map || !map.getLayer('portfolio-points')) return;

            // If no active filters, show all buildings
            if (getActiveFilterCount() === 0) {
                map.setFilter('portfolio-points', null);
                if (map.getLayer('portfolio-labels')) {
                    map.setFilter('portfolio-labels', null);
                }
                return;
            }

            var filteredIds = filteredData.features.map(function(f) {
                return f.properties.buildingId;
            });

            // Apply filter to show only filtered buildings
            map.setFilter('portfolio-points', ['in', ['get', 'buildingId'], ['literal', filteredIds]]);

            // Also filter labels layer if it exists
            if (map.getLayer('portfolio-labels')) {
                map.setFilter('portfolio-labels', ['in', ['get', 'buildingId'], ['literal', filteredIds]]);
            }

            // Zoom to fit filtered points
            zoomToFilteredPoints();
        }

        function zoomToFilteredPoints() {
            if (!filteredData || filteredData.features.length === 0) return;

            var features = filteredData.features;

            if (features.length === 1) {
                // Single point - fly to it with a reasonable zoom level
                var coords = features[0].geometry.coordinates;
                map.flyTo({
                    center: coords,
                    zoom: 14,
                    duration: 1000
                });
            } else {
                // Multiple points - fit bounds
                var bounds = new maplibregl.LngLatBounds();
                features.forEach(function(feature) {
                    bounds.extend(feature.geometry.coordinates);
                });
                map.fitBounds(bounds, {
                    padding: 80,
                    duration: 1000,
                    maxZoom: 16
                });
            }
        }

        function resetFilters() {
            activeFilters = {
                status: [],
                eigentum: [],
                teilportfolio: [],
                gebaeudeart: [],
                land: [],
                region: []
            };

            // Uncheck all checkboxes
            document.querySelectorAll('#smart-drawer .filter-option input[type="checkbox"]').forEach(function(cb) {
                cb.checked = false;
            });

            applyFilters();
        }

        // Global alias for empty state buttons
        window.resetAllFilters = resetFilters;

        function navigateToAllObjects() {
            resetFilters();
            switchView(previousView || 'gallery');
        }

        function navigateWithLandFilter() {
            if (!currentDetailBuilding) return;
            var land = currentDetailBuilding.properties.country;
            if (!land) return;

            // Reset all filters and set only land filter
            resetFilters();
            activeFilters.land = [land];

            // Update checkbox state
            var checkbox = document.querySelector('#filter-pane input[data-filter="land"][data-value="' + land + '"]');
            if (checkbox) checkbox.checked = true;

            applyFilters();
            switchView(previousView || 'gallery');
        }

        function navigateWithRegionFilter() {
            if (!currentDetailBuilding) return;
            var region = currentDetailBuilding.properties.stateProvincePrefecture;
            if (!region) return;

            // Reset all filters and set only region filter
            resetFilters();
            activeFilters.region = [region];

            // Update checkbox state
            var checkbox = document.querySelector('#filter-pane input[data-filter="region"][data-value="' + region + '"]');
            if (checkbox) checkbox.checked = true;

            applyFilters();
            switchView(previousView || 'gallery');
        }

        function updateObjectCount() {
            var count = filteredData ? filteredData.features.length : (portfolioData ? portfolioData.features.length : 0);
            var countEl = document.getElementById('object-count');
            if (countEl) {
                countEl.textContent = count + ' Objekte';
            }
            // Mobile filter sheet footer ("N Objekte anzeigen")
            var footerCount = document.getElementById('drawer-footer-count');
            if (footerCount) {
                footerCount.textContent = count + (count === 1 ? ' Objekt anzeigen' : ' Objekte anzeigen');
            }
        }

        function updateFilterButtonState() {
            var drawerBtn = document.getElementById('smart-drawer-btn');
            if (!drawerBtn) return;

            var count = getActiveFilterCount();

            if (count > 0) {
                // Add active filters highlight
                drawerBtn.classList.add('has-active-filters');
                // Add or update count badge
                var badge = drawerBtn.querySelector('.filter-count');
                if (!badge) {
                    badge = document.createElement('span');
                    badge.className = 'filter-count';
                    drawerBtn.appendChild(badge);
                }
                badge.textContent = count;
            } else {
                // Remove active filters highlight
                drawerBtn.classList.remove('has-active-filters');
                // Remove count badge
                var badge = drawerBtn.querySelector('.filter-count');
                if (badge) {
                    badge.remove();
                }
            }
        }

        function renderCurrentView() {
            // Mark non-current views as dirty (they'll re-render when switched to)
            if (currentView !== 'list') {
                listViewDirty = true;
            }
            if (currentView !== 'gallery') {
                galleryViewDirty = true;
            }

            // Render current view and clear its dirty flag
            if (currentView === 'list') {
                renderListView();
                listViewDirty = false;
            } else if (currentView === 'gallery') {
                renderGalleryView();
                galleryViewDirty = false;
            }
            // Map view updates via updateMapFilter()
        }

        // ===== SMART DRAWER (filter) =====
        // The former "KI Assistent" tab was removed: KI answers now appear inline in the search suggestions.
        function toggleSmartDrawer(open) {
            var drawer = document.getElementById('smart-drawer');
            var drawerBtn = document.getElementById('smart-drawer-btn');

            if (open === undefined) {
                open = !drawer.classList.contains('open');
            }

            var wasOpen = drawer.classList.contains('open');

            if (open) {
                drawer.classList.add('open');
                drawerBtn.classList.add('panel-open');
                drawerBtn.setAttribute('aria-expanded', 'true');
                // On phones the drawer is a full-screen sheet: move focus into it
                if (isMobileLayout() && !wasOpen) {
                    var closeBtn = document.getElementById('drawer-close-btn');
                    if (closeBtn) closeBtn.focus();
                }
            } else {
                drawer.classList.remove('open');
                drawerBtn.classList.remove('panel-open');
                drawerBtn.setAttribute('aria-expanded', 'false');
                // Return focus to the button that opened the sheet
                if (wasOpen && drawer.contains(document.activeElement)) {
                    drawerBtn.focus();
                }
            }

            // Resize map after transition completes
            if (window.map) {
                setTimeout(function() {
                    map.resize();
                }, 350);
            }
        }

        // ===== DRAWER RESIZE =====
        function initDrawerResize() {
            var drawer = document.getElementById('smart-drawer');
            var handle = drawer.querySelector('.smart-drawer-resize-handle');
            if (!handle) return;

            var isResizing = false;
            var startX, startWidth;

            // Get min/max from CSS variables
            var styles = getComputedStyle(document.documentElement);
            var minWidth = parseInt(styles.getPropertyValue('--drawer-min-width')) || 300;
            var maxWidth = parseInt(styles.getPropertyValue('--drawer-max-width')) || 800;

            // Load saved width from localStorage
            var savedWidth = localStorage.getItem('drawerWidth');
            if (savedWidth) {
                document.documentElement.style.setProperty('--drawer-width', savedWidth + 'px');
            }

            // Pointer events: mouse, pen and touch (the handle has touch-action: none in the stylesheet)
            handle.addEventListener('pointerdown', function(e) {
                if (isMobileLayout()) return; // full-screen sheet on phones, nothing to resize
                isResizing = true;
                startX = e.clientX;
                startWidth = drawer.offsetWidth;
                handle.classList.add('dragging');
                drawer.classList.add('resizing');
                document.body.style.cursor = 'ew-resize';
                document.body.style.userSelect = 'none';
                if (handle.setPointerCapture) handle.setPointerCapture(e.pointerId);
                e.preventDefault();
            });

            handle.addEventListener('pointermove', function(e) {
                if (!isResizing) return;

                // Calculate new width (dragging left = wider, right = narrower)
                var delta = startX - e.clientX;
                var newWidth = Math.min(maxWidth, Math.max(minWidth, startWidth + delta));

                document.documentElement.style.setProperty('--drawer-width', newWidth + 'px');
            });

            function endResize() {
                if (!isResizing) return;

                isResizing = false;
                handle.classList.remove('dragging');
                drawer.classList.remove('resizing');
                document.body.style.cursor = '';
                document.body.style.userSelect = '';

                // Save width to localStorage
                var currentWidth = drawer.offsetWidth;
                localStorage.setItem('drawerWidth', currentWidth);

                // Resize map
                if (window.map) {
                    map.resize();
                }
            }

            handle.addEventListener('pointerup', endResize);
            handle.addEventListener('pointercancel', endResize);
        }

        function initFilterOptions() {
            if (!portfolioData) return;

            // Collect unique values for each filter category
            var uniqueValues = {
                status: new Set(),
                eigentum: new Set(),
                teilportfolio: new Set(),
                gebaeudeart: new Set(),
                land: new Set(),
                region: new Set()
            };

            // Objects per option value, shown next to each label ("Verwaltungsgebäude 2")
            var valueCounts = {};
            function collect(filterKey, value) {
                if (!value) return;
                uniqueValues[filterKey].add(value);
                valueCounts[filterKey] = valueCounts[filterKey] || {};
                valueCounts[filterKey][value] = (valueCounts[filterKey][value] || 0) + 1;
            }

            portfolioData.features.forEach(function(feature) {
                var props = feature.properties;
                var ext = props.extensionData || {};
                collect('status', props.status);
                collect('eigentum', props.typeOfOwnership);
                collect('teilportfolio', ext.portfolio);
                collect('gebaeudeart', props.primaryTypeOfBuilding);
                collect('land', props.country);
                collect('region', props.stateProvincePrefecture);
            });

            // Render options for each filter
            Object.keys(uniqueValues).forEach(function(filterKey) {
                var container = document.getElementById('filter-' + filterKey + '-options');
                if (!container) return;

                var values = Array.from(uniqueValues[filterKey]).sort();
                var html = '';

                values.forEach(function(value) {
                    var id = 'filter-' + filterKey + '-' + value.replace(/[^a-zA-Z0-9]/g, '_');
                    var checked = activeFilters[filterKey].includes(value) ? 'checked' : '';

                    html += '<div class="filter-option">' +
                        '<input type="checkbox" id="' + id + '" data-filter="' + filterKey + '" data-value="' + value + '" ' + checked + '>' +
                        '<label for="' + id + '">' + escapeHtml(value) +
                            ' <span class="filter-option-count">' + valueCounts[filterKey][value] + '</span>' +
                        '</label>' +
                        '</div>';
                });

                container.innerHTML = html;

                // Add event listeners to checkboxes
                container.querySelectorAll('input[type="checkbox"]').forEach(function(checkbox) {
                    checkbox.addEventListener('change', function() {
                        var filterKey = this.dataset.filter;
                        var value = this.dataset.value;

                        if (this.checked) {
                            if (!activeFilters[filterKey].includes(value)) {
                                activeFilters[filterKey].push(value);
                            }
                        } else {
                            activeFilters[filterKey] = activeFilters[filterKey].filter(function(v) {
                                return v !== value;
                            });
                        }

                        applyFilters();
                    });
                });
            });
        }

        function initFilterPane() {
            // Toggle smart drawer via header button
            document.getElementById('smart-drawer-btn').addEventListener('click', function() {
                toggleSmartDrawer();
            });

            // Close smart drawer
            document.getElementById('drawer-close-btn').addEventListener('click', function() {
                toggleSmartDrawer(false);
            });

            // Reset filters (button inside drawer)
            document.getElementById('drawer-reset-btn').addEventListener('click', function() {
                resetFilters();
            });

            // Mobile sheet footer: reset and "N Objekte anzeigen" (closes the sheet)
            var footerReset = document.getElementById('drawer-footer-reset');
            var footerApply = document.getElementById('drawer-footer-apply');
            if (footerReset) footerReset.addEventListener('click', resetFilters);
            if (footerApply) footerApply.addEventListener('click', function() { toggleSmartDrawer(false); });

            // Filter section accordion toggle
            document.querySelectorAll('.filter-section-header').forEach(function(header) {
                header.addEventListener('click', function() {
                    var section = this.parentElement;
                    section.classList.toggle('open');
                });
            });

            // Close on Escape key
            document.addEventListener('keydown', function(e) {
                if (e.key === 'Escape') {
                    toggleSmartDrawer(false);
                }
            });

            // Logo click - navigate to main page
            document.getElementById('logo-area').addEventListener('click', function() {
                navigateToAllObjects();
            });
        }

        // ===== LIST VIEW TOOLBAR FUNCTIONS =====

        // Dropdown Toggle Function
        function toggleDropdown(dropdownId) {
            var menu = document.getElementById(dropdownId);
            var isOpen = menu.classList.contains('show');

            // Close all dropdowns first
            document.querySelectorAll('.dropdown-menu').forEach(function(dropdown) {
                dropdown.classList.remove('show');
            });

            // Toggle the clicked one
            if (!isOpen) {
                menu.classList.add('show');
            }
        }

        // Close dropdowns when clicking outside
        document.addEventListener('click', function(e) {
            if (!e.target.closest('.dropdown-container')) {
                document.querySelectorAll('.dropdown-menu').forEach(function(dropdown) {
                    dropdown.classList.remove('show');
                });
            }
        });

        // ===== EXPORT PANEL FUNCTIONS =====
        var selectedExportFormat = 'geojson';

        function initExportPanel() {
            // Format card selection
            document.querySelectorAll('.export-format-card').forEach(function(card) {
                card.addEventListener('click', function() {
                    document.querySelectorAll('.export-format-card').forEach(function(c) {
                        c.classList.remove('active');
                    });
                    this.classList.add('active');
                    selectedExportFormat = this.getAttribute('data-format');
                });
            });

            // Data selection change
            var dataSelection = document.getElementById('export-data-selection');
            if (dataSelection) {
                dataSelection.addEventListener('change', updateExportCount);
            }

            // Export button
            var exportBtn = document.getElementById('export-btn');
            if (exportBtn) {
                exportBtn.addEventListener('click', performExport);
            }

            // Initial count update
            updateExportCount();
        }

        function updateExportCount() {
            var countEl = document.getElementById('export-count');
            var dataSelection = document.getElementById('export-data-selection');
            if (!countEl || !dataSelection) return;

            var count = 0;
            var selection = dataSelection.value;

            if (selection === 'filtered') {
                count = filteredData ? filteredData.length : 0;
            } else if (selection === 'all') {
                count = portfolioData ? portfolioData.length : 0;
            } else if (selection === 'selected') {
                count = selectedBuildingId ? 1 : 0;
            }

            countEl.textContent = count + ' Objekt' + (count !== 1 ? 'e' : '') + ' werden exportiert';
        }

        function getExportData() {
            var dataSelection = document.getElementById('export-data-selection');
            var selection = dataSelection ? dataSelection.value : 'filtered';

            if (selection === 'filtered') {
                return filteredData || [];
            } else if (selection === 'all') {
                return portfolioData || [];
            } else if (selection === 'selected' && selectedBuildingId) {
                var building = portfolioData.find(function(b) {
                    return b.properties.buildingId === selectedBuildingId;
                });
                return building ? [building] : [];
            }
            return [];
        }

        function performExport() {
            var data = getExportData();
            if (data.length === 0) {
                showToast({ type: 'error', message: 'Keine Daten zum Exportieren vorhanden' });
                return;
            }

            var btn = document.getElementById('export-btn');
            var originalHTML = btn.innerHTML;
            btn.innerHTML = '<span class="material-symbols-outlined">hourglass_empty</span><span>Exportiere...</span>';
            btn.disabled = true;

            setTimeout(function() {
                try {
                    switch (selectedExportFormat) {
                        case 'geojson':
                            exportGeoJSON(data);
                            break;
                        case 'csv':
                            exportCSV(data);
                            break;
                        case 'kml':
                            exportKML(data);
                            break;
                        case 'shapefile':
                            exportShapefile(data);
                            break;
                    }
                    showToast({ type: 'success', message: 'Export erfolgreich abgeschlossen' });
                } catch (e) {
                    console.error('Export error:', e);
                    showToast({ type: 'error', message: 'Fehler beim Export: ' + e.message });
                }

                btn.innerHTML = originalHTML;
                btn.disabled = false;
            }, 300);
        }

        function exportGeoJSON(data) {
            var includeCoords = document.getElementById('export-coords').checked;
            var includeParcels = document.getElementById('export-parcels').checked;

            var featureCollection = {
                type: 'FeatureCollection',
                features: data.map(function(feature) {
                    var exportFeature = JSON.parse(JSON.stringify(feature));
                    if (!includeCoords) {
                        delete exportFeature.geometry;
                    }
                    return exportFeature;
                })
            };

            // Add parcels if requested
            if (includeParcels && parcelsData && parcelsData.features) {
                featureCollection.features = featureCollection.features.concat(
                    parcelsData.features.map(function(f) {
                        return JSON.parse(JSON.stringify(f));
                    })
                );
            }

            var blob = new Blob([JSON.stringify(featureCollection, null, 2)], { type: 'application/geo+json' });
            downloadBlob(blob, 'bbl-portfolio-export.geojson');
        }

        function exportCSV(data) {
            var allFields = document.getElementById('export-all-fields').checked;
            var visibleOnly = document.getElementById('export-visible-only').checked;
            var includeCoords = document.getElementById('export-coords').checked;

            // Define columns
            var columns = ['buildingId', 'name', 'address', 'city', 'country', 'status', 'energyClass', 'flaeche'];

            if (allFields && !visibleOnly) {
                columns = ['buildingId', 'name', 'address', 'postalCode', 'city', 'country', 'region',
                          'status', 'ownershipType', 'portfolioGroup', 'buildingType', 'energyClass',
                          'flaeche', 'constructedYear', 'refurbishmentYear', 'parkingSpaces', 'evChargingStations'];
            }

            if (includeCoords) {
                columns.push('longitude', 'latitude');
            }

            // Build CSV content
            var csvContent = columns.join(';') + '\n';

            data.forEach(function(feature) {
                var props = feature.properties || {};
                var row = columns.map(function(col) {
                    if (col === 'longitude' && feature.geometry && feature.geometry.coordinates) {
                        return feature.geometry.coordinates[0];
                    }
                    if (col === 'latitude' && feature.geometry && feature.geometry.coordinates) {
                        return feature.geometry.coordinates[1];
                    }
                    var value = props[col];
                    if (value === null || value === undefined) return '';
                    // Escape quotes and wrap in quotes if contains separator
                    var strValue = String(value);
                    if (strValue.includes(';') || strValue.includes('"') || strValue.includes('\n')) {
                        strValue = '"' + strValue.replace(/"/g, '""') + '"';
                    }
                    return strValue;
                });
                csvContent += row.join(';') + '\n';
            });

            var blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8' }); // BOM for Excel
            downloadBlob(blob, 'bbl-portfolio-export.csv');
        }

        function exportKML(data) {
            var includeCoords = document.getElementById('export-coords').checked;

            var kmlContent = '<?xml version="1.0" encoding="UTF-8"?>\n';
            kmlContent += '<kml xmlns="http://www.opengis.net/kml/2.2">\n';
            kmlContent += '  <Document>\n';
            kmlContent += '    <name>BBL Immobilienportfolio</name>\n';
            kmlContent += '    <description>Export vom ' + new Date().toLocaleDateString('de-CH') + '</description>\n';

            // Define styles for different statuses
            var statusStyles = {
                'In Betrieb': { color: 'ff50af4c', icon: 'grn-circle' },
                'In Renovation': { color: 'ff0098ff', icon: 'orange-circle' },
                'In Planung': { color: 'fff39621', icon: 'blu-circle' },
                'Ausser Betrieb': { color: 'ff9e9e9e', icon: 'grey-circle' }
            };

            Object.keys(statusStyles).forEach(function(status) {
                var style = statusStyles[status];
                kmlContent += '    <Style id="style-' + status.replace(/\s/g, '-') + '">\n';
                kmlContent += '      <IconStyle>\n';
                kmlContent += '        <color>' + style.color + '</color>\n';
                kmlContent += '        <scale>1.0</scale>\n';
                kmlContent += '        <Icon><href>http://maps.google.com/mapfiles/kml/paddle/' + style.icon + '.png</href></Icon>\n';
                kmlContent += '      </IconStyle>\n';
                kmlContent += '    </Style>\n';
            });

            data.forEach(function(feature) {
                var props = feature.properties || {};
                var coords = feature.geometry && feature.geometry.coordinates ? feature.geometry.coordinates : [0, 0];
                var status = props.status || 'In Betrieb';

                kmlContent += '    <Placemark>\n';
                kmlContent += '      <name>' + escapeXml(props.name || 'Unbekannt') + '</name>\n';
                kmlContent += '      <description><![CDATA[\n';
                kmlContent += '        <b>Adresse:</b> ' + escapeXml(props.address || '') + '<br>\n';
                kmlContent += '        <b>Stadt:</b> ' + escapeXml(props.city || '') + '<br>\n';
                kmlContent += '        <b>Status:</b> ' + escapeXml(status) + '<br>\n';
                kmlContent += '        <b>Energieklasse:</b> ' + escapeXml(props.energyClass || '-') + '<br>\n';
                kmlContent += '        <b>Fläche:</b> ' + (props.flaeche ? props.flaeche.toLocaleString('de-CH') + ' m²' : '-') + '\n';
                kmlContent += '      ]]></description>\n';
                kmlContent += '      <styleUrl>#style-' + status.replace(/\s/g, '-') + '</styleUrl>\n';

                if (includeCoords) {
                    kmlContent += '      <Point>\n';
                    kmlContent += '        <coordinates>' + coords[0] + ',' + coords[1] + ',0</coordinates>\n';
                    kmlContent += '      </Point>\n';
                }

                kmlContent += '    </Placemark>\n';
            });

            kmlContent += '  </Document>\n';
            kmlContent += '</kml>';

            var blob = new Blob([kmlContent], { type: 'application/vnd.google-earth.kml+xml' });
            downloadBlob(blob, 'bbl-portfolio-export.kml');
        }

        function exportShapefile(data) {
            // Shapefile export requires external library or server-side processing
            // For now, we'll export as GeoJSON with a note about conversion
            showToast({ type: 'info', title: 'Shapefile-Export', message: 'GeoJSON wird erstellt. Konvertieren Sie mit QGIS oder ogr2ogr zu Shapefile.' });

            var includeCoords = document.getElementById('export-coords').checked;

            var featureCollection = {
                type: 'FeatureCollection',
                name: 'bbl_portfolio',
                crs: { type: 'name', properties: { name: 'urn:ogc:def:crs:OGC:1.3:CRS84' } },
                features: data.map(function(feature) {
                    var exportFeature = JSON.parse(JSON.stringify(feature));
                    // Flatten properties for shapefile compatibility (10 char field names)
                    if (exportFeature.properties) {
                        var props = exportFeature.properties;
                        exportFeature.properties = {
                            bldg_id: props.buildingId,
                            name: (props.name || '').substring(0, 254),
                            address: (props.address || '').substring(0, 254),
                            city: (props.city || '').substring(0, 80),
                            country: (props.country || '').substring(0, 80),
                            status: (props.status || '').substring(0, 50),
                            energy_cls: props.energyClass,
                            area_m2: props.flaeche,
                            built_year: props.constructedYear,
                            portfolio: (props.portfolioGroup || '').substring(0, 80)
                        };
                    }
                    if (!includeCoords) {
                        delete exportFeature.geometry;
                    }
                    return exportFeature;
                })
            };

            var blob = new Blob([JSON.stringify(featureCollection, null, 2)], { type: 'application/geo+json' });
            downloadBlob(blob, 'bbl-portfolio-for-shapefile.geojson');
        }

        function escapeXml(str) {
            if (!str) return '';
            return String(str)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&apos;');
        }

        function downloadBlob(blob, filename) {
            var url = URL.createObjectURL(blob);
            var a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }

        // Legacy export handler for dropdown menu
        function handleExport(format) {
            selectedExportFormat = format;
            performExport();
        }

        // ===== SHARE FUNCTIONS =====
        function getShareUrl() {
            var baseUrl = window.location.origin + window.location.pathname;
            var params = new URLSearchParams(window.location.search);

            // Add current map position if map exists
            if (typeof map !== 'undefined' && map) {
                var center = map.getCenter();
                var zoom = map.getZoom();
                params.set('lng', center.lng.toFixed(5));
                params.set('lat', center.lat.toFixed(5));
                params.set('zoom', zoom.toFixed(2));
            }

            // Add selected building or parcel if one is selected
            if (selectedBuildingId) {
                params.set('id', selectedBuildingId);
                params.delete('parcelId');
            } else if (selectedParcelId) {
                params.set('parcelId', selectedParcelId);
                params.delete('id');
            } else {
                params.delete('id');
                params.delete('parcelId');
            }

            return baseUrl + '?' + params.toString();
        }

        function updateShareLink() {
            var input = document.getElementById('share-link-input');
            if (input) {
                input.value = getShareUrl();
            }
        }

        function shareViaEmail() {
            var url = getShareUrl();
            var subject = encodeURIComponent('BBL Immobilienportfolio - Kartenansicht');
            var body = encodeURIComponent('Schauen Sie sich diese Kartenansicht an:\n\n' + url);
            window.open('mailto:?subject=' + subject + '&body=' + body, '_self');
        }

        function shareViaFacebook() {
            var url = encodeURIComponent(getShareUrl());
            window.open('https://www.facebook.com/sharer/sharer.php?u=' + url, '_blank', 'width=600,height=400');
        }

        function shareViaLinkedIn() {
            var url = encodeURIComponent(getShareUrl());
            window.open('https://www.linkedin.com/sharing/share-offsite/?url=' + url, '_blank', 'width=600,height=400');
        }

        function shareViaX() {
            var url = encodeURIComponent(getShareUrl());
            var text = encodeURIComponent('BBL Immobilienportfolio - Kartenansicht');
            window.open('https://twitter.com/intent/tweet?url=' + url + '&text=' + text, '_blank', 'width=600,height=400');
        }

        function copyShareLink() {
            var input = document.getElementById('share-link-input');
            var button = document.querySelector('.share-copy-btn');

            if (input && navigator.clipboard) {
                navigator.clipboard.writeText(input.value).then(function() {
                    button.textContent = 'Kopiert!';
                    button.classList.add('copied');
                    setTimeout(function() {
                        button.textContent = 'Link kopieren';
                        button.classList.remove('copied');
                    }, 2000);
                });
            } else if (input) {
                // Fallback for older browsers
                input.select();
                document.execCommand('copy');
                button.textContent = 'Kopiert!';
                button.classList.add('copied');
                setTimeout(function() {
                    button.textContent = 'Link kopieren';
                    button.classList.remove('copied');
                }, 2000);
            }
        }

        // ===== PRINT FUNCTIONS =====
        function generatePrintPDF() {
            var orientation = document.getElementById('print-orientation').value;
            var scale = document.getElementById('print-scale').value;
            var includeLegend = document.getElementById('print-legend').checked;
            var includeGrid = document.getElementById('print-grid').checked;

            var btn = document.getElementById('print-pdf-btn');
            var originalText = btn.textContent;
            btn.textContent = 'Wird erstellt...';
            btn.disabled = true;

            // Get print dimensions based on orientation
            var printDimensions = getPrintDimensions(orientation);

            // Create print container
            var printContainer = document.createElement('div');
            printContainer.id = 'print-container';
            printContainer.style.cssText = 'position: fixed; top: 0; left: 0; width: ' + printDimensions.width + 'mm; height: ' + printDimensions.height + 'mm; background: white; z-index: 10000; padding: 10mm; box-sizing: border-box;';

            // Create header
            var header = document.createElement('div');
            header.style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 5mm; padding-bottom: 3mm; border-bottom: 1px solid #ccc;';
            header.innerHTML = '<div style="font-size: 14pt; font-weight: bold;">BBL Immobilienportfolio</div><div style="font-size: 10pt; color: #666;">' + new Date().toLocaleDateString('de-CH') + '</div>';
            printContainer.appendChild(header);

            // Create map container
            var mapContainer = document.createElement('div');
            var mapHeight = printDimensions.height - 40; // Account for header and footer
            if (includeLegend) mapHeight -= 25; // Reserve space for legend
            mapContainer.style.cssText = 'width: 100%; height: ' + mapHeight + 'mm; border: 1px solid #ccc; position: relative; overflow: hidden;';

            // Clone map canvas
            if (map) {
                var mapCanvas = map.getCanvas();
                var clonedCanvas = document.createElement('canvas');
                clonedCanvas.width = mapCanvas.width;
                clonedCanvas.height = mapCanvas.height;
                var ctx = clonedCanvas.getContext('2d');
                ctx.drawImage(mapCanvas, 0, 0);
                clonedCanvas.style.cssText = 'width: 100%; height: 100%; object-fit: contain;';
                mapContainer.appendChild(clonedCanvas);

                // Add coordinate grid overlay if requested
                if (includeGrid) {
                    var gridOverlay = document.createElement('div');
                    gridOverlay.style.cssText = 'position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none;';
                    gridOverlay.innerHTML = createCoordinateGrid();
                    mapContainer.appendChild(gridOverlay);
                }

                // Add scale bar
                var scaleBar = document.createElement('div');
                scaleBar.style.cssText = 'position: absolute; bottom: 5mm; left: 5mm; background: rgba(255,255,255,0.9); padding: 2mm 3mm; border-radius: 2px; font-size: 8pt;';
                var currentScale = scale === 'auto' ? Math.round(getMapScale()) : parseInt(scale);
                scaleBar.textContent = 'Massstab 1:' + currentScale.toLocaleString('de-CH');
                mapContainer.appendChild(scaleBar);

                // Add north arrow
                var northArrow = document.createElement('div');
                northArrow.style.cssText = 'position: absolute; top: 5mm; right: 5mm; background: rgba(255,255,255,0.9); padding: 2mm; border-radius: 2px; text-align: center;';
                northArrow.innerHTML = '<div style="font-size: 16pt;">↑</div><div style="font-size: 8pt;">N</div>';
                mapContainer.appendChild(northArrow);
            }
            printContainer.appendChild(mapContainer);

            // Add legend if requested
            if (includeLegend) {
                var legend = document.createElement('div');
                legend.style.cssText = 'margin-top: 5mm; padding: 3mm; border: 1px solid #ccc; font-size: 9pt;';
                legend.innerHTML = '<div style="font-weight: bold; margin-bottom: 2mm;">Legende</div>' +
                    '<div style="display: flex; gap: 10mm; flex-wrap: wrap;">' +
                    '<span><span style="display: inline-block; width: 10px; height: 10px; background: #4CAF50; border-radius: 50%; margin-right: 2mm;"></span>In Betrieb</span>' +
                    '<span><span style="display: inline-block; width: 10px; height: 10px; background: #FF9800; border-radius: 50%; margin-right: 2mm;"></span>In Renovation</span>' +
                    '<span><span style="display: inline-block; width: 10px; height: 10px; background: #2196F3; border-radius: 50%; margin-right: 2mm;"></span>In Planung</span>' +
                    '<span><span style="display: inline-block; width: 10px; height: 10px; background: #9E9E9E; border-radius: 50%; margin-right: 2mm;"></span>Ausser Betrieb</span>' +
                    '</div>';
                printContainer.appendChild(legend);
            }

            // Add footer
            var footer = document.createElement('div');
            footer.style.cssText = 'margin-top: 3mm; padding-top: 3mm; border-top: 1px solid #ccc; font-size: 8pt; color: #666; display: flex; justify-content: space-between;';
            footer.innerHTML = '<span>Quelle: BBL Immobilienportfolio</span><span>© ' + new Date().getFullYear() + ' Bundesamt für Bauten und Logistik</span>';
            printContainer.appendChild(footer);

            document.body.appendChild(printContainer);

            // Create print-specific styles
            var printStyles = document.createElement('style');
            printStyles.id = 'print-styles';
            printStyles.textContent = '@media print { body > *:not(#print-container) { display: none !important; } #print-container { position: static !important; } @page { size: ' + (orientation.includes('landscape') ? 'landscape' : 'portrait') + '; margin: 0; } }';
            document.head.appendChild(printStyles);

            // Trigger print dialog
            setTimeout(function() {
                window.print();

                // Cleanup after print dialog closes
                setTimeout(function() {
                    document.body.removeChild(printContainer);
                    document.head.removeChild(printStyles);
                    btn.textContent = originalText;
                    btn.disabled = false;
                }, 500);
            }, 100);
        }

        function getPrintDimensions(orientation) {
            var dimensions = {
                'portrait-a4': { width: 210, height: 297 },
                'landscape-a4': { width: 297, height: 210 },
                'portrait-a3': { width: 297, height: 420 },
                'landscape-a3': { width: 420, height: 297 }
            };
            return dimensions[orientation] || dimensions['landscape-a4'];
        }

        function getMapScale() {
            if (!map) return 25000;
            var center = map.getCenter();
            var zoom = map.getZoom();
            // Calculate approximate scale based on zoom level at given latitude
            var metersPerPixel = 156543.03392 * Math.cos(center.lat * Math.PI / 180) / Math.pow(2, zoom);
            // Assume 96 DPI screen
            var pixelsPerMeter = 96 / 0.0254;
            return Math.round(metersPerPixel * pixelsPerMeter);
        }

        function createCoordinateGrid() {
            // Create a simple SVG grid overlay
            return '<svg width="100%" height="100%" style="position: absolute; top: 0; left: 0;">' +
                '<defs><pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse">' +
                '<path d="M 50 0 L 0 0 0 50" fill="none" stroke="rgba(0,0,0,0.15)" stroke-width="0.5"/>' +
                '</pattern></defs>' +
                '<rect width="100%" height="100%" fill="url(#grid)"/>' +
                '</svg>';
        }

        // ===== PRINT PREVIEW OVERLAY =====
        var printPreviewOverlay = null;

        function createPrintPreviewOverlay() {
            if (printPreviewOverlay) return;

            var mapView = document.getElementById('map-view');
            if (!mapView) return;

            printPreviewOverlay = document.createElement('div');
            printPreviewOverlay.className = 'print-preview-overlay';
            printPreviewOverlay.innerHTML = '<svg><defs><mask id="print-preview-mask"><rect width="100%" height="100%" fill="white"/><rect id="print-crop-rect" fill="black"/></mask></defs><rect width="100%" height="100%" fill="rgba(0,0,0,0.5)" mask="url(#print-preview-mask)"/></svg><div class="print-preview-crop"><div class="print-preview-label"></div></div>';
            mapView.appendChild(printPreviewOverlay);
        }

        function showPrintPreview() {
            createPrintPreviewOverlay();
            if (printPreviewOverlay) {
                printPreviewOverlay.classList.add('active');
                updatePrintPreview();
            }
        }

        function hidePrintPreview() {
            if (printPreviewOverlay) {
                printPreviewOverlay.classList.remove('active');
            }
        }

        function updatePrintPreview() {
            if (!printPreviewOverlay || !printPreviewOverlay.classList.contains('active')) return;

            var mapView = document.getElementById('map-view');
            if (!mapView) return;

            var orientation = document.getElementById('print-orientation').value;
            var printDims = getPrintDimensions(orientation);
            var aspectRatio = printDims.width / printDims.height;

            var viewRect = mapView.getBoundingClientRect();
            var viewWidth = viewRect.width;
            var viewHeight = viewRect.height;

            // Calculate print area dimensions to fit in map view (with padding)
            var padding = 60;
            var maxWidth = viewWidth - (padding * 2);
            var maxHeight = viewHeight - (padding * 2);

            var cropWidth, cropHeight;
            if (maxWidth / aspectRatio <= maxHeight) {
                cropWidth = maxWidth;
                cropHeight = maxWidth / aspectRatio;
            } else {
                cropHeight = maxHeight;
                cropWidth = maxHeight * aspectRatio;
            }

            // Center the crop area
            var cropX = (viewWidth - cropWidth) / 2;
            var cropY = (viewHeight - cropHeight) / 2;

            // Update SVG mask rectangle
            var maskRect = printPreviewOverlay.querySelector('#print-crop-rect');
            if (maskRect) {
                maskRect.setAttribute('x', cropX);
                maskRect.setAttribute('y', cropY);
                maskRect.setAttribute('width', cropWidth);
                maskRect.setAttribute('height', cropHeight);
            }

            // Update crop border element
            var cropBorder = printPreviewOverlay.querySelector('.print-preview-crop');
            if (cropBorder) {
                cropBorder.style.left = cropX + 'px';
                cropBorder.style.top = cropY + 'px';
                cropBorder.style.width = cropWidth + 'px';
                cropBorder.style.height = cropHeight + 'px';
            }

            // Update label
            var label = printPreviewOverlay.querySelector('.print-preview-label');
            if (label) {
                var formatLabel = orientation.includes('a3') ? 'A3' : 'A4';
                var orientLabel = orientation.includes('landscape') ? 'Querformat' : 'Hochformat';
                label.textContent = formatLabel + ' ' + orientLabel;
            }
        }

        // Column Toggle Handler
        function handleColumnToggle(checkbox) {
            var columnClass = checkbox.getAttribute('data-column');
            var isVisible = checkbox.checked;

            // Toggle visibility of header and body cells
            document.querySelectorAll('.' + columnClass).forEach(function(cell) {
                cell.style.display = isVisible ? '' : 'none';
            });
        }

        // Toggle All Columns (Alle/Keine)
        function toggleAllColumns(showAll) {
            var checkboxes = document.querySelectorAll('#columns-dropdown-menu input[type="checkbox"]');

            checkboxes.forEach(function(checkbox) {
                checkbox.checked = showAll;
                handleColumnToggle(checkbox);
            });
        }

        // List Search Handler
        function handleListSearch(query) {
            listSearchTerm = query.toLowerCase().trim();
            listCurrentPage = 1; // Reset to first page when searching
            renderListView();
        }

        // Initialize List View Toolbar Event Listeners
        function initListToolbar() {
            // Dropdown buttons
            var exportBtn = document.getElementById('export-dropdown-btn');
            var columnsBtn = document.getElementById('columns-dropdown-btn');

            if (exportBtn) {
                exportBtn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    toggleDropdown('export-dropdown-menu');
                });
            }

            if (columnsBtn) {
                columnsBtn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    toggleDropdown('columns-dropdown-menu');
                });
            }

            // Column checkboxes
            document.querySelectorAll('#columns-dropdown-menu input[type="checkbox"]').forEach(function(checkbox) {
                checkbox.addEventListener('change', function() {
                    handleColumnToggle(this);
                });
            });

            // Search input
            var searchInput = document.getElementById('list-search-input');
            if (searchInput) {
                searchInput.addEventListener('input', function() {
                    handleListSearch(this.value);
                });
            }
        }

        // Daten laden (parallel fetch of all entity files with error handling)
        function loadAllData() {
            showLoadingOverlay('Daten werden geladen...');

            Promise.all([
                fetchWithErrorHandling('data/buildings.geojson'),
                fetchWithErrorHandling('data/area-measurements.json'),
                fetchWithErrorHandling('data/documents.json'),
                fetchWithErrorHandling('data/contacts.json'),
                fetchWithErrorHandling('data/contracts.json'),
                fetchWithErrorHandling('data/assets.json'),
                fetchWithErrorHandling('data/costs.json'),
                fetchWithErrorHandling('data/parcels.geojson')
            ])
                .then(function(results) {
                    // Validate and destructure results
                    portfolioData = results[0];

                    // Safely access nested arrays with fallbacks
                    allAreaMeasurements = (results[1] && results[1].areaMeasurements) || [];
                    allDocuments = (results[2] && results[2].documents) || [];
                    allContacts = (results[3] && results[3].contacts) || [];
                    allContracts = (results[4] && results[4].contracts) || [];
                    allAssets = (results[5] && results[5].assets) || [];
                    allCosts = (results[6] && results[6].costs) || [];
                    parcelData = results[7];

                    // Validate portfolio data
                    if (!portfolioData || !portfolioData.features) {
                        throw new Error('Ungültiges Datenformat: Gebäudedaten fehlen');
                    }

                    // Initialize filters from URL
                    activeFilters = getFiltersFromURL();

                    // Initialize filter pane with options
                    initFilterOptions();
                    initFilterPane();
                    initDrawerResize();
                    initExportPanel();

                    // Apply initial filters (this sets filteredData and updates count)
                    applyFilters();

                    renderListView();
                    renderGalleryView();
                    initListToolbar();
                    initListPagination();

                    // Always use the load event to avoid race conditions
                    // If already loaded, the callback fires immediately
                    if (map.loaded()) {
                        addMapLayers();
                    } else {
                        map.once('load', addMapLayers);
                    }

                    // Check if URL has detail view
                    var initialView = getViewFromURL();
                    var buildingId = getBuildingIdFromURL();
                    var initialTab = getTabFromURL();
                    if (initialView === 'detail' && buildingId) {
                        showDetailView(buildingId, initialTab);
                    } else if (initialView !== 'map') {
                        switchView(initialView);
                    } else {
                        // Map view is default - show style switcher
                        var styleSwitcher = document.getElementById('style-switcher');
                        if (styleSwitcher) {
                            styleSwitcher.classList.add('visible');
                        }
                    }

                    // Hide loading overlay on success
                    hideLoadingOverlay();
                })
                .catch(function(error) {
                    console.error('Fehler beim Laden der Daten:', error);
                    hideLoadingOverlay();

                    // Show user-friendly error with retry option
                    showError(
                        'Fehler beim Laden der Daten',
                        'Die Portfoliodaten konnten nicht geladen werden. Bitte überprüfen Sie Ihre Internetverbindung.',
                        function() {
                            loadAllData(); // Retry
                        }
                    );
                });
        }

        // Start initial data load
        loadAllData();
        
        // ===== VIEW MANAGEMENT =====
        var currentView = 'map';
        
        function getViewFromURL() {
            var params = new URLSearchParams(window.location.search);
            return params.get('view') || 'map';
        }
        
        function getBuildingIdFromURL() {
            var params = new URLSearchParams(window.location.search);
            return params.get('id');
        }

        function getTabFromURL() {
            var params = new URLSearchParams(window.location.search);
            return params.get('tab') || 'overview';
        }

        function setViewInURL(view, buildingId, tab) {
            var url = new URL(window.location);
            url.searchParams.set('view', view);
            if (buildingId) {
                url.searchParams.set('id', buildingId);
            } else {
                url.searchParams.delete('id');
            }
            if (view === 'detail' && tab && tab !== 'overview') {
                url.searchParams.set('tab', tab);
            } else {
                url.searchParams.delete('tab');
            }
            window.history.pushState({}, '', url);
        }

        function setTabInURL(tab) {
            var url = new URL(window.location);
            if (tab && tab !== 'overview') {
                url.searchParams.set('tab', tab);
            } else {
                url.searchParams.delete('tab');
            }
            window.history.replaceState({}, '', url);
        }
        
        function switchView(view) {
            if (view !== 'detail') {
                previousView = currentView !== 'detail' ? currentView : previousView;
            }
            currentView = view;
            setViewInURL(view);
            
            // Update toggle buttons and ARIA attributes
            document.querySelectorAll('.view-toggle-btn').forEach(function(btn) {
                btn.classList.remove('active');
                btn.setAttribute('aria-selected', 'false');
                if (btn.dataset.view === view) {
                    btn.classList.add('active');
                    btn.setAttribute('aria-selected', 'true');
                }
            });
            
            // Show/hide views
            document.getElementById('map-view').classList.remove('active');
            document.getElementById('list-view').classList.remove('active');
            document.getElementById('gallery-view').classList.remove('active');
            document.getElementById('detail-view').classList.remove('active');

            // Disable page scrolling mode when leaving detail view
            document.body.classList.remove('detail-active');
            updateDetailHeaderOffset();

            var viewElement = document.getElementById(view + '-view');
            if (viewElement) {
                viewElement.classList.add('active');
            }

            // Show/hide style switcher based on view (only visible in map view)
            var styleSwitcher = document.getElementById('style-switcher');
            if (styleSwitcher) {
                styleSwitcher.classList.toggle('visible', view === 'map');
            }

            // Resize map if switching to map view
            if (view === 'map' && window.map) {
                setTimeout(function() {
                    map.resize();
                    // Apply filters to map when switching to map view
                    if (map.getLayer('portfolio-points')) {
                        updateMapFilter();
                    }
                }, 100);
            }

            // Re-render list view if dirty (filters changed while on another view)
            if (view === 'list' && listViewDirty) {
                renderListView();
                listViewDirty = false;
            }

            // Re-render gallery view if dirty (filters changed while on another view)
            if (view === 'gallery' && galleryViewDirty) {
                renderGalleryView();
                galleryViewDirty = false;
            }
        }

        function showDetailView(buildingId, tab) {
            if (!portfolioData) return;

            // Default tab to overview if not specified
            if (!tab) tab = 'overview';

            // Find building by ID
            var building = portfolioData.features.find(function(f) {
                return f.properties.buildingId === buildingId;
            });

            if (!building) {
                console.error('Building not found:', buildingId);
                return;
            }

            currentDetailBuilding = building;

            // Store previous view if not already in detail
            if (currentView !== 'detail') {
                previousView = currentView;
            }

            // Update URL with view, building ID, and tab
            setViewInURL('detail', buildingId, tab);
            currentView = 'detail';

            // Hide all views, show detail
            document.getElementById('map-view').classList.remove('active');
            document.getElementById('list-view').classList.remove('active');
            document.getElementById('gallery-view').classList.remove('active');
            document.getElementById('detail-view').classList.add('active');

            // Enable page scrolling mode for detail view
            document.body.classList.add('detail-active');
            window.scrollTo(0, 0);

            // Hide style switcher in detail view
            var styleSwitcher = document.getElementById('style-switcher');
            if (styleSwitcher) {
                styleSwitcher.classList.remove('visible');
            }

            // Clear active state from view toggle buttons
            document.querySelectorAll('.view-toggle-btn').forEach(function(btn) {
                btn.classList.remove('active');
            });

            // Populate detail view
            populateDetailView(building);

            // Activate the specified tab
            activateTab(tab);

            // Phones: the sticky header collapses to the tab strip (needs the rendered breadcrumb height)
            updateDetailHeaderOffset();
        }

        // Phones: #header is sticky with a negative top, so on scroll it collapses until only the tab strip is pinned
        function updateDetailHeaderOffset() {
            var header = document.getElementById('header');
            var tabs = document.querySelector('.detail-tabs');
            if (!header) return;
            if (!isMobileLayout() || !document.body.classList.contains('detail-active') || !tabs) {
                header.style.removeProperty('--header-sticky-offset');
                return;
            }
            var offset = header.offsetHeight - tabs.offsetHeight;
            header.style.setProperty('--header-sticky-offset', (-Math.max(0, offset)) + 'px');
        }
        window.addEventListener('resize', updateDetailHeaderOffset);

        function activateTab(tab) {
            // Update active tab styling
            document.querySelectorAll('.detail-tab').forEach(function(t) {
                var isActive = t.dataset.tab === tab;
                t.classList.toggle('active', isActive);
                t.setAttribute('aria-selected', isActive ? 'true' : 'false');
                // Phones: the tab strip scrolls horizontally — keep the active tab in view
                if (isActive && t.scrollIntoView && isTabStripScrollable()) {
                    t.scrollIntoView({ block: 'nearest', inline: 'center' });
                }
            });
            updateTabStripFade();

            // Switch content visibility
            document.querySelectorAll('.tab-content').forEach(function(content) {
                content.classList.remove('active');
            });
            var targetContent = document.querySelector('.tab-content[data-content="' + tab + '"]');
            if (targetContent) {
                targetContent.classList.add('active');
            }

            // Render table data for the tab
            if (tab === 'measurements') renderMeasurementsTable();
            if (tab === 'documents') renderDocumentsTable();
            if (tab === 'contacts') renderContactsTable();
            if (tab === 'costs') renderCostsTable();
            if (tab === 'contracts') renderContractsTable();
            if (tab === 'assets') renderAssetsTable();
        }
        
        function populateDetailView(building) {
            var props = building.properties;
            var coords = building.geometry.coordinates;
            
            // Helper to access extensionData safely
            var ext = props.extensionData || {};

            // Breadcrumb
            document.getElementById('breadcrumb-name').textContent = props.name;
            document.getElementById('breadcrumb-country').textContent = props.country || '—';
            document.getElementById('breadcrumb-region').textContent = props.stateProvincePrefecture || '—';

            // Objekt Stammdaten
            document.getElementById('detail-name').textContent = props.name;
            document.getElementById('detail-id').textContent = props.buildingId;
            document.getElementById('detail-teilportfolio').textContent = ext.portfolio || '—';
            document.getElementById('detail-baujahr').textContent = extractYear(props.constructionYear) || '—';

            // Address
            document.getElementById('detail-country').textContent = props.country;
            document.getElementById('detail-region').textContent = props.stateProvincePrefecture || '—';
            document.getElementById('detail-city').textContent = props.city;

            // Read address parts directly from properties, parse street from address
            var addressParts = parseAddress(props.streetName);
            document.getElementById('detail-plz').textContent = props.postalCode || '—';
            document.getElementById('detail-street').textContent = addressParts.street || '—';
            document.getElementById('detail-housenumber').textContent = props.houseNumber || '—';

            // Gebäudedaten
            document.getElementById('detail-sanierung').textContent = extractYear(props.yearOfLastRefurbishment) || '—';
            document.getElementById('detail-ladestationen').textContent = props.electricVehicleChargingStations !== undefined ? props.electricVehicleChargingStations : '—';
            document.getElementById('detail-denkmalschutz').textContent = formatBoolean(props.monumentProtection);
            document.getElementById('detail-parkplaetze').textContent = props.parkingSpaces !== undefined ? props.parkingSpaces : '—';
            document.getElementById('detail-geschosse').textContent = ext.numberOfFloors !== undefined ? ext.numberOfFloors : '—';
            document.getElementById('detail-baubewilligung').textContent = formatDate(props.buildingPermitDate) || '—';

            // Energie
            document.getElementById('detail-energieklasse').textContent = props.energyEfficiencyClass || '—';
            document.getElementById('detail-waermeerzeuger').textContent = ext.heatingGenerator || '—';
            document.getElementById('detail-waermequelle').textContent = ext.heatingSource || '—';
            document.getElementById('detail-warmwasser').textContent = ext.hotWater || '—';

            // Grundstück
            document.getElementById('detail-grundstueck-name').textContent = ext.plotName || '—';
            document.getElementById('detail-grundstueck-id').textContent = ext.plotId || '—';
            document.getElementById('detail-egid').textContent = ext.egid || '—';
            document.getElementById('detail-egrid').textContent = ext.egrid || '—';
            document.getElementById('detail-gueltig-von').textContent = formatDate(props.validFrom) || '—';
            document.getElementById('detail-gueltig-bis').textContent = formatDate(props.validUntil) || 'Keine Angabe';

            // Klassifizierung
            document.getElementById('detail-objektart1').textContent = props.primaryTypeOfBuilding || '—';
            document.getElementById('detail-teilportfolio-gruppe').textContent = ext.portfolioGroup || '—';
            document.getElementById('detail-objektart2').textContent = props.secondaryTypeOfBuilding || '—';
            document.getElementById('detail-eigentum').textContent = props.typeOfOwnership || '—';

            // Load measurements for this building
            loadMeasurementsForBuilding(building);

            // Load documents for this building
            loadDocumentsForBuilding(building);

            // Load contacts for this building
            loadContactsForBuilding(building);

            // Load costs for this building
            loadCostsForBuilding(building);

            // Load contracts for this building
            loadContractsForBuilding(building);

            // Load assets for this building
            loadAssetsForBuilding(building);

            // Initialize carousel
            initCarousel();

            // Initialize mini map
            initMiniMap(coords);
        }
        
        // Helper: Extract year from ISO 8601 date string (e.g., "1902-01-01T00:00:00Z" → "1902")
        function extractYear(isoDate) {
            if (!isoDate) return null;
            var match = isoDate.match(/^(\d{4})/);
            return match ? match[1] : null;
        }

        // Helper: Format ISO 8601 date to DD.MM.YYYY
        function formatDate(isoDate) {
            if (!isoDate) return null;
            var match = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})/);
            return match ? match[3] + '.' + match[2] + '.' + match[1] : null;
        }

        // Helper: Format boolean for display (true → "Ja", false → "Nein")
        function formatBoolean(value) {
            if (value === true) return 'Ja';
            if (value === false) return 'Nein';
            return '—';
        }

        function parseAddress(address) {
            // Parse address into street, house number, and PLZ
            // Expected formats: "Strasse Nr, PLZ Stadt" or "Nr Strasse, Stadt, State PLZ"
            var street = '';
            var number = '';
            var plz = '';

            if (!address) {
                return { street: street, number: number, plz: plz };
            }

            // Split by comma to separate street+number from PLZ+city
            var commaParts = address.split(',');
            var streetPart = commaParts[0].trim();

            // Extract PLZ from the part after the comma
            if (commaParts.length > 1) {
                var restPart = commaParts.slice(1).join(',').trim();
                // Look for PLZ patterns: Swiss (4 digits), German (5 digits), US (5 digits), etc.
                var plzMatch = restPart.match(/\b(\d{4,5})\b/);
                if (plzMatch) {
                    plz = plzMatch[1];
                }
            }

            // Parse street and house number from the first part
            // Check for number at the end (European style: "Strasse 123")
            var endNumberMatch = streetPart.match(/^(.+?)\s+(\d+[A-Za-z]?)$/);
            if (endNumberMatch) {
                street = endNumberMatch[1];
                number = endNumberMatch[2];
            } else {
                // Check for number at the beginning (US/UK style: "123 Street")
                var startNumberMatch = streetPart.match(/^(\d+[A-Za-z]?)\s+(.+)$/);
                if (startNumberMatch) {
                    number = startNumberMatch[1];
                    street = startNumberMatch[2];
                } else {
                    // No clear number found, use entire part as street
                    street = streetPart;
                }
            }

            return { street: street, number: number, plz: plz };
        }
        
        function initCarousel() {
            currentCarouselIndex = 0;
            updateCarouselImage();
            
            // Create dots
            var dotsContainer = document.getElementById('carousel-dots');
            dotsContainer.innerHTML = '';
            placeholderImages.forEach(function(_, index) {
                var dot = document.createElement('div');
                dot.className = 'carousel-dot' + (index === 0 ? ' active' : '');
                dot.onclick = function() {
                    currentCarouselIndex = index;
                    updateCarouselImage();
                };
                dotsContainer.appendChild(dot);
            });

            // Touch: a horizontal swipe changes the image
            var carouselEl = document.getElementById('detail-carousel');
            if (carouselEl && !carouselEl.dataset.swipeInit) {
                carouselEl.dataset.swipeInit = '1';
                var swipeStartX = null;
                var swipeStartY = 0;
                carouselEl.addEventListener('touchstart', function(e) {
                    if (e.touches.length !== 1) { swipeStartX = null; return; }
                    swipeStartX = e.touches[0].clientX;
                    swipeStartY = e.touches[0].clientY;
                }, { passive: true });
                carouselEl.addEventListener('touchend', function(e) {
                    if (swipeStartX === null) return;
                    var dx = e.changedTouches[0].clientX - swipeStartX;
                    var dy = e.changedTouches[0].clientY - swipeStartY;
                    swipeStartX = null;
                    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {
                        if (dx < 0) carouselNext(); else carouselPrev();
                    }
                }, { passive: true });
            }
        }
        
        function updateCarouselImage() {
            var imageEl = document.getElementById('carousel-image');
            imageEl.style.backgroundImage = 'url(' + placeholderImages[currentCarouselIndex] + ')';
            
            // Update dots
            document.querySelectorAll('.carousel-dot').forEach(function(dot, index) {
                dot.classList.toggle('active', index === currentCarouselIndex);
            });
        }
        
        function carouselPrev() {
            currentCarouselIndex = (currentCarouselIndex - 1 + placeholderImages.length) % placeholderImages.length;
            updateCarouselImage();
        }
        
        function carouselNext() {
            currentCarouselIndex = (currentCarouselIndex + 1) % placeholderImages.length;
            updateCarouselImage();
        }
        
        function initMiniMap(coords) {
            // Destroy existing map if any
            if (miniMap) {
                miniMap.remove();
                miniMap = null;
            }
            
            // Create new mini map
            miniMap = new maplibregl.Map({
                container: 'mini-map',
                style: mapStyles.positron.url,
                center: coords,
                zoom: 17,
                pitch: 50,
                bearing: -17,
                // The mini map sits inside a scrolling page: one-finger drag and plain wheel scroll the page,
                // two fingers / Ctrl+wheel move the map (MapLibre shows a localized hint)
                cooperativeGestures: true,
                locale: {
                    'CooperativeGesturesHandler.WindowsHelpText': 'Ctrl + Scrollen zum Zoomen der Karte',
                    'CooperativeGesturesHandler.MacHelpText': '⌘ + Scrollen zum Zoomen der Karte',
                    'CooperativeGesturesHandler.MobileHelpText': 'Karte mit zwei Fingern bewegen'
                }
            });
            
            // Add 3D buildings layer (OpenMapTiles "building" layer of the CARTO basemap, like prototype-main)
            miniMap.on('load', function() {
                var style = miniMap.getStyle();
                var layers = style.layers || [];
                var sources = style.sources || {};

                // First vector source of the basemap carries the building footprints
                var vectorSourceId = Object.keys(sources).find(function(key) { return sources[key].type === 'vector'; });

                // Insert below the first label layer so street names stay readable
                var labelLayerId;
                for (var i = 0; i < layers.length; i++) {
                    if (layers[i].type === 'symbol' && layers[i].layout && layers[i].layout['text-field']) {
                        labelLayerId = layers[i].id;
                        break;
                    }
                }

                if (vectorSourceId) {
                    // Hide the basemap's own flat building layers to prevent double-rendering
                    layers.forEach(function(layer) {
                        if (layer['source-layer'] === 'building' && layer.id !== '3d-buildings') {
                            miniMap.setLayoutProperty(layer.id, 'visibility', 'none');
                        }
                    });

                    miniMap.addLayer({
                        'id': '3d-buildings',
                        'source': vectorSourceId,
                        'source-layer': 'building',
                        'type': 'fill-extrusion',
                        'minzoom': 15,
                        'filter': ['!=', ['get', 'hide_3d'], true],
                        'paint': {
                            'fill-extrusion-color': '#A8B0B7',
                            'fill-extrusion-height': [
                                'interpolate', ['linear'], ['zoom'],
                                15, 0,
                                15.05, ['coalesce', ['get', 'render_height'], 5]
                            ],
                            'fill-extrusion-base': [
                                'interpolate', ['linear'], ['zoom'],
                                15, 0,
                                15.05, ['coalesce', ['get', 'render_min_height'], 0]
                            ],
                            'fill-extrusion-opacity': 0.6
                        }
                    }, labelLayerId);
                }

                // Add marker
                new maplibregl.Marker({ color: '#c00' })
                    .setLngLat(coords)
                    .addTo(miniMap);
            });

            // Add navigation controls
            miniMap.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
        }
        
        // View toggle click handlers
        document.querySelectorAll('.view-toggle-btn').forEach(function(btn) {
            btn.addEventListener('click', function() {
                switchView(this.dataset.view);
            });
        });
        
        // Back button handler
        document.getElementById('btn-back').addEventListener('click', function() {
            switchView(previousView || 'gallery');
        });
        
        // Handle browser back/forward
        window.addEventListener('popstate', function() {
            var view = getViewFromURL();
            var buildingId = getBuildingIdFromURL();
            var tab = getTabFromURL();
            if (view === 'detail' && buildingId) {
                showDetailView(buildingId, tab);
            } else {
                switchView(view);
            }
        });
        
        // ===== RENDER LIST VIEW =====
        function renderListView() {
            if (!portfolioData) return;

            var dataToRender = filteredData || portfolioData;
            var listBody = document.getElementById('list-body');
            var tableWrapper = document.querySelector('#list-view .list-table-wrapper');
            var html = '';

            // Apply list search filter if active
            if (listSearchTerm) {
                dataToRender = {
                    type: dataToRender.type,
                    features: dataToRender.features.filter(function(feature) {
                        var props = feature.properties;
                        var ext = props.extensionData || {};
                        var searchableText = [
                            props.buildingId,
                            props.name,
                            props.country,
                            props.city,
                            props.streetName,
                            ext.portfolio,
                            props.status
                        ].join(' ').toLowerCase();
                        return searchableText.includes(listSearchTerm);
                    })
                };
            }

            // Handle empty state
            if (dataToRender.features.length === 0) {
                listBody.innerHTML = '';
                // Check if empty state already exists
                var existingEmpty = document.querySelector('#list-view .empty-state');
                if (!existingEmpty) {
                    var emptyHtml = '<div class="empty-state">' +
                        '<span class="material-symbols-outlined">search_off</span>' +
                        '<div class="empty-state-title">Keine Objekte gefunden</div>' +
                        '<div class="empty-state-description">Die aktuellen Filter ergeben keine Treffer. Passen Sie die Filterkriterien an oder setzen Sie die Filter zurück.</div>' +
                        '<div class="empty-state-action"><button class="btn-secondary" onclick="resetAllFilters()">Filter zurücksetzen</button></div>' +
                    '</div>';
                    tableWrapper.insertAdjacentHTML('afterend', emptyHtml);
                }
                updateListPaginationInfo(0, 0, 0);
                return;
            } else {
                // Remove empty state if it exists
                var existingEmpty = document.querySelector('#list-view .empty-state');
                if (existingEmpty) existingEmpty.remove();
            }

            // Pagination calculations
            var totalItems = dataToRender.features.length;
            var totalPages = Math.ceil(totalItems / listRowsPerPage);

            // Ensure current page is valid
            if (listCurrentPage > totalPages) {
                listCurrentPage = totalPages;
            }
            if (listCurrentPage < 1) {
                listCurrentPage = 1;
            }

            var startIndex = (listCurrentPage - 1) * listRowsPerPage;
            var endIndex = Math.min(startIndex + listRowsPerPage, totalItems);

            // Get paginated slice of data
            var paginatedFeatures = dataToRender.features.slice(startIndex, endIndex);

            paginatedFeatures.forEach(function(feature) {
                var props = feature.properties;
                var ext = props.extensionData || {};
                var statusClass = props.status === 'In Betrieb' ? 'status-active' :
                                  props.status === 'In Renovation' ? 'status-renovation' :
                                  props.status === 'In Planung' ? 'status-planning' : 'status-inactive';
                var flaeche = Number(ext.netFloorArea || 0).toLocaleString('de-CH');

                html += '<tr data-id="' + props.buildingId + '" tabindex="0" role="row">' +
                    '<td class="col-id">' + props.buildingId + '</td>' +
                    '<td class="col-name">' + props.name + '</td>' +
                    '<td class="col-land">' + props.country + '</td>' +
                    '<td class="col-ort">' + props.city + '</td>' +
                    '<td class="col-adresse">' + props.streetName + '</td>' +
                    '<td class="col-portfolio">' + (ext.portfolio || '—') + '</td>' +
                    '<td class="col-flaeche">' + flaeche + ' m²</td>' +
                    '<td class="col-status"><span class="status-badge ' + statusClass + '">' + props.status + '</span></td>' +
                '</tr>';
            });

            listBody.innerHTML = html;

            // Update pagination info
            updateListPaginationInfo(listCurrentPage, totalPages, totalItems);

            // Add click and keyboard handlers
            document.querySelectorAll('#list-body tr').forEach(function(row) {
                row.addEventListener('click', function() {
                    var buildingId = this.dataset.id;
                    showDetailView(buildingId);
                });
                row.addEventListener('keydown', function(e) {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        var buildingId = this.dataset.id;
                        showDetailView(buildingId);
                    }
                });
            });
        }

        // Update list pagination UI
        function updateListPaginationInfo(currentPage, totalPages, totalItems) {
            var infoEl = document.getElementById('list-pagination-info');
            var prevBtn = document.getElementById('list-prev-btn');
            var nextBtn = document.getElementById('list-next-btn');

            if (infoEl) {
                if (totalItems === 0) {
                    infoEl.textContent = 'Keine Einträge';
                } else {
                    infoEl.textContent = 'Seite ' + currentPage + ' von ' + totalPages;
                }
            }

            if (prevBtn) {
                prevBtn.disabled = currentPage <= 1;
            }

            if (nextBtn) {
                nextBtn.disabled = currentPage >= totalPages;
            }
        }

        // Initialize list pagination event listeners
        function initListPagination() {
            var rowsSelect = document.getElementById('list-rows-per-page');
            var prevBtn = document.getElementById('list-prev-btn');
            var nextBtn = document.getElementById('list-next-btn');

            if (rowsSelect) {
                rowsSelect.addEventListener('change', function() {
                    listRowsPerPage = parseInt(this.value, 10);
                    listCurrentPage = 1; // Reset to first page when changing rows per page
                    renderListView();
                });
            }

            if (prevBtn) {
                prevBtn.addEventListener('click', function() {
                    if (listCurrentPage > 1) {
                        listCurrentPage--;
                        renderListView();
                    }
                });
            }

            if (nextBtn) {
                nextBtn.addEventListener('click', function() {
                    var dataToRender = filteredData || portfolioData;
                    var totalPages = Math.ceil(dataToRender.features.length / listRowsPerPage);
                    if (listCurrentPage < totalPages) {
                        listCurrentPage++;
                        renderListView();
                    }
                });
            }
        }
        
        // ===== RENDER GALLERY VIEW =====
        function renderGalleryView() {
            if (!portfolioData) return;

            var dataToRender = filteredData || portfolioData;
            var galleryGrid = document.getElementById('gallery-grid');
            var html = '';

            // Handle empty state
            if (dataToRender.features.length === 0) {
                galleryGrid.innerHTML = '<div class="empty-state">' +
                    '<span class="material-symbols-outlined">search_off</span>' +
                    '<div class="empty-state-title">Keine Objekte gefunden</div>' +
                    '<div class="empty-state-description">Die aktuellen Filter ergeben keine Treffer. Passen Sie die Filterkriterien an oder setzen Sie die Filter zurück.</div>' +
                    '<div class="empty-state-action"><button class="btn-secondary" onclick="resetAllFilters()">Filter zurücksetzen</button></div>' +
                '</div>';
                return;
            }

            dataToRender.features.forEach(function(feature, index) {
                var props = feature.properties;
                var ext = props.extensionData || {};
                var flaeche = Number(ext.netFloorArea || 0).toLocaleString('de-CH');
                var statusClass = props.status === 'In Betrieb' ? 'status-active' :
                                  props.status === 'In Renovation' ? 'status-renovation' :
                                  props.status === 'In Planung' ? 'status-planning' : 'status-inactive';
                // Use placeholder images
                var imageUrl = placeholderImages[index % placeholderImages.length];

                html += '<div class="gallery-card" data-id="' + props.buildingId + '" tabindex="0" role="article" aria-label="' + props.name + '">' +
                    '<div class="gallery-image" style="background-image: url(' + imageUrl + ')" role="img" aria-label="Bild von ' + props.name + '">' +
                        '<div class="gallery-image-label">' + props.country + '</div>' +
                    '</div>' +
                    '<div class="gallery-content">' +
                        '<div class="gallery-title">' + props.name + '</div>' +
                        '<div class="gallery-subtitle">' + props.streetName + '</div>' +
                        '<div class="gallery-meta">' +
                            '<span class="gallery-tag">' + (ext.portfolio || '—') + '</span>' +
                            '<span class="gallery-tag">' + flaeche + ' m²</span>' +
                            '<span class="status-badge ' + statusClass + '">' + props.status + '</span>' +
                        '</div>' +
                    '</div>' +
                '</div>';
            });

            galleryGrid.innerHTML = html;

            // Add click and keyboard handlers
            document.querySelectorAll('.gallery-card').forEach(function(card) {
                card.addEventListener('click', function() {
                    var buildingId = this.dataset.id;
                    showDetailView(buildingId);
                });
                card.addEventListener('keydown', function(e) {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        var buildingId = this.dataset.id;
                        showDetailView(buildingId);
                    }
                });
            });
        }
        
        // ===== INITIALIZE MAP =====

        // Map style definitions (defined early for use in map initialization)
        // Same basemaps as prototype-main: CARTO vector styles (OpenMapTiles schema) and the swisstopo
        // SWISSIMAGE raster. `url` is a style URL or an inline style object; `thumbnail` a local PNG
        // rendered from the style itself (assets/basemaps, 160×120 @2x) — no API key, no static-image service.
        var SWISSIMAGE_TILES = 'https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.swissimage/default/current/3857/{z}/{x}/{y}.jpeg';
        var mapStyles = {
            'positron': {
                name: 'Light',
                url: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
                thumbnail: 'assets/basemaps/positron.png'
            },
            'voyager': {
                name: 'Standard',
                url: 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json',
                thumbnail: 'assets/basemaps/voyager.png'
            },
            'swissimage': {
                name: 'Luftbild',
                url: {
                    version: 8,
                    glyphs: 'https://tiles.basemaps.cartocdn.com/fonts/{fontstack}/{range}.pbf',
                    sources: {
                        'swissimage': {
                            type: 'raster',
                            tiles: [SWISSIMAGE_TILES],
                            tileSize: 256,
                            minzoom: 8,
                            maxzoom: 20,
                            bounds: [5.95, 45.81, 10.49, 47.81],
                            attribution: '&copy; <a href="https://www.swisstopo.admin.ch">swisstopo</a>'
                        }
                    },
                    layers: [{ id: 'swissimage', type: 'raster', source: 'swissimage' }]
                },
                thumbnail: 'assets/basemaps/swissimage.png'
            },
            'dark-matter': {
                name: 'Dark',
                url: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
                thumbnail: 'assets/basemaps/dark-matter.png'
            }
        };
        var DEFAULT_MAP_STYLE = 'positron';

        // Load saved map style from localStorage (old Mapbox ids fall back to the default)
        var currentMapStyle = localStorage.getItem('mapStyle') || DEFAULT_MAP_STYLE;
        if (!mapStyles[currentMapStyle]) {
            currentMapStyle = DEFAULT_MAP_STYLE;
        }

        // 1. Parse URL parameters for map state
        var urlParams = new URLSearchParams(window.location.search);
        var initialLat = parseFloat(urlParams.get('lat'));
        var initialLng = parseFloat(urlParams.get('lng'));
        var initialZoom = parseFloat(urlParams.get('zoom'));

        // Defaults (Switzerland)
        var startCenter = [8.2275, 46.8182];
        var startZoom = 2;

        // Override defaults if URL params exist
        if (!isNaN(initialLat) && !isNaN(initialLng) && !isNaN(initialZoom)) {
            startCenter = [initialLng, initialLat];
            startZoom = initialZoom;
        }

        var map = new maplibregl.Map({
            container: 'map',
            style: mapStyles[currentMapStyle].url,
            center: startCenter,
            zoom: startZoom
        });
        
        map.addControl(new maplibregl.NavigationControl(), 'top-right');
        map.addControl(new maplibregl.ScaleControl({ maxWidth: 200 }), 'bottom-left');

        // Home button control
        var HomeControl = function() {};
        HomeControl.prototype.onAdd = function(map) {
            this._map = map;
            this._container = document.createElement('div');
            this._container.className = 'maplibregl-ctrl maplibregl-ctrl-group';

            var button = document.createElement('button');
            button.className = 'map-home-btn';
            button.type = 'button';
            button.title = 'Zur Startansicht';
            button.innerHTML = '<span class="material-symbols-outlined">home</span>';
            button.onclick = function() {
                map.flyTo({
                    center: [8.2275, 46.8182],
                    zoom: 2,
                    duration: 1000
                });
            };

            this._container.appendChild(button);
            return this._container;
        };
        HomeControl.prototype.onRemove = function() {
            this._container.parentNode.removeChild(this._container);
            this._map = undefined;
        };

        map.addControl(new HomeControl(), 'top-right');

        // 2. Update URL on map move/zoom
        map.on('moveend', function() {
            if (currentView !== 'map') return; // Don't update if not in map view
            
            var center = map.getCenter();
            var zoom = map.getZoom();
            
            var url = new URL(window.location);
            url.searchParams.set('lng', center.lng.toFixed(5));
            url.searchParams.set('lat', center.lat.toFixed(5));
            url.searchParams.set('zoom', zoom.toFixed(2));
            
            // Use replaceState to update URL without adding to history stack
            window.history.replaceState({}, '', url);
        });

        map.on('mousemove', function(e) {
            var lng = e.lngLat.lng.toFixed(5);
            var lat = e.lngLat.lat.toFixed(5);
            document.getElementById('coordinates').textContent = 'WGS 84 | Koordinaten: ' + lng + ', ' + lat;
        });
        
        // ===== SWISSTOPO LAYER MANAGEMENT =====

        function addSwisstopoLayer(layerId, title, silent) {
            if (!layerId) {
                if (!silent) showToast({ type: 'error', title: 'Fehler', message: 'Keine Layer-ID vorhanden.' });
                return;
            }

            // Validate layer ID format (alphanumeric, dots, hyphens, underscores only)
            if (!/^[a-zA-Z0-9._-]+$/.test(layerId)) {
                if (!silent) showToast({ type: 'error', title: 'Fehler', message: 'Ungültige Layer-ID.' });
                return;
            }

            // Check if layer already added
            var existing = activeSwisstopoLayers.find(function(l) { return l.id === layerId; });
            if (existing) {
                if (!silent) showToast({ type: 'info', title: 'Hinweis', message: 'Layer "' + title + '" ist bereits aktiv.' });
                return;
            }

            // Cancel any pending fetch for this layer
            if (pendingLayerFetches[layerId]) {
                pendingLayerFetches[layerId].abort();
                delete pendingLayerFetches[layerId];
            }

            // Create AbortController for this fetch
            var abortController = new AbortController();
            pendingLayerFetches[layerId] = abortController;

            // Show loading toast
            if (!silent) showToast({ type: 'info', title: 'Lade Layer...', message: 'Metadaten werden abgerufen.', duration: 2000 });

            // Fetch layer metadata to get correct format and timestamp
            fetch('https://api3.geo.admin.ch/rest/services/api/MapServer/' + layerId + '?lang=de', { signal: abortController.signal })
                .then(function(response) {
                    if (!response.ok) throw new Error('Layer-Metadaten nicht verfügbar');
                    return response.json();
                })
                .then(function(metadata) {
                    // Clean up pending fetch reference
                    delete pendingLayerFetches[layerId];

                    // Check if layer was removed while fetching
                    if (!pendingLayerFetches.hasOwnProperty(layerId) && activeSwisstopoLayers.find(function(l) { return l.id === layerId; })) {
                        return; // Layer was removed during fetch
                    }

                    var sourceId = 'swisstopo-' + layerId;
                    var mapLayerId = 'swisstopo-layer-' + layerId;
                    var tileUrl;
                    var maxZoom = 18;

                    // Check if layer supports WMTS (has format specified)
                    if (metadata.format) {
                        // Use WMTS (faster, pre-rendered tiles)
                        var tileFormat = metadata.format.replace('image/', '');
                        var timestamp = 'current';
                        if (metadata.timestamps && metadata.timestamps.length > 0) {
                            timestamp = metadata.timestamps[0];
                        }
                        tileUrl = 'https://wmts.geo.admin.ch/1.0.0/' + layerId + '/default/' + timestamp + '/3857/{z}/{x}/{y}.' + tileFormat;

                        if (metadata.maxScale) {
                            maxZoom = Math.min(22, Math.max(0, Math.round(18 - Math.log2(metadata.maxScale / 500))));
                        }
                    } else {
                        // Fall back to WMS (supports all layers with on-the-fly reprojection)
                        tileUrl = 'https://wms.geo.admin.ch/?' +
                            'SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap' +
                            '&LAYERS=' + layerId +
                            '&CRS=EPSG:3857' +
                            '&BBOX={bbox-epsg-3857}' +
                            '&WIDTH=256&HEIGHT=256' +
                            '&FORMAT=image/png' +
                            '&TRANSPARENT=true';
                        maxZoom = 19; // WMS typically supports higher zoom
                    }

                    try {
                        // Add raster source
                        map.addSource(sourceId, {
                            type: 'raster',
                            tiles: [tileUrl],
                            tileSize: 256,
                            maxzoom: maxZoom,
                            attribution: '&copy; <a href="https://www.swisstopo.admin.ch">swisstopo</a>'
                        });

                        // Find the layer to insert before (below highlight layer, parcels, and points)
                        var beforeLayer = null;
                        if (map.getLayer(identifyHighlightLayerId)) {
                            beforeLayer = identifyHighlightLayerId;
                        } else if (map.getLayer('parcels-fill')) {
                            beforeLayer = 'parcels-fill';
                        } else if (map.getLayer('portfolio-points')) {
                            beforeLayer = 'portfolio-points';
                        }

                        // Add raster layer
                        map.addLayer({
                            id: mapLayerId,
                            type: 'raster',
                            source: sourceId,
                            paint: {
                                'raster-opacity': 0.7
                            }
                        }, beforeLayer);
                    } catch (e) {
                        console.error('Fehler beim Hinzufügen des Layers zur Karte:', e);
                        if (!silent) showToast({ type: 'error', title: 'Fehler', message: 'Layer "' + (title || layerId) + '" konnte nicht zur Karte hinzugefügt werden.' });
                        return;
                    }

                    // Track the layer (including tileUrl, maxZoom, and visibility for re-adding after style change)
                    activeSwisstopoLayers.push({
                        id: layerId,
                        title: title || layerId,
                        sourceId: sourceId,
                        mapLayerId: mapLayerId,
                        tileUrl: tileUrl,
                        maxZoom: maxZoom,
                        visible: true
                    });

                    // Update the UI and URL
                    renderActiveLayersList();
                    updateUrlWithLayers();

                    if (!silent) showToast({ type: 'success', title: 'Layer hinzugefügt', message: '"' + (title || layerId) + '" wurde zur Karte hinzugefügt.' });
                })
                .catch(function(e) {
                    // Clean up pending fetch reference
                    delete pendingLayerFetches[layerId];

                    // Ignore abort errors (user cancelled)
                    if (e.name === 'AbortError') return;

                    console.error('Fehler beim Hinzufügen des Layers:', e);
                    if (!silent) showToast({ type: 'error', title: 'Fehler', message: 'Layer "' + (title || layerId) + '" konnte nicht geladen werden.' });
                });
        }

        window.removeSwisstopoLayer = function(layerId) {
            // Cancel any pending fetch for this layer
            if (pendingLayerFetches[layerId]) {
                pendingLayerFetches[layerId].abort();
                delete pendingLayerFetches[layerId];
            }

            var layerIndex = activeSwisstopoLayers.findIndex(function(l) { return l.id === layerId; });
            if (layerIndex === -1) return;

            var layer = activeSwisstopoLayers[layerIndex];

            try {
                if (map.getLayer(layer.mapLayerId)) {
                    map.removeLayer(layer.mapLayerId);
                }
                if (map.getSource(layer.sourceId)) {
                    map.removeSource(layer.sourceId);
                }
            } catch (e) {
                console.error('Fehler beim Entfernen des Layers:', e);
            }

            activeSwisstopoLayers.splice(layerIndex, 1);
            renderActiveLayersList();
            updateUrlWithLayers();

            showToast({ type: 'info', title: 'Layer entfernt', message: '"' + layer.title + '" wurde entfernt.' });
        };

        window.toggleSwisstopoLayerVisibility = function(layerId) {
            var layer = activeSwisstopoLayers.find(function(l) { return l.id === layerId; });
            if (!layer) return;

            // Check if map layer exists
            if (!map.getLayer(layer.mapLayerId)) {
                console.warn('Map layer not found:', layer.mapLayerId);
                return;
            }

            var visibility = map.getLayoutProperty(layer.mapLayerId, 'visibility');
            var newVisibility = visibility === 'none' ? 'visible' : 'none';
            map.setLayoutProperty(layer.mapLayerId, 'visibility', newVisibility);

            // Track visibility state for style change restoration
            layer.visible = newVisibility !== 'none';

            renderActiveLayersList();
        };

        function renderActiveLayersList() {
            var container = document.getElementById('external-layers-list');
            if (!container) return;

            if (activeSwisstopoLayers.length === 0) {
                container.innerHTML = '<div class="active-layers-empty">Keine externen Karten aktiv. Suchen Sie nach Karten über das Suchfeld.</div>';
                return;
            }

            var html = '';
            activeSwisstopoLayers.forEach(function(layer) {
                // Check if map layer exists, fall back to tracked visibility state
                var isVisible;
                if (map.getLayer(layer.mapLayerId)) {
                    var visibility = map.getLayoutProperty(layer.mapLayerId, 'visibility');
                    isVisible = visibility !== 'none';
                } else {
                    isVisible = layer.visible !== false;
                }
                var checkedAttr = isVisible ? 'checked' : '';
                var escapedId = escapeForJs(layer.id);

                html += '<div class="active-layer-item">' +
                    '<button class="active-layer-remove" onclick="removeSwisstopoLayer(\'' + escapedId + '\')" title="Entfernen">' +
                        '<span class="material-symbols-outlined">close</span>' +
                    '</button>' +
                    '<input type="checkbox" class="active-layer-checkbox" ' + checkedAttr + ' onchange="toggleSwisstopoLayerVisibility(\'' + escapedId + '\')" title="' + (isVisible ? 'Ausblenden' : 'Einblenden') + '">' +
                    '<span class="active-layer-title">' + escapeHtml(layer.title) + '</span>' +
                    '<button class="active-layer-info" onclick="showLayerInfo(\'' + escapedId + '\')" title="Layer-Informationen">' +
                        '<span class="material-symbols-outlined">info</span>' +
                    '</button>' +
                '</div>';
            });

            container.innerHTML = html;

            // Sync Geokatalog checkboxes with active layers
            updateGeokatalogCheckboxes();
        }

        function readdSwisstopoLayers() {
            // Re-add all Swisstopo layers after a map style change
            if (activeSwisstopoLayers.length === 0) return;

            activeSwisstopoLayers.forEach(function(layer) {
                // Skip if source already exists (shouldn't happen, but safety check)
                if (map.getSource(layer.sourceId)) return;

                try {
                    // Re-add raster source
                    map.addSource(layer.sourceId, {
                        type: 'raster',
                        tiles: [layer.tileUrl],
                        tileSize: 256,
                        maxzoom: layer.maxZoom,
                        attribution: '&copy; <a href="https://www.swisstopo.admin.ch">swisstopo</a>'
                    });

                    // Find the layer to insert before
                    var beforeLayer = null;
                    if (map.getLayer(identifyHighlightLayerId)) {
                        beforeLayer = identifyHighlightLayerId;
                    } else if (map.getLayer('parcels-fill')) {
                        beforeLayer = 'parcels-fill';
                    } else if (map.getLayer('portfolio-points')) {
                        beforeLayer = 'portfolio-points';
                    }

                    // Re-add raster layer with preserved visibility state
                    map.addLayer({
                        id: layer.mapLayerId,
                        type: 'raster',
                        source: layer.sourceId,
                        layout: {
                            visibility: layer.visible !== false ? 'visible' : 'none'
                        },
                        paint: {
                            'raster-opacity': 0.7
                        }
                    }, beforeLayer);
                } catch (e) {
                    console.error('Fehler beim Wiederherstellen des Layers:', layer.id, e);
                }
            });

            // Update checkbox states in UI
            renderActiveLayersList();
        }

        // ===== SWISSTOPO FEATURE IDENTIFICATION =====

        var identifiedFeaturePopup = null;
        var identifyHighlightSourceId = 'swisstopo-identify-highlight';
        var identifyHighlightLayerId = 'swisstopo-identify-highlight-layer';
        var identifyHighlightOutlineLayerId = 'swisstopo-identify-highlight-outline';

        function initIdentifyHighlightLayer() {
            // Add empty source for highlighting identified features
            if (!map.getSource(identifyHighlightSourceId)) {
                map.addSource(identifyHighlightSourceId, {
                    type: 'geojson',
                    data: { type: 'FeatureCollection', features: [] }
                });

                // Find the layer to insert before (should be above Swisstopo layers, below parcels/points)
                var beforeLayer = null;
                if (map.getLayer('parcels-fill')) {
                    beforeLayer = 'parcels-fill';
                } else if (map.getLayer('portfolio-points')) {
                    beforeLayer = 'portfolio-points';
                }

                // Add fill layer for polygons
                map.addLayer({
                    id: identifyHighlightLayerId,
                    type: 'fill',
                    source: identifyHighlightSourceId,
                    paint: {
                        'fill-color': '#ff6b00',
                        'fill-opacity': 0.35
                    }
                }, beforeLayer);

                // Add outline layer (above fill)
                map.addLayer({
                    id: identifyHighlightOutlineLayerId,
                    type: 'line',
                    source: identifyHighlightSourceId,
                    paint: {
                        'line-color': '#ff6b00',
                        'line-width': 3,
                        'line-opacity': 0.9
                    }
                }, beforeLayer);
            }
        }

        function clearIdentifyHighlight() {
            if (map.getSource(identifyHighlightSourceId)) {
                map.getSource(identifyHighlightSourceId).setData({
                    type: 'FeatureCollection',
                    features: []
                });
            }
            if (identifiedFeaturePopup) {
                // Store reference and null it BEFORE removing to prevent infinite loop
                // (popup.remove() fires 'close' event which would call this function again)
                var popup = identifiedFeaturePopup;
                identifiedFeaturePopup = null;
                popup.remove();
            }
        }

        function identifySwisstopoFeatures(lngLat) {
            // Only identify if there are active layers
            if (activeSwisstopoLayers.length === 0) return;

            // Get visible layer IDs
            var visibleLayers = activeSwisstopoLayers.filter(function(layer) {
                var visibility = map.getLayoutProperty(layer.mapLayerId, 'visibility');
                return visibility !== 'none';
            }).map(function(layer) {
                return layer.id;
            });

            if (visibleLayers.length === 0) return;

            // Build the identify URL
            // Use tolerance=0 for exact point-in-polygon intersection
            // Per API docs: tolerance=0 with mapExtent=0,0,0,0 and imageDisplay=0,0,0 does exact intersection
            var url = 'https://api3.geo.admin.ch/rest/services/all/MapServer/identify?' +
                'geometry=' + lngLat.lng + ',' + lngLat.lat +
                '&geometryType=esriGeometryPoint' +
                '&geometryFormat=geojson' +
                '&sr=4326' +
                '&layers=all:' + visibleLayers.join(',') +
                '&mapExtent=0,0,0,0' +
                '&imageDisplay=0,0,0' +
                '&tolerance=0' +
                '&returnGeometry=true' +
                '&lang=de';

            fetch(url)
                .then(function(response) {
                    if (!response.ok) throw new Error('Identify request failed');
                    return response.json();
                })
                .then(function(data) {
                    if (data.results && data.results.length > 0) {
                        showIdentifiedFeature(data.results[0], lngLat);
                    } else {
                        clearIdentifyHighlight();
                    }
                })
                .catch(function(e) {
                    console.error('Identify error:', e);
                    clearIdentifyHighlight();
                });
        }

        function showIdentifiedFeature(result, lngLat) {
            // Remove existing popup FIRST (before setting new geometry)
            // This prevents the old popup's close event from clearing our new geometry
            if (identifiedFeaturePopup) {
                var oldPopup = identifiedFeaturePopup;
                identifiedFeaturePopup = null;
                oldPopup.remove();
            }

            // Now highlight the geometry (after old popup is gone)
            if (result.geometry) {
                var feature = {
                    type: 'Feature',
                    geometry: result.geometry,
                    properties: result.properties || {}
                };

                if (map.getSource(identifyHighlightSourceId)) {
                    map.getSource(identifyHighlightSourceId).setData({
                        type: 'FeatureCollection',
                        features: [feature]
                    });
                }
            }

            // Build popup content
            var props = result.properties || result.attributes || {};
            var layerName = result.layerName || result.layerBodId || 'Feature';

            var html = '<div class="identify-popup">';
            html += '<div class="identify-popup-header">' + escapeHtml(layerName) + '</div>';
            html += '<div class="identify-popup-content">';

            // Display properties (limit to first 8 for readability)
            var propCount = 0;
            for (var key in props) {
                if (props.hasOwnProperty(key) && propCount < 8) {
                    var value = props[key];
                    // Skip internal/technical fields
                    if (key.startsWith('_') || key === 'id' || key === 'featureId') continue;
                    // Skip null/undefined values
                    if (value === null || value === undefined || value === '') continue;

                    // Format the key (remove underscores, capitalize)
                    var displayKey = key.replace(/_/g, ' ').replace(/\b\w/g, function(l) { return l.toUpperCase(); });

                    html += '<div class="identify-prop">';
                    html += '<span class="identify-prop-key">' + escapeHtml(displayKey) + ':</span> ';
                    html += '<span class="identify-prop-value">' + escapeHtml(String(value)) + '</span>';
                    html += '</div>';
                    propCount++;
                }
            }

            if (propCount === 0) {
                html += '<div class="identify-prop"><em>Keine Attribute verfügbar</em></div>';
            }

            html += '</div></div>';

            // Create and show popup
            identifiedFeaturePopup = new maplibregl.Popup({
                closeButton: true,
                closeOnClick: false,
                maxWidth: '320px'
            })
                .setLngLat(lngLat)
                .setHTML(html)
                .addTo(map);

            identifiedFeaturePopup.on('close', function() {
                clearIdentifyHighlight();
            });
        }

        function addMapLayers() {
            if (!portfolioData) return;

            // Prevent duplicate source errors if called multiple times
            if (map.getSource('portfolio')) {
                return;
            }

            map.addSource('portfolio', {
                type: 'geojson',
                data: portfolioData
            });

            // Add parcels source and layers
            if (parcelData && parcelData.features) {
                map.addSource('parcels', {
                    type: 'geojson',
                    data: parcelData
                });

                // Parcel fill layer
                map.addLayer({
                    id: 'parcels-fill',
                    type: 'fill',
                    source: 'parcels',
                    paint: {
                        'fill-color': '#1976d2',
                        'fill-opacity': 0.15
                    }
                });

                // Parcel outline layer
                map.addLayer({
                    id: 'parcels-outline',
                    type: 'line',
                    source: 'parcels',
                    paint: {
                        'line-color': '#1976d2',
                        'line-width': 2,
                        'line-opacity': 0.8
                    }
                });

                // Parcel hover highlight layer
                map.addLayer({
                    id: 'parcels-highlight',
                    type: 'fill',
                    source: 'parcels',
                    filter: ['==', ['get', 'parcelId'], ''],
                    paint: {
                        'fill-color': '#1976d2',
                        'fill-opacity': 0.35
                    }
                });
            }

            // Main points layer
            map.addLayer({
                id: 'portfolio-points',
                type: 'circle',
                source: 'portfolio',
                paint: {
                    'circle-radius': 10,
                    'circle-color': [
                        'match',
                        ['get', 'status'],
                        'In Betrieb', statusColors['In Betrieb'],
                        'In Renovation', statusColors['In Renovation'],
                        'In Planung', statusColors['In Planung'],
                        'Ausser Betrieb', statusColors['Ausser Betrieb'],
                        '#6C757D'  // fallback
                    ],
                    'circle-stroke-width': 2,
                    'circle-stroke-color': '#ffffff'
                }
            });

            // Selected point highlight layer - outer ring
            map.addLayer({
                id: 'portfolio-selected',
                type: 'circle',
                source: 'portfolio',
                filter: ['==', ['get', 'buildingId'], ''],
                paint: {
                    'circle-radius': 18,
                    'circle-color': 'transparent',
                    'circle-stroke-width': 3,
                    'circle-stroke-color': '#c00',  // primary-red
                    'circle-stroke-opacity': 0.9
                }
            });

            // Selected point pulse animation layer
            map.addLayer({
                id: 'portfolio-selected-pulse',
                type: 'circle',
                source: 'portfolio',
                filter: ['==', ['get', 'buildingId'], ''],
                paint: {
                    'circle-radius': 24,
                    'circle-color': 'transparent',
                    'circle-stroke-width': 2,
                    'circle-stroke-color': '#c00',
                    'circle-stroke-opacity': 0.4
                }
            });

            // Re-apply the "Interne Karten" checkbox state. addMapLayers() also runs after a
            // basemap change (style.load), which would otherwise reset hidden layers to visible.
            applyInternalLayerVisibility();

            // Animate the pulse layer
            var pulseRadius = 24;
            var pulseOpacity = 0.4;
            var pulseDirection = 1;
            var pulseAnimationId = null;

            function animatePulse() {
                // Only animate if a building is selected
                if (!selectedBuildingId) {
                    pulseAnimationId = null;
                    return;
                }

                pulseRadius += 0.3 * pulseDirection;
                pulseOpacity -= 0.01 * pulseDirection;

                if (pulseRadius >= 32) {
                    pulseDirection = -1;
                } else if (pulseRadius <= 24) {
                    pulseDirection = 1;
                }

                if (map.getLayer('portfolio-selected-pulse')) {
                    map.setPaintProperty('portfolio-selected-pulse', 'circle-radius', pulseRadius);
                    map.setPaintProperty('portfolio-selected-pulse', 'circle-stroke-opacity', Math.max(0.1, pulseOpacity));
                }

                pulseAnimationId = requestAnimationFrame(animatePulse);
            }

            // Start/stop pulse animation based on selection (exposed globally)
            window.startPulseAnimation = function() {
                if (pulseAnimationId === null) {
                    pulseRadius = 24;
                    pulseOpacity = 0.4;
                    pulseDirection = 1;
                    animatePulse();
                }
            };

            window.stopPulseAnimation = function() {
                if (pulseAnimationId !== null) {
                    cancelAnimationFrame(pulseAnimationId);
                    pulseAnimationId = null;
                }
            };
            
            map.on('mouseenter', 'portfolio-points', function() {
                map.getCanvas().style.cursor = 'pointer';
            });
            
            map.on('mouseleave', 'portfolio-points', function() {
                map.getCanvas().style.cursor = '';
            });
            
            // CLICK HANDLER
            map.on('click', 'portfolio-points', function(e) {
                var props = e.features[0].properties;
                // UPDATED: Pass 'false' so map does NOT zoom on click
                selectBuilding(props.buildingId, false);
            });

            // PARCEL HANDLERS
            if (parcelData && parcelData.features) {
                map.on('mouseenter', 'parcels-fill', function(e) {
                    map.getCanvas().style.cursor = 'pointer';
                    if (e.features.length > 0) {
                        var parcelId = e.features[0].properties.parcelId;
                        map.setFilter('parcels-highlight', ['==', ['get', 'parcelId'], parcelId]);
                    }
                });

                map.on('mouseleave', 'parcels-fill', function() {
                    map.getCanvas().style.cursor = '';
                    map.setFilter('parcels-highlight', ['==', ['get', 'parcelId'], '']);
                });

                map.on('click', 'parcels-fill', function(e) {
                    // Check if a building point is near the click - buildings take priority
                    // Use a bounding box (15px) to match the building circle size (10px radius + stroke)
                    var bbox = [
                        [e.point.x - 15, e.point.y - 15],
                        [e.point.x + 15, e.point.y + 15]
                    ];
                    var buildingFeatures = map.queryRenderedFeatures(bbox, { layers: ['portfolio-points'] });
                    if (buildingFeatures.length > 0) {
                        return; // Let the building click handler handle it
                    }
                    var props = e.features[0].properties;
                    selectParcel(props.parcelId);
                });
            }

            // Click on map (not on a point or parcel) to deselect or identify Swisstopo features
            map.on('click', function(e) {
                var pointFeatures = map.queryRenderedFeatures(e.point, { layers: ['portfolio-points'] });
                var parcelFeatures = parcelData && parcelData.features ? map.queryRenderedFeatures(e.point, { layers: ['parcels-fill'] }) : [];
                if (pointFeatures.length === 0 && parcelFeatures.length === 0) {
                    selectedBuildingId = null;
                    selectedParcelId = null;
                    updateSelectedBuilding();
                    updateSelectedParcel();
                    updateUrlWithSelection();
                    document.getElementById('info-panel').classList.remove('show');

                    // Try to identify features from active Swisstopo layers
                    if (activeSwisstopoLayers.length > 0) {
                        identifySwisstopoFeatures(e.lngLat);
                    }
                } else {
                    // Clear any Swisstopo highlight when selecting a portfolio feature
                    clearIdentifyHighlight();
                }
            });

            // Apply initial filters to map if any
            if (filteredData && getActiveFilterCount() > 0) {
                updateMapFilter();
            }

            // Select building or parcel from URL parameter if present
            var urlBuildingId = urlParams.get('id');
            var urlParcelId = urlParams.get('parcelId');
            if (urlBuildingId) {
                var building = portfolioData.features.find(function(f) {
                    return f.properties.buildingId === urlBuildingId;
                });
                if (building) {
                    selectBuilding(urlBuildingId, true);
                }
            } else if (urlParcelId && parcelData && parcelData.features) {
                var parcel = parcelData.features.find(function(f) {
                    return f.properties.parcelId === urlParcelId;
                });
                if (parcel) {
                    selectParcel(urlParcelId, true);
                }
            }

            // Initialize highlight layer for Swisstopo feature identification
            initIdentifyHighlightLayer();

            // Load background layers from URL parameters
            loadLayersFromUrl();
        }

        // Reusable function to select a building
        // flyToBuilding: if true, map will fly to the building location
        function selectBuilding(buildingId, flyToBuilding) {
            // ES5 default parameter
            if (flyToBuilding === undefined) flyToBuilding = false;

            // Find feature props
            var building = portfolioData.features.find(function(f) { return f.properties.buildingId === buildingId; });
            if (!building) return;

            var props = building.properties;
            var ext = props.extensionData || {};
            var flaeche = Number(ext.netFloorArea || 0).toLocaleString('de-CH');
            var baujahr = extractYear(props.constructionYear) || '—';
            var statusClass = props.status === 'In Betrieb' ? 'status-active' :
                              props.status === 'In Renovation' ? 'status-renovation' :
                              props.status === 'In Planung' ? 'status-planning' : 'status-inactive';

            // Update selected IDs (clear parcel selection)
            selectedBuildingId = buildingId;
            selectedParcelId = null;
            updateSelectedBuilding();
            updateSelectedParcel();
            updateUrlWithSelection();

            // Update header title
            document.getElementById('info-header-title').textContent = 'Gebäude';

            // Show preview image for buildings (a class, so the stylesheet can still hide it on short
            // viewports and on phones — an inline display would override those rules)
            document.getElementById('info-panel').classList.add('has-preview');

            // Find building index for placeholder image
            var buildingIndex = portfolioData.features.findIndex(function(f) {
                return f.properties.buildingId === buildingId;
            });
            var imageUrl = placeholderImages[buildingIndex % placeholderImages.length];

            // Set preview image
            document.getElementById('info-preview-image').style.backgroundImage = 'url(' + imageUrl + ')';

            var infoHtml =
                '<div class="info-row"><span class="info-label">Objekt-ID</span><span class="info-value">' + props.buildingId + '</span></div>' +
                '<div class="info-row"><span class="info-label">Name</span><span class="info-value">' + props.name + '</span></div>' +
                '<div class="info-row"><span class="info-label">Ort</span><span class="info-value">' + props.city + ', ' + props.country + '</span></div>' +
                '<div class="info-row info-row-secondary"><span class="info-label">Adresse</span><span class="info-value">' + props.streetName + '</span></div>' +
                '<div class="info-row info-row-secondary"><span class="info-label">Fläche NGF</span><span class="info-value">' + flaeche + ' m²</span></div>' +
                '<div class="info-row info-row-secondary"><span class="info-label">Baujahr</span><span class="info-value">' + baujahr + '</span></div>' +
                '<div class="info-row info-row-secondary"><span class="info-label">Verantwortlich</span><span class="info-value">' + (ext.responsiblePerson || '—') + '</span></div>' +
                '<div class="info-row"><span class="info-label">Status</span><span class="info-value"><span class="status-badge ' + statusClass + '">' + props.status + '</span></span></div>' +
                '<div class="info-footer">' +
                    '<button class="info-detail-link" onclick="showDetailView(\'' + props.buildingId + '\')">' +
                        '<span class="material-symbols-outlined">open_in_new</span>' +
                        'Details anzeigen' +
                    '</button>' +
                '</div>';

            document.getElementById('info-body').innerHTML = infoHtml;
            document.getElementById('info-panel').classList.add('show');

            // UPDATED: Only fly to building if explicitly requested (e.g. from Search)
            if (map && flyToBuilding) {
                map.flyTo({
                    center: building.geometry.coordinates,
                    zoom: 16,
                    offset: getInfoPanelOffset() // keep the object out from under the mobile sheet
                });
            } else if (map) {
                revealSelectionOnMobile(building.geometry.coordinates);
            }
        }
        
        function updateSelectedBuilding() {
            if (map && map.getLayer('portfolio-selected')) {
                map.setFilter('portfolio-selected', ['==', ['get', 'buildingId'], selectedBuildingId || '']);
            }
            if (map && map.getLayer('portfolio-selected-pulse')) {
                map.setFilter('portfolio-selected-pulse', ['==', ['get', 'buildingId'], selectedBuildingId || '']);
            }
            // Start or stop pulse animation based on selection
            if (selectedBuildingId && typeof window.startPulseAnimation === 'function') {
                window.startPulseAnimation();
            } else if (typeof window.stopPulseAnimation === 'function') {
                window.stopPulseAnimation();
            }
        }

        function updateUrlWithSelection() {
            var url = new URL(window.location);
            if (selectedBuildingId) {
                url.searchParams.set('id', selectedBuildingId);
            } else {
                url.searchParams.delete('id');
            }
            if (selectedParcelId) {
                url.searchParams.set('parcelId', selectedParcelId);
            } else {
                url.searchParams.delete('parcelId');
            }
            window.history.replaceState({}, '', url);
        }

        function updateUrlWithLayers() {
            var url = new URL(window.location);
            if (activeSwisstopoLayers.length > 0) {
                var layerIds = activeSwisstopoLayers.map(function(l) { return l.id; });
                url.searchParams.set('bgLayers', layerIds.join(','));
            } else {
                url.searchParams.delete('bgLayers');
            }
            // Geokatalog topic ("Thema wechseln"); the default topic needs no parameter
            if (currentTopic !== DEFAULT_TOPIC) {
                url.searchParams.set('topic', currentTopic);
            } else {
                url.searchParams.delete('topic');
            }
            window.history.replaceState({}, '', url);
        }

        function loadLayersFromUrl() {
            var urlParams = new URLSearchParams(window.location.search);

            // Geokatalog topic ("Thema wechseln"); the catalog itself loads when the accordion opens
            var topic = urlParams.get('topic');
            if (topic && isValidTopicId(topic) && topic !== currentTopic) {
                currentTopic = topic;
                geokatalogLoaded = false;
                updateTopicHeader();
            }

            var bgLayers = urlParams.get('bgLayers');
            if (bgLayers) {
                var layerIds = bgLayers.split(',');
                // Limit to max 10 layers from URL to prevent abuse
                var maxLayers = Math.min(layerIds.length, 10);
                for (var i = 0; i < maxLayers; i++) {
                    var layerId = layerIds[i].trim();
                    if (layerId) {
                        // Pass silent=true to suppress toasts when loading from URL
                        // Layer ID validation happens inside addSwisstopoLayer
                        addSwisstopoLayer(layerId, layerId, true);
                    }
                }
            }
        }

        // ===== PARCEL SELECTION FUNCTIONALITY =====

        // Helper function to calculate polygon centroid
        function getPolygonCentroid(coordinates) {
            var ring = coordinates[0]; // outer ring
            var x = 0, y = 0, n = ring.length - 1; // exclude closing point
            for (var i = 0; i < n; i++) {
                x += ring[i][0];
                y += ring[i][1];
            }
            return [x / n, y / n];
        }

        function selectParcel(parcelId, flyToParcel) {
            // ES5 default parameter
            if (flyToParcel === undefined) flyToParcel = false;

            // Find parcel feature
            var parcel = parcelData.features.find(function(f) { return f.properties.parcelId === parcelId; });
            if (!parcel) return;

            var props = parcel.properties;

            // Format area with thousand separators
            var formattedArea = Number(props.area || 0).toLocaleString('de-CH');

            // Update selected IDs (clear building selection)
            selectedParcelId = parcelId;
            selectedBuildingId = null;
            updateSelectedBuilding();
            updateSelectedParcel();
            updateUrlWithSelection();

            // Update header title
            document.getElementById('info-header-title').textContent = 'Parzelle';

            // Hide preview image for parcels
            document.getElementById('info-panel').classList.remove('has-preview');

            // Build info panel HTML content
            var infoHtml =
                '<div class="info-row"><span class="info-label">Parzellen-ID</span><span class="info-value">' + escapeHtml(props.parcelId || '—') + '</span></div>' +
                '<div class="info-row"><span class="info-label">Name</span><span class="info-value">' + escapeHtml(props.name || '—') + '</span></div>' +
                '<div class="info-row"><span class="info-label">Ort</span><span class="info-value">' + escapeHtml(props.municipality || '—') + ', ' + escapeHtml(props.canton || '—') + '</span></div>' +
                '<div class="info-row info-row-secondary"><span class="info-label">Parzellen-Nr.</span><span class="info-value">' + escapeHtml(props.plotNumber || '—') + '</span></div>' +
                '<div class="info-row info-row-secondary"><span class="info-label">Fläche</span><span class="info-value">' + formattedArea + ' m²</span></div>' +
                '<div class="info-row info-row-secondary"><span class="info-label">Nutzungszone</span><span class="info-value">' + escapeHtml(props.landUseZone || '—') + '</span></div>' +
                '<div class="info-row info-row-secondary"><span class="info-label">Eigentum</span><span class="info-value">' + escapeHtml(props.ownershipType || '—') + '</span></div>';

            document.getElementById('info-body').innerHTML = infoHtml;
            document.getElementById('info-panel').classList.add('show');

            // Fly to parcel if requested; otherwise make sure it is not hidden under the mobile sheet
            if (map && parcel.geometry && parcel.geometry.coordinates) {
                var center = getPolygonCentroid(parcel.geometry.coordinates);
                if (flyToParcel) {
                    map.flyTo({
                        center: center,
                        zoom: 16,
                        offset: getInfoPanelOffset()
                    });
                } else {
                    revealSelectionOnMobile(center);
                }
            }
        }

        function updateSelectedParcel() {
            if (map && map.getLayer('parcels-highlight')) {
                map.setFilter('parcels-highlight', ['==', ['get', 'parcelId'], selectedParcelId || '']);
            }
        }

        // ===== SEARCH FUNCTIONALITY =====
        var searchInput = document.getElementById('search-input');
        var searchResults = document.getElementById('search-results');
        var searchSpinner = document.getElementById('search-spinner');
        var searchClearBtn = document.getElementById('search-clear-btn');
        var searchDebounceTimer;
        var searchAbortController = null;

        // The long placeholder is cut to "Suche nach Objekten, O" in a ~200px field: shorter hint on phones
        var searchPlaceholderLong = searchInput.getAttribute('placeholder');
        function updateSearchPlaceholder() {
            searchInput.setAttribute('placeholder', isMobileLayout() ? 'Objekt, Ort oder Karte' : searchPlaceholderLong);
        }
        updateSearchPlaceholder();
        window.addEventListener('resize', updateSearchPlaceholder);
        
        // Listen for input
        searchInput.addEventListener('input', function(e) {
            clearTimeout(searchDebounceTimer);
            var val = e.target.value.trim();
            
            // Toggle clear button visibility
            if (val.length > 0) {
                searchClearBtn.classList.add('visible');
            } else {
                searchClearBtn.classList.remove('visible');
            }
            
            if (val.length < 2) {
                searchResults.classList.remove('active');
                searchSpinner.style.display = 'none';
                return;
            }
            
            searchSpinner.style.display = 'block';
            searchDebounceTimer = setTimeout(function() {
                performSearch(val);
            }, 300);
        });

        // Enter: answer the KI suggestion if there is one, otherwise open the first result
        searchInput.addEventListener('keydown', function(e) {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            if (!searchResults.classList.contains('active')) return;
            if (document.getElementById('search-ai-item')) {
                showAiAnswer();
                return;
            }
            var first = searchResults.querySelector('.search-item[onclick]');
            if (first) first.click();
        });

        // Scope menu inside the search box ("Alle ▾" opens checkboxes Fragen / Objekte / Orte / Karten).
        // Several sources can be combined; with every box (or none) ticked the label reads "Alle".
        var searchScopeBtn = document.getElementById('search-scope-btn');
        var searchScopeMenu = document.getElementById('search-scope-menu');
        var searchScopeLabel = document.getElementById('search-scope-label');
        var searchScopeBoxes = searchScopeMenu ? Array.prototype.slice.call(searchScopeMenu.querySelectorAll('input[type="checkbox"]')) : [];
        var searchScopes = [];   // empty = all sources

        function updateSearchScope() {
            var checked = searchScopeBoxes.filter(function(cb) { return cb.checked; });
            searchScopes = (checked.length === 0 || checked.length === searchScopeBoxes.length)
                ? [] : checked.map(function(cb) { return cb.value; });
            if (searchScopeLabel) {
                var names = checked.map(function(cb) { return cb.parentNode.textContent.trim(); });
                searchScopeLabel.textContent = searchScopes.length === 0 ? 'Alle'
                    : (names.length === 1 ? names[0] : names.length + ' Bereiche');
            }
            if (searchScopeBtn) searchScopeBtn.classList.toggle('active', searchScopes.length > 0);
        }

        function setSearchScopeMenuOpen(open) {
            if (!searchScopeMenu || !searchScopeBtn) return;
            searchScopeMenu.hidden = !open;
            searchScopeBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
        }

        if (searchScopeBtn && searchScopeMenu) {
            searchScopeBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                setSearchScopeMenuOpen(searchScopeMenu.hidden);
            });
            searchScopeMenu.addEventListener('change', function() {
                updateSearchScope();
                var val = searchInput.value.trim();
                if (val.length >= 2) {
                    searchSpinner.style.display = 'block';
                    performSearch(val);
                }
            });
            document.addEventListener('click', function(e) {
                if (!searchScopeMenu.hidden && !searchScopeBtn.contains(e.target) && !searchScopeMenu.contains(e.target)) {
                    setSearchScopeMenuOpen(false);
                }
            });
            document.addEventListener('keydown', function(e) {
                if (e.key === 'Escape' && !searchScopeMenu.hidden) {
                    setSearchScopeMenuOpen(false);
                    searchScopeBtn.focus();
                }
            });
            updateSearchScope();
        }

        // Clear Button Click Listener
        searchClearBtn.addEventListener('click', function() {
            searchInput.value = '';
            searchClearBtn.classList.remove('visible');
            searchResults.classList.remove('active');
            searchInput.focus();
            
            // Remove the search marker if it exists
            if (searchMarker) {
                searchMarker.remove();
                searchMarker = null;
            }
        });
        
        // Close search on click outside
        document.addEventListener('click', function(e) {
            if (!document.getElementById('search-wrapper').contains(e.target)) {
                searchResults.classList.remove('active');
            }
        });

        // Close search on Escape
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') {
                searchResults.classList.remove('active');
            }
        });
        
        // Wrap the matched term in <b> (escaped text; Swisstopo labels arrive with their own <b> tags)
        function highlightMatch(text, term) {
            var safe = escapeHtml(text || '');
            if (!term) return safe;
            var pattern = escapeHtml(term).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            return safe.replace(new RegExp('(' + pattern + ')', 'ig'), '<b>$1</b>');
        }

        function scopeAllows(section) {
            return searchScopes.length === 0 || searchScopes.indexOf(section) !== -1;
        }

        function performSearch(term) {
            // Cancel any pending search requests
            if (searchAbortController) {
                searchAbortController.abort();
            }
            searchAbortController = new AbortController();
            var signal = searchAbortController.signal;
            var lowerTerm = term.toLowerCase();

            var promises = [];

            // 1. Local search: buildings and parcels
            promises.push(new Promise(function(resolve) {
                var buildings = [];
                var parcels = [];
                if (scopeAllows('objects') || scopeAllows('ask')) {
                    if (portfolioData) {
                        buildings = portfolioData.features.filter(function(f) {
                            var p = f.properties;
                            return [p.name, p.streetName, p.city, p.buildingId].some(function(v) {
                                return v && String(v).toLowerCase().includes(lowerTerm);
                            });
                        });
                    }
                    if (parcelData && parcelData.features) {
                        parcels = parcelData.features.filter(function(f) {
                            var p = f.properties;
                            return [p.name, p.parcelId, p.municipality, p.plotNumber].some(function(v) {
                                return v && String(v).toLowerCase().includes(lowerTerm);
                            });
                        });
                    }
                }
                resolve({ type: 'local', data: buildings, parcels: parcels });
            }));

            // 2. Swisstopo Locations
            if (scopeAllows('places')) {
                promises.push(fetch('https://api3.geo.admin.ch/rest/services/ech/SearchServer?type=locations&limit=5&sr=4326&searchText=' + encodeURIComponent(term), { signal: signal })
                    .then(function(r) { return r.json(); })
                    .then(function(data) { return { type: 'locations', data: data.results }; })
                    .catch(function(e) {
                        if (e.name === 'AbortError') return { type: 'locations', data: [], aborted: true };
                        return { type: 'locations', data: [] };
                    }));
            } else {
                promises.push(Promise.resolve({ type: 'locations', data: [] }));
            }

            // 3. Swisstopo Layers
            if (scopeAllows('maps')) {
                promises.push(fetch('https://api3.geo.admin.ch/rest/services/ech/SearchServer?type=layers&limit=5&lang=de&searchText=' + encodeURIComponent(term), { signal: signal })
                    .then(function(r) { return r.json(); })
                    .then(function(data) { return { type: 'layers', data: data.results }; })
                    .catch(function(e) {
                        if (e.name === 'AbortError') return { type: 'layers', data: [], aborted: true };
                        return { type: 'layers', data: [] };
                    }));
            } else {
                promises.push(Promise.resolve({ type: 'layers', data: [] }));
            }

            Promise.all(promises).then(function(results) {
                // Don't render if request was aborted (newer search in progress)
                var wasAborted = results.some(function(r) { return r.aborted; });
                if (wasAborted) return;

                renderSearchResults(results, term);
                searchSpinner.style.display = 'none';
            });
        }

        var currentAiSuggestion = null;

        function renderSearchResults(results, term) {
            var local = results.find(function(r) { return r.type === 'local'; });
            var localResults = local.data;
            var parcelResults = local.parcels || [];
            var locResults = results.find(function(r) { return r.type === 'locations'; }).data;
            var layerResults = results.find(function(r) { return r.type === 'layers'; }).data;

            var html = '';
            var sectionHeader = function(title, source) {
                return '<div class="search-section-header"><span>' + title + '</span>' +
                    (source ? '<span class="search-section-source">' + source + '</span>' : '') + '</div>';
            };
            var icon = function(name) {
                return '<span class="material-symbols-outlined search-item-icon" aria-hidden="true">' + name + '</span>';
            };

            // Section: Frage stellen (KI) — one suggested question, answered inline from the loaded data
            currentAiSuggestion = scopeAllows('ask') ? suggestAiQuestion(term, localResults) : null;
            if (currentAiSuggestion) {
                html += sectionHeader('Frage stellen', 'KI') +
                    '<div class="search-item search-item--ask" id="search-ai-item" role="option" tabindex="0" aria-expanded="false">' +
                        icon('auto_awesome') +
                        '<span class="search-item-main"><span class="search-item-title">' + currentAiSuggestion.questionHtml + '</span></span>' +
                        '<span class="search-item-meta"><span class="material-symbols-outlined" aria-hidden="true">keyboard_return</span>Antwort</span>' +
                    '</div>' +
                    '<div class="search-answer" id="search-ai-answer" hidden aria-live="polite"></div>';
            }

            // Section: Objekte (buildings and parcels, local)
            if (scopeAllows('objects') && (localResults.length > 0 || parcelResults.length > 0)) {
                html += sectionHeader('Objekte', '');
                localResults.forEach(function(f) {
                    var p = f.properties;
                    html += '<div class="search-item" role="option" onclick="handleSearchClick(\'local\', \'' + escapeForJs(p.buildingId) + '\')">' +
                        icon('apartment') +
                        '<span class="search-item-main">' +
                            '<span class="search-item-title">' + highlightMatch(p.name, term) + '</span>' +
                            '<span class="search-item-subtitle">' + escapeHtml((p.streetName || '') + ', ' + (p.city || '')) + '</span>' +
                        '</span>' +
                        '<span class="search-item-meta">Gebäude · ' + escapeHtml((p.city || '') + ' ' + (p.country || '')) + ' · ' + escapeHtml(p.buildingId) + '</span>' +
                    '</div>';
                });
                parcelResults.forEach(function(f) {
                    var p = f.properties;
                    html += '<div class="search-item" role="option" onclick="handleSearchClick(\'parcel\', \'' + escapeForJs(p.parcelId) + '\')">' +
                        icon('crop_square') +
                        '<span class="search-item-main">' +
                            '<span class="search-item-title">' + highlightMatch(p.name || p.parcelId, term) + '</span>' +
                            '<span class="search-item-subtitle">' + escapeHtml((p.municipality || '') + (p.canton ? ', ' + p.canton : '')) + '</span>' +
                        '</span>' +
                        '<span class="search-item-meta">Parzelle · ' + escapeHtml(p.municipality || '') + (p.plotNumber ? ' · Nr. ' + escapeHtml(p.plotNumber) : '') + '</span>' +
                    '</div>';
                });
            }

            // Section: Orte (Swisstopo)
            if (locResults.length > 0) {
                html += sectionHeader('Ort', 'swisstopo');
                locResults.forEach(function(r) {
                    var lat = r.attrs.lat;
                    var lon = r.attrs.lon;
                    var zoom = r.attrs.zoomlevel || 14;
                    html += '<div class="search-item" role="option" onclick="handleSearchClick(\'location\', null, ' + lat + ', ' + lon + ', ' + zoom + ')">' +
                        icon('location_on') +
                        '<span class="search-item-main"><span class="search-item-title">' + r.attrs.label + '</span></span>' +
                        '<span class="search-item-meta">Ort</span>' +
                    '</div>';
                });
            }

            // Section: Karten (Swisstopo Geokatalog) — row click adds the layer, the info button at the
            // right opens the same layer info modal as in the "Dargestellte Karten" accordion
            if (layerResults.length > 0) {
                html += sectionHeader('Karten', 'Geokatalog');
                layerResults.forEach(function(r) {
                    var layerId = r.attrs.layer || '';
                    var layerTitle = r.attrs.title || r.attrs.label || layerId;
                    html += '<div class="search-item" role="option" onclick="handleSearchClick(\'layer\', \'' + escapeForJs(layerId) + '\', null, null, null, \'' + escapeForJs(layerTitle) + '\')">' +
                        icon('map') +
                        '<span class="search-item-main"><span class="search-item-title">' + r.attrs.label + '</span></span>' +
                        '<span class="search-item-action">+ Als Ebene</span>' +
                        '<button type="button" class="search-item-info" onclick="event.stopPropagation(); showLayerInfo(\'' + escapeForJs(layerId) + '\')" title="Layer-Informationen" aria-label="Layer-Informationen">' +
                            '<span class="material-symbols-outlined" aria-hidden="true">info</span>' +
                        '</button>' +
                    '</div>';
                });
            }

            if (html === '') {
                html = '<div class="search-item search-item--empty"><span class="search-item-subtitle">Keine Resultate gefunden</span></div>';
            }

            searchResults.innerHTML = html;
            searchResults.classList.add('active');

            var aiItem = document.getElementById('search-ai-item');
            if (aiItem) {
                aiItem.addEventListener('click', showAiAnswer);
                aiItem.addEventListener('keydown', function(e) {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        showAiAnswer();
                    }
                });
            }
        }

        // Reveal the answer below the suggested question; chips in the answer select the object on the map
        function showAiAnswer() {
            var answerEl = document.getElementById('search-ai-answer');
            var item = document.getElementById('search-ai-item');
            if (!answerEl || !currentAiSuggestion) return;
            answerEl.innerHTML = currentAiSuggestion.answerHtml +
                '<span class="search-answer-note">Prototyp: Antwort aus den geladenen Daten, kein Sprachmodell.</span>';
            answerEl.hidden = false;
            if (item) item.setAttribute('aria-expanded', 'true');
            answerEl.querySelectorAll('[data-building]').forEach(function(link) {
                link.addEventListener('click', function(e) {
                    e.preventDefault();
                    handleSearchClick('local', this.dataset.building);
                });
            });
        }

        // ===== KI: MOCK ANSWERS IN THE SEARCH SUGGESTIONS =====
        // Prototype only. A handful of question templates are answered from the loaded portfolio data —
        // no model, no network. The point is the interaction (question among the suggestions, answer
        // inline) before a real assistant is wired in. Replaces the former KI side panel.
        function formatSquareMetres(value) {
            return Number(value || 0).toLocaleString('de-CH') + ' m²';
        }

        function buildingArea(f) {
            return Number(((f.properties || {}).extensionData || {}).netFloorArea || 0);
        }

        function buildingChip(f) {
            var p = f.properties;
            return '<a href="#" class="search-answer-link" data-building="' + escapeHtml(p.buildingId) + '">' +
                '<span class="material-symbols-outlined" aria-hidden="true">apartment</span>' + escapeHtml(p.name) + '</a>';
        }

        function buildingChips(features) {
            return '<span class="search-answer-links">' + features.map(buildingChip).join('') + '</span>';
        }

        function joinNames(features) {
            return features.map(function(f) { return '«' + escapeHtml(f.properties.name) + '»'; }).join(', ');
        }

        function suggestAiQuestion(term, localMatches) {
            if (!portfolioData || !portfolioData.features.length) return null;
            var features = portfolioData.features;
            var t = term.toLowerCase().trim();
            var question = function(text) { return highlightMatch(text, term); };
            var isQuestion = /\?$/.test(t) || /^(wie|welche|welches|was|wo|gibt)\b/.test(t);

            function byStatus(status, label) {
                var hits = features.filter(function(f) { return f.properties.status === status; });
                return {
                    questionHtml: question('Welche Objekte sind ' + label + '?'),
                    answerHtml: hits.length
                        ? '<b>' + hits.length + (hits.length === 1 ? ' Objekt ist' : ' Objekte sind') + '</b> ' + label + ': ' + joinNames(hits) + '.' + buildingChips(hits)
                        : 'Zurzeit ist kein Objekt ' + label + '.'
                };
            }

            // Keyword intents first
            if (/renov|sanier/.test(t)) return byStatus('In Renovation', 'in Renovation');
            if (/planung|geplant/.test(t)) return byStatus('In Planung', 'in Planung');
            if (/ausser betrieb|stillgelegt/.test(t)) return byStatus('Ausser Betrieb', 'ausser Betrieb');

            if (/gesamt|total|summe|portfolio|alle objekte|geschossfl|fläche|flaeche/.test(t) && !localMatches.length) {
                var total = features.reduce(function(sum, f) { return sum + buildingArea(f); }, 0);
                var largest = features.slice().sort(function(a, b) { return buildingArea(b) - buildingArea(a); })[0];
                return {
                    questionHtml: question('Wie gross ist die gesamte Nettogeschossfläche des Portfolios?'),
                    answerHtml: 'Das Portfolio umfasst <b>' + features.length + ' Objekte</b> mit total <b>' + formatSquareMetres(total) +
                        '</b> Nettogeschossfläche. Das grösste Objekt ist «' + escapeHtml(largest.properties.name) + '» mit ' +
                        formatSquareMetres(buildingArea(largest)) + '.' + buildingChips([largest])
                };
            }

            if (/ältest|älteste|baujahr/.test(t)) {
                var dated = features.filter(function(f) { return extractYear(f.properties.constructionYear); })
                    .sort(function(a, b) { return extractYear(a.properties.constructionYear) - extractYear(b.properties.constructionYear); });
                if (dated.length) {
                    var oldest = dated[0].properties;
                    return {
                        questionHtml: question('Welches ist das älteste Objekt im Portfolio?'),
                        answerHtml: 'Das älteste Objekt ist «' + escapeHtml(oldest.name) + '» in ' + escapeHtml(oldest.city) +
                            ' mit Baujahr <b>' + extractYear(oldest.constructionYear) + '</b>.' + buildingChips([dated[0]])
                    };
                }
            }

            // The term is part of a building name → its floor area
            // (a match on the city or street only is handled as a place question below)
            var nameMatches = localMatches.filter(function(f) {
                return (f.properties.name || '').toLowerCase().includes(t);
            });
            if (nameMatches.length) {
                var f = nameMatches[0];
                var p = f.properties;
                var year = extractYear(p.constructionYear) || '—';
                return {
                    questionHtml: question('Wie gross ist die Nettogeschossfläche von «' + p.name + '»?'),
                    answerHtml: '«' + escapeHtml(p.name) + '» (' + escapeHtml((p.city || '') + ', ' + (p.country || '')) +
                        ') hat eine Nettogeschossfläche von <b>' + formatSquareMetres(buildingArea(f)) + '</b>. Baujahr ' + year +
                        ', Status «' + escapeHtml(p.status || '—') + '».' + buildingChips([f])
                };
            }

            // A place (city, region or country) matches → objects there
            var place = null;
            features.some(function(f) {
                var p = f.properties;
                place = [p.city, p.stateProvincePrefecture, p.country].find(function(v) {
                    return v && String(v).toLowerCase().includes(t);
                }) || null;
                return !!place;
            });
            if (place) {
                var inPlace = features.filter(function(f) {
                    var p = f.properties;
                    return p.city === place || p.stateProvincePrefecture === place || p.country === place;
                });
                var area = inPlace.reduce(function(sum, f) { return sum + buildingArea(f); }, 0);
                return {
                    questionHtml: question('Wie viele Objekte gibt es in ' + place + '?'),
                    answerHtml: 'In ' + escapeHtml(place) + ' gibt es <b>' + inPlace.length + (inPlace.length === 1 ? ' Objekt' : ' Objekte') +
                        '</b> mit total ' + formatSquareMetres(area) + ' Nettogeschossfläche: ' + joinNames(inPlace) + '.' + buildingChips(inPlace)
                };
            }

            // Street matched a building → its floor area
            if (localMatches.length) {
                var byStreet = localMatches[0];
                var bp = byStreet.properties;
                return {
                    questionHtml: question('Wie gross ist die Nettogeschossfläche von «' + bp.name + '»?'),
                    answerHtml: '«' + escapeHtml(bp.name) + '» (' + escapeHtml((bp.city || '') + ', ' + (bp.country || '')) +
                        ') hat eine Nettogeschossfläche von <b>' + formatSquareMetres(buildingArea(byStreet)) + '</b>. Baujahr ' +
                        (extractYear(bp.constructionYear) || '—') + ', Status «' + escapeHtml(bp.status || '—') + '».' + buildingChips([byStreet])
                };
            }

            // Looks like a question, but nothing matched
            if (isQuestion) {
                return {
                    questionHtml: escapeHtml(term),
                    answerHtml: 'Diese Frage kann der Prototyp noch nicht beantworten. Beispiele, die funktionieren: ' +
                        '«Wie viele Objekte gibt es in Bern?», «Welche Objekte sind in Renovation?», «Wie gross ist die gesamte Nettogeschossfläche?».'
                };
            }
            return null;
        }

        // Make this function global so onclick in HTML string works
        window.handleSearchClick = function(type, id, lat, lon, zoom, title) {
            searchResults.classList.remove('active');

            if (currentView !== 'map') {
                switchView('map');
            }

            if (type === 'local') {
                // Pass true to fly to the building when searching
                selectBuilding(id, true);

                // Remove generic search marker if we select a specific building
                if (searchMarker) {
                    searchMarker.remove();
                    searchMarker = null;
                }

                var b = portfolioData.features.find(f => f.properties.buildingId === id);
                if(b) {
                    searchInput.value = b.properties.name;
                    searchClearBtn.classList.add('visible');
                }

            } else if (type === 'parcel') {
                if (searchMarker) {
                    searchMarker.remove();
                    searchMarker = null;
                }
                selectParcel(id, true);
                var parcel = parcelData && parcelData.features.find(function(f) { return f.properties.parcelId === id; });
                if (parcel) {
                    searchInput.value = parcel.properties.name || id;
                    searchClearBtn.classList.add('visible');
                }

            } else if (type === 'location') {
                // 1. Remove existing marker
                if (searchMarker) {
                    searchMarker.remove();
                }

                // 2. Fly to location
                map.flyTo({
                    center: [lon, lat],
                    zoom: zoom
                });

                // 3. Add Red Marker
                searchMarker = new maplibregl.Marker({ color: '#c00' })
                    .setLngLat([lon, lat])
                    .addTo(map);

                // Clear selected building info panel
                selectedBuildingId = null;
                updateSelectedBuilding();
                updateUrlWithSelection();
                document.getElementById('info-panel').classList.remove('show');

                searchClearBtn.classList.add('visible');

            } else if (type === 'layer') {
                addSwisstopoLayer(id, title);
            }
        };

        // ===== ACCORDION =====
        var geokatalogAccordion = document.getElementById('geokatalog-accordion');

        document.querySelectorAll('.accordion-header').forEach(function(header) {
            header.addEventListener('click', function() {
                var content = this.nextElementSibling;
                var isActive = this.classList.contains('active');
                var isGeokatalog = this.parentElement.id === 'geokatalog-accordion';

                document.querySelectorAll('.accordion-header').forEach(function(h) { h.classList.remove('active'); });
                document.querySelectorAll('.accordion-content').forEach(function(c) { c.classList.remove('show'); });
                geokatalogAccordion.classList.remove('expanded');

                // Hide print preview when any accordion closes
                hidePrintPreview();

                if (!isActive) {
                    this.classList.add('active');
                    content.classList.add('show');

                    // Update share link when Teilen accordion is opened
                    var headerSpans = this.querySelectorAll(':scope > span');
                    var lastSpan = headerSpans[headerSpans.length - 1];
                    if (lastSpan && lastSpan.textContent.trim() === 'Teilen') {
                        updateShareLink();
                    }

                    // Show print preview when Drucken accordion is opened
                    if (lastSpan && lastSpan.textContent.trim() === 'Drucken') {
                        showPrintPreview();
                    }

                    // Update export count when Export accordion is opened
                    if (lastSpan && lastSpan.textContent.trim() === 'Export') {
                        updateExportCount();
                    }

                    // Expand Geokatalog to full height
                    if (isGeokatalog) {
                        geokatalogAccordion.classList.add('expanded');
                        loadGeokatalog();
                    }
                }

                updateMenuTogglePositionDebounced();
            });
        });

        // Print orientation change - update preview
        var printOrientationSelect = document.getElementById('print-orientation');
        if (printOrientationSelect) {
            printOrientationSelect.addEventListener('change', updatePrintPreview);
        }

        // Update print preview on window resize
        window.addEventListener('resize', function() {
            if (printPreviewOverlay && printPreviewOverlay.classList.contains('active')) {
                updatePrintPreview();
            }
        });

        // ===== LAYER INFO MODAL =====
        var layerInfoModal = document.getElementById('layer-info-modal');
        var layerInfoContent = document.getElementById('layer-info-content');
        var layerInfoCloseBtn = layerInfoModal ? layerInfoModal.querySelector('.layer-info-modal-close') : null;

        function showLayerInfo(layerId) {
            if (!layerInfoModal || !layerInfoContent || !layerId) return;

            // Show modal with loading state
            layerInfoContent.innerHTML = '<div class="layer-info-loading">Lade Informationen...</div>';
            layerInfoModal.classList.add('show');

            // Fetch layer legend/info
            fetch('https://api3.geo.admin.ch/rest/services/api/MapServer/' + layerId + '/legend?lang=de')
                .then(function(response) {
                    if (!response.ok) throw new Error('Layer-Informationen nicht verfügbar');
                    return response.text();
                })
                .then(function(html) {
                    layerInfoContent.innerHTML = html;
                })
                .catch(function(error) {
                    console.error('Fehler beim Laden der Layer-Informationen:', error);
                    layerInfoContent.innerHTML = '<div class="layer-info-loading">Informationen konnten nicht geladen werden.</div>';
                });
        }

        function hideLayerInfo() {
            if (layerInfoModal) {
                layerInfoModal.classList.remove('show');
            }
        }

        // Close modal on button click
        if (layerInfoCloseBtn) {
            layerInfoCloseBtn.addEventListener('click', hideLayerInfo);
        }

        // Close modal on backdrop click
        if (layerInfoModal) {
            layerInfoModal.addEventListener('click', function(e) {
                if (e.target === layerInfoModal) {
                    hideLayerInfo();
                }
            });
        }

        // Close modal on Escape key
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape' && layerInfoModal && layerInfoModal.classList.contains('show')) {
                hideLayerInfo();
            }
        });

        // Make showLayerInfo globally accessible for onclick handlers
        window.showLayerInfo = showLayerInfo;

        // ===== INTERNAL LAYERS ("Interne Karten" in the Dargestellte Karten accordion) =====

        // Map layer ids that belong to each internal dataset (shown/hidden together)
        var internalLayerMapIds = {
            buildings: ['portfolio-points', 'portfolio-selected', 'portfolio-selected-pulse', 'portfolio-labels'],
            parcels: ['parcels-fill', 'parcels-outline', 'parcels-highlight']
        };

        function setInternalLayerVisibility(layerKey, visible) {
            var ids = internalLayerMapIds[layerKey];
            if (!ids || !map) return;
            var vis = visible ? 'visible' : 'none';
            ids.forEach(function(id) {
                if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', vis);
            });
        }

        // The checkboxes in the accordion are the single source of truth for visibility
        function applyInternalLayerVisibility() {
            Object.keys(internalLayerMapIds).forEach(function(layerKey) {
                var toggle = document.getElementById('layer-toggle-' + layerKey);
                setInternalLayerVisibility(layerKey, !toggle || toggle.checked);
            });
        }

        window.toggleInternalLayer = function(layerKey, visible) {
            setInternalLayerVisibility(layerKey, visible);
        };

        // Metadata shown in the layer info modal for the internal datasets
        var internalLayerMeta = {
            buildings: {
                title: 'Gebäude (Bundesamt für Bauten und Logistik BBL)',
                description: 'Interner Datensatz des BBL-Immobilienportfolios. Enthält sämtliche Gebäude mit Standort, Nutzungstyp, Eigentumsverhältnissen, Baujahr und weiteren Attributen.',
                source: 'BBL Immobilienportfolio',
                format: 'GeoJSON',
                geometryType: 'Point'
            },
            parcels: {
                title: 'Grundstücke (Bundesamt für Bauten und Logistik BBL)',
                description: 'Interner Datensatz der BBL-Parzellen. Enthält Grundstücksinformationen mit Flächenangaben, Nutzungszonen und Eigentumsverhältnissen.',
                source: 'BBL Parzellen',
                format: 'GeoJSON',
                geometryType: 'Polygon'
            }
        };

        function buildInternalLegendHTML(layerKey) {
            var items = '';
            if (layerKey === 'buildings') {
                // Same colours as the portfolio-points circle layer
                ['In Betrieb', 'In Renovation', 'In Planung', 'Ausser Betrieb'].forEach(function(status) {
                    items += '<div class="internal-legend-item">' +
                        '<span class="internal-legend-circle" style="background: ' + statusColors[status] + ';"></span>' +
                        '<span>' + escapeHtml(status) + '</span>' +
                    '</div>';
                });
            } else {
                // Parcels: single colour, same as the parcels-fill / parcels-outline layers
                items = '<div class="internal-legend-item">' +
                    '<span class="internal-legend-rect" style="background: rgba(25, 118, 210, 0.15); border: 2px solid #1976d2;"></span>' +
                    '<span>Parzelle</span>' +
                '</div>';
            }
            return '<div class="legend-footer"><span>Legende</span></div>' +
                '<div class="internal-legend">' + items + '</div>';
        }

        function showInternalLayerInfo(layerKey) {
            if (!layerInfoModal || !layerInfoContent) return;

            var meta = internalLayerMeta[layerKey];
            if (!meta) return;

            var datenstand = new Date().toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric' });

            layerInfoContent.innerHTML = '<div class="legend-container">' +
                '<div class="bod-title">' + escapeHtml(meta.title) + '</div>' +
                '<div class="legend-abstract">' + escapeHtml(meta.description) + '</div>' +
                buildInternalLegendHTML(layerKey) +
                '<div class="legend-footer"><span>Informationen</span></div>' +
                '<table>' +
                '<tr><td>Quelle</td><td>' + escapeHtml(meta.source) + '</td></tr>' +
                '<tr><td>Format</td><td>' + escapeHtml(meta.format) + ' (' + escapeHtml(meta.geometryType) + ')</td></tr>' +
                '<tr><td>Metadaten</td><td><span class="placeholder-link">Link zu Metadaten (Platzhalter)</span></td></tr>' +
                '<tr><td>Detailbeschreibung</td><td><span class="placeholder-link">Link zur Detailbeschreibung (Platzhalter)</span></td></tr>' +
                '<tr><td>Datenbezug</td><td><span class="placeholder-link">Link für Datenbezug (Platzhalter)</span></td></tr>' +
                '<tr><td>Thematisches Geoportal</td><td><span class="placeholder-link">Link zum Fachportal (Platzhalter)</span></td></tr>' +
                '<tr><td>Datenstand</td><td>' + datenstand + '</td></tr>' +
                '</table>' +
                '</div>';
            layerInfoModal.classList.add('show');
        }

        window.showInternalLayerInfo = showInternalLayerInfo;

        // ===== GEOKATALOG =====
        var geokatalogLoaded = false;

        // Sync Geokatalog checkboxes with active layers
        function updateGeokatalogCheckboxes() {
            var checkboxes = document.querySelectorAll('.node-checkbox[data-layer-id]');
            checkboxes.forEach(function(checkbox) {
                var layerId = checkbox.getAttribute('data-layer-id');
                var isActive = activeSwisstopoLayers.some(function(l) { return l.id === layerId; });
                checkbox.checked = isActive;
            });
        }

        var geokatalogRequestId = 0;

        function loadGeokatalog() {
            if (geokatalogLoaded) return;

            var treeContainer = document.getElementById('geokatalog-tree');
            var requestId = ++geokatalogRequestId;
            treeContainer.innerHTML = '<div class="geokatalog-loading">Lade Katalog...</div>';

            // Catalog of the current topic ("Thema wechseln"); "ech" is the complete Geokatalog
            fetch('https://api3.geo.admin.ch/rest/services/' + encodeURIComponent(currentTopic) + '/CatalogServer?lang=de')
                .then(function(response) {
                    if (!response.ok) throw new Error('API nicht erreichbar');
                    return response.json();
                })
                .then(function(data) {
                    if (requestId !== geokatalogRequestId) return;   // a newer topic was requested meanwhile
                    geokatalogLoaded = true;
                    treeContainer.innerHTML = '';

                    if (data.results && data.results.root && data.results.root.children) {
                        renderCatalogTree(data.results.root.children, treeContainer);
                    } else {
                        treeContainer.innerHTML = '<div class="geokatalog-error">Keine Daten verfügbar</div>';
                    }

                    updateMenuTogglePositionDebounced();
                })
                .catch(function(error) {
                    if (requestId !== geokatalogRequestId) return;
                    console.error('Geokatalog Fehler:', error);
                    treeContainer.innerHTML = '<div class="geokatalog-error">Fehler beim Laden des Katalogs</div>';
                });
        }

        // ===== THEMA WECHSELN (topics of map.geo.admin.ch) =====
        // The Geokatalog is one of ~30 topics of api3.geo.admin.ch; a topic groups the catalog layers by
        // federal office or theme. Names and the sprite (assets/topics.png) are borrowed from
        // geoadmin/web-mapviewer; the chosen topic is kept in the URL (?topic=...).
        var TOPIC_LABELS = {
            are: 'ARE', astra: 'ASTRA', bafu: 'BAFU', blw: 'BLW', swisstopo: 'swisstopo', bfs: 'BFS', bav: 'BAV',
            meteoschweiz: 'MeteoSchweiz', geodesy: 'Geodäsie', energie: 'Energie', gewiss: 'Wasser',
            ivs: 'Hist. Verkehrswege', kgs: 'KGS Inventar', luftbilder: 'Luftbilder', nga: 'Breitbandatlas',
            sachplan: 'Sachpläne/Konzepte', funksender: 'Funksender', verteidigung: 'Verteidigung',
            vu: 'Verkehrsunfälle', wildruhezonen: 'Wildruhezonen', schneesport: 'Schneesport', aviation: 'Luftfahrt',
            georessourcen: 'Georessourcen', notruf: 'Notruf', schule: 'Für die Schule', isos: 'ISOS-Ortsbilder',
            cadastre: 'Grundstückinformation', geol: 'Geologie', inspire: 'INSPIRE', ech: 'Geokatalog'
        };
        var DEFAULT_TOPIC = 'ech';
        var currentTopic = DEFAULT_TOPIC;
        var topicList = null;   // topic ids from the API, cached for the session
        var topicModal = document.getElementById('topic-modal');
        var topicGrid = document.getElementById('topic-grid');
        var topicSwitchBtn = document.getElementById('topic-switch-btn');

        function isValidTopicId(id) {
            return typeof id === 'string' && /^[a-z0-9_-]+$/i.test(id);
        }

        function topicLabel(id) {
            return TOPIC_LABELS[id] || id;
        }

        // The accordion header shows the topic name ("Geokatalog" for the default topic)
        function updateTopicHeader() {
            var title = document.getElementById('geokatalog-title');
            if (title) title.textContent = topicLabel(currentTopic);
        }

        function openTopicModal() {
            if (!topicModal || !topicGrid) return;
            topicModal.classList.add('show');
            if (topicList) {
                renderTopicGrid();
                return;
            }
            topicGrid.innerHTML = '<div class="layer-info-loading">Lade Themen...</div>';
            fetch('https://api3.geo.admin.ch/rest/services')
                .then(function(response) {
                    if (!response.ok) throw new Error('HTTP ' + response.status);
                    return response.json();
                })
                .then(function(data) {
                    var ids = (data.topics || []).map(function(topic) { return topic.id; }).filter(isValidTopicId);
                    if (ids.length === 0) throw new Error('Keine Themen');
                    topicList = ids;
                    renderTopicGrid();
                })
                .catch(function(error) {
                    console.error('Themen Fehler:', error);
                    topicGrid.innerHTML = '<div class="geokatalog-error">Themen konnten nicht geladen werden</div>';
                });
        }

        function closeTopicModal() {
            if (topicModal) topicModal.classList.remove('show');
        }

        function renderTopicGrid() {
            topicGrid.innerHTML = topicList.map(function(id) {
                var active = id === currentTopic;
                return '<button type="button" class="topic-card' + (active ? ' active' : '') + '" data-topic="' + escapeHtml(id) + '" aria-pressed="' + active + '">' +
                    '<span class="topic-card-name">' + escapeHtml(topicLabel(id)) + '</span>' +
                    '<span class="topic-sprite topic-sprite-' + escapeHtml(id) + '" aria-hidden="true"></span>' +
                '</button>';
            }).join('');
        }

        function selectTopic(id) {
            closeTopicModal();
            if (!isValidTopicId(id) || id === currentTopic) return;
            currentTopic = id;
            updateTopicHeader();
            updateUrlWithLayers();

            // Reload the catalog tree for the new topic; open the accordion if it is closed
            geokatalogLoaded = false;
            var header = geokatalogAccordion ? geokatalogAccordion.querySelector('.accordion-header') : null;
            if (header && !header.classList.contains('active')) {
                header.click();   // opens the accordion, which loads the catalog
            } else {
                loadGeokatalog();
            }
        }

        if (topicSwitchBtn) {
            topicSwitchBtn.addEventListener('click', function(e) {
                e.stopPropagation();   // sits inside the accordion header: do not toggle the accordion
                openTopicModal();
            });
        }
        if (topicGrid) {
            topicGrid.addEventListener('click', function(e) {
                var card = e.target.closest('.topic-card');
                if (card) selectTopic(card.getAttribute('data-topic'));
            });
        }
        if (topicModal) {
            var topicCloseBtn = topicModal.querySelector('.topic-modal-close');
            if (topicCloseBtn) topicCloseBtn.addEventListener('click', closeTopicModal);
            topicModal.addEventListener('click', function(e) {
                if (e.target === topicModal) closeTopicModal();
            });
            document.addEventListener('keydown', function(e) {
                if (e.key === 'Escape' && topicModal.classList.contains('show')) closeTopicModal();
            });
        }

        function renderCatalogTree(items, container) {
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
                        var isActive = activeSwisstopoLayers.some(function(l) { return l.id === item.layerBodId; });
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
                        updateMenuTogglePositionDebounced();
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
                        var isActive = activeSwisstopoLayers.some(function(l) { return l.id === layerId; });

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

        // ===== MENU TOGGLE =====
        var menuToggle = document.getElementById('menu-toggle');
        var accordionPanel = document.getElementById('accordion-panel');
        var menuToggleText = document.getElementById('menu-toggle-text');
        var menuToggleIcon = menuToggle.querySelector('.material-symbols-outlined');
        // Phones: the same panel is a slide-in hamburger menu (css: mobile breakpoint)
        var hamburgerBtn = document.getElementById('hamburger-btn');
        var mobileMenuClose = document.getElementById('mobile-menu-close');
        var mobileMenuBackdrop = document.getElementById('mobile-menu-backdrop');
        // Tablets and phones start with the tools panel collapsed: open, it covers 40–80 % of the map
        var menuOpen = !isCompactLayout();

        // Backdrop and hamburger state only apply to the phone layout
        function syncMobileMenuChrome() {
            var mobileOpen = menuOpen && isMobileLayout();
            if (mobileMenuBackdrop) mobileMenuBackdrop.classList.toggle('active', mobileOpen);
            if (hamburgerBtn) hamburgerBtn.setAttribute('aria-expanded', mobileOpen ? 'true' : 'false');
        }

        function renderMenuToggleState() {
            accordionPanel.classList.toggle('collapsed', !menuOpen);
            menuToggleText.textContent = menuOpen ? 'Menü schliessen' : 'Menü öffnen';
            menuToggleIcon.textContent = menuOpen ? 'expand_less' : 'expand_more';
            menuToggle.setAttribute('aria-expanded', menuOpen ? 'true' : 'false');
            syncMobileMenuChrome();
        }
        renderMenuToggleState();

        function setMenuOpen(open, restoreFocus) {
            menuOpen = open;
            renderMenuToggleState();
            updateMenuTogglePositionDebounced();
            if (!isMobileLayout()) return;
            // Phone menu: move focus into the menu, and back to the hamburger when it closes
            if (open && mobileMenuClose) {
                mobileMenuClose.focus();
            } else if (!open && restoreFocus && hamburgerBtn && accordionPanel.contains(document.activeElement)) {
                hamburgerBtn.focus();
            }
        }

        if (hamburgerBtn) hamburgerBtn.addEventListener('click', function() { setMenuOpen(true); });
        if (mobileMenuClose) mobileMenuClose.addEventListener('click', function() { setMenuOpen(false, true); });
        if (mobileMenuBackdrop) mobileMenuBackdrop.addEventListener('click', function() { setMenuOpen(false, true); });

        function updateMenuTogglePosition() {
            if (isMobileLayout()) {
                // Phones: the panel is the hamburger menu, the floating toggle is hidden
                menuToggle.style.top = '';
                return;
            }

            var mainRect = document.getElementById('map-view').getBoundingClientRect();

            if (menuOpen) {
                var panelRect = accordionPanel.getBoundingClientRect();
                var calculatedTop = panelRect.bottom - mainRect.top;
                // Ensure button stays below the panel - if panel hasn't rendered yet, retry
                if (panelRect.height < 50) {
                    setTimeout(updateMenuTogglePosition, 50);
                    return;
                }
                menuToggle.style.top = calculatedTop + 'px';
            } else {
                menuToggle.style.top = '10px';
            }
        }

        // Debounced version to consolidate rapid calls
        var menuToggleDebounceTimer = null;
        function updateMenuTogglePositionDebounced() {
            if (menuToggleDebounceTimer) {
                clearTimeout(menuToggleDebounceTimer);
            }
            menuToggleDebounceTimer = setTimeout(updateMenuTogglePosition, 10);
        }

        setTimeout(updateMenuTogglePosition, 100);
        
        menuToggle.addEventListener('click', function() {
            setMenuOpen(!menuOpen);
        });

        menuToggle.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                menuToggle.click();
            }
        });

        window.addEventListener('resize', function() {
            syncMobileMenuChrome();
            updateMenuTogglePositionDebounced();
        });

        // Escape closes the phone menu
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape' && menuOpen && isMobileLayout()) {
                setMenuOpen(false, true);
            }
        });

        var observer = new MutationObserver(function() {
            updateMenuTogglePositionDebounced();
        });
        observer.observe(accordionPanel, { attributes: true, childList: true, subtree: true });
        
        // ===== INFO PANEL CLOSE =====
        document.getElementById('info-close').addEventListener('click', function() {
            document.getElementById('info-panel').classList.remove('show');
            selectedBuildingId = null;
            updateSelectedBuilding();
        });

        // ===== INFO PANEL ZOOM TO =====
        document.getElementById('info-zoom-to').addEventListener('click', function() {
            if (selectedBuildingId && map) {
                var building = portfolioData.features.find(function(f) {
                    return f.properties.buildingId === selectedBuildingId;
                });
                if (building && building.geometry) {
                    map.flyTo({
                        center: building.geometry.coordinates,
                        zoom: 16,
                        offset: getInfoPanelOffset()
                    });
                }
            } else if (selectedParcelId && map) {
                var parcel = parcelData.features.find(function(f) {
                    return f.properties.parcelId === selectedParcelId;
                });
                if (parcel && parcel.geometry && parcel.geometry.coordinates) {
                    var center = getPolygonCentroid(parcel.geometry.coordinates);
                    map.flyTo({
                        center: center,
                        zoom: 16,
                        offset: getInfoPanelOffset()
                    });
                }
            }
        });

        // ===== INFO PANEL: MOBILE SHEET HELPERS =====
        // Fly-to offset that centres the object in the part of the map not covered by the sheet
        // (bottom sheet on portrait phones, side panel on landscape phones). [0, 0] on larger screens.
        function getInfoPanelOffset() {
            var panel = document.getElementById('info-panel');
            if (!window.map || !panel || !isMobileLayout() || !panel.classList.contains('show')) return [0, 0];
            var m = map.getContainer().getBoundingClientRect();
            var p = panel.getBoundingClientRect();
            if (p.width >= m.width * 0.9) {
                var coveredBottom = Math.max(0, m.bottom - Math.max(p.top, m.top));
                return [0, -coveredBottom / 2];
            }
            if (p.height >= m.height * 0.9) {
                var coveredRight = Math.max(0, m.right - Math.max(p.left, m.left));
                return [-coveredRight / 2, 0];
            }
            return [0, 0];
        }

        // After a tap selection on a phone: if the object ended up under the sheet, pan it into the visible part
        function revealSelectionOnMobile(lngLat) {
            if (!window.map || !lngLat) return;
            var offset = getInfoPanelOffset();
            if (!offset[0] && !offset[1]) return;
            var m = map.getContainer().getBoundingClientRect();
            var visibleW = m.width + offset[0] * 2;
            var visibleH = m.height + offset[1] * 2;
            var pt = map.project(lngLat);
            var margin = 32;
            if (pt.x < margin || pt.x > visibleW - margin || pt.y < margin || pt.y > visibleH - margin) {
                map.panBy([pt.x - visibleW / 2, pt.y - visibleH / 2], { duration: 300 });
            }
        }

        // Bottom sheets on phones: swiping the handle (or header) down dismisses the sheet
        function initSheetGesture(panel, handleSelectors, onDismiss, isSheetFn) {
            if (!panel) return;
            var startY = 0;
            var dragY = 0;
            var dragging = false;

            function onStart(e) {
                if (!isSheetFn() || e.touches.length !== 1) return;
                startY = e.touches[0].clientY;
                dragY = 0;
                dragging = true;
                panel.classList.add('sheet-dragging');
            }

            function onMove(e) {
                if (!dragging) return;
                dragY = Math.max(0, e.touches[0].clientY - startY);
                if (dragY > 0) {
                    panel.style.transform = 'translateY(' + dragY + 'px)';
                    if (e.cancelable) e.preventDefault(); // the sheet follows the finger, the map must not pan
                }
            }

            function onEnd() {
                if (!dragging) return;
                dragging = false;
                panel.classList.remove('sheet-dragging');
                panel.style.transform = '';
                if (dragY > 80) onDismiss();
            }

            handleSelectors.forEach(function(selector) {
                var el = panel.querySelector(selector);
                if (!el) return;
                el.addEventListener('touchstart', onStart, { passive: true });
                el.addEventListener('touchmove', onMove, { passive: false });
                el.addEventListener('touchend', onEnd);
                el.addEventListener('touchcancel', onEnd);
            });
        }

        function isPortraitPhoneSheet() {
            return isMobileLayout() && !isLandscapePhone();
        }

        initSheetGesture(document.getElementById('info-panel'), ['.sheet-handle', '#info-header'], function() {
            document.getElementById('info-close').click();
        }, isPortraitPhoneSheet);

        // ===== INFO PANEL SHARE =====
        document.getElementById('info-share').addEventListener('click', function() {
            var url = getShareUrl();
            var title = 'BBL Immobilienportfolio';
            var text = selectedBuildingId
                ? 'Gebäude: ' + selectedBuildingId
                : selectedParcelId
                    ? 'Parzelle: ' + selectedParcelId
                    : 'Kartenansicht';

            // Use Web Share API if available
            if (navigator.share) {
                navigator.share({
                    title: title,
                    text: text,
                    url: url
                }).catch(function(err) {
                    // User cancelled or error - silently ignore
                    console.log('Share cancelled or failed:', err);
                });
            } else {
                // Fallback: copy to clipboard
                if (navigator.clipboard) {
                    navigator.clipboard.writeText(url).then(function() {
                        showToast({ type: 'success', title: 'Link kopiert', message: 'Link wurde in die Zwischenablage kopiert', duration: 2000 });
                    }).catch(function() {
                        showToast({ type: 'error', title: 'Fehler beim Kopieren', message: 'Link konnte nicht kopiert werden', duration: 3000 });
                    });
                }
            }
        });

        // ===== DETAIL TABS =====
        var detailTabsEl = document.querySelector('.detail-tabs');

        // Phones: the tab strip is wider than the screen and scrolls horizontally
        function isTabStripScrollable() {
            return !!detailTabsEl && detailTabsEl.scrollWidth > detailTabsEl.clientWidth + 1;
        }

        // Fade hint at the right edge while more tabs are hidden (css: .detail-tabs.can-scroll-right)
        function updateTabStripFade() {
            if (!detailTabsEl) return;
            var more = isTabStripScrollable() &&
                detailTabsEl.scrollLeft + detailTabsEl.clientWidth < detailTabsEl.scrollWidth - 1;
            detailTabsEl.classList.toggle('can-scroll-right', more);
        }

        if (detailTabsEl) {
            detailTabsEl.addEventListener('scroll', updateTabStripFade, { passive: true });
            window.addEventListener('resize', updateTabStripFade);
        }

        // Click, Enter and Space select a tab (activateTab renders the tab's table and syncs aria-selected)
        document.querySelectorAll('.detail-tab').forEach(function(tab) {
            function select() {
                if (tab.classList.contains('disabled')) return;
                var targetTab = tab.dataset.tab;
                activateTab(targetTab);
                setTabInURL(targetTab);
            }
            tab.addEventListener('click', select);
            tab.addEventListener('keydown', function(e) {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    select();
                }
            });
        });

        // ===== STYLE SWITCHER =====
        // Note: mapStyles and currentMapStyle are defined earlier (before map initialization)
        var styleSwitcherBtn = document.getElementById('style-switcher-btn');
        var stylePanel = document.getElementById('style-panel');
        var stylePanelOpen = false;

        // Thumbnail: a static z8 tile of Switzerland from the basemap provider (see mapStyles)
        function getStyleThumbnail(styleId) {
            return (mapStyles[styleId] && mapStyles[styleId].thumbnail) || '';
        }

        // Initialize thumbnails
        function initStyleThumbnails() {
            Object.keys(mapStyles).forEach(function(styleId) {
                var thumbEl = document.getElementById('thumb-' + styleId);
                if (thumbEl) {
                    thumbEl.src = getStyleThumbnail(styleId);
                }
            });
            // Set current style thumbnail
            document.getElementById('current-style-thumb').src = getStyleThumbnail(currentMapStyle);
        }

        // Update active style button
        function updateActiveStyleButton() {
            document.querySelectorAll('.style-option').forEach(function(btn) {
                btn.classList.remove('active');
                if (btn.dataset.style === currentMapStyle) {
                    btn.classList.add('active');
                }
            });
            document.getElementById('current-style-thumb').src = getStyleThumbnail(currentMapStyle);
        }

        // Toggle style panel
        function toggleStylePanel() {
            stylePanelOpen = !stylePanelOpen;
            if (stylePanelOpen) {
                stylePanel.classList.add('show');
            } else {
                stylePanel.classList.remove('show');
            }
        }

        // Close panel when clicking outside
        document.addEventListener('click', function(e) {
            if (stylePanelOpen && !e.target.closest('.style-switcher')) {
                stylePanelOpen = false;
                stylePanel.classList.remove('show');
            }
        });

        // Style switcher button click
        styleSwitcherBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            toggleStylePanel();
        });

        // Style option click handlers
        document.querySelectorAll('.style-option').forEach(function(btn) {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                var styleId = this.dataset.style;
                if (styleId === currentMapStyle) {
                    toggleStylePanel();
                    return;
                }

                currentMapStyle = styleId;
                localStorage.setItem('mapStyle', styleId);
                updateActiveStyleButton();

                // Change map style
                map.setStyle(mapStyles[styleId].url);

                // Close panel
                stylePanelOpen = false;
                stylePanel.classList.remove('show');
            });
        });

        // Re-add layers after style change
        map.on('style.load', function() {
            // Only re-add if portfolio data is loaded and source doesn't exist
            if (portfolioData && !map.getSource('portfolio')) {
                addMapLayers();
            }

            // Re-add Swisstopo layers that were active before style change
            readdSwisstopoLayers();
        });

        // Initialize thumbnails after a short delay to ensure token is available
        setTimeout(initStyleThumbnails, 100);
        updateActiveStyleButton();

        // ===== SHARED TABLE UTILITIES =====

        // Generic sort function for table data
        function sortTableData(data, column, direction) {
            return data.sort(function(a, b) {
                var valA = a[column];
                var valB = b[column];
                if (typeof valA === 'string') {
                    valA = valA.toLowerCase();
                    valB = valB.toLowerCase();
                }
                if (valA < valB) return direction === 'asc' ? -1 : 1;
                if (valA > valB) return direction === 'asc' ? 1 : -1;
                return 0;
            });
        }

        // Generic selection update for detail tables
        function updateTableSelection(config) {
            var checkboxes = document.querySelectorAll('.' + config.checkboxClass);
            var checkedCount = document.querySelectorAll('.' + config.checkboxClass + ':checked').length;
            var selectAll = document.getElementById(config.selectAllId);

            if (selectAll) {
                selectAll.checked = checkedCount === checkboxes.length && checkboxes.length > 0;
                selectAll.indeterminate = checkedCount > 0 && checkedCount < checkboxes.length;
            }

            document.querySelectorAll('#' + config.tableId + ' tbody tr').forEach(function(row) {
                var cb = row.querySelector('.' + config.checkboxClass);
                row.classList.toggle('selected', cb && cb.checked);
            });

            document.querySelectorAll('.' + config.actionClass).forEach(function(btn) {
                btn.disabled = checkedCount === 0;
            });
        }

        // Generic sort column click handler setup
        function initTableSorting(config) {
            document.querySelectorAll('#' + config.tableId + ' th.sortable').forEach(function(th) {
                th.addEventListener('click', function() {
                    var column = this.dataset.sort;

                    if (column === config.state.column) {
                        config.state.direction = config.state.direction === 'asc' ? 'desc' : 'asc';
                    } else {
                        config.state.column = column;
                        config.state.direction = 'asc';
                    }

                    document.querySelectorAll('#' + config.tableId + ' th.sortable').forEach(function(header) {
                        header.classList.remove('sort-asc', 'sort-desc');
                        var icon = header.querySelector('.sort-icon');
                        if (icon) icon.textContent = 'unfold_more';
                    });

                    this.classList.add('sort-' + config.state.direction);
                    var sortIcon = this.querySelector('.sort-icon');
                    if (sortIcon) {
                        sortIcon.textContent = config.state.direction === 'asc' ? 'arrow_upward' : 'arrow_downward';
                    }

                    config.onSort();
                });
            });
        }

        // Generic select-all checkbox setup
        function initSelectAll(config) {
            var selectAll = document.getElementById(config.selectAllId);
            if (selectAll) {
                selectAll.addEventListener('change', function() {
                    var isChecked = this.checked;
                    document.querySelectorAll('.' + config.checkboxClass).forEach(function(cb) {
                        cb.checked = isChecked;
                    });
                    config.onUpdate();
                });
            }
        }

        // ===== GENERIC ENTITY TABLE FACTORY =====
        // Eliminates code duplication across 6 entity tables

        function createEntityTable(config) {
            // Extract table name from tableId (e.g., 'measurements-table' -> 'measurements')
            var tableName = config.tableId.replace('-table', '');

            var table = {
                data: [],
                filteredData: [],
                sort: { column: config.defaultSort || 'id', direction: 'asc' },
                pagination: {
                    currentPage: 1,
                    rowsPerPage: 50
                },
                tableConfig: {
                    tableId: config.tableId,
                    checkboxClass: config.checkboxClass,
                    selectAllId: config.selectAllId,
                    actionClass: config.actionClass,
                    state: null, // Will be set below
                    onSort: null,
                    onUpdate: null
                }
            };

            // Set up circular references
            table.tableConfig.state = table.sort;
            table.tableConfig.onSort = function() {
                sortTableData(table.filteredData, table.sort.column, table.sort.direction);
                table.render();
            };
            table.tableConfig.onUpdate = function() {
                updateTableSelection(table.tableConfig);
            };

            // Load data for a building
            table.load = function(building) {
                if (building && building.properties) {
                    var buildingId = building.properties.buildingId;
                    table.data = config.dataSource()
                        .filter(function(item) {
                            return item.buildingIds && item.buildingIds.includes(buildingId);
                        })
                        .map(config.transform);
                } else {
                    table.data = [];
                }
                table.filteredData = table.data.slice();
                // Reset pagination when loading new data
                table.pagination.currentPage = 1;
            };

            // Render table rows with empty state and pagination support
            table.render = function() {
                var tbody = document.getElementById(config.tbodyId);
                if (!tbody) return;

                // Check for empty state
                if (table.filteredData.length === 0) {
                    var colCount = config.columns.length + 1; // +1 for checkbox column
                    var emptyMessage = table.data.length === 0
                        ? 'Keine Einträge vorhanden'
                        : 'Keine Treffer für die Suche';
                    var emptyIcon = table.data.length === 0 ? 'inbox' : 'search_off';

                    tbody.innerHTML = '<tr class="empty-row"><td colspan="' + colCount + '">' +
                        '<div class="table-empty-state">' +
                        '<span class="material-symbols-outlined">' + emptyIcon + '</span>' +
                        '<div class="table-empty-message">' + emptyMessage + '</div>' +
                        '</div></td></tr>';
                    table.updatePagination(0, 0);
                    return;
                }

                // Pagination calculations
                var totalItems = table.filteredData.length;
                var totalPages = Math.ceil(totalItems / table.pagination.rowsPerPage);

                // Ensure current page is valid
                if (table.pagination.currentPage > totalPages) {
                    table.pagination.currentPage = totalPages;
                }
                if (table.pagination.currentPage < 1) {
                    table.pagination.currentPage = 1;
                }

                var startIndex = (table.pagination.currentPage - 1) * table.pagination.rowsPerPage;
                var endIndex = Math.min(startIndex + table.pagination.rowsPerPage, totalItems);

                // Get paginated slice of data
                var paginatedData = table.filteredData.slice(startIndex, endIndex);

                var html = '';
                paginatedData.forEach(function(item) {
                    html += '<tr data-id="' + item.id + '">';
                    html += '<td class="col-checkbox"><input type="checkbox" class="' + config.checkboxClass + '"></td>';
                    config.columns.forEach(function(col) {
                        var value = col.render ? col.render(item) : (item[col.key] || '—');
                        html += '<td class="' + col.className + '">' + value + '</td>';
                    });
                    html += '</tr>';
                });
                tbody.innerHTML = html;

                // Update pagination UI
                table.updatePagination(table.pagination.currentPage, totalPages);

                document.querySelectorAll('.' + config.checkboxClass).forEach(function(cb) {
                    cb.addEventListener('change', function() {
                        updateTableSelection(table.tableConfig);
                    });
                });
            };

            // Update pagination UI
            table.updatePagination = function(currentPage, totalPages) {
                var paginationFooter = document.getElementById(tableName + '-pagination');
                if (!paginationFooter) return;

                var infoEl = paginationFooter.querySelector('.pagination-info');
                var prevBtn = paginationFooter.querySelector('.pagination-prev');
                var nextBtn = paginationFooter.querySelector('.pagination-next');

                if (infoEl) {
                    if (totalPages === 0) {
                        infoEl.textContent = 'Keine Einträge';
                    } else {
                        infoEl.textContent = 'Seite ' + currentPage + ' von ' + totalPages;
                    }
                }

                if (prevBtn) {
                    prevBtn.disabled = currentPage <= 1;
                }

                if (nextBtn) {
                    nextBtn.disabled = currentPage >= totalPages || totalPages === 0;
                }
            };

            // Filter data based on search term
            table.filter = function(term) {
                term = term.toLowerCase().trim();
                if (term === '') {
                    table.filteredData = table.data.slice();
                } else {
                    table.filteredData = table.data.filter(function(item) {
                        return config.searchFields.some(function(field) {
                            var val = item[field];
                            if (val == null) return false;
                            return String(val).toLowerCase().includes(term);
                        });
                    });
                }
                // Reset to first page when filtering
                table.pagination.currentPage = 1;
                sortTableData(table.filteredData, table.sort.column, table.sort.direction);
                table.render();
            };

            // Initialize event handlers
            table.init = function() {
                initTableSorting(table.tableConfig);
                initSelectAll(table.tableConfig);

                var filterInput = document.getElementById(config.filterId);
                if (filterInput) {
                    filterInput.addEventListener('input', function() {
                        table.filter(this.value);
                    });
                }

                var addBtn = document.getElementById(config.addBtnId);
                if (addBtn) {
                    addBtn.addEventListener('click', function() {
                        alert(config.addBtnMessage);
                    });
                }

                // Initialize pagination event listeners
                var paginationFooter = document.getElementById(tableName + '-pagination');
                if (paginationFooter) {
                    var rowsSelect = paginationFooter.querySelector('.pagination-rows-select');
                    var prevBtn = paginationFooter.querySelector('.pagination-prev');
                    var nextBtn = paginationFooter.querySelector('.pagination-next');

                    if (rowsSelect) {
                        rowsSelect.addEventListener('change', function() {
                            table.pagination.rowsPerPage = parseInt(this.value, 10);
                            table.pagination.currentPage = 1;
                            table.render();
                        });
                    }

                    if (prevBtn) {
                        prevBtn.addEventListener('click', function() {
                            if (table.pagination.currentPage > 1) {
                                table.pagination.currentPage--;
                                table.render();
                            }
                        });
                    }

                    if (nextBtn) {
                        nextBtn.addEventListener('click', function() {
                            var totalPages = Math.ceil(table.filteredData.length / table.pagination.rowsPerPage);
                            if (table.pagination.currentPage < totalPages) {
                                table.pagination.currentPage++;
                                table.render();
                            }
                        });
                    }
                }
            };

            return table;
        }

        // ===== SHARED FORMATTERS =====

        function formatCurrency(amount) {
            if (amount == null) return '—';
            return new Intl.NumberFormat('de-CH', {
                style: 'currency',
                currency: 'CHF',
                minimumFractionDigits: 0,
                maximumFractionDigits: 0
            }).format(amount);
        }

        function formatCurrencyWithUnit(amount, einheit) {
            if (amount == null) return '—';
            var currency = 'CHF';
            if (einheit) {
                var parts = einheit.split('/');
                if (parts.length > 0) currency = parts[0].trim();
            }
            return new Intl.NumberFormat('de-CH', {
                style: 'currency',
                currency: currency,
                minimumFractionDigits: 0,
                maximumFractionDigits: 0
            }).format(amount);
        }

        function getContractStatusClassName(status) {
            if (!status) return '';
            var s = status.toLowerCase();
            if (s === 'aktiv') return 'status-active';
            if (s === 'gekündigt') return 'status-terminated';
            if (s === 'ausgelaufen') return 'status-expired';
            return '';
        }

        // ===== ENTITY TABLE DEFINITIONS =====

        var measurementsTable = createEntityTable({
            tableId: 'measurements-table',
            tbodyId: 'measurements-tbody',
            checkboxClass: 'measurement-checkbox',
            selectAllId: 'select-all-measurements',
            actionClass: 'measurements-action',
            filterId: 'measurements-filter',
            addBtnId: 'btn-add-measurement',
            addBtnMessage: 'Bemessung hinzufügen - kommt bald...',
            defaultSort: 'id',
            dataSource: function() { return allAreaMeasurements; },
            transform: function(m) {
                return {
                    id: m.areaMeasurementId,
                    areaType: m.type,
                    value: m.value,
                    unit: m.unit,
                    source: (m.extensionData && m.extensionData.source) || 'Manuell',
                    accuracy: m.accuracy,
                    standard: m.standard,
                    validFrom: m.validFrom,
                    validUntil: m.validUntil || '—'
                };
            },
            columns: [
                { key: 'id', className: 'col-id' },
                { key: 'areaType', className: 'col-type' },
                { key: 'value', className: 'col-area', render: function(m) {
                    return Number(m.value).toLocaleString('de-CH') + ' ' + m.unit;
                }},
                { key: 'source', className: 'col-source' },
                { key: 'accuracy', className: 'col-accuracy' },
                { key: 'standard', className: 'col-standard' },
                { key: 'validFrom', className: 'col-from' },
                { key: 'validUntil', className: 'col-until' }
            ],
            searchFields: ['id', 'areaType', 'accuracy', 'standard', 'unit', 'value']
        });

        var documentsTable = createEntityTable({
            tableId: 'documents-table',
            tbodyId: 'documents-tbody',
            checkboxClass: 'document-checkbox',
            selectAllId: 'select-all-documents',
            actionClass: 'documents-action',
            filterId: 'documents-filter',
            addBtnId: 'btn-add-document',
            addBtnMessage: 'Dokument hinzufügen - kommt bald...',
            defaultSort: 'id',
            dataSource: function() { return allDocuments; },
            transform: function(d) {
                return {
                    id: d.documentId,
                    titel: d.name,
                    dokumentTyp: d.type,
                    dateiformat: d.fileFormat,
                    datum: d.validFrom,
                    dateigroesse: d.fileSize,
                    url: d.url || '#'
                };
            },
            columns: [
                { key: 'id', className: 'col-id' },
                { key: 'titel', className: 'col-title' },
                { key: 'dokumentTyp', className: 'col-type' },
                { key: 'dateiformat', className: 'col-format' },
                { key: 'datum', className: 'col-date' },
                { key: 'dateigroesse', className: 'col-size' }
            ],
            searchFields: ['id', 'titel', 'dokumentTyp', 'dateiformat', 'datum', 'dateigroesse']
        });

        var contactsTable = createEntityTable({
            tableId: 'contacts-table',
            tbodyId: 'contacts-tbody',
            checkboxClass: 'contact-checkbox',
            selectAllId: 'select-all-contacts',
            actionClass: 'contacts-action',
            filterId: 'contacts-filter',
            addBtnId: 'btn-add-contact',
            addBtnMessage: 'Kontakt hinzufügen - kommt bald...',
            defaultSort: 'name',
            dataSource: function() { return allContacts; },
            transform: function(contact) {
                return {
                    id: contact.contactId,
                    name: contact.name,
                    rolle: contact.role,
                    organisation: contact.organisation,
                    telefon: contact.phone,
                    email: contact.email
                };
            },
            columns: [
                { key: 'id', className: 'col-contact-id' },
                { key: 'name', className: 'col-contact-name' },
                { key: 'rolle', className: 'col-contact-role' },
                { key: 'organisation', className: 'col-contact-org' },
                { key: 'telefon', className: 'col-contact-phone', render: function(contact) {
                    return '<a href="tel:' + contact.telefon + '">' + contact.telefon + '</a>';
                }},
                { key: 'email', className: 'col-contact-email', render: function(contact) {
                    return '<a href="mailto:' + contact.email + '">' + contact.email + '</a>';
                }}
            ],
            searchFields: ['id', 'name', 'rolle', 'organisation', 'telefon', 'email']
        });

        var costsTable = createEntityTable({
            tableId: 'costs-table',
            tbodyId: 'costs-tbody',
            checkboxClass: 'cost-checkbox',
            selectAllId: 'select-all-costs',
            actionClass: 'costs-action',
            filterId: 'costs-filter',
            addBtnId: 'btn-add-cost',
            addBtnMessage: 'Kosten hinzufügen - kommt bald...',
            defaultSort: 'kostengruppe',
            dataSource: function() { return allCosts; },
            transform: function(cost) {
                return {
                    id: cost.costId,
                    kostengruppe: cost.costGroup,
                    kostenart: cost.costType,
                    betrag: cost.amount,
                    einheit: cost.unit,
                    stichtag: cost.referenceDate
                };
            },
            columns: [
                { key: 'id', className: 'col-cost-id' },
                { key: 'kostengruppe', className: 'col-cost-group' },
                { key: 'kostenart', className: 'col-cost-type' },
                { key: 'betrag', className: 'col-cost-amount', render: function(cost) {
                    return formatCurrencyWithUnit(cost.betrag, cost.einheit);
                }},
                { key: 'einheit', className: 'col-cost-unit', render: function(cost) {
                    return cost.einheit || '—';
                }},
                { key: 'stichtag', className: 'col-cost-date', render: function(cost) {
                    return cost.stichtag || '—';
                }}
            ],
            searchFields: ['id', 'kostengruppe', 'kostenart', 'betrag', 'einheit', 'stichtag']
        });

        var contractsTable = createEntityTable({
            tableId: 'contracts-table',
            tbodyId: 'contracts-tbody',
            checkboxClass: 'contract-checkbox',
            selectAllId: 'select-all-contracts',
            actionClass: 'contracts-action',
            filterId: 'contracts-filter',
            addBtnId: 'btn-add-contract',
            addBtnMessage: 'Vertrag hinzufügen - kommt bald...',
            defaultSort: 'vertragsart',
            dataSource: function() { return allContracts; },
            transform: function(contract) {
                return {
                    id: contract.contractId,
                    vertragsart: contract.type,
                    vertragspartner: contract.contractPartner,
                    vertragsbeginn: contract.validFrom,
                    vertragsende: contract.validUntil,
                    betrag: contract.amount,
                    status: contract.status
                };
            },
            columns: [
                { key: 'id', className: 'col-contract-id' },
                { key: 'vertragsart', className: 'col-contract-type' },
                { key: 'vertragspartner', className: 'col-contract-partner' },
                { key: 'vertragsbeginn', className: 'col-contract-start', render: function(contract) {
                    return contract.vertragsbeginn || '—';
                }},
                { key: 'vertragsende', className: 'col-contract-end', render: function(contract) {
                    return contract.vertragsende || 'unbefristet';
                }},
                { key: 'betrag', className: 'col-contract-amount', render: function(contract) {
                    return formatCurrency(contract.betrag);
                }},
                { key: 'status', className: 'col-contract-status', render: function(contract) {
                    return '<span class="status-badge ' + getContractStatusClassName(contract.status) + '">' + contract.status + '</span>';
                }}
            ],
            searchFields: ['id', 'vertragsart', 'vertragspartner', 'vertragsbeginn', 'vertragsende', 'betrag', 'status']
        });

        var assetsTable = createEntityTable({
            tableId: 'assets-table',
            tbodyId: 'assets-tbody',
            checkboxClass: 'asset-checkbox',
            selectAllId: 'select-all-assets',
            actionClass: 'assets-action',
            filterId: 'assets-filter',
            addBtnId: 'btn-add-asset',
            addBtnMessage: 'Ausstattung hinzufügen - kommt bald...',
            defaultSort: 'bezeichnung',
            dataSource: function() { return allAssets; },
            transform: function(asset) {
                return {
                    id: asset.assetId,
                    bezeichnung: asset.name,
                    kategorie: asset.category,
                    hersteller: asset.manufacturer,
                    baujahr: asset.installationYear,
                    standort: asset.location
                };
            },
            columns: [
                { key: 'id', className: 'col-asset-id' },
                { key: 'bezeichnung', className: 'col-asset-name' },
                { key: 'kategorie', className: 'col-asset-category', render: function(asset) {
                    return '<span class="kategorie-badge">' + asset.kategorie + '</span>';
                }},
                { key: 'hersteller', className: 'col-asset-manufacturer' },
                { key: 'baujahr', className: 'col-asset-year' },
                { key: 'standort', className: 'col-asset-location' }
            ],
            searchFields: ['id', 'bezeichnung', 'kategorie', 'hersteller', 'baujahr', 'standort']
        });

        // Initialize all entity tables
        measurementsTable.init();
        documentsTable.init();
        contactsTable.init();
        costsTable.init();
        contractsTable.init();
        assetsTable.init();

        // ===== ENTITY TABLE LOADER AND RENDER FUNCTIONS =====

        function loadMeasurementsForBuilding(building) { measurementsTable.load(building); }
        function loadDocumentsForBuilding(building) { documentsTable.load(building); }
        function loadContactsForBuilding(building) { contactsTable.load(building); }
        function loadCostsForBuilding(building) { costsTable.load(building); }
        function loadContractsForBuilding(building) { contractsTable.load(building); }
        function loadAssetsForBuilding(building) { assetsTable.load(building); }

        function renderMeasurementsTable() { measurementsTable.render(); }
        function renderDocumentsTable() { documentsTable.render(); }
        function renderContactsTable() { contactsTable.render(); }
        function renderCostsTable() { costsTable.render(); }
        function renderContractsTable() { contractsTable.render(); }
        function renderAssetsTable() { assetsTable.render(); }

        // ===== MAP CONTEXT MENU =====

        var contextMenu = document.getElementById('map-context-menu');
        var contextMenuCoords = document.getElementById('context-menu-coords');
        var contextMenuCoordsText = document.getElementById('context-menu-coords-text');
        var contextMenuShare = document.getElementById('context-menu-share');
        var contextMenuMeasure = document.getElementById('context-menu-measure');
        var contextMenuMeasureText = document.getElementById('context-menu-measure-text');
        var contextMenuPrint = document.getElementById('context-menu-print');
        var contextMenuReport = document.getElementById('context-menu-report');
        var measureDistanceDisplay = document.getElementById('measure-distance-display');
        var measureDistanceClose = document.getElementById('measure-distance-close');
        var measureTotalDistance = document.getElementById('measure-total-distance');
        var measureTotalArea = document.getElementById('measure-total-area');
        var measureAreaRow = document.getElementById('measure-area-row');

        // Store the clicked coordinates
        var contextMenuLngLat = null;

        // Measure distance state (Google Maps style - multi-point polyline)
        var measureState = {
            active: false,
            points: [],           // Array of [lng, lat] coordinates
            markers: [],          // Array of MapLibre markers
            labelMarkers: [],     // Array of label markers for distances
            lineSourceId: 'measure-line-source',
            lineLayerId: 'measure-line',
            isClosed: false       // True if polygon is closed
        };

        // Show context menu on right-click
        map.on('contextmenu', function(e) {
            e.preventDefault();

            // Store clicked coordinates
            contextMenuLngLat = e.lngLat;

            // Update coordinates display (lat, lon with 5 decimals)
            var lat = contextMenuLngLat.lat.toFixed(5);
            var lon = contextMenuLngLat.lng.toFixed(5);
            contextMenuCoordsText.textContent = lat + ', ' + lon;
            contextMenuCoords.classList.remove('copied');

            // Toggle measure menu text based on state
            if (measureState.active) {
                contextMenuMeasureText.textContent = 'Messung löschen';
            } else {
                contextMenuMeasureText.textContent = 'Distanz messen';
            }

            // Get map container dimensions
            var mapContainer = document.getElementById('map');
            var mapRect = mapContainer.getBoundingClientRect();

            // Calculate menu position relative to map container
            var menuWidth = 200;
            var menuHeight = 180;
            var clickX = e.point.x;
            var clickY = e.point.y;

            // Edge detection
            var flipHorizontal = (clickX + menuWidth) > mapRect.width;
            var flipVertical = (clickY + menuHeight) > mapRect.height;

            // Position the menu
            contextMenu.style.left = clickX + 'px';
            contextMenu.style.top = clickY + 'px';

            // Apply flip classes
            contextMenu.classList.toggle('flip-horizontal', flipHorizontal);
            contextMenu.classList.toggle('flip-vertical', flipVertical);

            // Show menu
            contextMenu.classList.add('show');
        });

        // Hide context menu
        function hideContextMenu() {
            contextMenu.classList.remove('show');
        }

        // Close menu on Escape key
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') {
                hideContextMenu();
                if (measureState.active) {
                    clearMeasurement();
                }
            }
        });

        // Copy coordinates to clipboard
        contextMenuCoords.addEventListener('click', function() {
            var coordsText = contextMenuCoordsText.textContent;
            navigator.clipboard.writeText(coordsText).then(function() {
                contextMenuCoords.classList.add('copied');
                showToast({
                    type: 'success',
                    title: 'Koordinaten kopiert',
                    message: coordsText,
                    duration: 2000
                });
                setTimeout(hideContextMenu, 300);
            }).catch(function(err) {
                showToast({
                    type: 'error',
                    title: 'Fehler beim Kopieren',
                    message: 'Koordinaten konnten nicht kopiert werden',
                    duration: 3000
                });
            });
        });

        // Share - use native system share
        contextMenuShare.addEventListener('click', function(e) {
            e.stopPropagation();
            if (!contextMenuLngLat) return;

            // Generate share URL with coordinates
            var lat = contextMenuLngLat.lat.toFixed(5);
            var lon = contextMenuLngLat.lng.toFixed(5);
            var shareUrl = window.location.origin + window.location.pathname + '?center=' + lon + ',' + lat + '&zoom=' + Math.round(map.getZoom());

            hideContextMenu();

            // Use native Web Share API
            if (navigator.share) {
                navigator.share({
                    title: 'GIS Immobilienportfolio - Standort',
                    text: 'Schauen Sie sich diesen Standort an:',
                    url: shareUrl
                }).catch(function(err) {
                    // User cancelled or share failed - copy to clipboard as fallback
                    if (err.name !== 'AbortError') {
                        navigator.clipboard.writeText(shareUrl).then(function() {
                            showToast({
                                type: 'success',
                                title: 'Link kopiert',
                                message: 'Link wurde in die Zwischenablage kopiert',
                                duration: 2000
                            });
                        });
                    }
                });
            } else {
                // Fallback for browsers without Web Share API - copy to clipboard
                navigator.clipboard.writeText(shareUrl).then(function() {
                    showToast({
                        type: 'success',
                        title: 'Link kopiert',
                        message: 'Link wurde in die Zwischenablage kopiert',
                        duration: 2000
                    });
                });
            }
        });

        // Print map
        contextMenuPrint.addEventListener('click', function() {
            hideContextMenu();
            window.print();
        });

        // Report problem
        contextMenuReport.addEventListener('click', function() {
            hideContextMenu();
            if (!contextMenuLngLat) return;
            var lat = contextMenuLngLat.lat.toFixed(5);
            var lon = contextMenuLngLat.lng.toFixed(5);
            var subject = encodeURIComponent('Problem melden - GIS Immobilienportfolio');
            var body = encodeURIComponent('Problembeschreibung:\n\n\n\n---\nKoordinaten: ' + lat + ', ' + lon + '\nURL: ' + window.location.href);
            window.location.href = 'mailto:info@gis-immo.ch?subject=' + subject + '&body=' + body;
        });

        // ===== MEASURE DISTANCE FEATURE (Google Maps Style) =====

        // Haversine formula to calculate distance between two points
        function haversineDistance(lat1, lon1, lat2, lon2) {
            var R = 6371000; // Earth's radius in meters
            var dLat = (lat2 - lat1) * Math.PI / 180;
            var dLon = (lon2 - lon1) * Math.PI / 180;
            var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                    Math.sin(dLon / 2) * Math.sin(dLon / 2);
            var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            return R * c;
        }

        // Calculate polygon area using Shoelace formula (in square meters)
        function calculatePolygonArea(points) {
            if (points.length < 3) return 0;

            var n = points.length;
            var area = 0;

            // Convert to approximate meters (at the centroid latitude)
            var avgLat = points.reduce(function(sum, p) { return sum + p[1]; }, 0) / n;
            var latScale = 111320; // meters per degree latitude
            var lonScale = 111320 * Math.cos(avgLat * Math.PI / 180); // meters per degree longitude

            for (var i = 0; i < n; i++) {
                var j = (i + 1) % n;
                var xi = points[i][0] * lonScale;
                var yi = points[i][1] * latScale;
                var xj = points[j][0] * lonScale;
                var yj = points[j][1] * latScale;
                area += xi * yj;
                area -= xj * yi;
            }

            return Math.abs(area / 2);
        }

        // Format distance for display
        function formatDistance(meters) {
            if (meters >= 1000) {
                return (meters / 1000).toFixed(2) + ' km';
            }
            return Math.round(meters) + ' m';
        }

        // Format area for display
        function formatArea(sqMeters) {
            if (sqMeters >= 1000000) {
                return (sqMeters / 1000000).toFixed(2) + ' km²';
            } else if (sqMeters >= 10000) {
                return (sqMeters / 10000).toFixed(2) + ' ha';
            }
            return Math.round(sqMeters) + ' m²';
        }

        // Create a marker element for measurement points
        function createMeasureMarkerElement() {
            var el = document.createElement('div');
            el.className = 'measure-marker';
            return el;
        }

        // Create a label element for distance display on segments
        function createDistanceLabel(distance) {
            var el = document.createElement('div');
            el.className = 'measure-label';
            el.textContent = formatDistance(distance);
            return el;
        }

        // Add a point to the measurement polyline
        function addMeasurePoint(lngLat, index) {
            var point = [lngLat.lng, lngLat.lat];

            if (index === undefined) {
                measureState.points.push(point);
                index = measureState.points.length - 1;
            } else {
                measureState.points[index] = point;
            }

            // Create marker if new point
            if (index >= measureState.markers.length) {
                var markerEl = createMeasureMarkerElement();
                var marker = new maplibregl.Marker({
                    element: markerEl,
                    draggable: true,
                    anchor: 'center'
                })
                .setLngLat(point)
                .addTo(map);

                // Store index on marker for reference
                marker._measureIndex = index;

                // Drag event to update point position
                marker.on('drag', function() {
                    var newLngLat = marker.getLngLat();
                    measureState.points[marker._measureIndex] = [newLngLat.lng, newLngLat.lat];
                    updateMeasureLine();
                    updateMeasureLabels();
                    updateMeasureDisplay();
                });

                // Click on marker: close polygon if first point, delete otherwise
                markerEl.addEventListener('click', function(e) {
                    e.stopPropagation();
                    var clickedIndex = marker._measureIndex;

                    // If clicking on first point with 3+ points, close polygon
                    if (clickedIndex === 0 && measureState.points.length >= 3 && !measureState.isClosed) {
                        measureState.isClosed = true;
                        updateMeasureLine();
                        updateMeasureLabels();
                        updateMeasureDisplay();
                        return;
                    }

                    // Otherwise delete the point
                    removeMeasurePoint(clickedIndex);
                });

                measureState.markers.push(marker);
            } else {
                measureState.markers[index].setLngLat(point);
            }

            updateMeasureLine();
            updateMeasureLabels();
            updateMeasureDisplay();
        }

        // Remove a point from the measurement polyline
        function removeMeasurePoint(index) {
            if (measureState.points.length <= 1) {
                clearMeasurement();
                return;
            }

            // Remove point
            measureState.points.splice(index, 1);

            // Remove marker
            measureState.markers[index].remove();
            measureState.markers.splice(index, 1);

            // Update marker indices
            measureState.markers.forEach(function(m, i) {
                m._measureIndex = i;
            });

            // Check if polygon was closed and now isn't
            if (measureState.isClosed && measureState.points.length < 3) {
                measureState.isClosed = false;
            }

            updateMeasureLine();
            updateMeasureLabels();
            updateMeasureDisplay();
        }

        // Update the measurement line on the map
        function updateMeasureLine() {
            var coordinates = measureState.points.slice();

            // Close polygon if needed
            if (measureState.isClosed && coordinates.length >= 3) {
                coordinates.push(coordinates[0]);
            }

            // Remove existing layers
            if (map.getLayer(measureState.lineLayerId)) {
                map.removeLayer(measureState.lineLayerId);
            }
            if (map.getSource(measureState.lineSourceId)) {
                map.removeSource(measureState.lineSourceId);
            }

            if (coordinates.length < 2) return;

            // Add source
            map.addSource(measureState.lineSourceId, {
                type: 'geojson',
                data: {
                    type: 'Feature',
                    geometry: {
                        type: 'LineString',
                        coordinates: coordinates
                    }
                }
            });

            // Add line layer
            map.addLayer({
                id: measureState.lineLayerId,
                type: 'line',
                source: measureState.lineSourceId,
                paint: {
                    'line-color': '#000000',
                    'line-width': 2
                }
            });
        }

        // Update distance labels on segments
        function updateMeasureLabels() {
            // Remove existing labels
            measureState.labelMarkers.forEach(function(m) { m.remove(); });
            measureState.labelMarkers = [];

            var points = measureState.points;
            if (points.length < 2) return;

            // Add label for each segment
            for (var i = 0; i < points.length - 1; i++) {
                var p1 = points[i];
                var p2 = points[i + 1];
                var distance = haversineDistance(p1[1], p1[0], p2[1], p2[0]);

                // Midpoint of segment
                var midLng = (p1[0] + p2[0]) / 2;
                var midLat = (p1[1] + p2[1]) / 2;

                var labelEl = createDistanceLabel(distance);
                var labelMarker = new maplibregl.Marker({
                    element: labelEl,
                    anchor: 'center'
                })
                .setLngLat([midLng, midLat])
                .addTo(map);

                measureState.labelMarkers.push(labelMarker);
            }

            // Add label for closing segment if polygon
            if (measureState.isClosed && points.length >= 3) {
                var pLast = points[points.length - 1];
                var pFirst = points[0];
                var closingDistance = haversineDistance(pLast[1], pLast[0], pFirst[1], pFirst[0]);

                var closingMidLng = (pLast[0] + pFirst[0]) / 2;
                var closingMidLat = (pLast[1] + pFirst[1]) / 2;

                var closingLabelEl = createDistanceLabel(closingDistance);
                var closingLabelMarker = new maplibregl.Marker({
                    element: closingLabelEl,
                    anchor: 'center'
                })
                .setLngLat([closingMidLng, closingMidLat])
                .addTo(map);

                measureState.labelMarkers.push(closingLabelMarker);
            }
        }

        // Update the measurement display panel
        function updateMeasureDisplay() {
            var points = measureState.points;
            var totalDistance = 0;

            // Calculate total distance
            for (var i = 0; i < points.length - 1; i++) {
                totalDistance += haversineDistance(
                    points[i][1], points[i][0],
                    points[i + 1][1], points[i + 1][0]
                );
            }

            // Add closing distance if polygon
            if (measureState.isClosed && points.length >= 3) {
                totalDistance += haversineDistance(
                    points[points.length - 1][1], points[points.length - 1][0],
                    points[0][1], points[0][0]
                );
            }

            measureTotalDistance.textContent = formatDistance(totalDistance);

            // Calculate and show area if polygon
            if (measureState.isClosed && points.length >= 3) {
                var area = calculatePolygonArea(points);
                measureTotalArea.textContent = formatArea(area);
                measureAreaRow.style.display = 'flex';
            } else {
                measureAreaRow.style.display = 'none';
            }
        }

        // Check if a click is near the first point (to close polygon)
        function isNearFirstPoint(lngLat) {
            if (measureState.points.length < 3) return false;

            var firstPoint = measureState.points[0];
            var distance = haversineDistance(lngLat.lat, lngLat.lng, firstPoint[1], firstPoint[0]);

            // Within 20 meters or visible pixel distance
            var pixelDistance = map.project(lngLat).dist(map.project({ lng: firstPoint[0], lat: firstPoint[1] }));

            return pixelDistance < 15;
        }

        // Start measurement mode
        function startMeasurement() {
            measureState.active = true;
            measureState.points = [];
            measureState.markers = [];
            measureState.labelMarkers = [];
            measureState.isClosed = false;

            measureDistanceDisplay.classList.add('show');
            measureTotalDistance.textContent = '0 m';
            measureAreaRow.style.display = 'none';

            map.getCanvas().style.cursor = 'crosshair';
        }

        // Clear all measurement
        function clearMeasurement() {
            measureState.active = false;
            measureState.isClosed = false;

            // Remove all markers
            measureState.markers.forEach(function(m) { m.remove(); });
            measureState.markers = [];

            // Remove all labels
            measureState.labelMarkers.forEach(function(m) { m.remove(); });
            measureState.labelMarkers = [];

            // Clear points
            measureState.points = [];

            // Remove line layer
            if (map.getLayer(measureState.lineLayerId)) {
                map.removeLayer(measureState.lineLayerId);
            }
            if (map.getSource(measureState.lineSourceId)) {
                map.removeSource(measureState.lineSourceId);
            }

            measureDistanceDisplay.classList.remove('show');
            map.getCanvas().style.cursor = '';
        }

        // Context menu - toggle measurement (start or clear)
        contextMenuMeasure.addEventListener('click', function() {
            hideContextMenu();
            if (measureState.active) {
                clearMeasurement();
            } else {
                startMeasurement();
            }
        });

        // Close button on measurement display
        measureDistanceClose.addEventListener('click', function() {
            clearMeasurement();
        });

        // Map click handler for measurement mode
        map.on('click', function(e) {
            hideContextMenu();

            if (!measureState.active) return;

            // Check if clicking near first point to close polygon
            if (isNearFirstPoint(e.lngLat) && !measureState.isClosed) {
                measureState.isClosed = true;
                updateMeasureLine();
                updateMeasureLabels();
                updateMeasureDisplay();
                return;
            }

            // Don't add points if polygon is already closed
            if (measureState.isClosed) return;

            // Add new point
            addMeasurePoint(e.lngLat);
        });