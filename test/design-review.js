// Browser review matrix. Saves measurements and screenshots; use --check after fixes.
const fs = require('node:fs');
const path = require('node:path');
const { launchBrowser, openPage, navigate, evaluate, BASE, VIEWPORTS } = require('./visual');
const out = path.resolve(process.env.REVIEW_OUT || 'visual-out/design-review');
const settle = 'await new Promise(r => setTimeout(r, 400));';
const inspect = `(() => {
  const rect = s => { const e = document.querySelector(s); if (!e || !e.getClientRects().length) return null; const r = e.getBoundingClientRect(); return {x:r.x,y:r.y,w:r.width,h:r.height,right:r.right,bottom:r.bottom}; };
  const detail = document.body.classList.contains('detail-active');
  const mobile = innerWidth <= 767 || (innerHeight <= 500 && matchMedia('(pointer: coarse)').matches);
  const tree = rect('#tree-panel.open'); const drawer = rect('#filter-panel.open');
  const header = rect('#header');
  const top = Math.max(0, header?.bottom || 0);
  const left = rect('.detail-grid, .detail-single-col');
  const main = rect('.main-content');
  return { viewport:[innerWidth,innerHeight], detail,mobile,overflow:document.documentElement.scrollWidth>innerWidth+1,
    header,tree,drawer,left,main,expectedTop:top,
    contentOffscreen:detail&&!mobile&&left&&(left.x<0||left.right>innerWidth+1),
    detailFilterInvalid:detail&&(!document.getElementById('filter-panel-btn').disabled||!!drawer),
    treeGap:detail&&tree&&!mobile?tree.y-top:0,
    treeOffscreen:tree&&(tree.x<0||tree.right>innerWidth+1||tree.bottom>innerHeight+1),
    drawerOffscreen:drawer&&(drawer.x<0||drawer.right>innerWidth+1||drawer.bottom>innerHeight+1),
    columns: document.querySelector('.detail-grid')?getComputedStyle(document.querySelector('.detail-grid')).gridTemplateColumns:null,
    focus:document.activeElement.id,scrollY };
})()`;
(async () => {
  fs.mkdirSync(out,{recursive:true}); const results=[];
  const {proc,cdp}=await launchBrowser();
  try {
    for(const proto of ['prototype-simple','prototype-tabs']) {
      for(const vp of ['desktop','laptop','tablet','phone-se','phone-14','phone-land']) {
        const page=await openPage(cdp,VIEWPORTS[vp]); const run=e=>evaluate(cdp,page.sessionId,e);
        await navigate(cdp,page.sessionId,BASE+proto+'/');
        await run(`(async()=>{window.reviewUI=await import('./js/ui.js');window.reviewTree=await import('./js/location-tree.js');window.reviewFilter=await import('./js/filters.js');})()`);
        const states = [
          ['map',''],
          ['map-tree',"reviewTree.toggleTreePanel(true);"],
          ['map-both',"reviewFilter.toggleSmartDrawer(true);"],
          ['map-close',"reviewTree.toggleTreePanel(false);reviewFilter.toggleSmartDrawer(false);"],
          ['gallery',"reviewUI.switchView('gallery');"],
          ['gallery-filter',"reviewFilter.toggleSmartDrawer(true);"],
          ['detail',"reviewUI.showDetailView('9900/9005/AA');"],
          ['detail-tree',"reviewTree.toggleTreePanel(true);"],
          ['detail-tree-scroll',"window.scrollTo(0,500);"],
          ['detail-both',"window.scrollTo(0,0);reviewFilter.toggleSmartDrawer(true);"],
          ['detail-filter',"reviewTree.toggleTreePanel(false);"],
          ['measurements',"reviewFilter.toggleSmartDrawer(false);reviewUI.activateTab('measurements');"],
          ['documents',proto==='prototype-tabs'?"reviewUI.activateTab('documents');":"reviewUI.activateTab('overview');"],
          ['tree-wide',"reviewUI.activateTab('overview');document.documentElement.style.setProperty('--tree-panel-width','600px');reviewTree.toggleTreePanel(true);"],
          ['search',"reviewTree.toggleTreePanel(false);reviewUI.switchView('map');const i=document.getElementById('search-input');i.value='Bern';i.dispatchEvent(new Event('input',{bubbles:true}));"],
          ['api-docs',"reviewUI.switchView('api-docs');"],
        ];
        for(const [name,setup] of states) {
          await run(`(async()=>{${setup}${settle}})()`);
          const result=await run(inspect); const label=proto+'--'+vp+'--'+name;
          results.push({label,...result});
          if(name==='detail-tree'&&result.mobile) {
            const focusCheck = await run(`(() => {
              const tree=document.getElementById('tree-panel');
              const good=tree.contains(document.activeElement)&&tree.getAttribute('aria-modal')==='true'&&document.getElementById('header').inert&&document.body.style.overflow==='hidden';
              document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',shiftKey:true,bubbles:true,cancelable:true}));
              return good&&tree.contains(document.activeElement);
            })()`);
            if(!focusCheck) throw new Error(label+' phone sheet focus/semantics');
          }
          if(['detail-tree','detail-both','tree-wide','documents','search','api-docs'].includes(name)) {
            const {data}=await cdp.send('Page.captureScreenshot',{format:'jpeg',quality:75},page.sessionId);
            fs.writeFileSync(path.join(out,label+'.jpg'),Buffer.from(data,'base64'));
          }
        }
        results.push({label:proto+'--'+vp+'--errors',errors:page.errors});
        await cdp.send('Target.closeTarget',{targetId:page.targetId});
      }
    }
    fs.writeFileSync(path.join(out,'review.json'),JSON.stringify(results,null,2));
    const failures=results.filter(r=>r.overflow||r.contentOffscreen||r.detailFilterInvalid||r.treeOffscreen||r.drawerOffscreen||Math.abs(r.treeGap)>2||r.errors?.length);
    console.log(JSON.stringify(failures,null,2));
    console.log(results.length+' states recorded; '+failures.length+' flagged');
    if(process.argv.includes('--check')&&failures.length)process.exitCode=1;
  } finally {proc.kill();}
})().catch(e=>{console.error(e);process.exit(1);});
