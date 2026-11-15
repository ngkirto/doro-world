import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createWorldProps } from '../src/world-props.js';
import { launchVelocity, resolvePracticeContact } from '../src/games/orange-practice-physics.js';
import { OrangePractice } from '../src/games/orange-practice.js';

const world = createWorldProps(new THREE.Scene(), new THREE.Group());
const bounds = world.crateBounds;
const { x: cx, z: cz } = world.crateCenter;

test('descending fruit scores, rising fruit and misses do not', () => {
  const position = { x: cx, y: 1.4, z: cz };
  const velocity = { x: 0, y: -3, z: -1 };
  assert.equal(resolvePracticeContact({ ...position, y: 2 }, position, velocity, .28, bounds), 'hit');
  assert.equal(velocity.y, 0);
  assert.equal(resolvePracticeContact({ x: cx, y: 1.5, z: cz }, { x: cx, y: 2, z: cz }, { x: 0, y: 3, z: 0 }, .28, bounds), null);
  assert.equal(resolvePracticeContact({ x: cx + 5, y: 2, z: cz }, { x: cx + 5, y: 1.4, z: cz }, { x: 0, y: -3, z: 0 }, .28, bounds), null);
});

test('fast low throws bounce off the crate instead of tunnelling', () => {
  const position = { x: cx, y: .6, z: cz - 1 };
  const velocity = { x: 0, y: 0, z: -5 };
  assert.equal(resolvePracticeContact({ x: cx, y: .6, z: cz + 2 }, position, velocity, .28, bounds), 'bounce');
  assert.ok(position.z > bounds.maxZ);
  assert.ok(velocity.z > 0);
});

test('launch power is bounded and yaw changes direction without changing speed', () => {
  assert.deepEqual(launchVelocity(0, -1), launchVelocity(0, 0));
  assert.deepEqual(launchVelocity(0, 2), launchVelocity(0, 1));
  const a = launchVelocity(0, .85), b = launchVelocity(Math.PI / 2, .85);
  assert.ok(Math.abs(a.z - b.x) < 1e-10);
  assert.equal(a.y, b.y);
});

function fixture() {
  const actor = new THREE.Group(); actor.position.copy(world.station);
  const originalCallback = () => {};
  const orange = { ready: true, enabled: true, busy: false, holding: true, managed: false,
    onPhysicsStep: originalCallback, prop: new THREE.Group(), visual: new THREE.Group(),
    velocity: new THREE.Vector3(), radius: .28,
    beginPickup() { this.holding = true; },
    toss(options) { this.release = options.onRelease; this.holding = false; return true; } };
  const elements = Object.fromEntries(['prompt','enter','panel','hint','charge','power','hits','attempts','aim','left','right','throw','exit'].map(key => [key, new EventTarget()]));
  const practice = new OrangePractice({ scene: new THREE.Scene(), actor, camera: new THREE.PerspectiveCamera(), orange,
    playClip() {}, setYaw() {}, elements, world });
  return { practice, orange, originalCallback };
}

test('cancelled charge does not throw; exit restores orange ownership', () => {
  const { practice, orange, originalCallback } = fixture();
  assert.equal(practice.enter(), true);
  practice.startCharge('keyboard'); practice.update(.8); practice.cancelCharge();
  assert.equal(practice.phase, 'ready'); assert.equal(practice.attempts, 0);
  practice.startCharge('keyboard'); practice.update(1); practice.releaseCharge('keyboard');
  const staleRelease = orange.release;
  practice.exit(); staleRelease();
  assert.equal(practice.active, false); assert.equal(practice.attempts, 0);
  assert.equal(orange.managed, false); assert.equal(orange.onPhysicsStep, originalCallback);
  practice.dispose();
});

test('a scored shot counts once and refills for the next turn', () => {
  const { practice, orange } = fixture();
  practice.enter(); practice.startCharge('keyboard'); practice.update(1);
  practice.releaseCharge('keyboard'); orange.release();
  assert.equal(practice.attempts, 1);
  practice.finishShot(true); practice.finishShot(true);
  assert.equal(practice.hits, 1);
  practice.update(2); practice.update(.3); practice.update(.1);
  assert.equal(practice.phase, 'ready');
  practice.dispose();
});
