import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const UP = new THREE.Vector3(0, 1, 0);
const FLOOR = -0.018;
const ORANGE_HEIGHT = 0.665;
const PICKUP_DISTANCE = 0.48;
const ease = (a, b, t) => THREE.MathUtils.smoothstep(t, a, b);

// The prop owns its state and cinematic. Doro's existing mixer still plays all poses.
export class OrangeInteraction {
  constructor({ scene, actor, camera, wall, playClip, setYaw, sound, focus, canInteract, elements }) {
    Object.assign(this, { scene, actor, camera, wall, playClip, setYaw, sound, focus, canInteract, elements });
    this.mode = 'ground';
    this.time = 0;
    this.storySeen = false;
    this.enabled = false;
    this.ready = false;
    this.attached = false;
    this.velocity = new THREE.Vector3();
    this.direction = new THREE.Vector3(0, 0, 1);
    this.start = new THREE.Vector3();
    this.orangeStart = new THREE.Vector3();
    this.chaseEnd = new THREE.Vector3();
    this.socket = new THREE.Vector3();
    this.cameraTarget = new THREE.Vector3();
    this.lookTarget = new THREE.Vector3();
    this.lastPosition = new THREE.Vector3();
    this.spinAxis = new THREE.Vector3();
    this.physicsDelta = new THREE.Vector3();
    this.spinRotation = new THREE.Quaternion();
    this.supportRotation = new THREE.Quaternion(0, 0, 0, 0);
    this.pickupRotation = new THREE.Quaternion();
    this.managed = false;
    this.throwOptions = { forwardSpeed: 1.2, upSpeed: 1.0 };
    this.onPhysicsStep = null;
    this.prop = new THREE.Group();
    this.prop.visible = false;
    scene.add(this.prop);
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.events = new Set();
    this.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.elements.interact.addEventListener('click', () => { this.interact(); this.focus(); });
    this.elements.toss.addEventListener('click', () => { this.toss(); this.focus(); });
    this.elements.skip.addEventListener('click', () => { this.skip(); this.focus(); });
  }

