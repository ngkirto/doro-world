import test from 'node:test';
import assert from 'node:assert/strict';
import { Group, Mesh, BoxGeometry, MeshBasicMaterial, Matrix4 } from 'three';
import { AdaptiveQuality, pixelRatio } from '../src/render-quality.js';
import { batchStaticProps } from '../src/batch-props.js';

test('pixel budget caps large screens without supersampling low-DPI screens', () => {
  assert.equal(pixelRatio('high',1,1280,720),1);
  assert.ok(pixelRatio('balanced',3,3840,2160)**2*3840*2160 <= 2000001);
  assert.equal(pixelRatio('low',3,390,844),1);
});
test('adaptive quality ignores isolated stalls and recovers only after sustained headroom', () => {
  const q = new AdaptiveQuality();
  for(let i=0;i<500;i++) q.sample(16.67);
  q.sample(500);
  assert.equal(q.tier,'balanced');
  for(let i=0;i<400;i++) q.sample(33.34);
  assert.equal(q.tier,'low');
  for(let i=0;i<1200;i++) q.sample(16.67);
  assert.equal(q.tier,'low');
  for(let i=0;i<1200;i++) q.sample(16.67);
  assert.equal(q.tier,'balanced');
});
test('instancing retains nested transforms, shared resources and shadow settings', () => {
  const root = new Group(); root.position.set(32,0,16); root.rotation.y=.3;
  const parent = new Group(); parent.rotation.z=.2; root.add(parent);
  const geometry = new BoxGeometry(), material = new MeshBasicMaterial();
  const meshes = [0,1,2].map(i => {const m=new Mesh(geometry,material);m.position.set(i,i*.2,0);m.scale.set(1,2,3);m.castShadow=true;parent.add(m);return m;});
  root.updateWorldMatrix(true,true);
  const before=meshes.map(m=>m.matrixWorld.clone());
  const batches=batchStaticProps(root);
  assert.equal(batches.length,1); assert.equal(batches[0].count,3);
  assert.equal(batches[0].geometry,geometry); assert.equal(batches[0].material,material);
  assert.equal(batches[0].castShadow,true);
  root.updateWorldMatrix(true,true);
  before.forEach((expected,i)=>{const matrix=new Matrix4();batches[0].getMatrixAt(i,matrix);matrix.premultiply(batches[0].matrixWorld);matrix.elements.forEach((v,j)=>assert.ok(Math.abs(v-expected.elements[j])<1e-6));});
});
