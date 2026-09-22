const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
function inRing(p,ring) {
  let inside=false;
  for(let i=0,j=ring.length-1;i<ring.length;j=i++) {
    const a=ring[i],b=ring[j];
    if((a[1]>p[1])!==(b[1]>p[1]) && p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0]) inside=!inside;
  }
  return inside;
}
const inside=(p,polygon)=>inRing(p,polygon[0])&&!polygon.slice(1).some(r=>inRing(p,r));
const box=(x,y,w,h)=>[[x,y],[x+w,y],[x+w,y+h],[x,y+h],[x,y]];
(async()=>{
  let checked=0;
  for(const proto of ['prototype-simple','prototype-tabs']) {
    const {parcelLabelPoint,parcelLabelFeatures}=await import(pathToFileURL(path.resolve(proto,'js/parcel-labels.js')).href);
    const polygon=rings=>({type:'Polygon',coordinates:rings});
    const rect=polygon([box(7,47,.001,.001)]);
    const center=parcelLabelPoint(rect);
    assert(Math.abs(center[0]-7.0005)<.000003 && Math.abs(center[1]-47.0005)<.000003,'rectangle centre'); checked++;
    // The bounding-box centre and usual centroid lie in the empty area of this U.
    const concave=polygon([[[0,0],[.006,0],[.006,.006],[.004,.006],[.004,.002],[.002,.002],[.002,.006],[0,.006],[0,0]]]);
    assert(inside(parcelLabelPoint(concave),concave.coordinates),'concave interior'); checked++;
    const hole=polygon([box(7,47,.01,.01),box(7.003,47.003,.004,.004)]);
    assert(inside(parcelLabelPoint(hole),hole.coordinates),'outside hole'); checked++;
    const multi={type:'MultiPolygon',coordinates:[[box(0,0,.001,.001)],[box(.01,.01,.008,.008)]]};
    assert(inside(parcelLabelPoint(multi),multi.coordinates[1]),'best component'); checked++;
    assert.equal(parcelLabelPoint({type:'Polygon',coordinates:[]}),null); checked++;
    assert.equal(parcelLabelPoint(polygon([box(1,1,0,0)])),null); checked++;
    assert.equal(parcelLabelPoint(polygon([[[NaN,1],[2,3],[4,5],[NaN,1]]])),null); checked++;
    const thin=polygon([box(7,47,.01,.0000005)]);
    assert(inside(parcelLabelPoint(thin),thin.coordinates),'very narrow parcel'); checked++;
    const dateline=polygon([[[179.999,0],[-179.999,0],[-179.999,.002],[179.999,.002],[179.999,0]]]);
    assert(Math.abs(parcelLabelPoint(dateline)[0])>179.999 && parcelLabelPoint(dateline)[1]>0,'date-line unwrapping'); checked++;
    const data=JSON.parse(fs.readFileSync(proto+'/data/parcels.geojson','utf8'));
    const before=JSON.stringify(data);
    const features=parcelLabelFeatures(data,proto==='prototype-simple'?'bbl_id':'parcelId');
    assert.equal(features.features.length,data.features.length);
    assert(features.features.every(f=>f.properties.parcelLabel==='01' && f.properties.parcelId.endsWith('/01')),'short labels preserve leading zeros and full IDs'); checked++;
    for(let i=0;i<data.features.length;i++) {
      const g=data.features[i].geometry,p=features.features[i].geometry.coordinates;
      assert((g.type==='Polygon'?[g.coordinates]:g.coordinates).some(poly=>inside(p,poly)),'real parcel anchor inside '+i); checked++;
    }
    assert.equal(JSON.stringify(data),before,'source geometry unchanged'); checked++;
  }
  console.log(checked+' parcel geometry checks passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
