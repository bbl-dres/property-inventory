// Exercise the shared component through both real schema adapters.
module.exports = function(prototype) {
  const simple = prototype === 'prototype-simple';
  return {
    name: prototype + ': shared table columns, selection and pagination',
    boot: { prototype },
    allowedErrors: [],
    async run(ctx, check) {
      const { document, window, modules } = ctx;
      const state = modules.state.state;
      const setValue = (id, value, event = 'change') => {
        const input = document.getElementById(id);
        input.value = value;
        input.dispatchEvent(new window.Event(event, { bubbles: true }));
      };
      const idClasses = '.col-id, .col-bbl_id, .col-objectid, .col-parcel-id, .col-lc-bbl_id, .col-lc-geb_id, [class$="-id"]';
      check('technical ID columns removed from all headers', !document.querySelector('.data-table thead ' + idClasses.split(', ').join(', .data-table thead ')));
      check('all feature tables use the shared component', document.querySelectorAll('.list-table.data-table').length === 3);
      const table = document.getElementById('list-table');
      const key = simple ? 'bbl_bez' : 'name';
      const header = table.querySelector('th[data-sort="' + key + '"]');
      check('sorting uses a native keyboard-accessible button', !!header.querySelector('button[type="button"]') && header.scope === 'col');
      header.querySelector('button').click();
      check('sort button updates aria-sort once', header.getAttribute('aria-sort') === 'ascending');
      const hidden = document.querySelector('#columns-list input[data-column="' + (simple ? 'col-garea_ngf' : 'col-flaeche') + '"]');
      hidden.checked = false;
      hidden.dispatchEvent(new window.Event('change'));
      check('hidden column has no width allocation', !Array.from(table.querySelectorAll('col')).some(c => c.dataset.column === (simple ? 'garea_ngf' : 'extensionData.netFloorArea')));
      hidden.checked = true;
      hidden.dispatchEvent(new window.Event('change'));
      check('shown column regains width allocation', Array.from(table.querySelectorAll('col')).some(c => c.dataset.column === (simple ? 'garea_ngf' : 'extensionData.netFloorArea')));

      // Land cover table (both prototypes): pagination without visible ids
      const size = document.getElementById('landcovers-rows-per-page');
      size.value = '25'; size.dispatchEvent(new window.Event('change'));
      check('land covers paginate without visible IDs', document.querySelectorAll('#landcovers-body tr[data-landcover-id]').length === 25);
      document.getElementById('landcovers-next-btn').click();
      check('land cover next page advances', document.querySelector('#landcovers-body tr').dataset.landcoverId === '26');
      if (simple) return;
      modules.ui.showDetailView('1080/4840/AF');
      const tabs = ['measurements','documents','contacts','costs','contracts','assets'];
      for (const tab of tabs) {
        modules.ui.activateTab(tab);
        const el = document.getElementById(tab + '-table');
        const first = el.querySelector('tbody tr[data-id]');
        check(tab + ': header and row column counts match', el.querySelectorAll('thead th').length === first.children.length);
        check(tab + ': UUIDs remain row keys only', /[a-f0-9]{8}-/.test(first.dataset.id) && !/[a-f0-9]{8}-[a-f0-9]{4}-/.test(first.textContent));
        check(tab + ': date cells contain no raw timestamp', Array.from(el.querySelectorAll('td[data-width="date"]')).every(td => !td.textContent.includes('T00:')));
      }
      modules.ui.activateTab('contracts');
      const firstCheck = document.querySelector('#contracts-tbody input');
      firstCheck.checked = true; firstCheck.dispatchEvent(new window.Event('change', { bubbles: true }));
      check('single selection is indeterminate and enables actions', document.getElementById('select-all-contracts').indeterminate && !document.querySelector('.contracts-action').disabled);
      const all = document.getElementById('select-all-contracts');
      all.checked = true; all.dispatchEvent(new window.Event('change', { bubbles: true }));
      check('select all checks current page', document.querySelectorAll('#contracts-tbody input:checked').length === 2);
      document.querySelector('#contracts-table th[data-sort="betrag"] button').click();
      check('selection survives sorting by row key', document.querySelectorAll('#contracts-tbody input:checked').length === 2);
      setValue('contracts-filter', 'no-such-contract', 'input');
      check('empty filtering clears stale actions and select all', document.querySelector('.contracts-action').disabled && !all.checked && all.disabled);
      check('empty colspan matches columns', document.querySelector('#contracts-tbody td').colSpan === document.querySelectorAll('#contracts-table th').length);

      // More than one page, a zero value, and a missing date expose numeric/null ordering.
      const source = state.allAreaMeasurements.find(m => m.buildingIds.includes('1080/4840/AF'));
      state.allAreaMeasurements = Array.from({ length: 27 }, (_, i) => ({ ...source,
        areaMeasurementId: 'test-row-' + i, type: 'Measurement ' + i, value: i,
        validFrom: i === 0 ? null : '2026-01-' + String(i).padStart(2, '0') + 'T00:00:00Z'
      }));
      modules.ui.showDetailView('1080/4840/AF');
      modules.ui.activateTab('measurements');
      setValue('measurements-page-size', '25');
      document.querySelector('#measurements-table th[data-sort="value"] button').click();
      check('numeric zero is displayed and sorted first', document.querySelector('#measurements-tbody tr').dataset.id === 'test-row-0' && /^0\s/.test(document.querySelector('#measurements-tbody .col-area').textContent));
      document.getElementById('measurements-next').click();
      check('entity pagination advances with exactly two remaining rows', document.querySelectorAll('#measurements-tbody tr[data-id]').length === 2 && document.getElementById('measurements-next').disabled && !document.getElementById('measurements-prev').disabled);
      const dates = document.querySelector('#measurements-table th[data-sort="validFrom"] button');
      dates.click(); dates.click();
      check('date sorting uses ISO values and keeps nulls last', document.querySelector('#measurements-tbody tr').dataset.id === 'test-row-26');
      setValue('measurements-filter', 'no-results', 'input');
      check('empty pagination disables both directions', document.getElementById('measurements-prev').disabled && document.getElementById('measurements-next').disabled);
      modules.ui.showDetailView('1080/5210/AA');
      check('switching buildings resets table filters', document.getElementById('measurements-filter').value === '');
    }
  };
};
