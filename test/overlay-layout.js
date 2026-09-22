const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {launchBrowser,openPage,navigate,evaluate,BASE,VIEWPORTS}=require('./visual');
(async()=>{
  const out=path.resolve('visual-out/overlays');fs.mkdirSync(out,{recursive:true});
  const {proc,cdp}=await launchBrowser();let checked=0;
  try {
    for(const proto of ['prototype-simple','prototype-tabs']) for(const vp of ['desktop','scaled-desktop','tablet','phone-se']) {
      const page=await openPage(cdp,VIEWPORTS[vp]||VIEWPORTS.desktop),run=e=>evaluate(cdp,page.sessionId,e);
      await navigate(cdp,page.sessionId,BASE+proto+'/');
      await run(`(async()=>{
        window.ui=await import('./js/ui.js');window.list=await import('./js/list.js');window.toast=await import('./js/toast.js');
        const sw=await import('./js/swisstopo.js');sw.addSwisstopoLayer('ch.swisstopo.pixelkarte-farbe','Landeskarte',true);
        ${vp==='scaled-desktop'?"document.documentElement.style.zoom='1.25';":''}
        await new Promise(r=>setTimeout(r,300));
      })()`);
      const icons=await run(`(() => {
        const a=document.querySelector('[data-action="showInternalLayerInfo"]'),b=document.querySelector('#external-layers-list [data-action="showLayerInfo"]');
        const style=e=>{const s=getComputedStyle(e),i=getComputedStyle(e.firstElementChild);return {w:s.width,h:s.height,border:s.border,background:s.backgroundColor,color:s.color,font:i.fontFamily,size:i.fontSize};};
        return {a:style(a),b:style(b),name:b.getAttribute('aria-label'),icon:b.firstElementChild.textContent};
      })()`);
      assert.deepEqual(icons.a,icons.b,proto+'/'+vp+' shared info button style');
      assert(icons.name && icons.icon==='info','named info control');
      await run(`(async()=>{toast.showToast({title:'Layer entfernt',message:'Der ausgewählte Layer wurde entfernt.',duration:0});await new Promise(r=>setTimeout(r,400));})()`);
      for(const open of [false,true]) {
        await run(`(async()=>{list.setTablePanelOpen(${open});await new Promise(r=>setTimeout(r,450));})()`);
        const metrics=await run(`(() => {const t=document.querySelector('.toast').getBoundingClientRect(),button=document.getElementById('tbl-toggle');return {onScreen:t.top>=0&&t.bottom<=innerHeight,clear:!button.getClientRects().length||t.bottom+12<=button.getBoundingClientRect().top};})()`);
        assert(metrics.onScreen&&metrics.clear,proto+'/'+vp+'/'+open+' toast clear of table toggle');checked++;
      }
      await run(`(async()=>{const search=document.getElementById('search-input');search.value='Bern';search.dispatchEvent(new Event('input'));await new Promise(r=>setTimeout(r,400));ui.switchView('api-docs');await new Promise(r=>setTimeout(r,600));})()`);
      assert(await run(`!document.getElementById('search-results').classList.contains('active')&&!document.querySelector('.api-docs-header')&&!!document.querySelector('#swagger-ui .info')`),'API header and search popup cleanup');
      const {data}=await cdp.send('Page.captureScreenshot',{format:'jpeg',quality:80},page.sessionId);
      fs.writeFileSync(path.join(out,proto+'--'+vp+'--api.jpg'),Buffer.from(data,'base64'));
      assert.deepEqual(page.errors,[],proto+'/'+vp+' errors');
      await cdp.send('Target.closeTarget',{targetId:page.targetId});
    }
    console.log(checked+' toast layouts passed; internal/external info icons and API header verified in 8 views');
  } finally {proc.kill();}
})().catch(e=>{console.error(e);process.exitCode=1;});
