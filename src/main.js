import { createQualityController } from './render-quality.js';
import { createPerformanceMonitor } from './performance-monitor.js';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrangeInteraction } from './orange.js';
import { OrangePractice } from './games/orange-practice.js';
import { createWorldProps } from './world-props.js';
import './style.css';

const $ = (id) => document.getElementById(id);
$('error-retry').addEventListener('click', () => location.reload());
const canvas = $('world');
const scene = new THREE.Scene();
scene.background = new THREE.Color('#eee9e4');
scene.fog = new THREE.Fog('#eee9e4', 12, 38);
const camera = new THREE.PerspectiveCamera(38, innerWidth / innerHeight, 0.02, 100);
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
} catch (error) {
  fail('This browser needs WebGL 2 to display Doro. Try an updated browser with hardware acceleration enabled.');
  throw error;
}
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
scene.add(new THREE.HemisphereLight(0xfff7f1, 0x9e959b, 2.3));
const sun = new THREE.DirectionalLight(0xfff4e5, 3.1);
sun.position.set(-3, 6, 4);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = sun.shadow.camera.bottom = -5;
sun.shadow.camera.right = sun.shadow.camera.top = 5;
sun.shadow.normalBias = 0.015;
sun.shadow.bias = -0.0001;
scene.add(sun, sun.target);
const fill = new THREE.DirectionalLight(0xe3d9fa, 1.5);
fill.position.set(3, 2, -3);
scene.add(fill);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000), new THREE.MeshStandardMaterial({ color: '#e2dad0', roughness: 0.92 }));
floor.rotation.x = -Math.PI / 2;
floor.position.y = -0.018;
floor.receiveShadow = true;
scene.add(floor);
const grid = new THREE.GridHelper(100, 100, '#b8aaa4', '#cbbfb7');
grid.position.y = -0.014;
grid.material.transparent = true;
grid.material.opacity = 0.28;
scene.add(grid);

// The wall Doro hides behind. Its free edge is at x = 0; she peeks and jumps out past it toward +x.
const WALL = { width: 2.6, height: 1.45, depth: 0.28, z: 0.35 };
const wall = new THREE.Mesh(
  new THREE.BoxGeometry(WALL.width, WALL.height, WALL.depth),
  new THREE.MeshStandardMaterial({ color: '#cdbfb3', roughness: 0.85 }),
);
wall.position.set(-WALL.width / 2, WALL.height / 2 - 0.018, WALL.z);
wall.castShadow = true;
wall.receiveShadow = true;
scene.add(wall);
const cap = new THREE.Mesh(
  new THREE.BoxGeometry(WALL.width + 0.08, 0.07, WALL.depth + 0.08),
  new THREE.MeshStandardMaterial({ color: '#b6a79b', roughness: 0.8 }),
);
cap.position.set(-WALL.width / 2, WALL.height, WALL.z);
cap.castShadow = true;
scene.add(cap);

const HIDE_SPOT = new THREE.Vector3(-0.3, 0, -0.02);
const LAND_SPOT = new THREE.Vector3(0.85, 0, 1.0);

const actor = new THREE.Group();
scene.add(actor);
const keys = new Set();
const yAxis = new THREE.Vector3(0, 1, 0);
const desiredRotation = new THREE.Quaternion();
const desiredCamera = new THREE.Vector3();
const look = new THREE.Vector3(0, 0.55, 0);
const desiredLook = new THREE.Vector3(0, 0.55, 0);
let state = 'loading';
let introTime = 0;
let speed = 0;
let yaw = 0;
let orbit = 0.35;
let pitch = 0.32;
let dragging = false;
let lastPointer;
const duration = 14;
const smooth = (a, b, t) => THREE.MathUtils.smoothstep(t, a, b);

// ---------------------------------------------------------------- animation clips
let mixer;
const actions = {};
let current = null;
let orange;
let practice, worldProps;
const quality = createQualityController(renderer, sun, $('quality'), tier => { worldProps?.setQuality(tier); });
const movementDirection = new THREE.Vector3();
const followLook = new THREE.Vector3();
const cameraOffset = new THREE.Vector3();
const lightOffset = new THREE.Vector3(-3, 6, 4);
let shockTime = -1;
const shockMeshes = [];
let oneShot = null; // name of the dodge currently playing, if any
const RUN_STYLES = ['Run', 'Run_Panic', 'Run_Naruto', 'Run_AllFours'];
let runStyle = 0;
const DODGES = {
  Digit1: 'Dodge_Left', Digit2: 'Dodge_Right', Digit3: 'Dodge_Duck', Digit4: 'Dodge_Matrix',
  Digit5: 'Dodge_Prone', Digit6: 'Dodge_Spin', Digit7: 'Dodge_Jump', Space: 'Dodge_Jump',
};