  async load() {
    const gltf = await new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}models/orange.glb`);
    this.visual = gltf.scene;
    this.visual.updateMatrixWorld(true);
    const fruit = this.visual.getObjectByName('Orange_Orange_0') || this.visual;
    const bounds = new THREE.Box3().setFromObject(fruit);
    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    const scale = 1 / Math.max(size.x, size.z);
    this.visual.scale.multiplyScalar(scale);
    this.visual.position.addScaledVector(center, -scale);
    // Place the stem on top of this imported model, which arrives lying on its side.
    const greens = this.visual.getObjectByName('Orange_Greens_0');
    if (greens) {
      this.visual.updateMatrixWorld(true);
      const leafDirection = new THREE.Box3().setFromObject(greens).getCenter(new THREE.Vector3()).normalize();
      const wrapper = new THREE.Group();
      wrapper.add(this.visual);
      wrapper.quaternion.setFromUnitVectors(leafDirection, UP);
      this.visual = wrapper;
    }
    this.visual.updateMatrixWorld(true);
    const uprightBounds = new THREE.Box3().setFromObject(this.visual, true);
    this.visual.scale.multiplyScalar(ORANGE_HEIGHT / uprightBounds.getSize(new THREE.Vector3()).y);
    this.groundHeight = size.y * scale / 2 + FLOOR;
    this.visual.traverse((object) => {
      if (object.isMesh) { object.castShadow = true; object.receiveShadow = true; }
    });
    this.prop.add(this.visual);
    this.prop.updateMatrixWorld(true);
    const fruitSize = new THREE.Box3().setFromObject(fruit, true).getSize(new THREE.Vector3());
    this.radius = Math.max(fruitSize.x, fruitSize.z) / 2;
    this.supportPoints = [];
    const positions = fruit.geometry?.attributes.position;
    if (positions) {
      for (let index = 0; index < positions.count; index++) {
        this.supportPoints.push(new THREE.Vector3().fromBufferAttribute(positions, index).applyMatrix4(fruit.matrixWorld));
      }
    }
    this.groundHeight = this.groundLevel();
    this.grip = this.actor.getObjectByName('OrangeGrip');
    if (!this.grip) throw new Error('Doro is missing the orange grip animation.');
    this.ready = true;
  }

  get busy() { return ['story', 'pickup', 'place', 'throw'].includes(this.mode); }
  get holding() { return this.mode === 'held'; }
  get near() { return this.ready && Math.hypot(this.actor.position.x - this.prop.position.x, this.actor.position.z - this.prop.position.z) < 1.15; }

  reset() {
    this.enabled = false;
    this.mode = 'ground';
    this.attached = false;
    this.prop.visible = false;
    this.velocity.set(0, 0, 0);
    this.elements.skip.hidden = true;
    this.refreshUI();
  }

  spawn(yaw) {
    if (!this.ready) return;
    this.reset();
    this.enabled = true;
    this.direction.set(Math.sin(yaw), 0, Math.cos(yaw));
    this.prop.position.copy(this.actor.position).addScaledVector(this.direction, 1.35);
    this.prop.quaternion.identity();
    this.prop.position.y = this.groundHeight;
    this.resolveWall();
    this.prop.visible = true;
    this.refreshUI();
  }

  setMode(mode) {
    this.mode = mode;
    this.time = 0;
    this.events.clear();
  }

  cue(id, at, effect, callback) {
    if (this.time < at || this.events.has(id)) return;
    this.events.add(id);
    if (effect) this.sound(effect);
    callback?.();
  }

  faceFruit() {
    this.direction.copy(this.prop.position).sub(this.actor.position).setY(0);
    if (this.direction.lengthSq() < 0.001) this.direction.set(0, 0, 1);
    this.direction.normalize();
    this.setYaw(Math.atan2(this.direction.x, this.direction.z));
  }

  interact() {
    if (!this.enabled || !this.ready || this.busy || !this.canInteract()) return;
    if (this.holding) {
      this.setMode('place');
      this.playClip('Orange_Place', { loop: false, restart: true, fade: 0.1 });
      return;
    }
    if (!this.near) return;
    this.faceFruit();
    this.start.copy(this.actor.position);
    this.orangeStart.copy(this.prop.position);
    this.pickupRotation.copy(this.prop.quaternion);
    this.velocity.set(0, 0, 0);
    this.setMode('pickup');
    this.playClip('Orange_Pickup', { loop: false, restart: true, fade: 0.12 });
    this.refreshUI();
  }

  clearChasePath() {
    // Keep the choreographed chase on open ground. Free-play throws use wall collision.
    for (let step = 0; step <= 12; step++) {
      const point = this.orangeStart.clone().addScaledVector(this.direction, step * 0.15);
      const margin = this.radius + 0.18;
      if (point.x > -this.wall.width - margin && point.x < margin && Math.abs(point.z - this.wall.z) < this.wall.depth / 2 + margin) return false;
    }
    return true;
  }

  finishHeld() {
    this.attached = true;
    this.storySeen = true;
    this.setMode('held');
    this.playClip('Orange_Idle', { fade: 0.18 });
    this.elements.skip.hidden = true;
    this.refreshUI();
  }

  skip() {
    if (this.mode !== 'story') return;
    this.finishHeld();
  }

  toss({ forwardSpeed = 1.2, upSpeed = 1.0, onRelease } = {}) {
    if (!this.enabled || !this.holding || (!this.managed && !this.canInteract())) return false;
    this.throwOptions = { forwardSpeed, upSpeed, onRelease };
    this.setMode('throw');
    this.playClip('Orange_Throw', { loop: false, restart: true, fade: 0.1 });
    return true;
  }

  beginPickup({ instant = false } = {}) {
    this.enabled = true;
    this.prop.visible = true;
    this.velocity.set(0, 0, 0);
    this.attached = false;
    if (instant) { this.finishHeld(); return; }
    this.direction.set(0, 0, 1).applyQuaternion(this.actor.quaternion).setY(0).normalize();
    this.start.copy(this.actor.position);
    this.prop.position.copy(this.actor.position).addScaledVector(this.direction, PICKUP_DISTANCE);
    this.prop.quaternion.copy(this.actor.quaternion);
    this.prop.position.y = this.groundLevel();
    this.orangeStart.copy(this.prop.position);
    this.pickupRotation.copy(this.prop.quaternion);
    this.setMode('pickup');
    this.playClip('Orange_Pickup', { loop: false, restart: true, fade: 0.12 });
    this.refreshUI();
  }

  release(forwardSpeed = 0, upSpeed = 0) {
    if (!this.attached) return;
    this.attached = false;
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(this.actor.quaternion);
    this.velocity.copy(forward).multiplyScalar(forwardSpeed);
    this.velocity.y = upSpeed;
    this.resolveWall();
  }

  dropForDodge() {
    if (this.holding) {
      this.release(0.3, 0.1);
      this.setMode('ground');
    }
  }

  tap(clientX, clientY, canvas) {
    if (!this.enabled || !this.ready || this.busy) return false;
    const rect = canvas.getBoundingClientRect();
    this.pointer.set((clientX - rect.left) / rect.width * 2 - 1, -(clientY - rect.top) / rect.height * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    if (!this.raycaster.intersectObject(this.prop, true).length) return false;
    this.interact();
    return true;
  }

  alignForPickup(amount, fruitPosition = this.orangeStart) {
    this.actor.position.copy(this.start).lerp(fruitPosition.clone().addScaledVector(this.direction, -PICKUP_DISTANCE).setY(0), amount);
  }

  update(dt) {
    if (!this.enabled || !this.ready) return;
    this.time += dt;
    if (this.mode === 'story') this.updateStory();
    if (this.mode === 'pickup') {
      this.alignForPickup(ease(0, 0.3, this.time));
      if (!this.attached) {
        this.prop.quaternion.slerpQuaternions(this.pickupRotation, this.actor.quaternion, ease(0, 0.42, this.time));
        this.prop.position.y = this.groundLevel();
      }
      this.cue('grip', 0.42, 'hop', () => { this.attached = true; });
      if (this.time >= 1.22) this.finishHeld();
    }
    if (this.mode === 'place') {
      this.cue('release', 0.68, null, () => this.release());
      if (this.time >= 1.09) this.setMode('ground');
    }
    if (this.mode === 'throw') {
      this.cue('release', 0.38, 'whoosh', () => {
        this.release(this.throwOptions.forwardSpeed, this.throwOptions.upSpeed);
        this.throwOptions.onRelease?.();
      });
      if (this.time >= 0.8) this.setMode('ground');
    }
    if (!this.attached && ['ground', 'place', 'throw'].includes(this.mode)) this.physics(dt);
    this.refreshUI();
  }

  updateStory() {
    const t = this.time;
    this.alignForPickup(ease(0, 0.65, t));
    this.cue('notice', 0.25, 'peek');
    this.cue('reach', 0.8, null, () => this.playClip('Orange_Reach', { loop: false, restart: true }));
    this.cue('nudge', 1.35, 'hop');
    const roll = ease(1.35, 3.55, t);
    this.prop.position.copy(this.orangeStart).addScaledVector(this.direction, 1.65 * roll);
    this.spinAxis.crossVectors(UP, this.direction).normalize();
    this.prop.quaternion.setFromAxisAngle(this.spinAxis, 1.65 * roll / this.radius);
    if (t >= 3.6) this.prop.quaternion.slerp(this.actor.quaternion, ease(3.6, 4.02, t));
    this.prop.position.y = this.groundLevel() + 0.045 * Math.sin(Math.PI * ease(1.35, 1.65, t));
    this.cue('chase', 1.65, null, () => {
      this.playClip('Run_AllFours', { fade: 0.12 });
      this.chaseEnd.copy(this.orangeStart).addScaledVector(this.direction, 1.65 - PICKUP_DISTANCE).setY(0);
    });
    if (t >= 1.65) {
      const behind = this.orangeStart.clone().addScaledVector(this.direction, -PICKUP_DISTANCE).setY(0);
      this.actor.position.copy(behind).lerp(this.chaseEnd, ease(1.65, 3.6, t));
    }
    this.cue('pickup', 3.6, null, () => this.playClip('Orange_Pickup', { loop: false, restart: true, fade: 0.12 }));
    this.cue('grip', 4.02, 'hop', () => { this.attached = true; });
    this.cue('hug', 4.82, 'cheer', () => this.playClip('Orange_Hug', { loop: false, restart: true, fade: 0.12 }));
    this.cue('hop', 5.67, 'hop');
    this.cue('settle', 6.24, null, () => this.playClip('Orange_Idle', { fade: 0.2 }));
    if (t >= 7) this.finishHeld();
  }

  frameCamera(dt, look, followPosition, followLook) {
    if (this.mode !== 'story') return false;
    const t = this.time;
    const side = new THREE.Vector3(this.direction.z, 0, -this.direction.x);
    const hero = ease(4.1, 5.2, t);
    const center = this.actor.position.clone().lerp(this.prop.position, 0.35);
    center.y = 0.55;
    const portrait = Math.max(1, 0.95 / this.camera.aspect);
    const distance = THREE.MathUtils.lerp(2.7, 1.05, hero) * Math.min(portrait, 1.65);
    this.cameraTarget.copy(center).addScaledVector(this.direction, distance)
      .addScaledVector(side, THREE.MathUtils.lerp(1.8, 2.75, hero)).add(new THREE.Vector3(0, 0.9, 0));
    this.lookTarget.copy(center);
    const handover = ease(6.24, 7, t);
    this.lookTarget.lerp(followLook, handover);
    // Orbit around her on both transitions so the camera never passes through her face.
    const offset = this.cameraTarget.clone().sub(center);
    let angle = Math.atan2(offset.x, offset.z);
    const turn = (a, b, amount) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * amount;
    angle = turn(this.shotStartAngle, angle, ease(0, 1, t));
    const followOffset = followPosition.clone().sub(center);
    angle = turn(angle, Math.atan2(followOffset.x, followOffset.z), handover);
    const radius = THREE.MathUtils.lerp(Math.hypot(offset.x, offset.z), Math.hypot(followOffset.x, followOffset.z), handover);
    this.cameraTarget.set(center.x + Math.sin(angle) * radius,
      THREE.MathUtils.lerp(center.y + 0.9, followPosition.y, handover), center.z + Math.cos(angle) * radius);
    this.camera.position.lerp(this.cameraTarget, 1 - Math.exp(-dt * 8));
    look.lerp(this.lookTarget, 1 - Math.exp(-dt * 7));
    this.camera.lookAt(look);
    return true;
  }

  afterAnimation() {
    if (!this.enabled || !this.ready || !this.attached) return;
    this.actor.updateMatrixWorld(true);
    this.grip.getWorldPosition(this.socket);
    this.prop.position.copy(this.socket);
    this.prop.quaternion.copy(this.actor.quaternion);
    if (this.holding) {
      this.resolveWall();
      this.actor.position.add(this.prop.position.clone().sub(this.socket));
    }
  }

  resolveWall() {
    const radius = this.radius;
    const minX = -this.wall.width - radius, maxX = radius;
    const minZ = this.wall.z - this.wall.depth / 2 - radius;
    const maxZ = this.wall.z + this.wall.depth / 2 + radius;
    const p = this.prop.position;
    if (p.y > this.wall.height + radius || p.x <= minX || p.x >= maxX || p.z <= minZ || p.z >= maxZ) return;
    const gaps = [p.x - minX, maxX - p.x, p.z - minZ, maxZ - p.z];
    const nearest = gaps.indexOf(Math.min(...gaps));
    if (nearest === 0) { p.x = minX; this.velocity.x = -Math.abs(this.velocity.x) * 0.5; }
    if (nearest === 1) { p.x = maxX; this.velocity.x = Math.abs(this.velocity.x) * 0.5; }
    if (nearest === 2) { p.z = minZ; this.velocity.z = -Math.abs(this.velocity.z) * 0.5; }
    if (nearest === 3) { p.z = maxZ; this.velocity.z = Math.abs(this.velocity.z) * 0.5; }
  }

  physics(dt) {
    const count = Math.max(1, Math.ceil(dt / (1 / 120)));
    const step = dt / count;
    for (let i = 0; i < count; i++) {
      this.lastPosition.copy(this.prop.position);
      this.velocity.y -= 5.5 * step;
      this.prop.position.addScaledVector(this.velocity, step);
      this.resolveWall();
      this.onPhysicsStep?.(this.lastPosition, step);
      const delta = this.physicsDelta.copy(this.prop.position).sub(this.lastPosition).setY(0);
      if (delta.lengthSq() > 1e-10) {
        this.spinAxis.crossVectors(UP, delta).normalize();
        this.prop.quaternion.premultiply(this.spinRotation.setFromAxisAngle(this.spinAxis, delta.length() / this.radius));
      }
      const floorContact = this.groundLevel();
      if (this.prop.position.y <= floorContact) {
        this.prop.position.y = floorContact;
        if (this.velocity.y < -0.55) { this.velocity.y *= -0.32; this.sound('orangeBounce'); }
        else this.velocity.y = 0;
        const drag = Math.exp(-2.5 * step);
        this.velocity.x *= drag;
        this.velocity.z *= drag;
        if (Math.hypot(this.velocity.x, this.velocity.z) < 0.025) { this.velocity.x = 0; this.velocity.z = 0; }
      }
    }
  }

  groundLevel() {
    if (!this.supportPoints?.length) return this.groundHeight;
    const q = this.prop.quaternion;
    if (this.supportRotation.equals(q)) return this.supportHeight;
    const a = 2 * (q.x * q.y + q.w * q.z);
    const b = 1 - 2 * (q.x * q.x + q.z * q.z);
    const c = 2 * (q.y * q.z - q.w * q.x);
    let bottom = Infinity;
    for (const v of this.supportPoints) bottom = Math.min(bottom, a * v.x + b * v.y + c * v.z);
    this.supportRotation.copy(q);
    return this.supportHeight = FLOOR - bottom;
  }

  refreshUI() {
    const visible = this.enabled && this.ready && !this.busy && !this.managed;
    this.elements.panel.hidden = !visible;
    this.elements.interact.disabled = !this.canInteract() || (!this.holding && !this.near);
    this.elements.interact.textContent = this.holding ? 'E · 放下歐潤吉' : 'E · 抱歐潤吉';
    this.elements.toss.hidden = !this.holding;
    this.elements.hint.textContent = this.holding ? '抱緊了 ♡' : this.near ? '她好像很想要這顆歐潤吉…' : '靠近歐潤吉，陪她玩';
  }
}
