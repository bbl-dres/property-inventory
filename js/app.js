// BBL GIS Immobilienportfolio - Main Application Script
// Extracted from index.html for better maintainability

// Mapbox Access Token
        mapboxgl.accessToken = 'pk.eyJ1IjoiZGF2aWRyYXNuZXI1IiwiYSI6ImNtMm5yamVkdjA5MDcycXMyZ2I2MHRhamgifQ.m651j7WIX7MyxNh8KIQ1Gg';
        
        // Status Farben (synchronized with CSS --status-* variables)
        var statusColors = {
            'Aktiv': '#2e7d32',      // --status-active
            'In Renovation': '#ef6c00',   // --status-renovation
            'In Planung': '#1976d2',      // --status-planning
            'Verkauft': '#6C757D'   // --status-inactive
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
        var tableOpen = true;
        var currentView = 'map';
        var previousView = 'map';
        var galleryViewDirty = false;
        var activeTableTab = 'buildings';
        var skipFilterZoom = false;
        var parcelCurrentPage = 1;
        var parcelRowsPerPage = 50;
        var parcelSearchTerm = '';
        var selectedBuildingId = null;
        var selectedParcelId = null;
        var searchMarker = null;

        // Active Swisstopo layers added from search
        var activeSwisstopoLayers = [];
        // Track pending layer fetch requests for cancellation
        var pendingLayerFetches = {};


        // List View Pagination State
        var listCurrentPage = 1;
        var listRowsPerPage = 50;
        var listSearchTerm = '';

        // ===== UTILITY FUNCTIONS =====

        function escapeHtml(text) {
            if (text == null) return '';
            return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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
            status: { property: 'bbl_stat', label: 'Status' },
            eigentum: { property: 'bbl_eigen', label: 'Art Eigentum' },
            teilportfolio: { property: 'bbl_port', label: 'Teilportfolio' },
            gebaeudeart: { property: 'bbl_gbda1', label: 'Gebäudeart' },
            land: { property: 'adr_land', label: 'Land' },
            region: { property: 'adr_reg', label: 'Region' }
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

            // Update export count
            updateExportCount();

            // Update filter button state
            updateFilterButtonState();

            // Update filter pills in toolbar
            renderFilterPills();

            // Re-render current view
            renderCurrentView();

            // Update map layer filter
            if (window.map && map.getLayer('portfolio-points')) {
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
                return f.properties.bbl_id;
            });

            // Apply filter to show only filtered buildings
            map.setFilter('portfolio-points', ['in', ['get', 'bbl_id'], ['literal', filteredIds]]);

            // Also filter labels layer if it exists
            if (map.getLayer('portfolio-labels')) {
                map.setFilter('portfolio-labels', ['in', ['get', 'bbl_id'], ['literal', filteredIds]]);
            }

            // Zoom to fit filtered points (skip during style change restore)
            if (!skipFilterZoom) {
                zoomToFilteredPoints();
            }
        }

        function renderFilterPills() {
            var container = document.getElementById('filter-pills');
            if (!container) return;

            var html = '';
            var hasAny = false;

            for (var filterKey in activeFilters) {
                var values = activeFilters[filterKey];
                if (!values || values.length === 0) continue;
                hasAny = true;
                var label = filterConfig[filterKey] ? filterConfig[filterKey].label : filterKey;
                values.forEach(function(val) {
                    html += '<span class="filter-pill">' +
                        '<span class="filter-pill-label">' + label + ':</span>' +
                        val +
                        '<button class="filter-pill-remove" data-filter-key="' + filterKey + '" data-filter-value="' + val + '" title="Filter entfernen">close</button>' +
                        '</span>';
                });
            }

            if (hasAny) {
                html += '<button class="filter-pills-reset" id="filter-pills-reset">Alle Filter zurücksetzen</button>';
            }

            container.innerHTML = html;

            // Remove individual filter pill
            container.querySelectorAll('.filter-pill-remove').forEach(function(btn) {
                btn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    var key = this.dataset.filterKey;
                    var val = this.dataset.filterValue;
                    if (activeFilters[key]) {
                        activeFilters[key] = activeFilters[key].filter(function(v) { return v !== val; });
                        // Also uncheck the corresponding checkbox in the drawer
                        var cb = document.querySelector('#filter-pane input[data-filter="' + key + '"][data-value="' + val + '"]');
                        if (cb) cb.checked = false;
                        applyFilters();
                    }
                });
            });

            // Reset all filters
            var resetBtn = document.getElementById('filter-pills-reset');
            if (resetBtn) {
                resetBtn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    for (var key in activeFilters) {
                        activeFilters[key] = [];
                    }
                    // Uncheck all filter checkboxes in the drawer
                    document.querySelectorAll('#filter-pane input[type="checkbox"]').forEach(function(cb) {
                        cb.checked = false;
                    });
                    applyFilters();
                });
            }
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
                var bounds = new mapboxgl.LngLatBounds();
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
            document.querySelectorAll('#filter-pane input[type="checkbox"]').forEach(function(cb) {
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
            var land = currentDetailBuilding.properties.adr_land;
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
            var region = currentDetailBuilding.properties.adr_reg;
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

        var listViewDirty = false;

        function renderCurrentView() {
            // Only render list/parcels if table panel is visible and we're in map view
            if (currentView === 'map' && tableOpen) {
                renderListView();
                renderParcelsView();
            } else {
                listViewDirty = true;
            }
            if (currentView === 'gallery') {
                renderGalleryView();
            } else {
                galleryViewDirty = true;
            }
            // Map view updates via updateMapFilter()
        }

        // ===== SMART DRAWER =====
        function toggleSmartDrawer(open) {
            var drawer = document.getElementById('smart-drawer');
            var drawerBtn = document.getElementById('smart-drawer-btn');

            if (open === undefined) {
                open = !drawer.classList.contains('open');
            }

            if (open) {
                drawer.classList.add('open');
                drawerBtn.classList.add('panel-open');
                drawerBtn.setAttribute('aria-expanded', 'true');
                document.body.classList.add('drawer-open');
            } else {
                drawer.classList.remove('open');
                drawerBtn.classList.remove('panel-open');
                drawerBtn.setAttribute('aria-expanded', 'false');
                document.body.classList.remove('drawer-open');
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

            handle.addEventListener('mousedown', function(e) {
                isResizing = true;
                startX = e.clientX;
                startWidth = drawer.offsetWidth;
                handle.classList.add('dragging');
                drawer.classList.add('resizing');
                document.body.style.cursor = 'ew-resize';
                document.body.style.userSelect = 'none';
                e.preventDefault();
            });

            document.addEventListener('mousemove', function(e) {
                if (!isResizing) return;

                // Calculate new width (dragging left = wider, right = narrower)
                var delta = startX - e.clientX;
                var newWidth = Math.min(maxWidth, Math.max(minWidth, startWidth + delta));

                document.documentElement.style.setProperty('--drawer-width', newWidth + 'px');
            });

            document.addEventListener('mouseup', function() {
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
            });
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

            portfolioData.features.forEach(function(feature) {
                var props = feature.properties;
                // Properties are flat (BBL GIS IMMO field names), no extensionData nesting
                if (props.bbl_stat) uniqueValues.status.add(props.bbl_stat);
                if (props.bbl_eigen) uniqueValues.eigentum.add(props.bbl_eigen);
                if (props.bbl_port) uniqueValues.teilportfolio.add(props.bbl_port);
                if (props.bbl_gbda1) uniqueValues.gebaeudeart.add(props.bbl_gbda1);
                if (props.adr_land) uniqueValues.land.add(props.adr_land);
                if (props.adr_reg) uniqueValues.region.add(props.adr_reg);
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
                        '<label for="' + id + '">' + value + '</label>' +
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

        // ===== LANGUAGE SELECTOR =====
        (function() {
            var langBtn = document.getElementById('lang-btn');
            var langDropdown = document.getElementById('lang-dropdown');
            var langCurrent = document.getElementById('lang-current');
            if (!langBtn || !langDropdown) return;

            langBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                var isOpen = langDropdown.classList.contains('open');
                langDropdown.classList.toggle('open', !isOpen);
                langBtn.setAttribute('aria-expanded', !isOpen);
            });

            langDropdown.addEventListener('click', function(e) {
                var option = e.target.closest('.lang-option');
                if (!option) return;
                langDropdown.querySelectorAll('.lang-option').forEach(function(o) { o.classList.remove('active'); });
                option.classList.add('active');
                langCurrent.textContent = option.textContent;
                langDropdown.classList.remove('open');
                langBtn.setAttribute('aria-expanded', 'false');
                // TODO: implement actual language switching
            });

            document.addEventListener('click', function(e) {
                if (!e.target.closest('#lang-selector')) {
                    langDropdown.classList.remove('open');
                    langBtn.setAttribute('aria-expanded', 'false');
                }
            });
        })();

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
                    return b.properties.bbl_id === selectedBuildingId;
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
            var columns = ['bbl_id', 'bbl_bez', 'adr_conct', 'adr_ort', 'adr_land', 'bbl_stat', 'garea_ngf'];

            if (allFields && !visibleOnly) {
                columns = ['bbl_id', 'bbl_bez', 'bbl_stat', 'bbl_eigen', 'bbl_gbda1', 'bbl_gbda2',
                          'bbl_ostr', 'bbl_port', 'bbl_port2', 'bbl_bjahr',
                          'adr_land', 'adr_reg', 'adr_ort', 'adr_plz', 'adr_str', 'adr_hsnr',
                          'av_egid', 'av_egrid', 'bfs_gem', 'bfs_gemnr',
                          'bbl_awrt', 'bbl_bwrt', 'garea_gf', 'garea_ngf', 'garea_ebf'];
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
                'Aktiv': { color: 'ff50af4c', icon: 'grn-circle' },
                'In Renovation': { color: 'ff0098ff', icon: 'orange-circle' },
                'In Planung': { color: 'fff39621', icon: 'blu-circle' },
                'Verkauft': { color: 'ff9e9e9e', icon: 'grey-circle' }
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
                var status = props.bbl_stat || 'Aktiv';

                kmlContent += '    <Placemark>\n';
                kmlContent += '      <name>' + escapeXml(props.bbl_bez || 'Unbekannt') + '</name>\n';
                kmlContent += '      <description><![CDATA[\n';
                kmlContent += '        <b>Adresse:</b> ' + escapeXml(props.adr_conct || '') + '<br>\n';
                kmlContent += '        <b>Ort:</b> ' + escapeXml(props.adr_ort || '') + '<br>\n';
                kmlContent += '        <b>Status:</b> ' + escapeXml(status) + '<br>\n';
                kmlContent += '        <b>GF:</b> ' + (props.garea_gf ? Number(props.garea_gf).toLocaleString('de-CH') + ' m²' : '-') + '\n';
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
                            bbl_id: props.bbl_id,
                            bbl_bez: (props.bbl_bez || '').substring(0, 254),
                            bbl_stat: (props.bbl_stat || '').substring(0, 50),
                            adr_conct: (props.adr_conct || '').substring(0, 254),
                            adr_ort: (props.adr_ort || '').substring(0, 80),
                            adr_land: (props.adr_land || '').substring(0, 80),
                            bbl_port: (props.bbl_port || '').substring(0, 80),
                            garea_gf: props.garea_gf,
                            bbl_bjahr: props.bbl_bjahr
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
                    '<span><span style="display: inline-block; width: 10px; height: 10px; background: ' + statusColors['Aktiv'] + '; border-radius: 50%; margin-right: 2mm;"></span>In Betrieb</span>' +
                    '<span><span style="display: inline-block; width: 10px; height: 10px; background: ' + statusColors['In Renovation'] + '; border-radius: 50%; margin-right: 2mm;"></span>In Renovation</span>' +
                    '<span><span style="display: inline-block; width: 10px; height: 10px; background: ' + statusColors['In Planung'] + '; border-radius: 50%; margin-right: 2mm;"></span>In Planung</span>' +
                    '<span><span style="display: inline-block; width: 10px; height: 10px; background: ' + statusColors['Verkauft'] + '; border-radius: 50%; margin-right: 2mm;"></span>Ausser Betrieb</span>' +
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

            // Append to #map (the actual map canvas container), not #map-view
            var mapEl = document.getElementById('map');
            if (!mapEl) return;

            printPreviewOverlay = document.createElement('div');
            printPreviewOverlay.className = 'print-preview-overlay';
            printPreviewOverlay.innerHTML =
                '<svg><defs><mask id="print-preview-mask">' +
                '<rect width="100%" height="100%" fill="white"/>' +
                '<rect id="print-crop-rect" fill="black"/>' +
                '</mask></defs>' +
                '<rect width="100%" height="100%" fill="rgba(0,0,0,0.5)" mask="url(#print-preview-mask)"/>' +
                '</svg>' +
                '<div class="print-preview-crop"><div class="print-preview-label"></div></div>';
            mapEl.appendChild(printPreviewOverlay);
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
            if (!map) return;

            var mapEl = document.getElementById('map');
            if (!mapEl) return;

            var orientation = document.getElementById('print-orientation').value;
            var scaleOption = document.getElementById('print-scale').value;
            var printDims = getPrintDimensions(orientation);

            // Determine print scale
            var printScale = scaleOption === 'auto' ? getMapScale() : parseInt(scaleOption);

            // Calculate ground extent of the printed page (in meters)
            // Paper dimensions are in mm; scale converts to meters on the ground
            var groundWidthM = (printDims.width / 1000) * printScale;   // e.g., 297mm at 1:25000 = 7425m
            var groundHeightM = (printDims.height / 1000) * printScale;

            // Convert ground meters to screen pixels at current zoom
            var center = map.getCenter();
            var metersPerPixel = 156543.03392 * Math.cos(center.lat * Math.PI / 180) / Math.pow(2, map.getZoom());

            var cropWidth = groundWidthM / metersPerPixel;
            var cropHeight = groundHeightM / metersPerPixel;

            // Clamp to map container size (don't exceed visible area)
            var mapRect = mapEl.getBoundingClientRect();
            var maxW = mapRect.width - 20;
            var maxH = mapRect.height - 20;
            if (cropWidth > maxW || cropHeight > maxH) {
                var shrink = Math.min(maxW / cropWidth, maxH / cropHeight);
                cropWidth *= shrink;
                cropHeight *= shrink;
            }

            // Center the crop area in the map
            var cropX = (mapRect.width - cropWidth) / 2;
            var cropY = (mapRect.height - cropHeight) / 2;

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
            var labelEl = printPreviewOverlay.querySelector('.print-preview-label');
            if (labelEl) {
                var formatLabel = orientation.includes('a3') ? 'A3' : 'A4';
                var orientLabel = orientation.includes('landscape') ? 'Querformat' : 'Hochformat';
                var formattedScale = formatNum(printScale, 0);
                labelEl.textContent = formatLabel + ' ' + orientLabel + ' — 1:' + formattedScale;
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
            var term = query.toLowerCase().trim();
            if (activeTableTab === 'parcels') {
                parcelSearchTerm = term;
                parcelCurrentPage = 1;
                renderParcelsView();
            } else {
                listSearchTerm = term;
                listCurrentPage = 1;
                renderListView();
            }
        }

        // Initialize List View Toolbar Event Listeners
        // Delegated event listeners — attached once, handle all current & future rows/cards
        function initDelegatedListeners() {
            var listBody = document.getElementById('list-body');
            var galleryGrid = document.getElementById('gallery-grid');
            var parcelsBody = document.getElementById('parcels-body');

            // Buildings table: click to select & zoom
            if (listBody) {
                listBody.addEventListener('click', function(e) {
                    var row = e.target.closest('tr[data-id]');
                    if (!row) return;
                    listBody.querySelectorAll('tr.row-active').forEach(function(r) { r.classList.remove('row-active'); });
                    row.classList.add('row-active');
                    selectBuilding(row.dataset.id, true);
                });
                listBody.addEventListener('keydown', function(e) {
                    if (e.key === 'Enter' || e.key === ' ') {
                        var row = e.target.closest('tr[data-id]');
                        if (!row) return;
                        e.preventDefault();
                        row.click();
                    }
                });
            }

            // Gallery: click to show detail
            if (galleryGrid) {
                galleryGrid.addEventListener('click', function(e) {
                    var card = e.target.closest('.gallery-card[data-id]');
                    if (!card) return;
                    showDetailView(card.dataset.id);
                });
                galleryGrid.addEventListener('keydown', function(e) {
                    if (e.key === 'Enter' || e.key === ' ') {
                        var card = e.target.closest('.gallery-card[data-id]');
                        if (!card) return;
                        e.preventDefault();
                        showDetailView(card.dataset.id);
                    }
                });
            }

            // Parcels table: click to select & zoom
            if (parcelsBody) {
                parcelsBody.addEventListener('click', function(e) {
                    var row = e.target.closest('tr[data-parcel-id]');
                    if (!row) return;
                    parcelsBody.querySelectorAll('tr.row-active').forEach(function(r) { r.classList.remove('row-active'); });
                    row.classList.add('row-active');
                    selectParcel(row.dataset.parcelId, true);
                });
                parcelsBody.addEventListener('keydown', function(e) {
                    if (e.key === 'Enter' || e.key === ' ') {
                        var row = e.target.closest('tr[data-parcel-id]');
                        if (!row) return;
                        e.preventDefault();
                        row.click();
                    }
                });
            }
        }

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

            // Search input (debounced)
            var searchInput = document.getElementById('list-search-input');
            var searchDebounceTimer = null;
            if (searchInput) {
                searchInput.addEventListener('input', function() {
                    var value = this.value;
                    clearTimeout(searchDebounceTimer);
                    searchDebounceTimer = setTimeout(function() {
                        handleListSearch(value);
                    }, 200);
                });
            }
        }

        // Daten laden (parallel fetch of all entity files with error handling)
        function loadAllData() {
            showLoadingOverlay('Daten werden geladen...');

            Promise.all([
                fetchWithErrorHandling('data/buildings.geojson'),
                fetchWithErrorHandling('data/parcels.geojson')
            ])
                .then(function(results) {
                    // Validate and destructure results
                    portfolioData = results[0];
                    parcelData = results[1];

                    // Legacy stubs (data files removed in simplification)
                    allAreaMeasurements = [];
                    allDocuments = [];
                    allContacts = [];
                    allContracts = [];
                    allAssets = [];
                    allCosts = [];

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
                    renderParcelsView();
                    initDelegatedListeners();
                    initListToolbar();
                    initListPagination();
                    initParcelsTable();
                    initTableTabs();
                    initInternalLayerToggles();
                    initTablePanel();

                    // Always use the load event to avoid race conditions
                    // If already loaded, the callback fires immediately
                    if (map.loaded()) {
                        addMapLayers();
                    } else {
                        map.once('load', addMapLayers);
                    }

                    // Restore view from URL
                    var buildingId = getBuildingIdFromURL();
                    var initialTab = getTabFromURL();
                    var initialView = getViewFromURL();
                    if (buildingId) {
                        showDetailView(buildingId, initialTab);
                    } else if (initialView === 'gallery') {
                        switchView('gallery');
                        renderGalleryView();
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
            document.getElementById('gallery-view').classList.remove('active');
            document.getElementById('detail-view').classList.remove('active');
            document.getElementById('api-docs-view').classList.remove('active');

            // Disable page scrolling mode when leaving detail view
            document.body.classList.remove('detail-active');

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
                    if (map.getLayer('portfolio-points')) {
                        updateMapFilter();
                    }
                }, 100);
            }

            // Re-render gallery view if dirty
            if (view === 'gallery' && galleryViewDirty) {
                renderGalleryView();
                galleryViewDirty = false;
            }

            // Re-render list/parcels views if dirty when switching to map
            if (view === 'map' && listViewDirty && tableOpen) {
                renderListView();
                renderParcelsView();
                listViewDirty = false;
            }
        }

        function showDetailView(buildingId, tab) {
            if (!portfolioData) return;

            // Default tab to overview if not specified
            if (!tab) tab = 'overview';

            // Find building by ID
            var building = portfolioData.features.find(function(f) {
                return f.properties.bbl_id === buildingId;
            });

            if (!building) {
                console.error('Building not found:', buildingId);
                return;
            }

            currentDetailBuilding = building;
            previousView = currentView !== 'detail' ? currentView : previousView;
            currentView = 'detail';

            // Update URL with building ID and tab
            setViewInURL('detail', buildingId, tab);

            // Deactivate toggle buttons
            document.querySelectorAll('.view-toggle-btn').forEach(function(btn) {
                btn.classList.remove('active');
            });

            // Hide map and gallery, show detail
            document.getElementById('map-view').classList.remove('active');
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

            // Populate detail view
            populateDetailView(building);

            // Activate the specified tab
            activateTab(tab);
        }

        function activateTab(tab) {
            // Update active tab styling
            document.querySelectorAll('.detail-tab').forEach(function(t) {
                t.classList.remove('active');
                if (t.dataset.tab === tab) {
                    t.classList.add('active');
                }
            });

            // Switch content visibility
            document.querySelectorAll('.tab-content').forEach(function(content) {
                content.classList.remove('active');
            });
            var targetContent = document.querySelector('.tab-content[data-content="' + tab + '"]');
            if (targetContent) {
                targetContent.classList.add('active');
            }

            // Render tab-specific content (simplified: only overview + measurements)
            // Measurements tab is now static HTML, no table rendering needed
        }
        
        function populateDetailView(building) {
            var props = building.properties;
            var coords = building.geometry.coordinates;

            // Helper to access extensionData safely
            // Properties are flat (BBL GIS IMMO field names), no extensionData nesting

            // Helper to set text by id (silently skip missing elements)
            function setText(id, value) {
                var el = document.getElementById(id);
                if (el) el.textContent = (value !== undefined && value !== null && value !== '') ? value : '–';
            }

            // Breadcrumb (using BBL GIS IMMO flat field names)
            setText('breadcrumb-name', props.bbl_bez);
            setText('breadcrumb-country', props.adr_land);
            setText('breadcrumb-region', props.adr_reg);

            // --- Tab: Übersicht ---

            // Stammdaten
            setText('detail-status', props.bbl_stat);
            setText('detail-name', props.bbl_bez);
            setText('detail-id', props.bbl_id);
            setText('detail-objektart1', props.bbl_gbda1);
            setText('detail-objektart2', props.bbl_gbda2);
            setText('detail-eigentum', props.bbl_eigen);
            setText('detail-ostr', props.bbl_ostr);
            setText('detail-mietmodell', props.bbl_mietm);
            setText('detail-teilportfolio', props.bbl_port);
            setText('detail-teilportfolio-gruppe', props.bbl_port2);
            setText('detail-baujahr', props.bbl_bjahr);
            setText('detail-vjahr', props.bbl_vjahr);
            setText('detail-awrt', formatCHF(props.bbl_awrt));
            setText('detail-bwrt', formatCHF(props.bbl_bwrt));
            setText('detail-ovtw', props.bbl_ovtw);
            setText('detail-pvtw', props.bbl_pvtw);

            // Adresse
            setText('detail-country', props.adr_land);
            setText('detail-region', props.adr_reg);
            setText('detail-city', props.adr_ort);
            setText('detail-plz', props.adr_plz);
            setText('detail-street', props.adr_str);
            setText('detail-housenumber', props.adr_hsnr);
            setText('detail-address-concat', props.adr_conct);

            // Koordinaten (combined pairs)
            setText('detail-wgs84', props.wgs84_lat != null && props.wgs84_lon != null
                ? Number(props.wgs84_lat).toFixed(6) + ', ' + Number(props.wgs84_lon).toFixed(6) : null);
            setText('detail-lv95', props.lv95_e != null && props.lv95_n != null
                ? formatNum(props.lv95_e, 0) + ', ' + formatNum(props.lv95_n, 0) : null);
            setText('detail-elev', formatNum(props.egm_elev, 1));

            // Link helper and shared variables (used by multiple sections below)
            var lat = props.wgs84_lat;
            var lon = props.wgs84_lon;
            var lv95e = props.lv95_e;
            var lv95n = props.lv95_n;
            var linkText = 'Auf externer Karte anzeigen';

            function setLink(id, href, label) {
                var el = document.getElementById(id);
                if (!el) return;
                if (href) {
                    el.href = href;
                    if (label) el.textContent = label + ' \u2197';
                } else {
                    el.removeAttribute('href');
                    el.textContent = '–';
                }
            }

            // Koordinaten links
            setLink('detail-link-gmaps',
                lat && lon ? 'https://www.google.com/maps/search/?api=1&query=' + lat + ',' + lon : null,
                linkText);
            setLink('detail-link-streetview',
                lat && lon ? 'https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=' + lat + ',' + lon : null,
                linkText);

            // Amtliche Vermessung
            setText('detail-egid', props.av_egid);
            setText('detail-egrid', props.av_egrid);
            setText('detail-bfs-gem', props.bfs_gem);
            setText('detail-bfs-gemnr', props.bfs_gemnr);
            setLink('detail-link-geoadmin-gwr',
                lv95e && lv95n ? 'https://map.geo.admin.ch/#/map?lang=de&center=' + lv95e + ',' + lv95n + '&z=12&crosshair=marker&topic=ech&layers=ch.swisstopo.amtliches-strassenverzeichnis;ch.bfs.gebaeude_wohnungs_register&bgLayer=ch.swisstopo.swissimage' : null,
                linkText);
            setLink('detail-link-geoadmin-oereb',
                lv95e && lv95n ? 'https://map.geo.admin.ch/#/map?lang=de&center=' + lv95e + ',' + lv95n + '&z=12&crosshair=marker&topic=ech&layers=ch.swisstopo-vd.stand-oerebkataster&bgLayer=ch.swisstopo.swissimage' : null,
                linkText);

            // Bauzone
            setText('detail-zbez', props.av_zbez);
            setText('detail-znut', props.av_znut);
            setLink('detail-link-bauzonen',
                lv95e && lv95n ? 'https://map.geo.admin.ch/#/map?lang=de&center=' + lv95e + ',' + lv95n + '&z=8.589&crosshair=marker&topic=ech&layers=ch.are.bauzonen&bgLayer=ch.swisstopo.swissimage' : null,
                linkText);

            // Denkmalschutz
            setText('detail-hist', props.bbl_hist);
            setText('detail-arch', props.bbl_arch);
            setText('detail-kgs-kat', props.kgs_kat);
            setText('detail-kgs-nr', props.kgs_nr);
            setLink('detail-link-kgs',
                lv95e && lv95n ? 'https://map.geo.admin.ch/#/map?lang=de&center=' + lv95e + ',' + lv95n + '&z=8.589&crosshair=marker&topic=ech&layers=ch.babs.kulturgueter&bgLayer=ch.swisstopo.swissimage' : null,
                linkText);

            // Sonstiges
            setText('detail-objectid', props.objectid);
            setText('detail-etl-ts', formatDate(props.etl_ts));

            // --- Tab: Bemessungen ---
            // All dimension fields are now flat properties (BBL GIS IMMO field names)
            setText('detail-garea-gf', formatArea(props.garea_gf));
            setText('detail-garea-gfo', formatArea(props.garea_gfo));
            setText('detail-garea-gfu', formatArea(props.garea_gfu));
            setText('detail-garea-acu', props.garea_acu);
            setText('detail-garea-ngf', formatArea(props.garea_ngf));
            setText('detail-garea-nf', formatArea(props.garea_nf));
            setText('detail-garea-hnf', formatArea(props.garea_hnf));
            setText('detail-garea-nnf', formatArea(props.garea_nnf));
            setText('detail-garea-ff', formatArea(props.garea_ff));
            setText('detail-garea-vf', formatArea(props.garea_vf));
            setText('detail-garea-vmf', formatArea(props.garea_vmf));
            setText('detail-garea-ebf', formatArea(props.garea_ebf));

            // Volumes
            setText('detail-gvol-gv', formatVolume(props.gvol_gv));
            setText('detail-gvol-gvo', formatVolume(props.gvol_gvo));
            setText('detail-gvol-gvu', formatVolume(props.gvol_gvu));
            setText('detail-gvol-acu', props.gvol_acu);

            // Floors
            setText('detail-geschosse', props.gastw);
            setText('detail-geschosse-og', props.gastw_og);
            setText('detail-geschosse-ug', props.gastw_ug);
            setText('detail-geschosse-acu', props.gastw_acu);

            // Land areas
            setText('detail-larea-ggf', formatArea(props.larea_ggf));
            setText('detail-larea-gsf', formatArea(props.larea_gsf));
            setText('detail-larea-uf', formatArea(props.larea_uf));
            setText('detail-larea-acu', props.larea_acu);

            // Initialize carousel
            initCarousel();

            // Initialize mini map
            initMiniMap(coords);

            // Initialize info icons (once)
            initInfoIcons();
        }

        // ===== INFO TOOLTIPS FOR DETAIL LABELS =====
        // Descriptions keyed by the text content of the label
        var labelDescriptions = {
            // Stammdaten
            'Status': 'Aktueller Status des Objekts im SAP-System (bbl_stat)',
            'Bezeichnung': 'Offizielle Objektbezeichnung gemäss SAP (bbl_bez)',
            'ID': 'Interne BBL-ID: Buchungskreis / Wirtschaftseinheit / Teilobjekt (bbl_id)',
            'Objektart 1': 'Gebäudeart Stufe 1 gemäss SAP (bbl_gbda1)',
            'Objektart 2': 'Gebäudeart Stufe 2 gemäss SAP (bbl_gbda2)',
            'Art Eigentum': 'Eigentumsverhältnis: Eigentum Bund, Miete, etc. (bbl_eigen)',
            'Objektstrategie': 'Strategische Ausrichtung: Erhalten, Optimieren, Veräussern (bbl_ostr)',
            'Mietmodell': 'Mietmodell gemäss SAP: Vollkosten-, Kosten-, Marktmiete (bbl_mietm)',
            'Teilportfolio': 'Teilportfolio-Zuordnung gemäss SAP (bbl_port)',
            'Portfoliogruppe': 'Übergeordnete Teilportfoliogruppe (bbl_port2)',
            'Baujahr': 'Erstellungsjahr des Gebäudes (bbl_bjahr)',
            'Verkaufsjahr': 'Jahr des Verkaufs, leer wenn nicht verkauft (bbl_vjahr)',
            'Anschaffungswert': 'Anschaffungswert in Schweizer Franken (bbl_awrt)',
            'Buchwert': 'Aktueller Buchwert in Schweizer Franken (bbl_bwrt)',
            // Kontakte
            'Verantwortlich': 'Objektverantwortliche Person gemäss SAP (bbl_ovtw)',
            'Portfoliomanager': 'Zuständiger Portfoliomanager gemäss SAP (bbl_pvtw)',
            // Adresse
            'Adresse': 'Verkettet aus Strasse, Hausnummer, PLZ und Ort (adr_conct)',
            // Koordinaten
            'WGS84': 'Breitengrad und Längengrad im World Geodetic System 1984 (wgs84_lat, wgs84_lon)',
            'LV95': 'Schweizer Landeskoordinaten, aus WGS84 hergeleitet (lv95_e, lv95_n)',
            'EGM Höhe': 'Absolute Höhe über Meeresspiegel in Metern, EGM2008-Geoid (egm_elev)',
            // Amtliche Vermessung
            'EGID': 'Eidgenössischer Gebäudeidentifikator, nur Schweiz (av_egid)',
            'EGRID': 'Eidgenössischer Grundstücksidentifikator, nur Schweiz (av_egrid)',
            'Gemeindename': 'BFS Gemeindename gemäss amtlichem Gemeindeverzeichnis (bfs_gem)',
            'Gemeindenummer': 'BFS Gemeindenummer gemäss amtlichem Gemeindeverzeichnis (bfs_gemnr)',
            // Denkmalschutz
            'Hist. Ausstattung': 'Historische Ausstattung gemäss SAP (bbl_hist)',
            'Archivwürdigkeit': 'Archivwürdigkeit gemäss SAP (bbl_arch)',
            'KGS Kategorie': 'Kategorie im Schweizerischen Kulturgüterschutz-Inventar: A, B oder C (kgs_kat)',
            'KGS Nummer': 'Identifikationsnummer im KGS-Inventar (kgs_nr)',
            // Bemessungen
            'Geschossfläche GF': 'Brutto-Geschossfläche aller Geschosse nach SIA 416 (garea_gf)',
            'GF Oberirdisch': 'Geschossfläche der oberirdischen Geschosse (garea_gfo)',
            'GF Unterirdisch': 'Geschossfläche der unterirdischen Geschosse (garea_gfu)',
            'Genauigkeit': 'Angabe zur Datenherkunft: Vermessen, Geschätzt, oder AV',
            'Netto-Geschossfl. NGF': 'Nutzbare Fläche ohne Konstruktionsfläche nach SIA 416 (garea_ngf)',
            'Nutzfläche NF': 'Summe Haupt- und Nebennutzfläche nach SIA 416 (garea_nf)',
            'Hauptnutzfläche HNF': 'Fläche für die Hauptnutzung des Gebäudes nach SIA 416 (garea_hnf)',
            'Nebennutzfläche NNF': 'Fläche für Nebennutzungen nach SIA 416 (garea_nnf)',
            'Funktionsfläche FF': 'Fläche für gebäudetechnische Anlagen nach SIA 416 (garea_ff)',
            'Verkehrsfläche VF': 'Erschliessungsfläche: Korridore, Treppenhäuser, Aufzüge (garea_vf)',
            'Vermietbare Fl. VMF': 'Vermietbare Fläche nach SIA 416 (garea_vmf)',
            'Energiebezugsfl. EBF': 'Energiebezugsfläche nach SIA 380, Grundlage für Energiekennzahlen (garea_ebf)',
            'Gebäudevolumen GV': 'Gesamtes Gebäudevolumen nach SIA 416 (gvol_gv)',
            'GV Oberirdisch': 'Volumen der oberirdischen Gebäudeteile (gvol_gvo)',
            'GV Unterirdisch': 'Volumen der unterirdischen Gebäudeteile (gvol_gvu)',
            'Anzahl Total': 'Gesamtanzahl Geschosse ober- und unterirdisch (gastw)',
            'Oberirdisch': 'Anzahl Geschosse über Terrain (gastw_og)',
            'Unterirdisch': 'Anzahl Geschosse unter Terrain (gastw_ug)',
            'Gebäudegrundfläche GGF': 'Grundrissfläche des Gebäudes am Boden nach SIA 416 (larea_ggf)',
            'Grundstücksfläche GSF': 'Gesamtfläche des Grundstücks nach SIA 416 (larea_gsf)',
            'Umgebungsfläche UF': 'Grundstücksfläche abzüglich Gebäudegrundfläche (larea_uf)',
            // Sonstiges
            'OBJECTID': 'Interne ESRI-System-ID für GIS-Updates (objectid)',
            'ETL Zeitstempel': 'Zeitpunkt der letzten Synchronisation aus den Quellsystemen (etl_ts)',
        };

        // Inject info icons as 3rd column and make rows clickable (run once)
        var infoIconsInitialized = false;
        function initInfoIcons() {
            if (infoIconsInitialized) return;
            infoIconsInitialized = true;

            document.querySelectorAll('#detail-view .detail-grid-row').forEach(function(row) {
                var label = row.querySelector('.detail-label');
                if (!label) return;
                var desc = labelDescriptions[label.textContent.trim()];
                if (desc) {
                    // Add data-desc to row and append icon as 3rd grid cell
                    row.setAttribute('data-desc', desc);
                    var icon = document.createElement('span');
                    icon.className = 'info-icon';
                    icon.textContent = 'info';
                    icon.title = desc;
                    row.appendChild(icon);
                }
            });

            // Event delegation — clicking anywhere on a row with data-desc toggles popover
            document.getElementById('detail-view').addEventListener('click', function(e) {
                var row = e.target.closest('.detail-grid-row[data-desc]');

                // Click outside any desc row — close open popover
                if (!row) {
                    var open = document.querySelector('.info-popover.active');
                    if (open) open.remove();
                    return;
                }

                // Don't toggle when clicking links
                if (e.target.closest('a')) return;

                var desc = row.getAttribute('data-desc');

                // Close any existing popover
                var existing = document.querySelector('.info-popover.active');
                if (existing) {
                    var wasOnSame = existing.parentElement === row;
                    existing.remove();
                    if (wasOnSame) return; // toggle off
                }

                // Create popover inside the row (spans all 3 columns)
                var popover = document.createElement('div');
                popover.className = 'info-popover active';
                popover.textContent = desc;
                row.appendChild(popover);
            });
        }

        // Helper: Format number with Swiss thousand separator (1'000)
        function formatNum(value, decimals) {
            if (value === undefined || value === null || value === '') return null;
            var num = Number(value);
            var fixed = decimals != null ? num.toFixed(decimals) : String(num);
            // Split integer and decimal parts
            var parts = fixed.split('.');
            // Add apostrophe thousand separators to integer part
            parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, "'");
            return parts.join('.');
        }

        // Helper: Format area value with m² unit
        function formatArea(value) {
            if (value === undefined || value === null || value === '') return null;
            return formatNum(value, 0) + ' m²';
        }

        // Helper: Format volume value with m³ unit
        function formatVolume(value) {
            if (value === undefined || value === null || value === '') return null;
            return formatNum(value, 0) + ' m³';
        }

        // Helper: Format CHF currency
        function formatCHF(value) {
            if (value === undefined || value === null || value === '') return null;
            return 'CHF ' + formatNum(value, 0);
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
            miniMap = new mapboxgl.Map({
                container: 'mini-map',
                style: 'mapbox://styles/mapbox/light-v11',
                center: coords,
                zoom: 17,
                pitch: 50,
                bearing: -17
            });
            
            // Add 3D buildings layer
            miniMap.on('load', function() {
                // Add 3D buildings
                var layers = miniMap.getStyle().layers;
                var labelLayerId;
                for (var i = 0; i < layers.length; i++) {
                    if (layers[i].type === 'symbol' && layers[i].layout['text-field']) {
                        labelLayerId = layers[i].id;
                        break;
                    }
                }
                
                miniMap.addLayer({
                    'id': '3d-buildings',
                    'source': 'composite',
                    'source-layer': 'building',
                    'filter': ['==', 'extrude', 'true'],
                    'type': 'fill-extrusion',
                    'minzoom': 15,
                    'paint': {
                        'fill-extrusion-color': '#A8B0B7',
                        'fill-extrusion-height': [
                            'interpolate', ['linear'], ['zoom'],
                            15, 0,
                            15.05, ['get', 'height']
                        ],
                        'fill-extrusion-base': [
                            'interpolate', ['linear'], ['zoom'],
                            15, 0,
                            15.05, ['get', 'min_height']
                        ],
                        'fill-extrusion-opacity': 0.6
                    }
                }, labelLayerId);
                
                // Add marker
                new mapboxgl.Marker({ color: '#c00' })
                    .setLngLat(coords)
                    .addTo(miniMap);
            });
            
            // Add navigation controls
            miniMap.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');

            // Force resize after container settles its width
            miniMap.on('load', function() { miniMap.resize(); });
            setTimeout(function() { if (miniMap) miniMap.resize(); }, 300);
        }
        
        // Back button handler
        document.getElementById('btn-back').addEventListener('click', function() {
            switchView(previousView || 'map');
        });

        // API docs footer link
        var apiLink = document.getElementById('footer-api-link');
        if (apiLink) {
            apiLink.addEventListener('click', function(e) {
                e.preventDefault();
                // Hide all views
                document.getElementById('map-view').classList.remove('active');
                document.getElementById('gallery-view').classList.remove('active');
                document.getElementById('detail-view').classList.remove('active');
                document.getElementById('api-docs-view').classList.add('active');
                // Hide detail header
                document.body.classList.remove('detail-active');
                // Deactivate toggle buttons
                document.querySelectorAll('.view-toggle-btn').forEach(function(btn) { btn.classList.remove('active'); });
                window.scrollTo(0, 0);
            });
        }

        // View toggle click handlers
        document.querySelectorAll('.view-toggle-btn').forEach(function(btn) {
            btn.addEventListener('click', function() {
                switchView(this.dataset.view);
            });
        });

        // Handle browser back/forward
        window.addEventListener('popstate', function() {
            var buildingId = getBuildingIdFromURL();
            var tab = getTabFromURL();
            if (buildingId) {
                showDetailView(buildingId, tab);
            } else if (currentView === 'detail') {
                switchView(previousView || 'map');
            }
        });
        
        // ===== RENDER LIST VIEW =====
        function renderListView() {
            if (!portfolioData) return;

            var dataToRender = filteredData || portfolioData;
            var listBody = document.getElementById('list-body');
            var tableWrapper = document.querySelector('#table-panel .list-table-wrapper');
            var html = '';

            // Apply list search filter if active
            if (listSearchTerm) {
                dataToRender = {
                    type: dataToRender.type,
                    features: dataToRender.features.filter(function(feature) {
                        var props = feature.properties;
                        // Properties are flat (BBL GIS IMMO field names), no extensionData nesting
                        var searchableText = [
                            props.bbl_id,
                            props.bbl_bez,
                            props.adr_land,
                            props.adr_ort,
                            props.adr_conct,
                            props.bbl_port,
                            props.bbl_stat
                        ].join(' ').toLowerCase();
                        return searchableText.includes(listSearchTerm);
                    })
                };
            }

            // Handle empty state
            if (dataToRender.features.length === 0) {
                listBody.innerHTML = '';
                // Check if empty state already exists
                var existingEmpty = document.querySelector('#table-panel .empty-state');
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
                var existingEmpty = document.querySelector('#table-panel .empty-state');
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
                // Properties are flat (BBL GIS IMMO field names), no extensionData nesting
                var statusClass = props.bbl_stat === 'Aktiv' ? 'status-active' :
                                  props.bbl_stat === 'In Renovation' ? 'status-renovation' :
                                  props.bbl_stat === 'In Planung' ? 'status-planning' : 'status-inactive';
                var flaeche = Number(props.garea_ngf || 0).toLocaleString('de-CH');

                html += '<tr data-id="' + props.bbl_id + '" tabindex="0" role="row">' +
                    '<td class="col-id">' + props.bbl_id + '</td>' +
                    '<td class="col-name">' + props.bbl_bez + '</td>' +
                    '<td class="col-land">' + props.adr_land + '</td>' +
                    '<td class="col-ort">' + props.adr_ort + '</td>' +
                    '<td class="col-adresse">' + props.adr_conct + '</td>' +
                    '<td class="col-portfolio">' + (props.bbl_port || '—') + '</td>' +
                    '<td class="col-flaeche">' + flaeche + ' m²</td>' +
                    '<td class="col-status"><span class="status-badge ' + statusClass + '">' + props.bbl_stat + '</span></td>' +
                '</tr>';
            });

            listBody.innerHTML = html;

            // Update pagination info
            updateListPaginationInfo(listCurrentPage, totalPages, totalItems);
        }

        // Update list pagination UI
        function updateListPaginationInfo(currentPage, totalPages, totalItems) {
            var infoEl = document.getElementById('list-pagination-info');
            var pageInfoEl = document.getElementById('list-page-info');
            var prevBtn = document.getElementById('list-prev-btn');
            var nextBtn = document.getElementById('list-next-btn');

            if (infoEl) {
                if (totalItems === 0) {
                    infoEl.textContent = 'Keine Objekte';
                } else {
                    var startIndex = (currentPage - 1) * listRowsPerPage + 1;
                    var endIndex = Math.min(currentPage * listRowsPerPage, totalItems);
                    infoEl.textContent = startIndex + '–' + endIndex + ' von ' + totalItems + ' Objekte';
                }
            }

            if (pageInfoEl) {
                if (totalItems === 0) {
                    pageInfoEl.textContent = '';
                } else {
                    pageInfoEl.textContent = 'Seite ' + currentPage + ' von ' + totalPages;
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

        // ===== GALLERY VIEW =====
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
                // Properties are flat (BBL GIS IMMO field names), no extensionData nesting
                var flaeche = Number(props.garea_ngf || 0).toLocaleString('de-CH');
                var statusClass = props.bbl_stat === 'Aktiv' ? 'status-active' :
                                  props.bbl_stat === 'In Renovation' ? 'status-renovation' :
                                  props.bbl_stat === 'In Planung' ? 'status-planning' : 'status-inactive';
                var imageUrl = placeholderImages[index % placeholderImages.length];

                html += '<div class="gallery-card" data-id="' + props.bbl_id + '" tabindex="0" role="article" aria-label="' + props.bbl_bez + '">' +
                    '<div class="gallery-image" style="background-image: url(' + imageUrl + ')" role="img" aria-label="Bild von ' + props.bbl_bez + '">' +
                        '<div class="gallery-image-label">' + props.adr_land + '</div>' +
                    '</div>' +
                    '<div class="gallery-content">' +
                        '<div class="gallery-title">' + props.bbl_bez + '</div>' +
                        '<div class="gallery-subtitle">' + props.adr_conct + '</div>' +
                        '<div class="gallery-meta">' +
                            '<span class="gallery-tag">' + (props.bbl_port || '—') + '</span>' +
                            '<span class="gallery-tag">' + flaeche + ' m²</span>' +
                            '<span class="status-badge ' + statusClass + '">' + props.bbl_stat + '</span>' +
                        '</div>' +
                    '</div>' +
                '</div>';
            });

            galleryGrid.innerHTML = html;
        }

        // ===== PARCELS TABLE =====
        function renderParcelsView() {
            if (!parcelData) return;

            var dataToRender = parcelData;

            // Apply search filter
            if (parcelSearchTerm) {
                dataToRender = {
                    type: dataToRender.type,
                    features: dataToRender.features.filter(function(feature) {
                        var props = feature.properties;
                        var searchableText = [
                            props.bbl_id,
                            props.av_nr,
                            props.bbl_bez,
                            props.bfs_gem,
                            props.adr_reg,
                            props.av_zbez,
                            props.bbl_eigen
                        ].join(' ').toLowerCase();
                        return searchableText.includes(parcelSearchTerm);
                    })
                };
            }

            var parcelsBody = document.getElementById('parcels-body');

            // Handle empty state
            if (dataToRender.features.length === 0) {
                parcelsBody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:24px; color:var(--grey-500);">Keine Grundstücke gefunden</td></tr>';
                updateParcelsPaginationInfo(1, 1, 0);
                return;
            }

            // Pagination
            var totalItems = dataToRender.features.length;
            var totalPages = Math.ceil(totalItems / parcelRowsPerPage);
            if (parcelCurrentPage > totalPages) parcelCurrentPage = totalPages;
            if (parcelCurrentPage < 1) parcelCurrentPage = 1;

            var startIndex = (parcelCurrentPage - 1) * parcelRowsPerPage;
            var endIndex = Math.min(startIndex + parcelRowsPerPage, totalItems);
            var paginatedFeatures = dataToRender.features.slice(startIndex, endIndex);

            var html = '';
            paginatedFeatures.forEach(function(feature) {
                var props = feature.properties;
                var area = Number(props.larea_gsf || 0).toLocaleString('de-CH');

                html += '<tr data-parcel-id="' + props.bbl_id + '" tabindex="0" role="row">' +
                    '<td class="col-parcel-id">' + props.bbl_id + '</td>' +
                    '<td class="col-parcel-plot">' + (props.av_nr || '–') + '</td>' +
                    '<td class="col-parcel-name">' + props.bbl_bez + '</td>' +
                    '<td class="col-parcel-municipality">' + (props.bfs_gem || '–') + '</td>' +
                    '<td class="col-parcel-canton">' + (props.adr_reg || '–') + '</td>' +
                    '<td class="col-parcel-area">' + area + ' m²</td>' +
                    '<td class="col-parcel-zone">' + (props.av_zbez || '–') + '</td>' +
                    '<td class="col-parcel-ownership">' + (props.bbl_eigen || '–') + '</td>' +
                '</tr>';
            });

            parcelsBody.innerHTML = html;
            updateParcelsPaginationInfo(parcelCurrentPage, totalPages, totalItems);
        }

        function updateParcelsPaginationInfo(currentPage, totalPages, totalItems) {
            var infoEl = document.getElementById('parcels-pagination-info');
            var pageInfoEl = document.getElementById('parcels-page-info');
            var prevBtn = document.getElementById('parcels-prev-btn');
            var nextBtn = document.getElementById('parcels-next-btn');

            if (infoEl) {
                if (totalItems === 0) {
                    infoEl.textContent = 'Keine Grundstücke';
                } else {
                    var startIndex = (currentPage - 1) * parcelRowsPerPage + 1;
                    var endIndex = Math.min(currentPage * parcelRowsPerPage, totalItems);
                    infoEl.textContent = startIndex + '–' + endIndex + ' von ' + totalItems + ' Grundstücke';
                }
            }

            if (pageInfoEl) {
                pageInfoEl.textContent = totalItems === 0 ? '' : 'Seite ' + currentPage + ' von ' + totalPages;
            }

            if (prevBtn) prevBtn.disabled = currentPage <= 1;
            if (nextBtn) nextBtn.disabled = currentPage >= totalPages;
        }

        function initParcelsTable() {
            var rowsSelect = document.getElementById('parcels-rows-per-page');
            var prevBtn = document.getElementById('parcels-prev-btn');
            var nextBtn = document.getElementById('parcels-next-btn');

            if (rowsSelect) {
                rowsSelect.addEventListener('change', function() {
                    parcelRowsPerPage = parseInt(this.value, 10);
                    parcelCurrentPage = 1;
                    renderParcelsView();
                });
            }

            if (prevBtn) {
                prevBtn.addEventListener('click', function() {
                    if (parcelCurrentPage > 1) {
                        parcelCurrentPage--;
                        renderParcelsView();
                    }
                });
            }

            if (nextBtn) {
                nextBtn.addEventListener('click', function() {
                    if (!parcelData) return;
                    var totalPages = Math.ceil(parcelData.features.length / parcelRowsPerPage);
                    if (parcelCurrentPage < totalPages) {
                        parcelCurrentPage++;
                        renderParcelsView();
                    }
                });
            }
        }

        // ===== TABLE TAB SWITCHING =====
        function switchTableTab(tabName) {
            activeTableTab = tabName;

            // Update tab buttons
            document.querySelectorAll('.table-tab').forEach(function(tab) {
                tab.classList.toggle('active', tab.dataset.tableTab === tabName);
                tab.setAttribute('aria-selected', tab.dataset.tableTab === tabName ? 'true' : 'false');
            });

            // Show/hide tab content
            document.getElementById('buildings-table-content').classList.toggle('active', tabName === 'buildings');
            document.getElementById('parcels-table-content').classList.toggle('active', tabName === 'parcels');

            // Update search placeholder
            var searchInput = document.getElementById('list-search-input');
            if (searchInput) {
                searchInput.placeholder = tabName === 'buildings' ? 'Gebäude durchsuchen...' : 'Grundstücke durchsuchen...';
                searchInput.value = '';
            }

            // Clear search terms
            listSearchTerm = '';
            parcelSearchTerm = '';

            // Render the active table
            if (tabName === 'parcels') {
                renderParcelsView();
            } else {
                renderListView();
            }

            // Persist table tab in URL
            var url = new URL(window.location);
            url.searchParams.set('tableTab', tabName);
            window.history.replaceState({}, '', url);
        }

        function initTableTabs() {
            document.querySelectorAll('.table-tab').forEach(function(tab) {
                tab.addEventListener('click', function() {
                    switchTableTab(this.dataset.tableTab);
                });
            });

            // Restore table tab from URL
            var urlParams = new URLSearchParams(window.location.search);
            var savedTab = urlParams.get('tableTab');
            if (savedTab === 'parcels' || savedTab === 'buildings') {
                switchTableTab(savedTab);
            }
        }

        // Sync table row highlight and scroll when a feature is selected on the map
        function syncTableToBuilding(buildingId) {
            if (!portfolioData) return;

            // Switch to buildings tab
            if (activeTableTab !== 'buildings') {
                switchTableTab('buildings');
            }

            // Find the index of this building in the (filtered) data
            var dataToSearch = filteredData || portfolioData;
            var index = -1;
            for (var i = 0; i < dataToSearch.features.length; i++) {
                if (dataToSearch.features[i].properties.bbl_id === buildingId) {
                    index = i;
                    break;
                }
            }
            if (index === -1) return;

            // Jump to the correct page
            var targetPage = Math.floor(index / listRowsPerPage) + 1;
            if (listCurrentPage !== targetPage) {
                listCurrentPage = targetPage;
                renderListView();
            }

            // Highlight and scroll to the row
            var listBody = document.getElementById('list-body');
            if (!listBody) return;
            listBody.querySelectorAll('tr.row-active').forEach(function(r) { r.classList.remove('row-active'); });
            var row = listBody.querySelector('tr[data-id="' + buildingId + '"]');
            if (row) {
                row.classList.add('row-active');
                row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            }
        }

        function syncTableToParcel(parcelId) {
            if (!parcelData) return;

            // Switch to parcels tab
            if (activeTableTab !== 'parcels') {
                switchTableTab('parcels');
            }

            // Find the index of this parcel
            var index = -1;
            for (var i = 0; i < parcelData.features.length; i++) {
                if (parcelData.features[i].properties.parcelId === parcelId) {
                    index = i;
                    break;
                }
            }
            if (index === -1) return;

            // Jump to the correct page
            var targetPage = Math.floor(index / parcelRowsPerPage) + 1;
            if (parcelCurrentPage !== targetPage) {
                parcelCurrentPage = targetPage;
                renderParcelsView();
            }

            // Highlight and scroll to the row
            var parcelsBody = document.getElementById('parcels-body');
            if (!parcelsBody) return;
            parcelsBody.querySelectorAll('tr.row-active').forEach(function(r) { r.classList.remove('row-active'); });
            var row = parcelsBody.querySelector('tr[data-parcel-id="' + parcelId + '"]');
            if (row) {
                row.classList.add('row-active');
                row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            }
        }

        // ===== INTERNAL LAYER TOGGLES =====
        function initInternalLayerToggles() {
            var buildingsToggle = document.getElementById('layer-toggle-buildings');
            var parcelsToggle = document.getElementById('layer-toggle-parcels');

            if (buildingsToggle) {
                buildingsToggle.addEventListener('change', function() {
                    var vis = this.checked ? 'visible' : 'none';
                    ['portfolio-points', 'portfolio-selected', 'portfolio-selected-pulse', 'portfolio-labels'].forEach(function(id) {
                        if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', vis);
                    });
                });
            }

            if (parcelsToggle) {
                parcelsToggle.addEventListener('change', function() {
                    var vis = this.checked ? 'visible' : 'none';
                    ['parcels-fill', 'parcels-outline', 'parcels-highlight', 'parcels-selected', 'parcels-selected-outline'].forEach(function(id) {
                        if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', vis);
                    });
                });
            }
        }

        // ===== TABLE PANEL TOGGLE & RESIZE =====
        function initTablePanel() {
            var toggleBtn = document.getElementById('tbl-toggle');
            var panel = document.getElementById('table-panel');
            var handle = document.getElementById('tbl-resize-handle');

            // Toggle table panel
            toggleBtn.addEventListener('click', function() {
                tableOpen = !tableOpen;
                panel.classList.toggle('collapsed', !tableOpen);
                toggleBtn.classList.toggle('collapsed', !tableOpen);
                handle.style.display = tableOpen ? '' : 'none';
                // Re-render tables if they were deferred while panel was closed
                if (tableOpen && listViewDirty) {
                    renderListView();
                    renderParcelsView();
                    listViewDirty = false;
                }
                setTimeout(function() {
                    if (window.map) map.resize();
                }, 280);
            });

            // Resize handle drag
            if (!handle) return;
            var MIN_H = 120;
            var MAX_FRAC = 0.75;
            var startY, startH;

            handle.addEventListener('pointerdown', function(e) {
                e.preventDefault();
                handle.setPointerCapture(e.pointerId);
                handle.classList.add('dragging');
                panel.style.transition = 'none';
                startY = e.clientY;
                startH = panel.getBoundingClientRect().height;

                function onMove(ev) {
                    var delta = startY - ev.clientY;
                    var maxH = window.innerHeight * MAX_FRAC;
                    panel.style.height = Math.min(maxH, Math.max(MIN_H, startH + delta)) + 'px';
                    if (window.map) map.resize();
                }

                function onUp() {
                    handle.classList.remove('dragging');
                    panel.style.transition = '';
                    handle.removeEventListener('pointermove', onMove);
                    handle.removeEventListener('pointerup', onUp);
                    if (window.map) map.resize();
                }

                handle.addEventListener('pointermove', onMove);
                handle.addEventListener('pointerup', onUp);
            });
        }

        // ===== INITIALIZE MAP =====

        // Map style definitions (defined early for use in map initialization)
        var mapStyles = {
            'light-v11': { name: 'Light', url: 'mapbox://styles/mapbox/light-v11' },
            'streets-v12': { name: 'Standard', url: 'mapbox://styles/mapbox/streets-v12' },
            'satellite-v9': { name: 'Luftbild', url: 'mapbox://styles/mapbox/satellite-v9' },
            'satellite-streets-v12': { name: 'Hybrid', url: 'mapbox://styles/mapbox/satellite-streets-v12' }
        };

        // Load saved map style from localStorage (default to light-v11)
        var currentMapStyle = localStorage.getItem('mapStyle') || 'light-v11';
        // Validate saved style exists, fallback to default if invalid
        if (!mapStyles[currentMapStyle]) {
            currentMapStyle = 'light-v11';
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

        var map = new mapboxgl.Map({
            container: 'map',
            style: mapStyles[currentMapStyle].url,
            center: startCenter,
            zoom: startZoom,
            preserveDrawingBuffer: true
        });
        
        map.addControl(new mapboxgl.NavigationControl(), 'top-right');
        map.addControl(new mapboxgl.ScaleControl({ maxWidth: 200 }), 'bottom-left');

        // Home button control
        var HomeControl = function() {};
        HomeControl.prototype.onAdd = function(map) {
            this._map = map;
            this._container = document.createElement('div');
            this._container.className = 'mapboxgl-ctrl mapboxgl-ctrl-group';

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
            if (currentView === 'detail') return; // Don't update if in detail view
            
            var center = map.getCenter();
            var zoom = map.getZoom();
            
            var url = new URL(window.location);
            url.searchParams.set('lng', center.lng.toFixed(5));
            url.searchParams.set('lat', center.lat.toFixed(5));
            url.searchParams.set('zoom', zoom.toFixed(2));
            
            // Use replaceState to update URL without adding to history stack
            window.history.replaceState({}, '', url);
        });

        var pendingCoordUpdate = null;
        var coordsEl = document.getElementById('coordinates');
        map.on('mousemove', function(e) {
            if (!pendingCoordUpdate) {
                var lng = e.lngLat.lng;
                var lat = e.lngLat.lat;
                pendingCoordUpdate = requestAnimationFrame(function() {
                    coordsEl.textContent = 'WGS 84 | Koordinaten: ' + lng.toFixed(5) + ', ' + lat.toFixed(5);
                    pendingCoordUpdate = null;
                });
            }
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
            identifiedFeaturePopup = new mapboxgl.Popup({
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
                    filter: ['==', ['get', 'bbl_id'], ''],
                    paint: {
                        'fill-color': '#1976d2',
                        'fill-opacity': 0.35
                    }
                });

                // Parcel selected fill layer (persistent selection)
                map.addLayer({
                    id: 'parcels-selected',
                    type: 'fill',
                    source: 'parcels',
                    filter: ['==', ['get', 'bbl_id'], ''],
                    paint: {
                        'fill-color': '#1976d2',
                        'fill-opacity': 0.45
                    }
                });

                // Parcel selected outline layer (persistent selection)
                map.addLayer({
                    id: 'parcels-selected-outline',
                    type: 'line',
                    source: 'parcels',
                    filter: ['==', ['get', 'bbl_id'], ''],
                    paint: {
                        'line-color': '#1976d2',
                        'line-width': 3,
                        'line-opacity': 1
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
                        ['get', 'bbl_stat'],
                        'Aktiv', statusColors['Aktiv'],
                        'In Renovation', statusColors['In Renovation'],
                        'In Planung', statusColors['In Planung'],
                        'Verkauft', statusColors['Verkauft'],
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
                filter: ['==', ['get', 'bbl_id'], ''],
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
                filter: ['==', ['get', 'bbl_id'], ''],
                paint: {
                    'circle-radius': 24,
                    'circle-color': 'transparent',
                    'circle-stroke-width': 2,
                    'circle-stroke-color': '#c00',
                    'circle-stroke-opacity': 0.4
                }
            });

            // Building ID labels (visible at zoom >= 16)
            map.addLayer({
                id: 'portfolio-labels',
                type: 'symbol',
                source: 'portfolio',
                minzoom: 16,
                layout: {
                    'text-field': ['get', 'bbl_id'],
                    'text-font': ['DIN Pro Bold', 'Arial Unicode MS Bold'],
                    'text-size': 13,
                    'text-anchor': 'bottom',
                    'text-offset': [0, -1.5],
                    'text-allow-overlap': false
                },
                paint: {
                    'text-color': '#1a1a1a',
                    'text-halo-color': '#ffffff',
                    'text-halo-width': 2
                }
            });

            // Animate the pulse layer (throttled to every 3rd frame for performance)
            var pulseRadius = 24;
            var pulseOpacity = 0.4;
            var pulseDirection = 1;
            var pulseAnimationId = null;
            var pulseFrameCount = 0;

            function animatePulse() {
                // Only animate if a building is selected
                if (!selectedBuildingId) {
                    pulseAnimationId = null;
                    return;
                }

                pulseFrameCount++;
                if (pulseFrameCount % 3 === 0) {
                    pulseRadius += 0.9 * pulseDirection;
                    pulseOpacity -= 0.03 * pulseDirection;

                    if (pulseRadius >= 32) {
                        pulseDirection = -1;
                    } else if (pulseRadius <= 24) {
                        pulseDirection = 1;
                    }

                    if (map.getLayer('portfolio-selected-pulse')) {
                        map.setPaintProperty('portfolio-selected-pulse', 'circle-radius', pulseRadius);
                        map.setPaintProperty('portfolio-selected-pulse', 'circle-stroke-opacity', Math.max(0.1, pulseOpacity));
                    }
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
                selectBuilding(props.bbl_id, false);
            });

            // PARCEL HANDLERS
            if (parcelData && parcelData.features) {
                map.on('mouseenter', 'parcels-fill', function(e) {
                    map.getCanvas().style.cursor = 'pointer';
                    if (e.features.length > 0) {
                        var parcelId = e.features[0].properties.bbl_id;
                        map.setFilter('parcels-highlight', ['==', ['get', 'bbl_id'], parcelId]);
                    }
                });

                map.on('mouseleave', 'parcels-fill', function() {
                    map.getCanvas().style.cursor = '';
                    map.setFilter('parcels-highlight', ['==', ['get', 'bbl_id'], '']);
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
                    selectParcel(props.bbl_id);
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
                    return f.properties.bbl_id === urlBuildingId;
                });
                if (building) {
                    selectBuilding(urlBuildingId, true);
                }
            } else if (urlParcelId && parcelData && parcelData.features) {
                var parcel = parcelData.features.find(function(f) {
                    return f.properties.bbl_id === urlParcelId;
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
            var building = portfolioData.features.find(function(f) { return f.properties.bbl_id === buildingId; });
            if (!building) return;

            var props = building.properties;
            // Properties are flat (BBL GIS IMMO field names), no extensionData nesting
            var flaeche = Number(props.garea_ngf || 0).toLocaleString('de-CH');
            var baujahr = props.bbl_bjahr || '—';
            var statusClass = props.bbl_stat === 'Aktiv' ? 'status-active' :
                              props.bbl_stat === 'In Renovation' ? 'status-renovation' :
                              props.bbl_stat === 'In Planung' ? 'status-planning' : 'status-inactive';

            // Update selected IDs (clear parcel selection)
            selectedBuildingId = buildingId;
            selectedParcelId = null;
            updateSelectedBuilding();
            updateSelectedParcel();
            updateUrlWithSelection();

            // Update header title
            document.getElementById('info-header-title').textContent = 'Gebäude';

            // Show preview image for buildings
            document.getElementById('info-preview-image').style.display = 'block';

            // Find building index for placeholder image
            var buildingIndex = portfolioData.features.findIndex(function(f) {
                return f.properties.bbl_id === buildingId;
            });
            var imageUrl = placeholderImages[buildingIndex % placeholderImages.length];

            // Set preview image
            document.getElementById('info-preview-image').style.backgroundImage = 'url(' + imageUrl + ')';

            var infoHtml =
                '<div class="info-row"><span class="info-label">Objekt-ID</span><span class="info-value">' + props.bbl_id + '</span></div>' +
                '<div class="info-row"><span class="info-label">Name</span><span class="info-value">' + props.bbl_bez + '</span></div>' +
                '<div class="info-row"><span class="info-label">Ort</span><span class="info-value">' + props.adr_ort + ', ' + props.adr_land + '</span></div>' +
                '<div class="info-row info-row-secondary"><span class="info-label">Adresse</span><span class="info-value">' + props.adr_conct + '</span></div>' +
                '<div class="info-row info-row-secondary"><span class="info-label">Fläche NGF</span><span class="info-value">' + flaeche + ' m²</span></div>' +
                '<div class="info-row info-row-secondary"><span class="info-label">Baujahr</span><span class="info-value">' + baujahr + '</span></div>' +
                '<div class="info-row info-row-secondary"><span class="info-label">Verantwortlich</span><span class="info-value">' + (props.bbl_ovtw || '—') + '</span></div>' +
                '<div class="info-row"><span class="info-label">Status</span><span class="info-value"><span class="status-badge ' + statusClass + '">' + props.bbl_stat + '</span></span></div>' +
                '<div class="info-footer">' +
                    '<button class="info-detail-link" onclick="showDetailView(\'' + props.bbl_id + '\')">' +
                        '<span class="material-symbols-outlined">open_in_new</span>' +
                        'Details anzeigen' +
                    '</button>' +
                '</div>';

            document.getElementById('info-body').innerHTML = infoHtml;
            document.getElementById('info-panel').classList.add('show');

            // Sync table: switch tab, highlight row, scroll into view
            syncTableToBuilding(buildingId);

            // UPDATED: Only fly to building if explicitly requested (e.g. from Search)
            if (map && flyToBuilding) {
                map.flyTo({
                    center: building.geometry.coordinates,
                    zoom: 16
                });
            }
        }
        
        function updateSelectedBuilding() {
            if (map && map.getLayer('portfolio-selected')) {
                map.setFilter('portfolio-selected', ['==', ['get', 'bbl_id'], selectedBuildingId || '']);
            }
            if (map && map.getLayer('portfolio-selected-pulse')) {
                map.setFilter('portfolio-selected-pulse', ['==', ['get', 'bbl_id'], selectedBuildingId || '']);
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
            window.history.replaceState({}, '', url);
        }

        function loadLayersFromUrl() {
            var urlParams = new URLSearchParams(window.location.search);
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
            var parcel = parcelData.features.find(function(f) { return f.properties.bbl_id === parcelId; });
            if (!parcel) return;

            var props = parcel.properties;

            // Format area with thousand separators
            var formattedArea = Number(props.larea_gsf || 0).toLocaleString('de-CH');

            // Update selected IDs (clear building selection)
            selectedParcelId = parcelId;
            selectedBuildingId = null;
            updateSelectedBuilding();
            updateSelectedParcel();
            updateUrlWithSelection();

            // Update header title
            document.getElementById('info-header-title').textContent = 'Parzelle';

            // Hide preview image for parcels
            document.getElementById('info-preview-image').style.display = 'none';

            // Build info panel HTML content
            var infoHtml =
                '<div class="info-row"><span class="info-label">Parzellen-ID</span><span class="info-value">' + escapeHtml(props.bbl_id || '—') + '</span></div>' +
                '<div class="info-row"><span class="info-label">Name</span><span class="info-value">' + escapeHtml(props.bbl_bez || '—') + '</span></div>' +
                '<div class="info-row"><span class="info-label">Ort</span><span class="info-value">' + escapeHtml(props.bfs_gem || props.adr_ort || '—') + ', ' + escapeHtml(props.adr_reg || '—') + '</span></div>' +
                '<div class="info-row info-row-secondary"><span class="info-label">Parzellen-Nr.</span><span class="info-value">' + escapeHtml(props.av_nr || '—') + '</span></div>' +
                '<div class="info-row info-row-secondary"><span class="info-label">Fläche</span><span class="info-value">' + formattedArea + ' m²</span></div>' +
                '<div class="info-row info-row-secondary"><span class="info-label">Nutzungszone</span><span class="info-value">' + escapeHtml(props.av_zbez || '—') + '</span></div>' +
                '<div class="info-row info-row-secondary"><span class="info-label">Eigentum</span><span class="info-value">' + escapeHtml(props.bbl_eigen || '—') + '</span></div>';

            document.getElementById('info-body').innerHTML = infoHtml;
            document.getElementById('info-panel').classList.add('show');

            // Sync table: switch tab, highlight row, scroll into view
            syncTableToParcel(parcelId);

            // Fly to parcel if requested
            if (map && flyToParcel && parcel.geometry && parcel.geometry.coordinates) {
                var center = getPolygonCentroid(parcel.geometry.coordinates);
                map.flyTo({
                    center: center,
                    zoom: 16
                });
            }
        }

        function updateSelectedParcel() {
            if (map && map.getLayer('parcels-selected')) {
                map.setFilter('parcels-selected', ['==', ['get', 'bbl_id'], selectedParcelId || '']);
            }
            if (map && map.getLayer('parcels-selected-outline')) {
                map.setFilter('parcels-selected-outline', ['==', ['get', 'bbl_id'], selectedParcelId || '']);
            }
        }

        // ===== SEARCH FUNCTIONALITY =====
        var searchInput = document.getElementById('search-input');
        var searchResults = document.getElementById('search-results');
        var searchSpinner = document.getElementById('search-spinner');
        var searchClearBtn = document.getElementById('search-clear-btn');
        var searchDebounceTimer;
        var searchAbortController = null;
        
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
        
        function performSearch(term) {
            // Cancel any pending search requests
            if (searchAbortController) {
                searchAbortController.abort();
            }
            searchAbortController = new AbortController();
            var signal = searchAbortController.signal;

            var promises = [];

            // 1. Local Search
            promises.push(new Promise(function(resolve) {
                var matches = [];
                if (portfolioData) {
                    var lowerTerm = term.toLowerCase();
                    matches = portfolioData.features.filter(function(f) {
                        var p = f.properties;
                        return (p.bbl_bez && p.bbl_bez.toLowerCase().includes(lowerTerm)) ||
                               (p.adr_conct && p.adr_conct.toLowerCase().includes(lowerTerm)) ||
                               (p.adr_ort && p.adr_ort.toLowerCase().includes(lowerTerm));
                    });
                }
                resolve({ type: 'local', data: matches });
            }));

            // 2. Swisstopo Locations
            promises.push(fetch('https://api3.geo.admin.ch/rest/services/ech/SearchServer?type=locations&limit=5&sr=4326&searchText=' + encodeURIComponent(term), { signal: signal })
                .then(function(r) { return r.json(); })
                .then(function(data) { return { type: 'locations', data: data.results }; })
                .catch(function(e) {
                    if (e.name === 'AbortError') return { type: 'locations', data: [], aborted: true };
                    return { type: 'locations', data: [] };
                }));

            // 3. Swisstopo Layers
            promises.push(fetch('https://api3.geo.admin.ch/rest/services/ech/SearchServer?type=layers&limit=5&lang=de&searchText=' + encodeURIComponent(term), { signal: signal })
                .then(function(r) { return r.json(); })
                .then(function(data) { return { type: 'layers', data: data.results }; })
                .catch(function(e) {
                    if (e.name === 'AbortError') return { type: 'layers', data: [], aborted: true };
                    return { type: 'layers', data: [] };
                }));

            Promise.all(promises).then(function(results) {
                // Don't render if request was aborted (newer search in progress)
                var wasAborted = results.some(function(r) { return r.aborted; });
                if (wasAborted) return;

                renderSearchResults(results);
                searchSpinner.style.display = 'none';
            });
        }
        
        function renderSearchResults(results) {
            var localResults = results.find(function(r) { return r.type === 'local'; }).data;
            var locResults = results.find(function(r) { return r.type === 'locations'; }).data;
            var layerResults = results.find(function(r) { return r.type === 'layers'; }).data;
            
            var html = '';
            
            // Section: Objekte (Local)
            if (localResults.length > 0) {
                html += '<div class="search-section-header">Objekte</div>';
                localResults.forEach(function(f) {
                    html += '<div class="search-item" onclick="handleSearchClick(\'local\', \'' + f.properties.bbl_id + '\')">' +
                            '<div class="search-item-title">' + f.properties.bbl_bez + '</div>' +
                            '<div class="search-item-subtitle">' + f.properties.streetName + ', ' + f.properties.city + '</div>' +
                            '</div>';
                });
            }
            
            // Section: Orte (API)
            if (locResults.length > 0) {
                html += '<div class="search-section-header">Orte</div>';
                locResults.forEach(function(r, index) {
                    var lat = r.attrs.lat;
                    var lon = r.attrs.lon;
                    var zoom = r.attrs.zoomlevel || 14;
                    html += '<div class="search-item" onclick="handleSearchClick(\'location\', null, ' + lat + ', ' + lon + ', ' + zoom + ')">' +
                            '<div class="search-item-title">' + r.attrs.label + '</div>' +
                            '</div>';
                });
            }
            
            // Section: Karten (API)
            if (layerResults.length > 0) {
                html += '<div class="search-section-header">Karten hinzufügen...</div>';
                layerResults.forEach(function(r) {
                    var layerId = r.attrs.layer || '';
                    var layerTitle = r.attrs.title || r.attrs.label || layerId;
                    html += '<div class="search-item" onclick="handleSearchClick(\'layer\', \'' + layerId.replace(/'/g, "\\'") + '\', null, null, null, \'' + layerTitle.replace(/'/g, "\\'") + '\')">' +
                            '<div class="search-item-title">' + r.attrs.label + '</div>' +
                            '</div>';
                });
            }
            
            if (html === '') {
                html = '<div class="search-item" style="cursor:default;"><div class="search-item-subtitle">Keine Resultate gefunden</div></div>';
            }
            
            searchResults.innerHTML = html;
            searchResults.classList.add('active');
        }
        
        // Make this function global so onclick in HTML string works
        window.handleSearchClick = function(type, id, lat, lon, zoom, title) {
            searchResults.classList.remove('active');
            
            // Close detail view if open
            if (currentView === 'detail') {
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

                var b = portfolioData.features.find(f => f.properties.bbl_id === id);
                if(b) {
                    searchInput.value = b.properties.name;
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
                searchMarker = new mapboxgl.Marker({ color: '#c00' })
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

                    // Show print preview when Karte drucken accordion is opened
                    if (lastSpan && lastSpan.textContent.trim() === 'Karte drucken') {
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

        // Internal layer metadata
        var internalLayerMeta = {
            buildings: {
                title: 'Gebäude (Bundesamt für Bauten und Logistik BBL)',
                description: 'Interner Datensatz des BBL-Immobilienportfolios. Enthält sämtliche Gebäude mit Standort, Nutzungstyp, Eigentumsverhältnissen, Baujahr und weiteren Attributen.',
                source: 'BBL Immobilienportfolio',
                geometryType: 'Point',
                format: 'GeoJSON',
                dataKey: 'portfolioData'
            },
            parcels: {
                title: 'Grundstücke (Bundesamt für Bauten und Logistik BBL)',
                description: 'Interner Datensatz der BBL-Parzellen. Enthält Grundstücksinformationen mit Flächenangaben, Nutzungszonen und Eigentumsverhältnissen.',
                source: 'BBL Parzellen',
                geometryType: 'Polygon',
                format: 'GeoJSON',
                dataKey: 'parcelData'
            }
        };

        function buildLegendHTML(layerKey) {
            if (layerKey === 'buildings') {
                return '<div class="legend-footer"><span>Legende</span></div>' +
                    '<div class="internal-legend">' +
                    '<div class="internal-legend-item">' +
                        '<span class="internal-legend-circle" style="background: ' + statusColors['Aktiv'] + ';"></span>' +
                        '<span>In Betrieb</span>' +
                    '</div>' +
                    '<div class="internal-legend-item">' +
                        '<span class="internal-legend-circle" style="background: ' + statusColors['In Renovation'] + ';"></span>' +
                        '<span>In Renovation</span>' +
                    '</div>' +
                    '<div class="internal-legend-item">' +
                        '<span class="internal-legend-circle" style="background: ' + statusColors['In Planung'] + ';"></span>' +
                        '<span>In Planung</span>' +
                    '</div>' +
                    '<div class="internal-legend-item">' +
                        '<span class="internal-legend-circle" style="background: ' + statusColors['Verkauft'] + ';"></span>' +
                        '<span>Ausser Betrieb</span>' +
                    '</div>' +
                    '</div>';
            }
            // Parcels: single color
            return '<div class="legend-footer"><span>Legende</span></div>' +
                '<div class="internal-legend">' +
                '<div class="internal-legend-item">' +
                    '<span class="internal-legend-rect" style="background: rgba(25, 118, 210, 0.15); border: 2px solid #1976d2;"></span>' +
                    '<span>Parzelle</span>' +
                '</div>' +
                '</div>';
        }

        function showInternalLayerInfo(layerKey) {
            if (!layerInfoModal || !layerInfoContent) return;

            var meta = internalLayerMeta[layerKey];
            if (!meta) return;

            var today = new Date();
            var datenstand = today.toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric' });

            var html = '<div class="legend-container">' +
                '<div class="bod-title">' + escapeHtml(meta.title) + '</div>' +
                '<div class="legend-abstract">' + escapeHtml(meta.description) + '</div>' +
                buildLegendHTML(layerKey) +
                '<div class="legend-footer"><span>Informationen</span></div>' +
                '<table>' +
                '<tr><td>Quelle</td><td>' + escapeHtml(meta.source) + '</td></tr>' +
                '<tr><td>Format</td><td>' + escapeHtml(meta.format) + ' (' + escapeHtml(meta.geometryType) + ')</td></tr>' +
                '<tr><td>Metadaten</td><td><a href="#">Link zu Metadaten</a></td></tr>' +
                '<tr><td>Detailbeschreibung</td><td><a href="#">Link zur Detailbeschreibung</a></td></tr>' +
                '<tr><td>Datenbezug</td><td><a href="#">Link für Datenbezug</a></td></tr>' +
                '<tr><td>Thematisches Geoportal</td><td><a href="#">Link zum Fachportal</a></td></tr>' +
                '<tr><td>Datenstand</td><td>' + datenstand + '</td></tr>' +
                '</table>' +
                '</div>';

            layerInfoContent.innerHTML = html;
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

        function loadGeokatalog() {
            if (geokatalogLoaded) return;

            var treeContainer = document.getElementById('geokatalog-tree');

            fetch('https://api3.geo.admin.ch/rest/services/ech/CatalogServer?lang=de')
                .then(function(response) {
                    if (!response.ok) throw new Error('API nicht erreichbar');
                    return response.json();
                })
                .then(function(data) {
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
                    console.error('Geokatalog Fehler:', error);
                    treeContainer.innerHTML = '<div class="geokatalog-error">Fehler beim Laden des Katalogs</div>';
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
        var menuOpen = true;
        
        function updateMenuTogglePosition() {
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
            menuOpen = !menuOpen;
            
            if (menuOpen) {
                accordionPanel.classList.remove('collapsed');
                menuToggleText.textContent = 'Menü schliessen';
                menuToggleIcon.textContent = 'expand_less';
            } else {
                accordionPanel.classList.add('collapsed');
                menuToggleText.textContent = 'Menü öffnen';
                menuToggleIcon.textContent = 'expand_more';
            }
            
            updateMenuTogglePositionDebounced();
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
                    return f.properties.bbl_id === selectedBuildingId;
                });
                if (building && building.geometry) {
                    map.flyTo({
                        center: building.geometry.coordinates,
                        zoom: 16
                    });
                }
            } else if (selectedParcelId && map) {
                var parcel = parcelData.features.find(function(f) {
                    return f.properties.bbl_id === selectedParcelId;
                });
                if (parcel && parcel.geometry && parcel.geometry.coordinates) {
                    var center = getPolygonCentroid(parcel.geometry.coordinates);
                    map.flyTo({
                        center: center,
                        zoom: 16
                    });
                }
            }
        });

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
                        showToast('Link in Zwischenablage kopiert');
                    }).catch(function() {
                        showToast('Kopieren fehlgeschlagen');
                    });
                }
            }
        });

        // ===== DETAIL TABS =====
        document.querySelectorAll('.detail-tab').forEach(function(tab) {
            tab.addEventListener('click', function() {
                if (this.classList.contains('disabled')) {
                    return;
                }
                var targetTab = this.dataset.tab;

                // Update active tab
                document.querySelectorAll('.detail-tab').forEach(function(t) {
                    t.classList.remove('active');
                });
                this.classList.add('active');

                // Switch content
                document.querySelectorAll('.tab-content').forEach(function(content) {
                    content.classList.remove('active');
                });
                var targetContent = document.querySelector('.tab-content[data-content="' + targetTab + '"]');
                if (targetContent) {
                    targetContent.classList.add('active');
                }

                // Update URL with current tab
                setTabInURL(targetTab);

                // Render measurements table when switching to measurements tab
                if (targetTab === 'measurements') {
                    renderMeasurementsTable();
                }

                // Render documents table when switching to documents tab
                if (targetTab === 'documents') {
                    renderDocumentsTable();
                }

                // Render contacts table when switching to contacts tab
                if (targetTab === 'contacts') {
                    renderContactsTable();
                }

                // Render costs table when switching to costs tab
                if (targetTab === 'costs') {
                    renderCostsTable();
                }

                // Render contracts table when switching to contracts tab
                if (targetTab === 'contracts') {
                    renderContractsTable();
                }

                // Render assets table when switching to assets tab
                if (targetTab === 'assets') {
                    renderAssetsTable();
                }
            });
        });

        // ===== STYLE SWITCHER =====
        // Note: mapStyles and currentMapStyle are defined earlier (before map initialization)
        var styleSwitcherBtn = document.getElementById('style-switcher-btn');
        var stylePanel = document.getElementById('style-panel');
        var stylePanelOpen = false;

        // Generate thumbnail URL using Mapbox Static Images API
        function getStyleThumbnail(styleId, width, height) {
            var lon = 8.2275;
            var lat = 46.8182;
            var zoom = 6;
            return 'https://api.mapbox.com/styles/v1/mapbox/' + styleId + '/static/' +
                   lon + ',' + lat + ',' + zoom + '/' + width + 'x' + height +
                   '?access_token=' + mapboxgl.accessToken;
        }

        // Initialize thumbnails
        function initStyleThumbnails() {
            Object.keys(mapStyles).forEach(function(styleId) {
                var thumbEl = document.getElementById('thumb-' + styleId);
                if (thumbEl) {
                    thumbEl.src = getStyleThumbnail(styleId, 140, 100);
                }
            });
            // Set current style thumbnail
            document.getElementById('current-style-thumb').src = getStyleThumbnail(currentMapStyle, 160, 120);
        }

        // Update active style button
        function updateActiveStyleButton() {
            document.querySelectorAll('.style-option').forEach(function(btn) {
                btn.classList.remove('active');
                if (btn.dataset.style === currentMapStyle) {
                    btn.classList.add('active');
                }
            });
            document.getElementById('current-style-thumb').src = getStyleThumbnail(currentMapStyle, 160, 120);
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

        // Re-add layers after style change — preserve filters and selection
        map.on('style.load', function() {
            if (portfolioData && !map.getSource('portfolio')) {
                addMapLayers();

                // Restore active filters without triggering zoom
                skipFilterZoom = true;
                applyFilters();
                skipFilterZoom = false;

                // Restore selected building highlight
                if (selectedBuildingId && map.getLayer('portfolio-selected')) {
                    map.setFilter('portfolio-selected', ['==', ['get', 'bbl_id'], selectedBuildingId]);
                    map.setFilter('portfolio-selected-pulse', ['==', ['get', 'bbl_id'], selectedBuildingId]);
                    if (window.startPulseAnimation) window.startPulseAnimation();
                }

                // Restore selected parcel highlight
                if (selectedParcelId && map.getLayer('parcels-selected')) {
                    map.setFilter('parcels-selected', ['==', ['get', 'bbl_id'], selectedParcelId]);
                    map.setFilter('parcels-selected-outline', ['==', ['get', 'bbl_id'], selectedParcelId]);
                }
            }

            // Re-add Swisstopo layers that were active before style change
            readdSwisstopoLayers();
        });

        // Initialize thumbnails after a short delay to ensure token is available
        setTimeout(initStyleThumbnails, 100);
        updateActiveStyleButton();

        // ===== PRINT WIDGET =====

        // ISO paper sizes in mm (portrait)
        var paperSizes = {
            'a0': { width: 841, height: 1189 },
            'a1': { width: 594, height: 841 },
            'a2': { width: 420, height: 594 },
            'a3': { width: 297, height: 420 },
            'a4': { width: 210, height: 297 },
            'a5': { width: 148, height: 210 }
        };

        function getPrintDimensions(orientation) {
            var parts = orientation.split('-');  // e.g., 'landscape-a4'
            var dir = parts[0];
            var size = parts[1];
            var base = paperSizes[size] || paperSizes['a4'];
            if (dir === 'landscape') {
                return { width: base.height, height: base.width };
            }
            return { width: base.width, height: base.height };
        }

        // Map scale from zoom level
        function getMapScale() {
            if (!map) return 25000;
            var center = map.getCenter();
            var zoom = map.getZoom();
            var metersPerPixel = 156543.03392 * Math.cos(center.lat * Math.PI / 180) / Math.pow(2, zoom);
            var pixelsPerMeter = 96 / 0.0254;
            return Math.round(metersPerPixel * pixelsPerMeter);
        }

        // Print preview: orientation change and map move update the overlay
        // (showPrintPreview/hidePrintPreview/updatePrintPreview defined earlier with createPrintPreviewOverlay)
        var printOrientationEl = document.getElementById('print-orientation');
        if (printOrientationEl) {
            printOrientationEl.addEventListener('change', updatePrintPreview);
        }
        var printScaleEl = document.getElementById('print-scale');
        if (printScaleEl) {
            printScaleEl.addEventListener('change', updatePrintPreview);
        }
        if (map) {
            map.on('moveend', updatePrintPreview);
            map.on('zoomend', updatePrintPreview);
        }

        // Generate print — opens a new window with the map crop
        var printGenerateBtn = document.getElementById('print-generate-btn');
        if (printGenerateBtn) {
            printGenerateBtn.addEventListener('click', function() {
                var btn = this;
                var originalHTML = btn.innerHTML;
                btn.disabled = true;
                btn.innerHTML = '<span class="material-symbols-outlined">hourglass_empty</span> Wird erstellt...';

                var orientation = document.getElementById('print-orientation').value;
                var scaleOption = document.getElementById('print-scale').value;
                var includeLegend = document.getElementById('print-legend').checked;
                var includeTitle = document.getElementById('print-title').checked;
                var dims = getPrintDimensions(orientation);
                var printScale = scaleOption === 'auto' ? getMapScale() : parseInt(scaleOption);

                setTimeout(function() {
                    try {
                        // Capture the map canvas
                        var mapCanvas = map.getCanvas();
                        var srcW = mapCanvas.width;
                        var srcH = mapCanvas.height;

                        // Calculate crop area (same logic as preview)
                        var center = map.getCenter();
                        var metersPerPixel = 156543.03392 * Math.cos(center.lat * Math.PI / 180) / Math.pow(2, map.getZoom());
                        var groundW = (dims.width / 1000) * printScale;
                        var groundH = (dims.height / 1000) * printScale;
                        var cropPxW = groundW / metersPerPixel;
                        var cropPxH = groundH / metersPerPixel;

                        // Device pixel ratio for hi-res capture
                        var dpr = window.devicePixelRatio || 1;
                        var cropSrcW = Math.min(cropPxW * dpr, srcW);
                        var cropSrcH = Math.min(cropPxH * dpr, srcH);
                        var cropSrcX = (srcW - cropSrcW) / 2;
                        var cropSrcY = (srcH - cropSrcH) / 2;

                        // Create output canvas at print resolution (150 DPI)
                        var printDPI = 150;
                        var outW = Math.round(dims.width / 25.4 * printDPI);
                        var outH = Math.round(dims.height / 25.4 * printDPI);
                        var outCanvas = document.createElement('canvas');
                        outCanvas.width = outW;
                        outCanvas.height = outH;
                        var ctx = outCanvas.getContext('2d');

                        // White background
                        ctx.fillStyle = '#ffffff';
                        ctx.fillRect(0, 0, outW, outH);

                        // Layout constants (in output pixels)
                        var margin = Math.round(10 / 25.4 * printDPI);  // 10mm margin
                        var headerH = includeTitle ? Math.round(12 / 25.4 * printDPI) : 0;
                        var legendH = includeLegend ? Math.round(10 / 25.4 * printDPI) : 0;
                        var footerH = Math.round(6 / 25.4 * printDPI);
                        var mapX = margin;
                        var mapY = margin + headerH;
                        var mapW = outW - margin * 2;
                        var mapH = outH - margin * 2 - headerH - legendH - footerH;

                        // Draw map crop
                        ctx.drawImage(mapCanvas, cropSrcX, cropSrcY, cropSrcW, cropSrcH, mapX, mapY, mapW, mapH);

                        // Map border
                        ctx.strokeStyle = '#cccccc';
                        ctx.lineWidth = 1;
                        ctx.strokeRect(mapX, mapY, mapW, mapH);

                        // Header
                        if (includeTitle) {
                            ctx.fillStyle = '#1a1a1a';
                            ctx.font = 'bold ' + Math.round(14 / 25.4 * printDPI) + 'px Arial';
                            ctx.fillText('BBL Immobilienportfolio', margin, margin + headerH * 0.6);
                            ctx.fillStyle = '#666666';
                            ctx.font = Math.round(8 / 25.4 * printDPI) + 'px Arial';
                            var dateStr = new Date().toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric' });
                            var dateW = ctx.measureText(dateStr).width;
                            ctx.fillText(dateStr, outW - margin - dateW, margin + headerH * 0.6);
                            // Header line
                            ctx.strokeStyle = '#333333';
                            ctx.lineWidth = 2;
                            ctx.beginPath();
                            ctx.moveTo(margin, margin + headerH - 2);
                            ctx.lineTo(outW - margin, margin + headerH - 2);
                            ctx.stroke();
                        }

                        // Scale bar on map
                        var scaleBarY = mapY + mapH - Math.round(5 / 25.4 * printDPI);
                        var scaleBarX = mapX + Math.round(5 / 25.4 * printDPI);
                        ctx.fillStyle = 'rgba(255,255,255,0.85)';
                        var scaleText = 'Massstab 1:' + formatNum(printScale, 0);
                        ctx.font = Math.round(7 / 25.4 * printDPI) + 'px Arial';
                        var stw = ctx.measureText(scaleText).width;
                        ctx.fillRect(scaleBarX - 4, scaleBarY - Math.round(4 / 25.4 * printDPI), stw + 8, Math.round(6 / 25.4 * printDPI));
                        ctx.fillStyle = '#333333';
                        ctx.fillText(scaleText, scaleBarX, scaleBarY);

                        // North arrow on map
                        var naX = mapX + mapW - Math.round(8 / 25.4 * printDPI);
                        var naY = mapY + Math.round(8 / 25.4 * printDPI);
                        var naR = Math.round(4 / 25.4 * printDPI);
                        ctx.fillStyle = 'rgba(255,255,255,0.85)';
                        ctx.beginPath();
                        ctx.arc(naX, naY, naR, 0, Math.PI * 2);
                        ctx.fill();
                        ctx.strokeStyle = '#cccccc';
                        ctx.lineWidth = 1;
                        ctx.stroke();
                        ctx.fillStyle = '#333333';
                        ctx.font = 'bold ' + Math.round(naR * 1.2) + 'px Arial';
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        ctx.fillText('N', naX, naY);
                        ctx.textAlign = 'start';
                        ctx.textBaseline = 'alphabetic';

                        // Legend
                        if (includeLegend) {
                            var legY = mapY + mapH + Math.round(5 / 25.4 * printDPI);
                            var legFont = Math.round(7 / 25.4 * printDPI);
                            ctx.font = legFont + 'px Arial';
                            var legItems = [
                                { color: '#2e7d32', label: 'Aktiv' },
                                { color: '#0098ff', label: 'In Renovation' },
                                { color: '#f39621', label: 'In Planung' },
                                { color: '#9e9e9e', label: 'Verkauft' }
                            ];
                            var legX = margin;
                            var dotR = Math.round(2.5 / 25.4 * printDPI);
                            legItems.forEach(function(item) {
                                ctx.fillStyle = item.color;
                                ctx.beginPath();
                                ctx.arc(legX + dotR, legY + dotR, dotR, 0, Math.PI * 2);
                                ctx.fill();
                                ctx.fillStyle = '#333333';
                                ctx.fillText(item.label, legX + dotR * 2 + 6, legY + dotR + legFont * 0.35);
                                legX += ctx.measureText(item.label).width + dotR * 2 + 24;
                            });
                        }

                        // Footer
                        var footY = outH - margin;
                        ctx.strokeStyle = '#cccccc';
                        ctx.lineWidth = 1;
                        ctx.beginPath();
                        ctx.moveTo(margin, footY - footerH + 4);
                        ctx.lineTo(outW - margin, footY - footerH + 4);
                        ctx.stroke();
                        ctx.fillStyle = '#999999';
                        ctx.font = Math.round(5.5 / 25.4 * printDPI) + 'px Arial';
                        ctx.fillText('Quelle: BBL Immobilienportfolio — Bundesamt für Bauten und Logistik', margin, footY);
                        var copyr = '© ' + new Date().getFullYear() + ' Schweizerische Eidgenossenschaft';
                        var cw = ctx.measureText(copyr).width;
                        ctx.fillText(copyr, outW - margin - cw, footY);

                        // Open in new window for printing
                        var dataUrl = outCanvas.toDataURL('image/png');
                        var printWin = window.open('', '_blank');
                        if (printWin) {
                            printWin.document.write(
                                '<!DOCTYPE html><html><head><title>BBL Immobilienportfolio — Druck</title>' +
                                '<style>@page{size:' + dims.width + 'mm ' + dims.height + 'mm;margin:0;}' +
                                'body{margin:0;display:flex;justify-content:center;align-items:center;height:100vh;background:#f5f5f5;}' +
                                'img{max-width:100%;max-height:100vh;box-shadow:0 2px 20px rgba(0,0,0,0.15);}' +
                                '@media print{body{background:none;height:auto;}img{max-width:100%;max-height:none;box-shadow:none;}}</style></head>' +
                                '<body><img src="' + dataUrl + '" onload="setTimeout(function(){window.print();},300);"></body></html>'
                            );
                            printWin.document.close();
                        }

                    } catch (e) {
                        console.error('Print error:', e);
                        alert('Fehler beim Erstellen der Druckansicht: ' + e.message);
                    }

                    btn.innerHTML = originalHTML;
                    btn.disabled = false;
                    showPrintPreview();
                }, 200);
            });
        }

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
                    var buildingId = building.properties.bbl_id;
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
            markers: [],          // Array of Mapbox markers
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

        // Format area for map measurement tool display
        function formatMeasureArea(sqMeters) {
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
                var marker = new mapboxgl.Marker({
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

            var geojsonData = {
                type: 'Feature',
                geometry: {
                    type: 'LineString',
                    coordinates: coordinates.length >= 2 ? coordinates : [[0, 0], [0, 0]]
                }
            };

            var source = map.getSource(measureState.lineSourceId);
            if (source) {
                // Update data in-place — much cheaper than remove/add
                if (coordinates.length < 2) {
                    // Hide by setting empty geometry
                    map.setLayoutProperty(measureState.lineLayerId, 'visibility', 'none');
                } else {
                    map.setLayoutProperty(measureState.lineLayerId, 'visibility', 'visible');
                    source.setData(geojsonData);
                }
            } else {
                // First time: create source + layer
                if (coordinates.length < 2) return;

                map.addSource(measureState.lineSourceId, {
                    type: 'geojson',
                    data: geojsonData
                });

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
                var labelMarker = new mapboxgl.Marker({
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
                var closingLabelMarker = new mapboxgl.Marker({
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
                measureTotalArea.textContent = formatMeasureArea(area);
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