function playClip(name, { fade = 0.18, loop = true, restart = false } = {}) {
  const next = actions[name];
  if (!next) return null;
  if (next === current && !restart) return next;
  next.reset();
  next.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
  next.clampWhenFinished = !loop;
  next.timeScale = 1;
  next.setEffectiveWeight(1);
  if (current && current !== next && fade > 0) next.crossFadeFrom(current, fade, false);
  else if (current && current !== next) current.stop();
  next.play();
  current = next;
  return next;
}

// ---------------------------------------------------------------- sound
// Small synthesized effects (squeaky steps, jump, landing, whoosh) made with Web Audio, so there are no audio files.
// Browsers only allow sound after the visitor's first click or key press.
let audio = null;
let master = null;
let muted = false;
try { muted = localStorage.getItem('doro-muted') === '1'; } catch { /* storage unavailable */ }
const sfxLog = [];

function ensureAudio() {
  if (muted) return null;
  if (!audio) {
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) return null;
    audio = new Context();
    master = audio.createGain();
    master.gain.value = 0.55;
    master.connect(audio.destination);
  }
  if (audio.state === 'suspended') audio.resume();
  return audio;
}

function tone({ from, to, dur, type = 'sine', gain = 0.2, delay = 0 }) {
  const start = audio.currentTime + delay;
  const osc = audio.createOscillator();
  const env = audio.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, start);
  osc.frequency.exponentialRampToValueAtTime(to, start + dur);
  env.gain.setValueAtTime(0.0001, start);
  env.gain.exponentialRampToValueAtTime(gain, start + Math.min(0.012, dur / 4));
  env.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  osc.connect(env).connect(master);
  osc.start(start); osc.stop(start + dur + 0.02);
}

