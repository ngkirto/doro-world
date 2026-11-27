import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

for (const name of ['doro', 'orange']) {
  test(`${name} is an embedded GLB without external resource requests`, () => {
    const data = readFileSync(new URL(`../public/models/${name}.glb`, import.meta.url));
    assert.ok(data.length < 10 * 1024 * 1024, 'Review oversized assets before publication');
    assert.equal(data.toString('ascii', 0, 4), 'glTF');
    assert.equal(data.readUInt32LE(4), 2);
    assert.equal(data.readUInt32LE(8), data.length);
    assert.equal(data.toString('ascii', 16, 20), 'JSON');
    const end = 20 + data.readUInt32LE(12);
    assert.ok(end <= data.length);
    const gltf = JSON.parse(data.toString('utf8', 20, end));
    assert.equal(gltf.asset.version, '2.0');
    for (const item of [...(gltf.buffers || []), ...(gltf.images || [])]) {
      assert.equal(item.uri, undefined, 'Embed all buffers and textures, never fetch remote URLs');
    }
    if (name === 'doro') {
      assert.ok(gltf.animations.some(a => a.name === 'Shock'));
      assert.ok(gltf.meshes.some(m => m.extras?.targetNames?.includes('Shocked')));
    } else {
      assert.match(gltf.asset.extras.license, /CC-BY-4.0/);
    }
  });
}
