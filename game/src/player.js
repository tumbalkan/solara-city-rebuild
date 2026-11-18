// Rico on foot — a third-person character with WASD movement relative to
// the camera, mouse-look orbit, sprint, and a simple walk cycle. While
// driving this controller sleeps: the car owns the camera instead.
import * as THREE from 'three';
import { PLAYER } from './config.js';

function makePlayerMesh() {
  const group = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: 0xf2c9a0 });
  const jacket = new THREE.MeshLambertMaterial({ color: 0x2a6ad9 });
  const pants = new THREE.MeshLambertMaterial({ color: 0x222222 });
  const capRed = new THREE.MeshLambertMaterial({ color: 0xcc2222 });

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 10), skin);
  head.position.y = 1.66;
  group.add(head);

  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.32, 0.14, 10), capRed);
  cap.position.y = 1.88;
  group.add(cap);

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.8, 0.36), jacket);
  torso.position.y = 1.12;
  group.add(torso);

  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.8, 0.3), pants);
  legL.position.set(-0.17, 0.4, 0);
  group.add(legL);
  const legR = legL.clone();
  legR.position.x = 0.17;
  group.add(legR);

  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.75, 0.24), jacket);
  armL.position.set(-0.45, 1.12, 0);
  group.add(armL);
  const armR = armL.clone();
  armR.position.x = 0.45;
  group.add(armR);

  // Rico's pistol, carried in the right hand.
  const gun = new THREE.Mesh(
    new THREE.BoxGeometry(0.35, 0.12, 0.1),
    new THREE.MeshLambertMaterial({ color: 0x111111 }),
  );
  gun.position.set(0.45, 0.85, 0.25);
  group.add(gun);

  group.userData.legs = [legL, legR];
  group.userData.arms = [armL, armR];
  group.userData.gun = gun;
  return group;
}

export class Player {
  constructor(scene, city, x, z) {
    this.scene = scene;
    this.city = city;
    this.mesh = makePlayerMesh();
    this.mesh.position.set(x, 0, z);
    scene.add(this.mesh);
    this.x = x;
    this.z = z;
    this.heading = 0;
    this.camYaw = 0;
    this.camPitch = 0.32;
    this.health = PLAYER.MAX_HEALTH;
    this.money = 250;
    this.speed = 0;
    this.walkPhase = 0;
    this.inCar = null;
    this.aiming = false;
  }

  // Where Rico is, whether on foot or behind the wheel.
  get pos() {
    if (this.inCar) return { x: this.inCar.x, z: this.inCar.z };
    return { x: this.x, z: this.z };
  }

  update(dt, input, camera) {
    // Mouse look: yaw orbits, pitch tilts, both clamped.
    this.camYaw -= input.mouseDX * 0.0025;
    this.camPitch = Math.max(0.05, Math.min(1.1, this.camPitch + input.mouseDY * 0.0025));

    if (this.inCar) {
      this.updateCarCamera(dt, camera);
      return;
    }

    // WASD, relative to where the camera looks.
    const forward = (input.down('KeyW') ? 1 : 0) - (input.down('KeyS') ? 1 : 0);
    const strafe = (input.down('KeyD') ? 1 : 0) - (input.down('KeyA') ? 1 : 0);
    const sprinting = input.down('ShiftLeft') || input.down('ShiftRight');
    const pace = sprinting ? PLAYER.RUN_SPEED : PLAYER.WALK_SPEED;
    let moveX = 0;
    let moveZ = 0;
    const moving = forward !== 0 || strafe !== 0;
    if (moving) {
      const sinYaw = Math.sin(this.camYaw);
      const cosYaw = Math.cos(this.camYaw);
      // Camera forward on the ground is (-sin, -cos); right is (cos, -sin).
      const fwdX = -sinYaw;
      const fwdZ = -cosYaw;
      const rightX = cosYaw;
      const rightZ = -sinYaw;
      moveX = fwdX * forward + rightX * strafe;
      moveZ = fwdZ * forward + rightZ * strafe;
      const len = Math.hypot(moveX, moveZ);
      moveX /= len;
      moveZ /= len;
      this.heading = Math.atan2(-moveZ, moveX);
    }
    this.speed = moving ? pace : 0;
    const nextX = this.x + moveX * pace * dt;
    const nextZ = this.z + moveZ * pace * dt;
    const settled = this.city.resolve(nextX, nextZ, PLAYER.RADIUS);
    this.x = settled.x;
    this.z = settled.z;
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.heading;

    this.animateWalk(dt, moving, pace);

    // Orbit camera: behind Rico at the mouse yaw, above at the pitch.
    const distance = 7.5;
    const camX = this.x + Math.sin(this.camYaw) * Math.cos(this.camPitch) * distance;
    const camZ = this.z + Math.cos(this.camYaw) * Math.cos(this.camPitch) * distance;
    const camY = 2.2 + Math.sin(this.camPitch) * distance;
    camera.position.set(camX, camY, camZ);
    camera.lookAt(this.x, 1.6, this.z);
  }

  animateWalk(dt, moving, pace) {
    const [legL, legR] = this.mesh.userData.legs;
    const [armL, armR] = this.mesh.userData.arms;
    if (!moving) {
      // Settle back to a standing pose.
      legL.rotation.x *= 0.8;
      legR.rotation.x *= 0.8;
      armL.rotation.x *= 0.8;
      armR.rotation.x *= 0.8;
      return;
    }
    this.walkPhase += dt * pace * 1.4;
    const swing = Math.sin(this.walkPhase) * 0.6;
    legL.rotation.x = swing;
    legR.rotation.x = -swing;
    armL.rotation.x = -swing * 0.6;
    armR.rotation.x = swing * 0.6;
  }

  updateCarCamera(dt, camera) {
    const car = this.inCar;
    // Chase cam: swing behind the car's heading, smoothed so it doesn't snap.
    const behindYaw = car.heading - Math.PI / 2;
    let diff = behindYaw - this.camYaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this.camYaw += diff * Math.min(1, dt * 3.2);
    const distance = 9.5 + Math.abs(car.speed) * 0.06;
    const target = new THREE.Vector3(
      car.x + Math.sin(this.camYaw) * distance,
      4.2,
      car.z + Math.cos(this.camYaw) * distance,
    );
    camera.position.lerp(target, Math.min(1, dt * 6));
    camera.lookAt(car.x, 1.4, car.z);
  }

  enterCar(car) {
    this.inCar = car;
    car.parked = false;
    this.mesh.visible = false;
    this.camYaw = car.heading - Math.PI / 2;
  }

  exitCar() {
    if (!this.inCar) return;
    const car = this.inCar;
    this.inCar = null;
    // Step out to the car's side, then unstick from any wall.
    this.x = car.x - Math.sin(car.heading) * 3;
    this.z = car.z - Math.cos(car.heading) * 3;
    const settled = this.city.resolve(this.x, this.z, PLAYER.RADIUS);
    this.x = settled.x;
    this.z = settled.z;
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.visible = true;
  }

  // Returns true when Rico goes down.
  damage(amount) {
    this.health = Math.max(0, this.health - amount);
    return this.health <= 0;
  }

  heal(amount) {
    this.health = Math.min(PLAYER.MAX_HEALTH, this.health + amount);
  }
}
