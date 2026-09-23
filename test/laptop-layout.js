// Browser geometry regression for scaled Windows laptops and adjacent layouts.
// Start the repository's static server on :8123, then: node test/laptop-layout.js
// PROFILES=1280x700,960x510 limits a follow-up run to those profiles.
const fs = require('fs');
const path = require('path');
const { launchBrowser, openPage, navigate, evaluate, BASE, VIEWPORTS } = require('./visual');
const out = path.resolve('tmp/laptop-layout');
const profiles = [
  ...[[1920,1100], [1600,900], [1536,860], [1440,800], [1366,680],
    [1280,700], [1200,700], [1164,636], [1024,768], [960,510]].map(([width,height]) =>
    [width + 'x' + height, { width, height, scale: width === 1280 ? 1.5 : 1, mobile:false, touch:false }]),
  ['phone', VIEWPORTS['phone-se']], ['landscape', VIEWPORTS['phone-land']]
].filter(([name]) => !process.env.PROFILES || process.env.PROFILES.split(',').includes(name));
const geometry = `(() => {
  const rect = s => { const el=document.querySelector(s); if(!el?.getClientRects().length) return null;
    const r=el.getBoundingClientRect(); return {x:r.x,y:r.y,w:r.width,h:r.height,right:r.right,bottom:r.bottom}; };
  const overlap = (a,b) => a && b && Math.min(a.right,b.right)>Math.max(a.x,b.x)+1 && Math.min(a.bottom,b.bottom)>Math.max(a.y,b.y)+1;
  return { overflow:document.documentElement.scrollWidth>innerWidth+1,
    header:rect('.header-main'), input:rect('#search-input'), treeBtn:rect('#tree-panel-btn'), filterBtn:rect('#filter-panel-btn'),
    headerCollision:overlap(rect('#logo-area'),rect('#search-area')) || overlap(rect('#search-area'),rect('#header-right')),
    map:rect('#map'), tree:rect('#tree-panel.open'), filter:rect('#filter-panel.open'),
    toolsCollision:!document.getElementById('accordion-panel').classList.contains('collapsed') && overlap(rect('#accordion-panel'),rect('#info-panel.show')),
    info:rect('#info-panel.show'), body:rect('#info-body'), footer:rect('.info-footer'),
    secondary:[...document.querySelectorAll('.info-row-secondary')].every(e=>getComputedStyle(e).display!=='none'),
    table:rect('#table-panel:not(.collapsed)'), carousel:rect('#detail-carousel'),
    barInner:rect('.header-detail .detail-header-inner'), contentBox:rect('.detail-hero, .tab-content.active .detail-grid') };
})()`;
(async () => {
  fs.mkdirSync(out,{recursive:true});
  const results=[]; const {proc,cdp}=await launchBrowser();
  function record(prototype,profile,state,checks,metrics) { results.push({prototype,profile,state,checks,metrics}); }
  try {
    for(const prototype of ['prototype-simple','prototype-tabs']) for(const [profile,viewport] of profiles) {
      const page=await openPage(cdp,viewport); const run=e=>evaluate(cdp,page.sessionId,e);
      const step=code=>run(`(async()=>{${code} await new Promise(r=>setTimeout(r,400));})()`);
      await navigate(cdp,page.sessionId,BASE+prototype+'/');
      await step(`window.ui=await import('./js/ui.js'); window.tree=await import('./js/location-tree.js');
        window.filters=await import('./js/filters.js'); window.mapModule=await import('./js/map.js');
        window.list=await import('./js/list.js'); window.lang=await import('./js/i18n.js');`);
      for(const language of ['de','fr','it','en']) {
        await step(`await lang.setLang('${language}');`);
        const m=await run(geometry);
        record(prototype,profile,'header-'+language,{
          noOverflow:!m.overflow, noCollision:!m.headerCollision,
          iconOnlyActions:[m.treeBtn,m.filterBtn].every(b=>!b || Math.abs(b.w-b.h)<=1),
          laptopHeight:viewport.width<1200 || viewport.width>1599 || m.header.h===72,
          usableSearch:viewport.width<1200 || m.input.w>=200
        },m);
      }
      await step(`await lang.setLang('de'); mapModule.selectBuilding('9900/9005/AA');`);
      if(!viewport.mobile) {
        await step('tree.toggleTreePanel(true); filters.toggleSmartDrawer(true);');
        const m=await run(geometry);
        record(prototype,profile,'panels', { noOverflow:!m.overflow,
          workspace:!(m.tree && m.filter) || m.map.w>=759,
          noOverlayCollision:!m.toolsCollision, fieldsRetained:m.secondary,
          cardInsideMap:m.info.y>=m.map.y && m.info.bottom<=m.map.bottom+1,
          actionVisible:m.footer.y>=m.body.y && m.footer.bottom<=m.info.bottom+1
        },m);
        if(viewport.width===1536) {
          await step("document.documentElement.style.setProperty('--drawer-width','520px');");
          const resized=await run(geometry);
          record(prototype,profile,'resized-drawer', { workspace:!(resized.tree && resized.filter),
            latestPanelKept:!!resized.filter },resized);
          await step("document.documentElement.style.removeProperty('--drawer-width'); tree.toggleTreePanel(true);");
          const restored=await run(geometry);
          record(prototype,profile,'restored-drawers', { bothAvailable:!!restored.tree && !!restored.filter },restored);
        }
        await step('tree.toggleTreePanel(false); filters.toggleSmartDrawer(false); list.setTablePanelOpen(true);');
        const table=await run(`(() => {
          const wrapper=document.querySelector('#table-panel .list-table-wrapper').getBoundingClientRect();
          const rows=[...document.querySelectorAll('#table-panel tbody tr')].filter(e=>{const r=e.getBoundingClientRect();return r.height>0 && r.top>=wrapper.top && r.bottom<=wrapper.bottom+1});
          return {rows:rows.length, ...${geometry}};
        })()`);
        record(prototype,profile,'table', { usefulRows:viewport.height<636 || table.rows>=3,
          mapRetained:table.map.h>=125, noOverflow:!table.overflow },table);
        if(viewport.width===1280) {
          await step("document.querySelector('#filter-panel input[data-filter]').click();");
          const constrained=await run(geometry);
          record(prototype,profile,'table-filter-selection', {
            cardInsideMap:constrained.info.bottom<=constrained.map.bottom+1,
            actionVisible:constrained.footer.y>=constrained.body.y && constrained.footer.bottom<=constrained.info.bottom+1,
            fieldsRetained:constrained.secondary
          },constrained);
          const {data}=await cdp.send('Page.captureScreenshot',{format:'png'},page.sessionId);
          fs.writeFileSync(path.join(out,prototype+'-'+profile+'-table.png'),Buffer.from(data,'base64'));
          await step("document.getElementById('map-reset-filters').click();");
        }
        await step('list.setTablePanelOpen(false);');
      } else {
        const m=await run(geometry);
        record(prototype,profile,'phone-card', { noOverflow:!m.overflow, fieldsRetained:m.secondary,
          cardOnScreen:m.info.y>=0 && m.info.bottom<=viewport.height+1,
          actionVisible:m.footer.y>=m.body.y && m.footer.bottom<=m.info.bottom+1 },m);
      }
      await step(`ui.showDetailView('9900/9005/AA'); ${viewport.mobile?'':'tree.toggleTreePanel(true);'}`);
      const detail=await run(`(() => {
        const grid=document.querySelector('.detail-grid'); const stacked=grid?.classList.contains('detail-grid--stacked');
        const extra=document.querySelector('.detail-section--additional'), address=document.querySelector('.detail-section--address');
        return { ...${geometry}, stacked,
          correctOrder:!stacked || !!(address.compareDocumentPosition(extra)&Node.DOCUMENT_POSITION_FOLLOWING),
          masterTop:document.getElementById('detail-name').getBoundingClientRect().top,
          miniMapCount:document.querySelectorAll('#mini-map').length };
      })()`);
      record(prototype,profile,'detail', { noOverflow:!detail.overflow, readingOrder:detail.correctOrder,
        oneMiniMap:detail.miniMapCount===1,
        // The breadcrumb bar in the page header follows the docked tree: its inner row spans the content
        barAligned:!detail.tree || (Math.abs(detail.barInner.x-detail.contentBox.x)<=1 && Math.abs(detail.barInner.right-detail.contentBox.right)<=1) },detail);
      if(['1280x700','1164x636','phone'].includes(profile)) {
        const {data}=await cdp.send('Page.captureScreenshot',{format:'png'},page.sessionId);
        fs.writeFileSync(path.join(out,prototype+'-'+profile+'-detail.png'),Buffer.from(data,'base64'));
      }
      await step("ui.activateTab('measurements');");
      const measurements=await run(geometry);
      record(prototype,profile,'measurements', { noOverflow:!measurements.overflow,
        heroConsistent:prototype!=='prototype-simple' || (!!measurements.carousel && !!detail.carousel && measurements.carousel.h===detail.carousel.h) },measurements);
      // Restore a wide layout without rebuilding detail content or its map.
      await cdp.send('Emulation.setDeviceMetricsOverride',{width:1920,height:1100,deviceScaleFactor:1,mobile:false},page.sessionId);
      await step("ui.activateTab('overview');");
      record(prototype,profile,'restore',await run(`({
        restored:${prototype==='prototype-tabs' ? "document.querySelector('.detail-section--additional').parentElement.classList.contains('detail-left')" : 'true'},
        noDuplicates:document.querySelectorAll('#detail-name').length===1
      })`));
      record(prototype,profile,'runtime',{noErrors:page.errors.length===0},page.errors);
      await cdp.send('Target.closeTarget',{targetId:page.targetId});
      fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));
      console.log(prototype+' '+profile+' checked');
    }
  } finally {cdp.ws.close();proc.kill();fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));}
  const failures=results.flatMap(r=>Object.entries(r.checks).filter(([,ok])=>!ok).map(([check])=>r.prototype+' '+r.profile+' '+r.state+': '+check));
  if(failures.length){console.error(failures.join('\n'));process.exitCode=1;}
  else console.log('Passed '+results.length+' layout states across both independent prototypes.');
})().catch(error=>{console.error(error);process.exitCode=1;});
