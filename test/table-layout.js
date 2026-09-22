// Real-browser geometry checks; needs the static server on :8123, like visual.js.
const assert = require('node:assert/strict');
const { launchBrowser, openPage, navigate, evaluate, BASE, VIEWPORTS } = require('./visual');

const inspect = `(() => {
  const table = Array.from(document.querySelectorAll('.data-table')).find(t => t.getBoundingClientRect().height > 0);
  const wrapper = table.parentElement;
  const cells = Array.from(table.querySelectorAll('tbody tr[data-id] td[data-width]'));
  return {
    overflow: document.documentElement.scrollWidth > innerWidth,
    inside: wrapper.getBoundingClientRect().right <= innerWidth + 1,
    canScroll: table.offsetWidth > wrapper.clientWidth,
    unnecessaryScroll: Number(table.dataset.minimumWidth) <= wrapper.clientWidth && wrapper.scrollWidth > wrapper.clientWidth,
    fillsPanel: table.offsetWidth >= wrapper.clientWidth - 1,
    spacer: table.querySelector('thead .table-spacer').getAttribute('aria-hidden') === 'true' &&
      Array.from(table.querySelectorAll('tbody tr[data-id]')).every(row => row.lastElementChild.classList.contains('table-spacer') && !row.lastElementChild.textContent),
    singleLine: cells.every(td => {
      const content = td.querySelector('.table-cell-content');
      return content && getComputedStyle(content).whiteSpace === 'nowrap' && getComputedStyle(content).textOverflow === 'ellipsis' && !content.querySelector('br') && content.offsetHeight < 30;
    }),
    fullHints: cells.every(td => td.title === td.textContent.replace(/\\s+/g, ' ').trim()),
    documentNote: table.textContent.includes('Demo · nur Registereintrag'),
    columns: Array.from(table.querySelectorAll('thead th')).filter(th => getComputedStyle(th).display !== 'none').map(th => ({
      key: th.dataset.sort, role: th.dataset.width, width: th.offsetWidth
    })),
    cellWidths: Array.from(table.querySelectorAll('tbody tr:first-child td')).filter(td => getComputedStyle(td).display !== 'none').map(td => td.offsetWidth)
  };
})()`;

(async () => {
  const { proc, cdp } = await launchBrowser();
  let checked = 0;
  try {
    for (const viewport of ['desktop','scaled-desktop','phone-14']) {
      const page = await openPage(cdp, VIEWPORTS[viewport] || VIEWPORTS.desktop);
      await navigate(cdp, page.sessionId, BASE + 'prototype-tabs/?view=detail&id=9900/9002/AA');
      if (viewport === 'scaled-desktop') await evaluate(cdp, page.sessionId, "document.documentElement.style.zoom = '1.25'");
      for (const tab of ['measurements','contracts','costs','documents','contacts','assets']) {
        await evaluate(cdp, page.sessionId, `(async () => {
          document.querySelector('.detail-tab[data-tab="${tab}"]').click();
          await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        })()`);
        const result = await evaluate(cdp, page.sessionId, inspect);
        assert.equal(result.overflow, false, viewport + '/' + tab + ' page overflow');
        assert.equal(result.inside, true, viewport + '/' + tab + ' wrapper outside viewport');
        assert.equal(result.unnecessaryScroll, false, viewport + '/' + tab + ' unnecessary scrollbar');
        assert.equal(result.fillsPanel, true, viewport + '/' + tab + ' table stops before panel edge');
        assert.equal(result.spacer, true, viewport + '/' + tab + ' presentation spacer missing');
        assert.equal(result.singleLine, true, viewport + '/' + tab + ' multiline cell');
        assert.equal(result.fullHints, true, viewport + '/' + tab + ' incomplete hover hint');
        assert.equal(result.documentNote, false, 'removed document note');
        if (viewport === 'phone-14') assert.equal(result.canScroll, true, tab + ' mobile scrolling');
        const widths = { date:136, amount:168, number:152, code:136, year:104, status:144, phone:176 };
        const caps = { name:320, text:320, description:480, title:720, email:360 };
        result.columns.forEach((col, i) => {
          if (widths[col.role]) assert.ok(Math.abs(col.width - widths[col.role]) < 1, tab + '/' + col.key + ' shared width: ' + col.width);
          if (caps[col.role]) assert.ok(col.width <= caps[col.role], tab + '/' + col.key + ' exceeds width cap: ' + col.width);
          assert.ok(Math.abs(col.width - result.cellWidths[i]) < 1, tab + '/' + col.key + ' header/body alignment');
          assert.notEqual(col.key, 'id');
        });
        const before = result.columns.map(c => c.width);
        await evaluate(cdp, page.sessionId, `(() => {
          const input = document.getElementById('${tab}-filter');
          input.value = 'no-match-for-width-check'; input.dispatchEvent(new Event('input'));
        })()`);
        const after = await evaluate(cdp, page.sessionId, inspect);
        assert.deepEqual(after.columns.map(c => c.width), before, tab + ' width changes with filtered rows');
        checked++;
      }
      assert.deepEqual(page.errors, [], 'browser errors');
      await cdp.send('Target.closeTarget', { targetId: page.targetId });
    }
    console.log('PASS capped widths, single-line cells, full-text hints, alignment, filtering and scroll containment (' + checked + ' views)');
  } finally { proc.kill(); }
})().catch(error => { console.error(error); process.exit(1); });
