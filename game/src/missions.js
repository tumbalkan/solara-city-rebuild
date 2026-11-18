// Missions — Rico's five-job story arc, from his first stolen car to the
// Bayfront Showdown. A mission is a list of steps; each step completes when
// its condition holds. A golden beacon marks the current objective in the
// world and on the minimap.
import * as THREE from 'three';
import { MONEY } from './config.js';

export const MISSION_DEFS = [
  {
    id: 'first-wheels',
    title: 'First Wheels',
    brief: "Mara needs a driver. Steal a car — any car — and bring it to her garage on Coral Ave.",
    steps: [
      { id: 'steal', text: 'Steal a car (walk up to one and press E)', type: 'in-car' },
      { id: 'drive', text: "Drive to Mara's Garage", type: 'reach', target: { x: -104, z: -104 }, radius: 10 },
    ],
  },
  {
    id: 'the-package',
    title: 'The Package',
    brief: 'Pick up the package at the docks and deliver it to the hotel before the timer runs out.',
    steps: [
      { id: 'pickup', text: 'Pick up the package at the docks', type: 'reach', target: { x: 104, z: 130 }, radius: 8 },
      { id: 'deliver', text: 'Deliver the package to the Grand Hotel', type: 'reach', target: { x: -52, z: 0 }, radius: 10, timeLimit: 120 },
    ],
  },
  {
    id: 'heat-wave',
    title: 'Heat Wave',
    brief: 'The cops are onto you. Lose the heat — get your wanted level back to zero.',
    steps: [
      { id: 'heat', text: 'You have 3 stars. Lose the cops!', type: 'wanted-zero', startStars: 3 },
    ],
  },
  {
    id: 'the-getaway',
    title: 'The Getaway',
    brief: 'Pick up the client at the plaza and drive him to the airfield while the police chase you.',
    steps: [
      { id: 'client', text: 'Pick up the client at Meridian Plaza', type: 'reach', target: { x: 0, z: 0 }, radius: 8 },
      { id: 'escape', text: 'Drive the client to the airfield', type: 'reach', target: { x: 130, z: -130 }, radius: 12, startStars: 3 },
    ],
  },
  {
    id: 'bayfront-showdown',
    title: 'Bayfront Showdown',
    brief: 'The Red Jacks took over the pier. Clear them out, then get out of there.',
    steps: [
      { id: 'pier', text: 'Go to the Bayfront Pier', type: 'reach', target: { x: 40, z: 150 }, radius: 14 },
      { id: 'clear', text: 'Take out the Red Jacks (5 left)', type: 'kill-all', spawn: 5 },
      { id: 'leave', text: 'Escape to the north side of town', type: 'reach', target: { x: -104, z: -130 }, radius: 14 },
    ],
  },
];

export class Missions {
  constructor(scene, audio) {
    this.scene = scene;
    this.audio = audio;
    this.index = 0;
    this.stepIndex = 0;
    this.active = false;
    this.completed = 0;
    this.timer = 0;
    this.beacon = this.makeBeacon();
    // onEvent(type, payload): 'start' | 'step' | 'complete' | 'fail'.
    this.onEvent = null;
  }

  get current() {
    return MISSION_DEFS[this.index] ?? null;
  }

  get step() {
    return this.current?.steps[this.stepIndex] ?? null;
  }

  get done() {
    return this.index >= MISSION_DEFS.length;
  }

  // A tall golden light beam plus a ring on the ground.
  makeBeacon() {
    const group = new THREE.Group();
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(1.2, 1.2, 60, 12, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xffd23f,
        transparent: true,
        opacity: 0.35,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    beam.position.y = 30;
    group.add(beam);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(3, 4.2, 24),
      new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.8, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.15;
    group.add(ring);
    group.visible = false;
    this.scene.add(group);
    return group;
  }

  start() {
    if (this.done) return;
    this.active = true;
    this.stepIndex = 0;
    this.enterStep();
    this.onEvent?.('start', { mission: this.current });
  }

  enterStep() {
    const step = this.step;
    if (!step) return;
    this.timer = step.timeLimit ?? 0;
    if (step.target) {
      this.beacon.position.set(step.target.x, 0, step.target.z);
      this.beacon.visible = true;
    } else {
      this.beacon.visible = false;
    }
    this.onEvent?.('step', { mission: this.current, step });
  }

  advance() {
    this.stepIndex += 1;
    if (this.stepIndex >= this.current.steps.length) this.completeMission();
    else this.enterStep();
  }

  completeMission() {
    const reward = MONEY.MISSION_REWARD[this.index] ?? 500;
    this.audio.missionComplete();
    this.onEvent?.('complete', { mission: this.current, reward });
    this.completed += 1;
    this.index += 1;
    this.active = false;
    this.beacon.visible = false;
  }

  failMission(reason) {
    this.audio.missionFail();
    this.onEvent?.('fail', { mission: this.current, reason });
    this.active = false;
    this.beacon.visible = false;
    // A retry starts the same mission from its first step.
    this.stepIndex = 0;
  }

  objectiveText() {
    if (!this.active || !this.current) {
      if (this.done) return 'All missions complete — Solara City is yours. Free roam!';
      return 'Press M to start a mission';
    }
    let text = `${this.current.title}: ${this.step.text}`;
    if (this.timer > 0) text += ` — ${Math.ceil(this.timer)}s`;
    return text;
  }

  targetPos() {
    if (this.active && this.step?.target) return this.step.target;
    return null;
  }

  // ctx: { player, police, enemiesLeft, inCar } — the live world state
  // each step condition reads.
  update(dt, ctx) {
    if (this.beacon.visible) {
      this.beacon.rotation.y += dt * 1.2;
      const pulse = 1 + Math.sin(performance.now() * 0.004) * 0.08;
      this.beacon.scale.set(pulse, 1, pulse);
    }
    if (!this.active || !this.current) return;
    const step = this.step;
    if (this.timer > 0) {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.failMission('Out of time');
        return;
      }
    }
    const pos = ctx.player.pos;
    if (step.type === 'in-car') {
      if (ctx.player.inCar) this.advance();
    } else if (step.type === 'reach') {
      const dist = Math.hypot(pos.x - step.target.x, pos.z - step.target.z);
      if (dist < step.radius) {
        this.audio.pickup();
        this.advance();
      }
    } else if (step.type === 'wanted-zero') {
      if (ctx.police.wanted === 0) this.advance();
    } else if (step.type === 'kill-all') {
      if (ctx.enemiesLeft === 0) this.advance();
    }
  }
}
