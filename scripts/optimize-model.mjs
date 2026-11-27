// Lossless embedded-image optimization; mesh, rig and animation buffers remain byte-identical.
import fs from 'node:fs/promises';
import sharp from 'sharp';
const [input, output] = process.argv.slice(2);
if (!input || !output || input === output) throw new Error('Usage: node scripts/optimize-model.mjs input.glb output.glb (different paths)');
const original = await fs.readFile(input);
const jsonLength = original.readUInt32LE(12);
const gltf = JSON.parse(original.subarray(20, 20 + jsonLength).toString());
const bin = original.subarray(28 + jsonLength);
const replacements = new Map();
for (const [i, image] of (gltf.images || []).entries()) {
  if (image.mimeType !== 'image/png' || image.bufferView === undefined) continue;
  const view = gltf.bufferViews[image.bufferView];
  const source = bin.subarray(view.byteOffset || 0, (view.byteOffset || 0) + view.byteLength);
  const encoded = await sharp(source).webp({ lossless: true, effort: 6 }).toBuffer();
  if (encoded.length >= source.length) continue;
  const before = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const after = await sharp(encoded).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (before.info.width !== after.info.width || before.info.height !== after.info.height) throw new Error('Dimensions changed');
  for (let p = 0; p < before.data.length; p += 4) {
    if (before.data[p+3] !== after.data[p+3] || (before.data[p+3] && !before.data.subarray(p,p+3).equals(after.data.subarray(p,p+3)))) throw new Error('Visible pixels changed');
  }
  replacements.set(image.bufferView, encoded);
  image.mimeType = 'image/webp';
  for (const texture of gltf.textures || []) if (texture.source === i) {
    texture.extensions = { ...texture.extensions, EXT_texture_webp: { source: i } };
    delete texture.source;
  }
}
if (replacements.size) {
  gltf.extensionsUsed = [...new Set([...(gltf.extensionsUsed || []), 'EXT_texture_webp'])];
  gltf.extensionsRequired = [...new Set([...(gltf.extensionsRequired || []), 'EXT_texture_webp'])];
}
let offset = 0;
const parts = gltf.bufferViews.map((view, i) => {
  const data = replacements.get(i) || bin.subarray(view.byteOffset || 0, (view.byteOffset || 0) + view.byteLength);
  view.byteOffset = offset; view.byteLength = data.length;
  const padded = Buffer.alloc(Math.ceil(data.length / 4) * 4); data.copy(padded); offset += padded.length;
  return padded;
});
gltf.buffers[0].byteLength = offset;
const json = Buffer.from(JSON.stringify(gltf));
const jsonPadded = Buffer.alloc(Math.ceil(json.length / 4) * 4, 32); json.copy(jsonPadded);
const header = Buffer.alloc(20);
header.writeUInt32LE(0x46546c67); header.writeUInt32LE(2,4); header.writeUInt32LE(28+jsonPadded.length+offset,8);
header.writeUInt32LE(jsonPadded.length,12); header.writeUInt32LE(0x4e4f534a,16);
const binHeader = Buffer.alloc(8); binHeader.writeUInt32LE(offset); binHeader.writeUInt32LE(0x004e4942,4);
const result = Buffer.concat([header,jsonPadded,binHeader,...parts]);
await fs.writeFile(output,result);
console.log(JSON.stringify({ before:original.length, after:result.length, savedPercent:Math.round((1-result.length/original.length)*100), images:replacements.size }));
