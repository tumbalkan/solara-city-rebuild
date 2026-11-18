// Pedestrians — sidewalk walkers with simple blocky bodies, wandering
// between intersections. Gunfire, a speeding car or a nearby player sends
// them running; getting hit knocks them down, which is a crime and feeds
// the wanted level.
import * as THREE from 'three';
import { CITY } from './config.js';

const PED_COUNT = 26;
const SHIRTS = [0xd94f4f, 0x4f7ad9, 0x4fd97a, 0xd9c24f, 0x9a4fd9, 0x4fd9c2, 0xe8e8e8, 0x333333];
const TROUSERS = [0x2a3a5a, 0x3a3a3a, 0x5a4a2a, 0x2a5a3a];
const SKIN_TONES = [0xf2c9a0, 0xc98a5a, 0x8a5a3a];

function makePedMesh(rng) {
  const group = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: SKIN_TONES[Math.floor(rng() * SKIN_TONES.length)] });
  const shirt = new THREE.MeshLambertMaterial({ color: SHIRTS[Math.floor(rng() * SHIRTS.length)] });
  const pants = new THREE.MeshLambertMaterial({ color: TROUSERS[Math.floor(rng() * TROUSERS.length)] });

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 8), skin);
  head.position.y = 1.62;
  group.add(head);

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.75, 0.34), shirt);
  torso.position.y = 1.1;
  group.add(torso);

  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.75, 0.28), pants);
  legL.position.set(-0.16, 0.38, 0);
  group.add(legL);
  const legR = legL.clone();
  legR.position.x = 0.16;
  group.add(legR);

  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.7, 0.22), shirt);
  armL.position.set(-0.42, 1.1, 0);
  group.add(armL);
  const armR = armL.clone();
  armR.position.x = 0.42;
  group.add(armR);

  group.userData.legs = [legL, legR];
  group.userData.arms = [armL, armR];
  return group;
}

export class Pedestrians {
  constructor(scene, city) {
    this.scene = scene;
    this.city = city;
    this.peds = [];
    this.rng = Math.random;
    for (let i = 0; i < PED_COUNT; i += 1) this.spawn();
  }

  spawn() {
    const mesh = makePedMesh(this.rng);
    const spot = this.randomSidewalkPoint();
    mesh.position.set(spot.x, 0, spot.z);
    this.scene.add(mesh);
    this.peds.push({
      mesh,
      x: spot.x,
      z: spot.z,
      heading: Math.random() * Math.PI * 2,
      speed: 1.2 + Math.random() * 0.8,
      state: 'walk',
      stateT: 0,
      target: this.randomSidewalkPoint(),
      walkPhase: Math.random() * 10,
      scared: false,
    });
  }

  // A point on a sidewalk: beside a street, just off the asphalt.
  randomSidewalkPoint() {
    const horizontal = Math.random() < 0.5;
    const street = CITY.street(Math.floor(Math.random() * CITY.STREETS));
    const along = (Math.random() * 2 - 1) * (CITY.half - 12);
    const side = Math.random() < 0.5 ? 1 : -1;
    const offset = side * (CITY.ROAD_WIDTH / 2 + 2);
    if (horizontal) return { x: along, z: street + offset };
    return { x: street + offset, z: along };
  }

  // Everyone within radius of a scare point starts running.
  scare(x, z, radius) {
    for (const ped of this.peds) {
      if (ped.state === 'down') continue;
      if (Math.hypot(ped.x - x, ped.z - z) < radius) {
        ped.state = 'flee';
        ped.stateT = 4 + Math.random() * 3;
        ped.scared = true;
      }
    }
  }

  // Every upright ped inside a circle (car bumper, punch, bullet splash).
  hitTest(x, z, radius) {
    const hits = [];
    for (const ped of this.peds) {
      if (ped.state === 'down') continue;
      if (Math.hypot(ped.x - x, ped.z - z) < radius) hits.push(ped);
    }
    return hits;
  }

  knockDown(ped) {
    ped.state = 'down';
    ped.stateT = 6;
    ped.mesh.rotation.x = Math.PI / 2;
    ped.mesh.position.y = 0.3;
  }

  update(dt, playerPos, playerSpeed) {
    for (const ped of this.peds) {
      if (ped.state === 'down') {
        ped.stateT -= dt;
        if (ped.stateT <= 0) {
          // Shaken, they get up and run.
          ped.state = 'flee';
          ped.stateT = 5;
          ped.mesh.rotation.x = 0;
          ped.mesh.position.y = 0;
        }
        continue;
      }

      // A fast player close by is frightening on its own.
      if (ped.state === 'walk' && playerPos) {
        const distToPlayer = Math.hypot(ped.x - playerPos.x, ped.z - playerPos.z);
        if (distToPlayer < 6 && playerSpeed > 10) {
          ped.state = 'flee';
          ped.stateT = 3;
        }
      }

      let targetX;
      let targetZ;
      let speed;
      if (ped.state === 'flee') {
        ped.stateT -= dt;
        if (ped.stateT <= 0) {
          ped.state = 'walk';
          ped.target = this.randomSidewalkPoint();
        }
        // Sprint directly away from the player.
        const awayX = ped.x - (playerPos?.x ?? ped.x);
        const awayZ = ped.z - (playerPos?.z ?? ped.z);
        const len = Math.hypot(awayX, awayZ) || 1;
        targetX = ped.x + (awayX / len) * 10;
        targetZ = ped.z + (awayZ / len) * 10;
        speed = 5.5;
      } else {
        targetX = ped.target.x;
        targetZ = ped.target.z;
        speed = ped.speed;
        if (Math.hypot(targetX - ped.x, targetZ - ped.z) < 2) {
          ped.target = this.randomSidewalkPoint();
        }
      }

      const dx = targetX - ped.x;
      const dz = targetZ - ped.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 0.1) {
        const wantedHeading = Math.atan2(-dz, dx);
        let diff = wantedHeading - ped.heading;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        ped.heading += Math.max(-3 * dt, Math.min(3 * dt, diff));
        const nextX = ped.x + Math.cos(ped.heading) * speed * dt;
        const nextZ = ped.z - Math.sin(ped.heading) * speed * dt;
        if (!this.city.collides(nextX, nextZ, 0.5)) {
          const settled = this.city.resolve(nextX, nextZ, 0.5);
          ped.x = settled.x;
          ped.z = settled.z;
        }
        ped.walkPhase += dt * speed * 2.2;
        const swing = Math.sin(ped.walkPhase) * 0.5;
        ped.mesh.userData.legs[0].rotation.x = swing;
        ped.mesh.userData.legs[1].rotation.x = -swing;
        ped.mesh.userData.arms[0].rotation.x = -swing * 0.7;
        ped.mesh.userData.arms[1].rotation.x = swing * 0.7;
      }
      ped.mesh.position.set(ped.x, ped.mesh.position.y, ped.z);
      ped.mesh.rotation.y = ped.heading;
    }
  }
}
