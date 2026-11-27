import { batchStaticProps } from './batch-props.js';
import * as THREE from 'three';

/** Built once, after orange.load(). Orange clones share the source geometry/materials.
 * Call update(dt) once per rendered frame, including outside the minigame.
 */
export function createWorldProps(scene, orangeVisual) {
  const root = new THREE.Group();
  root.name = 'DoroWorldProps';
  const station = new THREE.Vector3(32, 0, 16);
  const crateCenter = station.clone().add(new THREE.Vector3(0, 0.55, -3));
  const crateBounds = Object.freeze({
    minX: crateCenter.x - 1, maxX: crateCenter.x + 1,
    minZ: crateCenter.z - 0.8, maxZ: crateCenter.z + 0.8,
    bottomY: 0.02, topY: 1.08,
    innerMinX: crateCenter.x - 0.88, innerMaxX: crateCenter.x + 0.88,
    innerMinZ: crateCenter.z - 0.68, innerMaxZ: crateCenter.z + 0.68,
    heapY: 1.32,
  });
  const geometries = new Set(), materials = new Set(), textures = new Set();
  const geometry = (value) => { geometries.add(value); return value; };
  const material = (options) => {
    const value = new THREE.MeshStandardMaterial({ roughness: 0.88, ...options });
    materials.add(value); return value;
  };
  const wood = [material({ color: '#c99965' }), material({ color: '#dfb780' }), material({ color: '#b98a59' })];
  const darkWood = material({ color: '#79523e' });
  const cream = material({ color: '#fff0cb' });
  const pink = material({ color: '#e6a1b7' });
  const stoneMaterial = material({ color: '#d4c4ad' });
  const unitBox = geometry(new THREE.BoxGeometry(1, 1, 1));
  function box(parent, size, position, surface) {
    const mesh = new THREE.Mesh(unitBox, surface);
    mesh.scale.set(...size); mesh.position.set(...position);
    mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh);
    return mesh;
  }

  function label(parent, text, width, height, position) {
    // A plain board remains usable in headless scene tests without a DOM.
    if (typeof document === 'undefined') return;
    const canvas = document.createElement('canvas');
    canvas.width = 1024; canvas.height = 256;
    const context = canvas.getContext('2d');
    context.fillStyle = '#543b32'; context.textAlign = 'center'; context.textBaseline = 'middle';
    context.font = 'bold 94px "Microsoft JhengHei", "PingFang TC", sans-serif';
    context.fillText(text, 512, 132, 950);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace; textures.add(texture);
    const ink = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false });
    materials.add(ink);
    const plane = geometry(new THREE.PlaneGeometry(width, height));
    for (const sign of [-1, 1]) {
      const mesh = new THREE.Mesh(plane, ink);
      mesh.position.set(position[0], position[1], position[2] * sign);
      mesh.rotation.y = sign < 0 ? Math.PI : 0;
      parent.add(mesh);
    }
  }

  const sign = new THREE.Group();
  sign.name = 'RPGSignPlaceholder'; sign.position.set(8, 0, 6); root.add(sign);
  box(sign, [0.12, 1.8, 0.12], [0, 0.88, 0], darkWood);
  const arrowShape = new THREE.Shape();
  arrowShape.moveTo(-0.85, -0.16); arrowShape.lineTo(0.65, -0.16);
  arrowShape.lineTo(0.88, 0); arrowShape.lineTo(0.65, 0.16);
  arrowShape.lineTo(-0.85, 0.16); arrowShape.closePath();
  const arrowGeometry = geometry(new THREE.ExtrudeGeometry(arrowShape, { depth: 0.08, bevelEnabled: false }));
  arrowGeometry.translate(0, 0, -0.04);
  for (const [text, y, target, surface] of [
    ['歐潤吉投投樂', 1.52, station, wood[1]],
    ['街機 · 籌備中', 1.1, new THREE.Vector3(-8, 0, -4), wood[0]],
  ]) {
    const board = new THREE.Group();
    board.position.y = y;
    board.rotation.y = Math.atan2(-(target.z - sign.position.z), target.x - sign.position.x);
    const mesh = new THREE.Mesh(arrowGeometry, surface); mesh.castShadow = true;
    board.add(mesh); label(board, text, 1.35, 0.29, [-0.06, 0, 0.043]); sign.add(board);
  }

  const path = new THREE.Group(); path.name = 'PracticeSteppingStones'; root.add(path);
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(7.5, 0, 5.3), new THREE.Vector3(15, 0, 8.5),
    new THREE.Vector3(24, 0, 15.5), station.clone().add(new THREE.Vector3(0.4, 0, 0.9)),
  ]);
  const stoneGeometry = geometry(new THREE.CylinderGeometry(0.25, 0.27, 0.025, 7));
  for (let i = 0; i < 38; i++) {
    const stone = new THREE.Mesh(stoneGeometry, stoneMaterial);
    stone.position.copy(curve.getPointAt(i / 37)); stone.position.y = -0.005;
    stone.position.x += 0.1 * Math.sin(i * 2.3); stone.rotation.y = i * 1.73;
    stone.scale.z = 0.75; stone.receiveShadow = true; path.add(stone);
  }

  const mat = new THREE.Group(); mat.name = 'OrangePracticeMat'; mat.position.copy(station); root.add(mat);
  const disc = new THREE.Mesh(geometry(new THREE.CylinderGeometry(0.7, 0.7, 0.024, 48)), pink);
  disc.position.y = -0.004; disc.receiveShadow = true; mat.add(disc);
  const rim = new THREE.Mesh(geometry(new THREE.TorusGeometry(0.62, 0.018, 6, 48)), cream);
  rim.rotation.x = -Math.PI / 2; rim.position.y = 0.012; mat.add(rim);
  // A tiny paw print makes the fixed standing spot readable without another sign.
  const pawGeometry = geometry(new THREE.CircleGeometry(0.1, 18));
  for (const [x, z, scale] of [[0, 0.08, 1.5], [-0.17, -0.11, 0.65], [0, -0.18, 0.65], [0.17, -0.11, 0.65]]) {
    const paw = new THREE.Mesh(pawGeometry, cream);
    paw.rotation.x = -Math.PI / 2; paw.position.set(x, 0.01, z); paw.scale.setScalar(scale); mat.add(paw);
  }

  const crate = new THREE.Group(); crate.name = 'OverflowingOrangeCrate'; crate.position.copy(crateCenter); root.add(crate);
  box(crate, [1.92, 0.09, 1.52], [0, -0.485, 0], wood[2]);
  for (let row = 0; row < 3; row++) {
    const y = -0.32 + row * 0.335;
    for (const z of [-0.75, 0.75]) box(crate, [2, 0.29, 0.1], [0, y, z], wood[row % 2]);
    for (const x of [-0.95, 0.95]) box(crate, [0.1, 0.29, 1.4], [x, y, 0], wood[(row + 1) % 2]);
  }
  for (const x of [-0.89, 0.89]) for (const z of [-0.69, 0.69]) {
    box(crate, [0.12, 1.06, 0.12], [x, 0, z], wood[2]);
    for (const y of [-0.3, 0.04, 0.38]) box(crate, [0.025, 0.025, 0.012], [x, y, Math.sign(z) * 0.807], darkWood);
  }
  // Narrow darker streaks suggest planks without introducing texture assets.
  for (let row = 0; row < 3; row++) for (const z of [-0.801, 0.801]) {
    box(crate, [1.2 + row * 0.18, 0.009, 0.002], [-0.08, -0.26 + row * 0.335, z], wood[2]);
  }

  function fruit(parent, position, scale, yaw = 0, tilt = 0) {
    const holder = new THREE.Group();
    holder.add(orangeVisual.clone(true)); holder.position.set(...position);
    holder.scale.setScalar(scale); holder.rotation.set(tilt, yaw, tilt * 0.5);
    parent.add(holder); return holder;
  }
  const pile = new THREE.Group(); pile.name = 'OrangeHeap'; crate.add(pile);
  for (let layer = 0; layer < 2; layer++) {
    for (let row = 0; row < 3; row++) for (let col = 0; col < 4; col++) {
      const n = layer * 12 + row * 4 + col;
      fruit(pile, [-0.67 + col * 0.44 + layer * 0.025, 0.05 + layer * 0.4 + Math.sin(n * 2) * 0.025,
        -0.45 + row * 0.44], 0.71 + (n % 3) * 0.025, n * 2.4, Math.sin(n) * 0.16);
    }
  }
  for (let i = 0; i < 5; i++) {
    const angle = i / 5 * Math.PI * 2;
    fruit(pile, [Math.cos(angle) * 0.4, 0.73, Math.sin(angle) * 0.27], 0.72, angle + 0.4, 0.16);
  }
  const spills = new THREE.Group(); spills.name = 'SpilledOranges'; root.add(spills);
  for (const [x, z, scale, yaw] of [[-1.35, 0.6, 0.75, 0.2], [1.4, 0.3, 0.8, 2], [-1.2, 1.18, 0.68, 4], [1.1, 1.27, 0.76, 1]]) {
    const item = fruit(spills, [crateCenter.x + x, 0, crateCenter.z + z], scale, yaw);
    item.updateWorldMatrix(true, true);
    const fruitMesh = item.getObjectByName('Orange_Orange_0') || item;
    item.position.y += -0.018 - new THREE.Box3().setFromObject(fruitMesh, true).min.y;
  }
  const bursts = Array.from({ length: 5 }, (_, i) => {
    const object = fruit(root, [0, 0, 0], 0.56 + i * 0.025, i * 1.4);
    object.visible = false; return object;
  });
  const batches = [...batchStaticProps(path), ...batchStaticProps(pile), ...batchStaticProps(crate), ...batchStaticProps(spills)];
  const shadowCasters = [];
  root.traverse(mesh => { if (mesh.isMesh && mesh.castShadow) shadowCasters.push(mesh); });
  let burstTime = Infinity;
  scene.add(root);

  return {
    root, station, mat, crate, crateCenter, crateBounds, sign,
    burst({ reducedMotion = false } = {}) {
      burstTime = reducedMotion ? Infinity : 0;
      crate.rotation.set(0, 0, 0);
      for (const item of bursts) item.visible = !reducedMotion;
    },
    setQuality(tier) {
      for (const mesh of shadowCasters) mesh.castShadow = tier !== 'low';
    },
    update(dt, cameraPosition) {
      if (cameraPosition) {
        // Beyond the fully opaque fog, including the largest object/burst radius.
        const visible = Math.hypot(cameraPosition.x - station.x, cameraPosition.z - station.z) < 45;
        crate.visible = spills.visible = mat.visible = visible;
      }
      if (!Number.isFinite(burstTime)) return;
      burstTime += Math.max(0, dt);
      const t = burstTime, duration = 0.85;
      const envelope = Math.max(0, 1 - t / duration);
      crate.rotation.z = Math.sin(t * 38) * 0.035 * envelope;
      crate.rotation.x = Math.sin(t * 29) * 0.018 * envelope;
      bursts.forEach((item, i) => {
        const a = i / bursts.length * Math.PI * 2 + 0.3;
        item.visible = t < duration;
        item.position.set(crateCenter.x + Math.cos(a) * (0.3 + t * 0.65),
          crateBounds.heapY + 0.08 + (1.8 + i * 0.08) * t - 2.75 * t * t,
          crateCenter.z + Math.sin(a) * (0.25 + t * 0.5));
        item.rotation.z = t * (i % 2 ? -2 : 2);
      });
      if (t >= duration) { burstTime = Infinity; crate.rotation.set(0, 0, 0); }
    },
    dispose() {
      root.removeFromParent();
      batches.forEach(batch => batch.dispose());
      geometries.forEach((value) => value.dispose());
      materials.forEach((value) => value.dispose());
      textures.forEach((value) => value.dispose());
      // Never dispose orangeVisual's shared resources here.
    },
  };
}