let noiseBuffer = null;
function noise({ from, to, dur, gain = 0.15, delay = 0, q = 1.2 }) {
  if (!noiseBuffer) {
    noiseBuffer = audio.createBuffer(1, audio.sampleRate, audio.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  const start = audio.currentTime + delay;
  const source = audio.createBufferSource();
  const filter = audio.createBiquadFilter();
  const env = audio.createGain();
  source.buffer = noiseBuffer;
  filter.type = 'bandpass'; filter.Q.value = q;
  filter.frequency.setValueAtTime(from, start);
  filter.frequency.exponentialRampToValueAtTime(to, start + dur);
  env.gain.setValueAtTime(0.0001, start);
  env.gain.exponentialRampToValueAtTime(gain, start + dur * 0.3);
  env.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  source.connect(filter).connect(env).connect(master);
  source.start(start, Math.random() * 0.5, dur + 0.05);
}

const jitter = () => 1 + (Math.random() - 0.5) * 0.12;
const SFX = {
  stepA() { const k = jitter(); tone({ from: 720 * k, to: 1150 * k, dur: 0.07, type: 'triangle', gain: 0.13 }); noise({ from: 900, to: 300, dur: 0.05, gain: 0.05 }); },
  stepB() { const k = jitter(); tone({ from: 840 * k, to: 1300 * k, dur: 0.07, type: 'triangle', gain: 0.13 }); noise({ from: 900, to: 300, dur: 0.05, gain: 0.05 }); },
  peek() { tone({ from: 500, to: 1500, dur: 0.16, type: 'sine', gain: 0.16 }); },
  jump() { tone({ from: 320, to: 1250, dur: 0.26, type: 'sine', gain: 0.2 }); noise({ from: 500, to: 3000, dur: 0.22, gain: 0.07 }); },
  land() { tone({ from: 190, to: 60, dur: 0.16, type: 'sine', gain: 0.32 }); noise({ from: 700, to: 150, dur: 0.1, gain: 0.1 }); tone({ from: 900, to: 600, dur: 0.08, type: 'triangle', gain: 0.08, delay: 0.03 }); },
  thud() { tone({ from: 150, to: 50, dur: 0.2, type: 'sine', gain: 0.34 }); noise({ from: 500, to: 120, dur: 0.14, gain: 0.12 }); },
  whoosh() { noise({ from: 400, to: 2600, dur: 0.24, gain: 0.14, q: 0.8 }); },
  hop() { const k = jitter(); tone({ from: 880 * k, to: 1500 * k, dur: 0.09, type: 'sine', gain: 0.12 }); },
  cheer() { tone({ from: 900, to: 1400, dur: 0.1, gain: 0.15 }); tone({ from: 1200, to: 1900, dur: 0.14, gain: 0.15, delay: 0.11 }); },
  orangeBounce() { tone({ from: 240, to: 110, dur: 0.06, gain: 0.1 }); },
};

function playSound(name) {
  if (!muted && audio?.state === 'running') SFX[name]?.();
}

// Sound cues per clip, as [fraction of the clip, effect]. Steps land shortly after each leg swings forward.
const STEPS = [[0.35, 'stepA'], [0.85, 'stepB']];
const CUES = {
  Walk: STEPS, Run: STEPS, Run_Panic: STEPS, Run_Naruto: STEPS, Run_AllFours: STEPS,
  Orange_Walk: STEPS, Orange_Run: STEPS,
  Hide_PeekL: [[0.17, 'peek']], Hide_PeekR: [[0.17, 'peek']],
  JumpOut: [[0.16, 'jump'], [0.5, 'land'], [0.62, 'cheer']],
  Cheer: [[0.3, 'hop']],
  Dodge_Left: [[0.08, 'whoosh']], Dodge_Right: [[0.08, 'whoosh']], Dodge_Matrix: [[0.08, 'whoosh']],
  Dodge_Duck: [[0.06, 'whoosh'], [0.24, 'hop']],
  Dodge_Prone: [[0.05, 'whoosh'], [0.19, 'thud']],
  Dodge_Spin: [[0.1, 'whoosh'], [0.45, 'whoosh']],
  Dodge_Jump: [[0.2, 'jump'], [0.72, 'land']],
};
let cueAction = null;
let cuePhase = 0;
function runCues() {
  if (!current) return;
  const clip = current.getClip();
  const phase = current.time / clip.duration;
  if (current !== cueAction) { cueAction = current; cuePhase = -1; }
  for (const [at, name] of CUES[clip.name] || []) {
    const hit = phase >= cuePhase ? (at > cuePhase && at <= phase) : (at > cuePhase || at <= phase);
    if (!hit) continue;
    if (import.meta.env.DEV) sfxLog.push(name);
    if (!muted && audio && audio.state === 'running') SFX[name]();
  }
  cuePhase = phase;
}

function setMuted(value) {
  muted = value;
  try { localStorage.setItem('doro-muted', muted ? '1' : '0'); } catch { /* storage unavailable */ }
  $('sound').textContent = muted ? 'Sound off' : 'Sound on';
  $('sound').setAttribute('aria-pressed', String(!muted));
  if (!muted) ensureAudio();
}
$('sound').onclick = () => { setMuted(!muted); canvas.focus({ preventScroll: true }); };
setMuted(muted);
for (const type of ['pointerdown', 'keydown']) window.addEventListener(type, ensureAudio, { capture: true });

function fail(message) {
  performance.mark('doro-ready');
  $('loading').hidden = true;
  $('error').hidden = false;
  $('error-detail').textContent = message;
}

function beginIntro() {
  practice?.exit(); shockTime = -1;
  orange?.reset();
  state = 'intro'; introTime = 0; speed = 0; yaw = 0; oneShot = null; introBeat = '';
  keys.clear(); actor.position.copy(HIDE_SPOT); actor.rotation.set(0, 0, 0);
  playClip('Hide_Idle', { fade: 0, restart: true });
  camera.position.set(1.7, 0.75, 4.4);
  look.set(0.1, 0.5, 0.2);
  $('cinema').hidden = false;
  for (const id of ['welcome', 'controls', 'touch', 'replay']) $(id).hidden = true;
}

function beginPlay() {
  state = 'play'; speed = 0; oneShot = null;
  // If the intro was skipped while she was still behind the wall, put her out in the open.
  if (actor.position.z < WALL.z + 0.4 && actor.position.x < 0.3) { actor.position.copy(LAND_SPOT); yaw = 0; }
  actor.position.y = 0;
  orbit = yaw + Math.PI + 0.32;
  playClip('Idle');
  $('cinema').hidden = true;
  for (const id of ['welcome', 'controls', 'touch', 'replay']) $(id).hidden = false;
  canvas.focus({ preventScroll: true });
  orange?.spawn(yaw);
}

// Cutscene beats: hide behind the wall -> peek -> jump out with both hands up -> cheer -> run off -> hand over control.
const T = { peek: 1.6, wait: 4.1, jump: 4.7, cheer: 6.55, run: 8.6, stop: 11.6 };
let introBeat = '';
function beat(name, clip, options) {
  if (introBeat === name) return;
  introBeat = name;
  playClip(clip, options);
}

// Fixed shot for the jump-out, as in the reference: her landing spot is centred and the camera sits above her, looking down.
function jumpShot(zoom = 1) {
  // Lead her slightly while she is still travelling so she stays near the middle on narrow screens too.
  const x = THREE.MathUtils.lerp(LAND_SPOT.x, actor.position.x, 0.5);
  const z = THREE.MathUtils.lerp(LAND_SPOT.z, actor.position.z, 0.5);
  desiredCamera.set(x, 0.5 + 1.0 * zoom, z + 3.3 * zoom);
  desiredLook.set(x, 0.5, z);
}

function intro(dt) {
  introTime += dt;
  const t = introTime;
  if (t < T.peek) {
    beat('hide', 'Hide_Idle');
    desiredCamera.set(1.5 - t * 0.2, 0.7, 4.1 - t * 0.35);
    desiredLook.set(0.1, 0.5, 0.2);
  } else if (t < T.wait) {
    beat('peek', 'Hide_PeekL', { loop: false });
    // Close on the wall edge: she slides out sideways, fully horizontal.
    desiredCamera.set(0.32, 0.5, 2.1);
    desiredLook.set(0.2, 0.42, 0);
  } else if (t < T.jump) {
    beat('wait', 'Hide_Idle');
    jumpShot();
  } else if (t < T.cheer) {
    beat('jump', 'JumpOut', { loop: false, fade: 0.08 });
    // She is airborne between frames 9 and 22 of the clip; travel out past the wall edge during that window.
    // Sideways first, then forward, so she clears the wall edge instead of cutting through its corner.
    const tj = t - T.jump;
    actor.position.x = THREE.MathUtils.lerp(HIDE_SPOT.x, LAND_SPOT.x, smooth(0.3, 0.8, tj));
    actor.position.z = THREE.MathUtils.lerp(HIDE_SPOT.z, LAND_SPOT.z, smooth(0.5, 0.92, tj));
    jumpShot();
  } else if (t < T.run) {
    beat('cheer', 'Cheer', { fade: 0.25 });
    actor.position.copy(LAND_SPOT);
    jumpShot(0.88);
  } else if (t < T.stop) {
    beat('run', 'Run');
    const runTime = t - T.run;
    yaw = smooth(0, 0.35, runTime) * 1.25 + smooth(1.4, 3.0, runTime) * 0.9;
    actor.quaternion.setFromAxisAngle(yAxis, yaw);
    const pace = 1.9 * smooth(0, 0.3, runTime) * (1 - smooth(T.stop - T.run - 0.35, T.stop - T.run, runTime));
    actor.position.x += Math.sin(yaw) * pace * dt;
    actor.position.z += Math.cos(yaw) * pace * dt;
    desiredCamera.copy(actor.position).add(new THREE.Vector3(0.9, 1.0, 3.4));
    desiredLook.copy(actor.position).add(new THREE.Vector3(0, 0.5, 0));
  } else {
    beat('settle', 'Idle', { fade: 0.3 });
    const arc = smooth(T.stop, duration, t);
    const angle = THREE.MathUtils.lerp(0.3, yaw + Math.PI + 0.32, arc);
    desiredCamera.copy(actor.position).add(new THREE.Vector3(Math.sin(angle) * 3, 1.4, Math.cos(angle) * 3));
    desiredLook.copy(actor.position).add(new THREE.Vector3(0, 0.55, 0));
  }
  camera.position.lerp(desiredCamera, 1 - Math.exp(-dt * 4));
  look.lerp(desiredLook, 1 - Math.exp(-dt * 6));
  camera.lookAt(look);
  $('progress').style.width = `${Math.min(1, t / duration) * 100}%`;
  if (t >= duration) beginPlay();
}

const WALK_SPEED = 0.62;
const RUN_SPEED = 2.0;
function play(dt) {
  if (practice?.active) { practice.frameCamera(dt, look); return; }
  const horizontal = Number(keys.has('KeyD') || keys.has('ArrowRight')) - Number(keys.has('KeyA') || keys.has('ArrowLeft'));
  const vertical = Number(keys.has('KeyW') || keys.has('ArrowUp')) - Number(keys.has('KeyS') || keys.has('ArrowDown'));
  const moving = !oneShot && !orange?.busy && (horizontal !== 0 || vertical !== 0);
  const running = keys.has('ShiftLeft') || keys.has('ShiftRight');
  const pace = orange?.holding ? (running ? 1.05 : 0.42) : (running ? RUN_SPEED : WALK_SPEED);
  speed = THREE.MathUtils.damp(speed, moving ? pace : 0, 9, dt);
  if (moving) {
    const direction = movementDirection.set(-Math.sin(orbit) * vertical + Math.cos(orbit) * horizontal, 0, -Math.cos(orbit) * vertical - Math.sin(orbit) * horizontal).normalize();
    actor.position.addScaledVector(direction, speed * dt);
    yaw = Math.atan2(direction.x, direction.z);
    $('welcome').hidden = true;
  }
  desiredRotation.setFromAxisAngle(yAxis, yaw);
  actor.quaternion.slerp(desiredRotation, 1 - Math.exp(-dt * 10));
  if (!oneShot && !orange?.busy) {
    if (speed < 0.08) playClip(orange?.holding ? 'Orange_Idle' : 'Idle', { fade: 0.25 });
    else if (running && moving) playClip(orange?.holding ? 'Orange_Run' : RUN_STYLES[runStyle]).timeScale = THREE.MathUtils.clamp(speed / 1.8, 0.7, 1.3);
    else playClip(orange?.holding ? 'Orange_Walk' : 'Walk').timeScale = THREE.MathUtils.clamp(speed / 0.4, 0.8, 1.7);
  }
  const distance = (innerWidth < 700 ? 3.8 : 3.1) + (orange?.holding ? 0.3 : 0);
  desiredCamera.copy(actor.position).add(cameraOffset.set(Math.sin(orbit) * distance, 0.55 + Math.sin(pitch) * distance, Math.cos(orbit) * distance));
  if (orange?.frameCamera(dt, look, desiredCamera, followLook.set(actor.position.x, 0.55, actor.position.z))) return;
  camera.position.lerp(desiredCamera, 1 - Math.exp(-dt * 5));
  look.lerp(followLook.set(actor.position.x, 0.55, actor.position.z), 1 - Math.exp(-dt * 8));
  camera.lookAt(look);
}

function dodge(name) {
  if (state !== 'play' || oneShot || orange?.busy || !actions[name]) return;
  orange?.dropForDodge();
  oneShot = name;
  $('welcome').hidden = true;
  playClip(name, { loop: false, fade: 0.1, restart: true });
}

function shocked() {
  if (state !== 'play' || practice?.active || oneShot || orange?.busy) return;
  orange?.dropForDodge();
  keys.clear(); speed = 0; oneShot = 'Shock'; shockTime = 0;
  playClip('Shock', { loop: false, restart: true, fade: 0.08 });
}
$('shock').onclick = () => { shocked(); canvas.focus(); };

const handled = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight', 'KeyR', 'KeyE', 'KeyF', ...Object.keys(DODGES)];
window.addEventListener('keydown', (event) => {
  if (state === 'play' && practice?.handleKey(event, true)) return;
  if (event.code === 'KeyQ' && !event.repeat && !['BUTTON','INPUT','SELECT'].includes(event.target.tagName)) { shocked(); return; }
  if (event.code === 'KeyE' && !event.repeat && state === 'play' && practice?.near && !oneShot && !orange?.busy && !['BUTTON','INPUT','SELECT'].includes(event.target.tagName)) { event.preventDefault(); keys.clear(); practice.enter(); return; }
  if (!handled.includes(event.code) || state !== 'play' || ['BUTTON', 'INPUT', 'SELECT'].includes(event.target.tagName)) return;
  event.preventDefault();
  if (event.code === 'KeyE' || event.code === 'KeyF') {
    if (!event.repeat && !oneShot) {
      if (event.code === 'KeyE') orange?.interact();
      else orange?.toss();
      canvas.focus({ preventScroll: true });
    }
    return;
  }
  if (DODGES[event.code]) { if (!event.repeat) dodge(DODGES[event.code]); return; }
  if (event.code === 'KeyR') { if (!event.repeat) runStyle = (runStyle + 1) % RUN_STYLES.length; return; }
  keys.add(event.code);
});
window.addEventListener('keyup', (event) => { practice?.handleKey(event, false); keys.delete(event.code); });
window.addEventListener('blur', () => { keys.clear(); dragging = false; });
document.addEventListener('visibilitychange', () => keys.clear());
canvas.addEventListener('pointerdown', (event) => {
  if (state !== 'play' || orange?.busy || practice?.active) return;
  dragging = true; lastPointer = [event.clientX, event.clientY];
  pointerStart = [event.clientX, event.clientY];
  pointerDistance = 0;
  canvas.setPointerCapture(event.pointerId); canvas.focus();
});
canvas.addEventListener('pointermove', (event) => {
  if (!dragging) return;
  pointerDistance = Math.max(pointerDistance, Math.hypot(event.clientX - pointerStart[0], event.clientY - pointerStart[1]));
  orbit -= (event.clientX - lastPointer[0]) * 0.005;
  pitch = THREE.MathUtils.clamp(pitch + (event.clientY - lastPointer[1]) * 0.003, 0.06, 0.9);
  lastPointer = [event.clientX, event.clientY];
});
let pointerStart = [0, 0];
let pointerDistance = 0;
canvas.addEventListener('pointerup', (event) => {
  if (dragging && pointerDistance < 6 && !oneShot) orange?.tap(event.clientX, event.clientY, canvas);
  dragging = false;
});
for (const event of ['pointercancel', 'lostpointercapture']) canvas.addEventListener(event, () => { dragging = false; });
document.querySelectorAll('[data-key]').forEach((button) => {
  button.addEventListener('pointerdown', (event) => { event.preventDefault(); keys.add(button.dataset.key); button.setPointerCapture(event.pointerId); });
  for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(event, () => keys.delete(button.dataset.key));
});
$('skip').onclick = beginPlay;
$('replay').onclick = beginIntro;
$('reset').onclick = () => {
  practice?.exit(); shockTime = -1;
  actor.position.copy(LAND_SPOT); speed = 0; keys.clear(); oneShot = null;
  orange?.spawn(yaw); playClip('Idle', { fade: 0.15 }); canvas.focus();
};
window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix(); quality.resize();
});

