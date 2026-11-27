import { InstancedMesh, Matrix4 } from 'three';

/** Batch only static opaque meshes, preserving geometry/material ownership and transforms.
 * A moving parent (e.g. the shaking crate) can still animate the whole batch.
 */
export function batchStaticProps(root) {
  root.updateWorldMatrix(true, true);
  const inverse = new Matrix4().copy(root.matrixWorld).invert();
  const groups = new Map();
  root.traverse(mesh => {
    if (!mesh.isMesh || mesh.isSkinnedMesh || mesh.isInstancedMesh || Array.isArray(mesh.material) || mesh.material.transparent) return;
    const key = `${mesh.geometry.uuid}/${mesh.material.uuid}/${mesh.castShadow}/${mesh.receiveShadow}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(mesh);
  });
  const batches = [], matrix = new Matrix4();
  for (const meshes of groups.values()) {
    if (meshes.length < 2) continue;
    const first = meshes[0];
    const batch = new InstancedMesh(first.geometry, first.material, meshes.length);
    batch.name = `${root.name}_batch_${batches.length}`;
    batch.castShadow = first.castShadow; batch.receiveShadow = first.receiveShadow;
    meshes.forEach((mesh, i) => {
      matrix.multiplyMatrices(inverse, mesh.matrixWorld); batch.setMatrixAt(i, matrix); mesh.removeFromParent();
    });
    batch.instanceMatrix.needsUpdate = true;
    batch.computeBoundingBox(); batch.computeBoundingSphere();
    root.add(batch); batches.push(batch);
  }
  // Remove empty clone holders; preserve the batching root and non-mesh content.
  function prune(node) {
    for (const child of [...node.children]) { prune(child); if (child.isGroup && child.children.length === 0) child.removeFromParent(); }
  }
  prune(root);
  return batches;
}
