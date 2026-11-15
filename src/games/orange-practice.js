import * as THREE from 'three';
import { PRACTICE_PHYSICS as PHYSICS, launchVelocity, resolvePracticeContact } from './orange-practice-physics.js';

const AIM_RATE = 32 * Math.PI / 180;
const LEFT = new Set(['KeyA', 'ArrowLeft']);
const RIGHT = new Set(['KeyD', 'ArrowRight']);
const GAME_KEYS = new Set(['KeyF', 'Escape', 'KeyE', 'KeyW', 'KeyS', 'ArrowUp', 'ArrowDown',
  'KeyR', 'KeyQ', 'Space', 'ShiftLeft', 'ShiftRight', ...LEFT, ...RIGHT,
  ...Array.from({ length: 7 }, (_, i) => `Digit${i + 1}`)]);
const clamp = THREE.MathUtils.clamp;

/** Sidecar: main continues orange.update(), mixer.update(), orange.afterAnimation().
 * Call practice.update(dt) after orange.update(), and suppress main's movement/animation
 * selection and orbit controls while active. Call world.update(dt) separately.
 * elements: prompt, enter, panel, hint, charge (<progress max="1">), power, hits,
 * attempts, aim, left, right, throw, exit. All are supplied by the host, not created here.
 */
export class OrangePractice {
  constructor({ scene, actor, camera, orange, playClip, setYaw, sound, focus, onExit, elements, world }) {
    Object.assign(this, { scene, actor, camera, orange, playClip, setYaw, sound, focus, onExit, elements, world });
    for (const key of ['prompt', 'enter', 'panel', 'hint', 'charge', 'power', 'hits', 'attempts', 'aim', 'left', 'right', 'throw', 'exit']) {
      if (!elements?.[key]) throw new Error(`OrangePractice needs elements.${key}`);
    }
    this.phase = 'idle';
    this.phaseTime = 0; this.flightTime = 0;
    this.aim = 0; this.charge = 0; this.hits = 0; this.attempts = 0;
    this.heldKeys = new Set(); this.pointers = new Map();
    this.chargeSource = null; this.listeners = []; this.fadeRecords = [];
    this.generation = 0;
    this.result = null; this.hitPosition = new THREE.Vector3();
    this.cameraPosition = new THREE.Vector3(); this.cameraLook = new THREE.Vector3();
    this.forward = new THREE.Vector3(); this.side = new THREE.Vector3();
    this.releaseOrigin = new THREE.Vector3();
    this.mediaQuery = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
    this.reducedMotion = !!this.mediaQuery?.matches;
    this.physicsStep = (previous, dt) => this.onPhysicsStep(previous, dt);

    const points = new Float32Array(49 * 3);
    this.arcGeometry = new THREE.BufferGeometry();
    this.arcGeometry.setAttribute('position', new THREE.BufferAttribute(points, 3));
    this.arcMaterial = new THREE.LineDashedMaterial({ color: '#b66d42', dashSize: 0.075, gapSize: 0.05,
      transparent: true, opacity: 0.75, depthWrite: false });
    this.arc = new THREE.Line(this.arcGeometry, this.arcMaterial);
    this.arc.name = 'OrangeAimTrajectory'; this.arc.visible = false; this.arc.frustumCulled = false; scene.add(this.arc);

    this.listen(elements.enter, 'click', () => { this.enter(); this.focus?.(); });
    this.listen(elements.exit, 'click', () => this.exit());
    this.bindPointer(elements.left, 'left');
    this.bindPointer(elements.right, 'right');
    this.bindPointer(elements.throw, 'throw');
    // Space/Enter work when a touch control is focused, without turning synthetic clicks into throws.
    for (const [element, code] of [[elements.left, 'ArrowLeft'], [elements.right, 'ArrowRight'], [elements.throw, 'KeyF']]) {
      for (const type of ['keydown', 'keyup']) this.listen(element, type, (event) => {
        if (!['Space', 'Enter'].includes(event.code)) return;
        event.preventDefault(); event.stopPropagation();
        this.handleKey({ code, repeat: event.repeat, preventDefault() {} }, type === 'keydown');
      });
    }
    if (typeof window !== 'undefined') this.listen(window, 'blur', () => this.cancelCharge());
    if (typeof document !== 'undefined') this.listen(document, 'visibilitychange', () => {
      if (document.hidden) this.cancelCharge();
    });
    if (this.mediaQuery?.addEventListener) this.listen(this.mediaQuery, 'change', (event) => {
      this.reducedMotion = event.matches;
    });
    elements.charge.max = 1;
    this.refreshUI();
  }