new GLTFLoader().load(`${import.meta.env.BASE_URL}models/doro.glb`, async (gltf) => {
  actor.add(gltf.scene);
  gltf.scene.traverse((object) => {
    if (object.morphTargetDictionary?.Shocked !== undefined) {
      object.morphTargetInfluences[object.morphTargetDictionary.Shocked] = 1;
      object.visible = false;
      shockMeshes.push(object);
    }
    if (object.isMesh) {
      object.castShadow = true; object.receiveShadow = true;
      object.frustumCulled = false;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) { material.roughness = 0.55; material.metalness = 0; }
    }
  });
  mixer = new THREE.AnimationMixer(gltf.scene);
  for (const clip of gltf.animations) actions[clip.name] = mixer.clipAction(clip);
  for (const name of ['Idle', 'Walk', 'Run', 'Hide_Idle', 'Hide_PeekL', 'JumpOut', 'Cheer', 'Orange_Notice', 'Orange_Reach', 'Orange_Pickup', 'Orange_Hug', 'Orange_Place', 'Orange_Throw', 'Orange_Idle', 'Orange_Walk', 'Orange_Run']) {
    if (!actions[name]) { fail(`The model is missing the ${name} animation.`); return; }
  }
  mixer.addEventListener('finished', (event) => {
    if (oneShot && event.action === actions[oneShot]) oneShot = null;
  });
  orange = new OrangeInteraction({
    scene, actor, camera, wall: WALL, playClip, sound: playSound,
    focus() { canvas.focus({ preventScroll: true }); },
    canInteract() { return state === 'play' && !oneShot; },
    setYaw(value) { yaw = value; keys.clear(); speed = 0; $('welcome').hidden = true; },
    elements: { panel: $('orange-controls'), interact: $('interact'), toss: $('toss'), hint: $('orange-hint'), skip: $('skip-orange') },
  });
  try { await orange.load(); }
  catch (error) { console.error(error); fail('The orange could not load. Please try again.'); return; }
  worldProps = createWorldProps(scene, orange.visual);
  worldProps.setQuality(quality.tier);
  practice = new OrangePractice({ scene, actor, camera, orange, world: worldProps, playClip, sound: playSound,
    setYaw(value) { yaw = value; keys.clear(); speed = 0; },
    focus() { canvas.focus({ preventScroll: true }); },
    onExit() { keys.clear(); speed = 0; },
    elements: Object.fromEntries(['prompt','enter','panel','hint','charge','power','hits','attempts','aim','left','right','throw','exit'].map(key => [key, $('practice-' + key)])),
  });
  if (import.meta.env.DEV) window.__doro = { actor, actions, mixer, camera, orange, get state() { return state; }, get clip() { return current?.getClip().name; }, get t() { return introTime; }, sfxLog, get audioState() { return audio?.state; }, keys, pause(v) { paused = v; }, advance(seconds) { for (let i = 0; i < Math.round(seconds * 60); i++) tick(1 / 60); } };
  performance.mark('doro-ready');
  $('loading').hidden = true;
  beginIntro();
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) beginPlay();
}, (event) => {
  if (event.total) $('load-detail').textContent = `${Math.round(event.loaded / event.total * 100)}% loaded`;
}, () => fail('The character could not be downloaded. Check your connection, then try again.'));

