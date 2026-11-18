// Vehicles — box-built cars and the arcade driving model.
// One Car class covers parked cars, the player's ride, traffic and police
// interceptors; only the driver differs.
import * as THREE from 'three';
import { CAR } from './config.js';

// Six cars on Solara's streets. speed multiplies the shared top speed.
export const CAR_TYPES = [
  { name: 'Sedan', color: 0xcc3333, speed: 1.0, len: 4.4, wid: 2.0 },
  { name: 'Coupe', color: 0x3366cc, speed: 1.15, len: 4.2, wid: 1.9 },
  { name: 'Taxi', color: 0xf5c518, speed: 1.0, len: 4.4, wid: 2.0 },
  { name: 'Pickup', color: 0x3a7a4a, speed: 0.9, len: 5.0, wid: 2.1 },
  { name: 'Van', color: 0xdddddd, speed: 0.85, len: 5.2, wid: 2.2 },
  { name: 'Sport', color: 0xcc22aa, speed: 1.3, len: 4.3, wid: 2.0 },
];

// Assembles a car from boxes: body, glass cabin, roof, lights, wheels,
// plus a light bar for police and a roof sign for taxis.
export function buildCarMesh(type, opts = {}) {
  const group = new THREE.Group();
  const length = type.len;
  const width = type.wid;
  const paint = new THREE.MeshLambertMaterial({ color: opts.color ?? type.color });
  const glass = new THREE.MeshLambertMaterial({ color: 0x1a2a3a });
  const rubber = new THREE.MeshLambertMaterial({ color: 0x1c1c1c });

  const body = new THREE.Mesh(new THREE.BoxGeometry(length, 0.7, width), paint);
  body.position.y = 0.55;
  group.add(body);

  const cabinHeight = type.name === 'Van' ? 1.0 : 0.6;
  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(length * 0.5, cabinHeight, width * 0.85),
    glass,
  );
  cabin.position.set(-length * 0.05, 0.55 + 0.35 + cabinHeight / 2 - 0.1, 0);
  group.add(cabin);

  const roof = new THREE.Mesh(new THREE.BoxGeometry(length * 0.45, 0.1, width * 0.8), paint);
  roof.position.set(-length * 0.05, 0.55 + 0.35 + cabinHeight - 0.05, 0);
  group.add(roof);

  const headlightMat = new THREE.MeshBasicMaterial({ color: 0xfff6c0 });
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xff2222 });
  for (const side of [-1, 1]) {
    const front = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.2, 0.4), headlightMat);
    front.position.set(length / 2 + 0.02, 0.55, side * width * 0.32);
    group.add(front);
    const rear = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.2, 0.4), tailMat);
    rear.position.set(-length / 2 - 0.02, 0.55, side * width * 0.32);
    group.add(rear);
  }

  const wheelShape = new THREE.CylinderGeometry(0.36, 0.36, 0.3, 10);
  wheelShape.rotateX(Math.PI / 2);
  const wheelSpots = [
    [length * 0.32, width / 2],
    [length * 0.32, -width / 2],
    [-length * 0.32, width / 2],
    [-length * 0.32, -width / 2],
  ];
  for (const [wx, wz] of wheelSpots) {
    const wheel = new THREE.Mesh(wheelShape, rubber);
    wheel.position.set(wx, 0.36, wz);
    group.add(wheel);
  }

  if (opts.police) {
    const bar = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.18, 1.4),
      new THREE.MeshBasicMaterial({ color: 0x2244ff }),
    );
    bar.position.set(-length * 0.05, 0.55 + 0.35 + cabinHeight + 0.05, 0);
    group.add(bar);
    group.userData.lightbar = bar;
    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(length * 0.9, 0.05, width + 0.02),
      new THREE.MeshBasicMaterial({ color: 0x111111 }),
    );
    stripe.position.y = 0.92;
    group.add(stripe);
  }

  if (type.name === 'Taxi') {
    const sign = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.25, 0.5),
      new THREE.MeshBasicMaterial({ color: 0xf5c518 }),
    );
    sign.position.set(-length * 0.05, 0.55 + 0.35 + cabinHeight + 0.1, 0);
    group.add(sign);
  }

  return group;
}

export class Car {
  constructor(scene, type, x, z, heading, opts = {}) {
    this.scene = scene;
    this.type = type;
    this.mesh = buildCarMesh(type, opts);
    this.mesh.position.set(x, 0, z);
    this.mesh.rotation.y = heading;
    scene.add(this.mesh);
    this.heading = heading;
    this.speed = 0;
    this.steer = 0;
    this.police = Boolean(opts.police);
    this.parked = Boolean(opts.parked);
    this.dead = false;
    this.health = 100;
    this.sirenPhase = 0;
  }

  get x() {
    return this.mesh.position.x;
  }

  get z() {
    return this.mesh.position.z;
  }

  // Arcade driving: throttle and brake, drag, a handbrake that scrubs
  // speed fast, and steering that only bites once the car is moving.
  // Returns true when the car hit a building this frame.
  drive(dt, throttle, steerInput, handbrake, city) {
    const topSpeed = CAR.MAX_SPEED * this.type.speed;
    if (throttle > 0) {
      this.speed += CAR.ACCEL * throttle * dt;
    } else if (throttle < 0) {
      if (this.speed > 0.5) {
        this.speed -= CAR.BRAKE * dt;
      } else {
        this.speed = Math.max(this.speed + CAR.ACCEL * 0.6 * throttle * dt, -CAR.MAX_REVERSE);
      }
    }
    this.speed -= this.speed * CAR.DRAG * dt;
    if (handbrake) this.speed -= this.speed * 2.2 * dt;
    this.speed = Math.max(-CAR.MAX_REVERSE, Math.min(topSpeed, this.speed));

    const pace = Math.abs(this.speed);
    const steerGoal = steerInput * Math.min(1, pace / 8);
    this.steer += (steerGoal - this.steer) * Math.min(1, dt * 8);
    const direction = Math.sign(this.speed || 1);
    this.heading -= this.steer * CAR.TURN_RATE * dt * direction * Math.min(1, pace / 6 + 0.15);

    const nextX = this.x + Math.cos(this.heading) * this.speed * dt;
    const nextZ = this.z - Math.sin(this.heading) * this.speed * dt;
    const radius = Math.max(this.type.len, this.type.wid) * 0.55;
    if (city.collides(nextX, nextZ, radius)) {
      // Crash: damage scales with impact speed, then a small bounce back.
      if (pace > 8) this.health -= (pace - 8) * 1.5;
      this.speed *= -0.25;
      return true;
    }
    const settled = city.resolve(nextX, nextZ, radius);
    this.mesh.position.set(settled.x, 0, settled.z);
    this.mesh.rotation.y = this.heading;
    if (this.health <= 0 && !this.dead) {
      this.dead = true;
      this.speed = 0;
    }
    return false;
  }

  // Flashing light bar on police cars; a dead car lists to one side.
  updateVisual(dt) {
    const bar = this.mesh.userData.lightbar;
    if (this.police && bar) {
      this.sirenPhase += dt * 10;
      bar.material.color.setHex(Math.sin(this.sirenPhase) > 0 ? 0xff2222 : 0x2244ff);
    }
    if (this.dead) this.mesh.rotation.z = 0.03;
  }

  remove() {
    this.scene.remove(this.mesh);
  }
}