  get active() { return this.phase !== 'idle'; }
  get near() { return Math.hypot(this.actor.position.x - this.world.station.x, this.actor.position.z - this.world.station.z) <= 1.4; }
  get canAim() { return this.phase === 'ready' || this.phase === 'charge'; }
  get yaw() { return this.baseYaw + this.aim; }

  listen(target, type, callback, options) {
    target.addEventListener(type, callback, options);
    this.listeners.push(() => target.removeEventListener(type, callback, options));
  }

  bindPointer(element, action) {
    this.listen(element, 'pointerdown', (event) => {
      if (!this.active || !this.canAim || (event.pointerType === 'mouse' && event.button !== 0)) return;
      event.preventDefault(); event.stopPropagation();
      const source = `pointer:${event.pointerId}`;
      if (action === 'throw' && !this.startCharge(source)) return;
      this.pointers.set(event.pointerId, { action, element });
      element.setPointerCapture?.(event.pointerId);
      this.focus?.();
    });
    this.listen(element, 'pointerup', (event) => {
      const pointer = this.pointers.get(event.pointerId);
      if (!pointer) return;
      event.preventDefault(); event.stopPropagation();
      this.pointers.delete(event.pointerId);
      if (pointer.action === 'throw') this.releaseCharge(`pointer:${event.pointerId}`);
      if (element.hasPointerCapture?.(event.pointerId)) element.releasePointerCapture(event.pointerId);
    });
    for (const type of ['pointercancel', 'lostpointercapture']) this.listen(element, type, (event) => {
      if (!this.pointers.has(event.pointerId)) return;
      // A cancelled gesture never launches a fruit or leaves an aim button held.
      this.cancelCharge();
    });
    this.listen(element, 'contextmenu', (event) => { if (this.active) event.preventDefault(); });
  }

  setPhase(phase) { this.phase = phase; this.phaseTime = 0; }

  orient() {
    this.actor.position.copy(this.world.station);
    this.actor.rotation.set(0, this.yaw, 0);
    this.setYaw(this.yaw);
  }

  enter() {
    if (this.active || !this.near || !this.orange.ready || !this.orange.enabled || this.orange.busy) return false;
    this.generation++;
    this.previousPhysicsStep = this.orange.onPhysicsStep;
    this.previousManaged = this.orange.managed;
    this.orange.managed = true;
    this.orange.onPhysicsStep = this.physicsStep;
    this.baseYaw = Math.atan2(this.world.crateCenter.x - this.world.station.x, this.world.crateCenter.z - this.world.station.z);
    this.aim = 0; this.charge = 0; this.hits = 0; this.attempts = 0;
    this.result = null; this.heldKeys.clear(); this.pointers.clear();
    this.orient();
    this.setPhase(this.orange.holding ? 'ready' : 'pickup');
    if (this.orange.holding) this.playClip('Orange_Idle', { fade: 0.18 });
    else this.orange.beginPickup();
    this.refreshUI(); this.focus?.();
    return true;
  }

  exit() {
    if (!this.active) return false;
    this.generation++;
    this.cancelCharge(); this.restoreFade();
    if (this.orange.onPhysicsStep === this.physicsStep) this.orange.onPhysicsStep = this.previousPhysicsStep;
    this.orient();
    this.orange.beginPickup({ instant: true });
    this.orange.managed = this.previousManaged ?? false;
    this.setPhase('idle'); this.arc.visible = false;
    this.elements.panel.hidden = true; this.elements.prompt.hidden = true;
    this.onExit?.(); this.focus?.();
    return true;
  }

  /** Main calls this only while active, before its ordinary movement handlers. */
  handleKey(event, isDown) {
    if (!this.active || !GAME_KEYS.has(event.code)) return false;
    event.preventDefault?.();
    if (event.code === 'Escape') { if (isDown && !event.repeat) this.exit(); return true; }
    if (LEFT.has(event.code) || RIGHT.has(event.code)) {
      if (isDown && this.canAim) this.heldKeys.add(event.code);
      else this.heldKeys.delete(event.code);
    }
    if (event.code === 'KeyF') {
      if (isDown && !event.repeat) this.startCharge('keyboard');
      if (!isDown) this.releaseCharge('keyboard');
    }
    return true;
  }

  startCharge(source) {
    if (this.phase !== 'ready' || !this.orange.holding) return false;
    this.chargeSource = source; this.charge = 0;
    this.setPhase('charge'); this.refreshUI(); return true;
  }