function tick(dt) {
  if (state === 'intro') intro(dt);
  if (state === 'play') { orange?.update(dt); practice?.update(dt); play(dt); }
  if (mixer) { mixer.update(dt); runCues(); }
  if (shockTime >= 0) { shockTime += dt; if (shockTime > 1.75) shockTime = -1; }
  for (const mesh of shockMeshes) {
    // Keep the finished mouth shape; toggle the artwork without morph interpolation.
    mesh.morphTargetInfluences[mesh.morphTargetDictionary.Shocked] = 1;
    mesh.visible = shockTime >= 0;
  }
  orange?.afterAnimation();
  worldProps?.update(dt, camera.position);
  $('shock').hidden = state !== 'play' || !!practice?.active;
  if (practice?.active) { $('controls').hidden = true; $('touch').hidden = true; $('welcome').hidden = true; }
  else if (state === 'play') { $('controls').hidden = false; $('touch').hidden = false; }
  if (practice && (state !== 'play' || oneShot)) $('practice-prompt').hidden = true;
  $('shock').disabled = !!oneShot || !!orange?.busy;
  sun.position.copy(actor.position).add(lightOffset);
  sun.target.position.copy(actor.position);
  grid.position.x = Math.round(actor.position.x / 10) * 10;
  grid.position.z = Math.round(actor.position.z / 10) * 10;
  renderer.render(scene, camera);
}

