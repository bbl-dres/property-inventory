// Real MapLibre labels, layer toggles and info-card geometry (static server :8123).
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {launchBrowser,openPage,navigate,evaluate,BASE,VIEWPORTS}=require('./visual');
(async()=>{
  const out=path.resolve('visual-out/parcel-labels');fs.mkdirSync(out,{recursive:true});
  const {proc,cdp}=await launchBrowser();let checked=0;
  try {
    for(const proto of ['prototype-simple','prototype-tabs']) {
      const page=await openPage(cdp,VIEWPORTS.desktop),run=e=>evaluate(cdp,page.sessionId,e);
      await navigate(cdp,page.sessionId,BASE+proto+'/');
      await run(`(async()=>{window.s=(await import('./js/state.js')).state;window.m=await import('./js/map.js');})()`);
      for(const [building,parcel] of [['9900/9002/AA','9900/9002/01'],['9900/9005/AA','9900/9005/01'],['1080/5210/AA','1080/5210/01'],['9900/9012/AA','9900/9012/01']]) {
        await run(`(async()=>{m.selectBuilding('${building}');s.map.jumpTo({center:s.buildingIndex.get('${building}').geometry.coordinates,zoom:18.25,pitch:0});await new Promise(r=>setTimeout(r,1800));})()`);
        const metrics=await run(`(() => {
          const labels=s.map.queryRenderedFeatures({layers:['parcels-labels']}).map(f=>f.properties.parcelId);
          const rows=[...document.querySelectorAll('#info-body .info-row')].filter(r=>r.getClientRects().length);
          return {labels,infoFits:rows.every(row=>{const label=row.querySelector('.info-label'),value=row.querySelector('.info-value');return label.getBoundingClientRect().right+4<value.getBoundingClientRect().left&&value.getBoundingClientRect().right<=row.getBoundingClientRect().right+1&&label.title===label.textContent&&getComputedStyle(label).textOverflow==='ellipsis';})};
        })()`);
        assert(metrics.labels.includes(parcel),proto+'/'+parcel+' label rendered');
        assert(metrics.infoFits,proto+'/'+parcel+' info labels and values fit');checked++;
        const noPointOverlap = await run(`(() => {const p=s.map.project(s.buildingIndex.get('${building}').geometry.coordinates);return s.map.queryRenderedFeatures([[p.x-19,p.y-19],[p.x+19,p.y+19]],{layers:['parcels-labels']}).length===0;})()`);
        assert(noPointOverlap,proto+'/'+parcel+' parcel text clears selected building dot');
        const {data}=await cdp.send('Page.captureScreenshot',{format:'png'},page.sessionId);
        fs.writeFileSync(path.join(out,proto+'--'+parcel.replaceAll('/','-')+'.png'),Buffer.from(data,'base64'));
        for (const zoom of [15, 16, 18.25]) {
          for (const selected of [false, true]) {
            await run(`(async()=>{${selected ? `m.selectBuilding('${building}')` : 'm.clearSelection()'};s.map.jumpTo({zoom:${zoom}});await new Promise(r=>setTimeout(r,600));})()`);
            assert(await run(`s.map.queryRenderedFeatures({layers:['buildings-labels']}).some(f=>(f.properties.bbl_id||f.properties.buildingId)==='${building}')`),proto+'/'+building+' label visible at '+zoom+', selected='+selected);
            assert(await run(`(() => {const p=s.map.project(s.buildingIndex.get('${building}').geometry.coordinates);return s.map.queryRenderedFeatures([[p.x-65,p.y-60],[p.x+65,p.y-24]],{layers:['buildings-labels']}).some(f=>(f.properties.bbl_id||f.properties.buildingId)==='${building}');})()`),'building ID stays above its dot');
          }
        }
      }
      await run(`(async()=>{m.clearSelection();await new Promise(r=>setTimeout(r,600));})()`);
      assert(await run(`(() => {const p=s.map.project(s.buildingIndex.get('9900/9012/AA').geometry.coordinates);return s.map.queryRenderedFeatures([[p.x-12,p.y-12],[p.x+12,p.y+12]],{layers:['parcels-labels']}).length===0;})()`),'parcel text clears unselected building dot');
      await run(`(async()=>{s.map.jumpTo({zoom:14.9});await new Promise(r=>setTimeout(r,500));})()`);
      assert.equal(await run(`s.map.queryRenderedFeatures({layers:['parcels-labels','buildings-labels']}).length`),0,'hidden below zoom 15');
      await run(`(async()=>{s.map.jumpTo({zoom:15});await new Promise(r=>setTimeout(r,800));})()`);
      assert((await run(`s.map.queryRenderedFeatures({layers:['parcels-labels','buildings-labels']}).length`))>0,'labels available at zoom 15');
      await run(`(async()=>{s.map.jumpTo({zoom:18.25});const toggle=document.getElementById('layer-toggle-parcels');toggle.checked=false;toggle.dispatchEvent(new Event('change'));await new Promise(r=>setTimeout(r,500));})()`);
      assert.equal(await run(`s.map.queryRenderedFeatures({layers:['parcels-labels']}).length`),0,'hidden with parcel layer');
      await run(`(async()=>{document.querySelector('[data-style="dark-matter"]').click();await new Promise(r=>setTimeout(r,2500));})()`);
      assert.equal(await run(`s.map.getLayoutProperty('parcels-labels','visibility')`),'none','visibility survives style change');
      await run(`(async()=>{const toggle=document.getElementById('layer-toggle-parcels');toggle.checked=true;toggle.dispatchEvent(new Event('change'));await new Promise(r=>setTimeout(r,500));})()`);
      assert((await run(`s.map.queryRenderedFeatures({layers:['parcels-labels']}).length`))>0,'restored labels rendered on dark style');
      assert.deepEqual(page.errors,[],proto+' errors');
      await cdp.send('Target.closeTarget',{targetId:page.targetId});
    }
    console.log(checked+' parcel/info-card views passed, with zoom and basemap checks');
  } finally {proc.kill();}
})().catch(e=>{console.error(e);process.exitCode=1;});