  releaseCharge(source) {
    if (this.phase !== 'charge' || this.chargeSource !== source) return false;
    const velocity = launchVelocity(this.yaw, this.charge);
    const generation = this.generation;
    this.chargeSource = null; this.heldKeys.clear();
    this.setPhase('windup'); this.arc.visible = false;
    // OrangeInteraction owns Orange_Throw and the .38-second release cue.
    const accepted = this.orange.toss({
      forwardSpeed: Math.hypot(velocity.x, velocity.z), upSpeed: velocity.y,
      onRelease: () => {
        if (this.generation !== generation || this.phase !== 'windup') return;
        this.attempts++; this.flightTime = 0; this.result = null;
        this.setPhase('flight'); this.refreshUI();
      },
    });
    if (!accepted) { this.charge = 0; this.setPhase('ready'); }
    this.refreshUI();
    return !!accepted;
  }

  cancelCharge() {
    this.heldKeys.clear();
    const pointers = [...this.pointers.entries()];
    this.pointers.clear(); this.chargeSource = null;
    for (const [id, { element }] of pointers) {
      if (element.hasPointerCapture?.(id)) element.releasePointerCapture(id);
    }
    if (this.phase === 'charge') { this.charge = 0; this.setPhase('ready'); }
    this.refreshUI();
  }

  onPhysicsStep(previous, dt) {
    if (!this.active) return;
    if (this.result === 'hit' && ['reaction', 'refill'].includes(this.phase)) {
      this.orange.prop.position.copy(this.hitPosition); this.orange.velocity.set(0, 0, 0);
      return;
    }
    if (this.phase !== 'flight') return;
    const contact = resolvePracticeContact(previous, this.orange.prop.position, this.orange.velocity,
      this.orange.radius, this.world.crateBounds);
    if (contact === 'hit') {
      this.hitPosition.copy(this.orange.prop.position);
      this.finishShot(true);
    } else if (contact === 'bounce') this.sound?.('orangeBounce');
    const floor = this.orange.groundLevel?.() ?? this.orange.radius - 0.018;
    if (this.phase === 'flight' && this.orange.velocity.y <= 0 && this.orange.prop.position.y <= floor + 0.001) this.finishShot(false);
  }

  finishShot(hit) {
    if (this.phase !== 'flight') return;
    this.result = hit ? 'hit' : 'miss';
    this.setPhase('reaction');
    if (hit) {
      this.hits++;
      this.world.burst({ reducedMotion: this.reducedMotion });
      this.sound?.('cheer');
      const action = this.playClip('Cheer', { loop: false, restart: true, fade: 0.14 });
      this.reactionSeconds = clamp(action?.getClip?.().duration ?? 1.1, 0.85, 1.6);
    } else {
      this.playClip('Orange_Notice', { loop: false, restart: true, fade: 0.18 });
      this.reactionSeconds = 0.7;
    }
    this.refreshUI();
  }

  startFade() {
    this.restoreFade();
    this.orange.visual.traverse((mesh) => {
      if (!mesh.isMesh) return;
      const original = mesh.material;
      const originals = Array.isArray(original) ? original : [original];
      const copies = originals.map((surface) => {
        const copy = surface.clone(); copy.transparent = true; copy.depthWrite = false; return copy;
      });
      this.fadeRecords.push({ mesh, original, copies, opacities: originals.map((surface) => surface.opacity) });
      mesh.material = Array.isArray(original) ? copies : copies[0];
    });
  }

  restoreFade() {
    for (const { mesh, original, copies } of this.fadeRecords) {
      mesh.material = original; copies.forEach((surface) => surface.dispose());
    }
    this.fadeRecords.length = 0;
  }