const metrics = createPerformanceMonitor(renderer, (destination) => {
  if (!practice || !orange?.ready) return;
  practice.exit(); keys.clear(); speed = 0; oneShot = null; shockTime = -1;
  if (state !== 'play') beginPlay();
  if (destination === 'practice') {
    actor.position.copy(worldProps.station); orange.spawn(0); practice.enter();
  } else { $('reset').click(); orbit = Math.PI + .32; }
});
let previous = performance.now();
let accumulated = 0;
let lastRendered = previous;
let paused = false;
document.addEventListener('visibilitychange', () => {
  previous = lastRendered = performance.now(); accumulated = 0; quality.resetTiming(); metrics.reset();
});
renderer.setAnimationLoop((now) => {
  const rawMs = now - previous; previous = now;
  if (document.hidden || paused) { lastRendered = now; accumulated = 0; return; }
  accumulated += rawMs;
  const interval = 1000 / quality.fpsLimit;
  if (accumulated < interval - .5) return;
  const frameMs = now - lastRendered;
  lastRendered = now;
  accumulated = Math.max(0, accumulated - interval) % interval;
  const started = performance.now();
  tick(Math.min(frameMs / 1000, .05));
  if (state !== 'loading') quality.sample(frameMs);
  metrics.sample(frameMs, performance.now() - started, `${practice?.active ? '投擲區' : state} · ${quality.tier}`);
});