  update(dt) {
    if (!this.active) { this.refreshUI(); return; }
    dt = Math.max(0, dt);
    this.phaseTime += dt;
    if (this.canAim) {
      const left = [...this.heldKeys].some((key) => LEFT.has(key)) || [...this.pointers.values()].some((p) => p.action === 'left');
      const right = [...this.heldKeys].some((key) => RIGHT.has(key)) || [...this.pointers.values()].some((p) => p.action === 'right');
      // +yaw is Doro's left when facing the crate (-Z).
      this.aim = clamp(this.aim + (Number(left) - Number(right)) * AIM_RATE * dt, -PHYSICS.aimLimit, PHYSICS.aimLimit);
      this.orient();
    }
    if (this.phase === 'pickup' && this.orange.holding) this.setPhase('ready');
    if (this.phase === 'charge') this.charge = Math.min(1, this.phaseTime / PHYSICS.chargeSeconds);
    if (this.phase === 'flight') {
      this.flightTime += dt;
      if (this.flightTime >= PHYSICS.flightTimeout) this.finishShot(false);
    }
    if (this.phase === 'reaction' && this.phaseTime >= this.reactionSeconds) {
      this.setPhase('refill'); this.startFade();
    }
    if (this.phase === 'refill') {
      const amount = this.reducedMotion ? 1 : clamp(this.phaseTime / 0.28, 0, 1);
      for (const { copies, opacities } of this.fadeRecords) copies.forEach((surface, i) => { surface.opacity = opacities[i] * (1 - amount); });
      if (amount >= 1) {
        this.restoreFade(); this.result = null; this.charge = 0;
        this.orient(); this.orange.beginPickup(); this.setPhase('pickup');
      }
    }
    this.updateTrajectory(); this.refreshUI();
  }

  updateTrajectory() {
    this.arc.visible = this.canAim;
    if (!this.arc.visible) return;
    const velocity = launchVelocity(this.yaw, this.charge);
    this.forward.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    // Throw's grip moves a little forward before release. Use the live held fruit for height.
    this.releaseOrigin.copy(this.orange.prop.position).addScaledVector(this.forward, 0.06);
    const position = this.arcGeometry.attributes.position;
    let count = 0;
    for (let i = 0; i < position.count; i++) {
      const t = i * 0.035;
      const y = this.releaseOrigin.y + velocity.y * t - 0.5 * PHYSICS.gravity * t * t;
      if (i > 1 && y < this.orange.radius - 0.018) break;
      position.setXYZ(i, this.releaseOrigin.x + velocity.x * t, y, this.releaseOrigin.z + velocity.z * t);
      count++;
    }
    position.needsUpdate = true; this.arcGeometry.setDrawRange(0, count);
    this.arc.computeLineDistances();
  }

  frameCamera(dt, look) {
    if (!this.active) return false;
    // A fixed side/front view keeps her face, the full arc and the distant crate in one shot.
    const center = this.world.station.clone().lerp(this.world.crateCenter, 0.5).setY(0.65);
    this.forward.copy(this.world.crateCenter).sub(this.world.station).setY(0).normalize();
    this.side.set(this.forward.z, 0, -this.forward.x);
    const aspect = this.camera.aspect || 1;
    const fit = Math.max(1, 1.16 / aspect);
    const offset = this.side.clone().multiplyScalar(5.5).addScaledVector(this.forward, 1.25).setY(3.05).multiplyScalar(fit);
    this.cameraPosition.copy(center).add(offset);
    this.cameraLook.copy(center);
    const amount = this.reducedMotion ? 1 : 1 - Math.exp(-Math.max(0, dt) * 5);
    this.camera.position.lerp(this.cameraPosition, amount);
    look.lerp(this.cameraLook, amount); this.camera.lookAt(look);
    return true;
  }

  refreshUI() {
    const e = this.elements;
    e.prompt.hidden = this.active || !this.near || !this.orange.enabled || !this.orange.ready || this.orange.busy;
    e.panel.hidden = !this.active;
    if (!this.active) return;
    e.hits.textContent = String(this.hits); e.attempts.textContent = String(this.attempts);
    e.charge.value = this.charge;
    e.power.textContent = `${Math.round(this.charge * 100)}%`;
    const degrees = Math.round(Math.abs(this.aim) * 180 / Math.PI);
    e.aim.textContent = degrees === 0 ? '正前方' : `${this.aim > 0 ? '左' : '右'} ${degrees}°`;
    e.left.disabled = e.right.disabled = !this.canAim;
    e.throw.disabled = !this.canAim;
    e.throw.textContent = this.phase === 'charge' ? '放開投出！' : '按住 F · 蓄力';
    e.hint.textContent = ({
      pickup: '抱緊一點，準備好囉…', ready: 'A / D 瞄準 · 按住 F，放開投出',
      charge: this.charge >= 1 ? '蓄滿了！放開就投出' : '再用一點力…',
      windup: '嘿——！', flight: '飛呀，歐潤吉！',
      reaction: this.result === 'hit' ? '進箱了！又多一顆 ♡' : '差一點點，再來一顆！',
      refill: '新的歐潤吉來囉…',
    })[this.phase];
  }

  dispose() {
    this.exit(); this.listeners.forEach((remove) => remove()); this.listeners.length = 0;
    this.arc.removeFromParent(); this.arcGeometry.dispose(); this.arcMaterial.dispose();
  }
}
