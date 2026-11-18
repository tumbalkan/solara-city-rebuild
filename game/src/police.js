// Wanted system and the Solara PD. Crimes add stars; staying out of sight
// lets them cool off one at a time. Patrol cars spawn near the player and
// chase — at three stars and up they ram — while cops on foot run a player
// on foot down and try to arrest them.
import * as THREE from 'three';
import { Car } from './vehicles.js';
import { CITY, WANTED } from './config.js';

const PATROL_CAR = { name: 'Interceptor', color: 0xf2f2f2, speed: 1.25, len: 4.5, wid: 2.0 };

function makeCopMesh() {
  const group = new THREE.Group();
  const navy = new THREE.MeshLambertMaterial({ color: 0x1a2a4a });
  const skin = new THREE.MeshLambertMaterial({ color: 0xc98a5a });

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 8), skin);
  head.position.y = 1.62;
  group.add(head);

  const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.32, 0.14, 8), navy);
  hat.position.y = 1.86;
  group.add(hat);

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.75, 0.34), navy);
  torso.position.y = 1.1;
  group.add(torso);

  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.75, 0.28), navy);
  legL.position.set(-0.16, 0.38, 0);
  group.add(legL);
  const legR = legL.clone();
  legR.position.x = 0.16;
  group.add(legR);

  group.userData.legs = [legL, legR];
  return group;
}

export class Police {
  constructor(scene, city, audio) {
    this.scene = scene;
    this.city = city;
    this.audio = audio;
    this.stars = 0;
    this.hiddenTime = 0;
    this.cars = [];
    this.cops = [];
    this.spawnTimer = 0;
    this.onWantedChange = null;
  }

  get wanted() {
    return this.stars;
  }

  addStars(count, reason) {
    const before = this.stars;
    this.stars = Math.min(WANTED.MAX, this.stars + count);
    this.hiddenTime = 0;
    if (this.stars > before) {
      this.audio.wantedUp();
      this.onWantedChange?.(this.stars, reason);
    }
  }

  clearStars() {
    this.stars = 0;
    this.hiddenTime = 0;
    this.onWantedChange?.(0, 'clear');
  }

  // A patrol car on a road near the player, far enough away to feel fair.
  spawnCarNear(playerPos) {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const spot = this.city.randomIntersection();
      const dist = Math.hypot(spot.x - playerPos.x, spot.z - playerPos.z);
      if (dist > 45 && dist < 120) {
        const heading = Math.atan2(-(playerPos.z - spot.z), playerPos.x - spot.x);
        this.spawnCarAt(spot.x, spot.z, heading);
        return;
      }
    }
  }

  // A patrol car at an exact spot — the chase screenshot uses this.
  spawnCarAt(x, z, heading) {
    const car = new Car(this.scene, PATROL_CAR, x, z, heading, { police: true });
    this.cars.push(car);
    return car;
  }

  spawnCopNear(playerPos) {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 20 + Math.random() * 15;
      const x = playerPos.x + Math.cos(angle) * dist;
      const z = playerPos.z + Math.sin(angle) * dist;
      if (Math.abs(x) > CITY.half || Math.abs(z) > CITY.half) continue;
      if (this.city.collides(x, z, 1)) continue;
      const mesh = makeCopMesh();
      mesh.position.set(x, 0, z);
      this.scene.add(mesh);
      this.cops.push({ mesh, x, z, heading: 0, walkPhase: 0, health: 50 });
      return;
    }
  }

  // Is any unit close enough to keep the player on the radar?
  playerSeen(playerPos) {
    for (const car of this.cars) {
      if (!car.dead && Math.hypot(car.x - playerPos.x, car.z - playerPos.z) < 40) return true;
    }
    for (const cop of this.cops) {
      if (Math.hypot(cop.x - playerPos.x, cop.z - playerPos.z) < 30) return true;
    }
    return false;
  }

  update(dt, player, playerCar) {
    const pos = player.pos;
    this.audio.setSiren(this.stars > 0 && this.cars.length > 0);

    // Hidden long enough: one star fades.
    if (this.stars > 0) {
      if (this.playerSeen(pos)) {
        this.hiddenTime = 0;
      } else {
        this.hiddenTime += dt;
        if (this.hiddenTime > WANTED.DECAY_TIME) {
          this.stars -= 1;
          this.hiddenTime = 0;
          this.onWantedChange?.(this.stars, 'decay');
        }
      }
    }

    // Field the right number of units for the current heat.
    const carsWanted = this.stars === 0 ? 0 : Math.min(this.stars, 4);
    const copsWanted = this.stars === 0 || playerCar ? 0 : Math.min(this.stars, 3);
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = 1.5;
      const liveCars = this.cars.filter((car) => !car.dead).length;
      if (liveCars < carsWanted) this.spawnCarNear(pos);
      if (this.cops.length < copsWanted) this.spawnCopNear(pos);
    }

    if (this.stars === 0) {
      // All clear: every unit stands down and leaves.
      for (const car of this.cars) car.remove();
      this.cars = [];
      for (const cop of this.cops) this.scene.remove(cop.mesh);
      this.cops = [];
      return;
    }

    // Patrol cars hunt the player. Below three stars they box in; at three
    // and up they ram.
    for (const car of this.cars) {
      if (car.dead) continue;
      const dx = pos.x - car.x;
      const dz = pos.z - car.z;
      const dist = Math.hypot(dx, dz);
      const wantedHeading = Math.atan2(-dz, dx);
      let diff = wantedHeading - car.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      const steer = Math.max(-1, Math.min(1, diff * 1.5));
      let throttle = 1;
      if (dist < 6 && this.stars < 3) throttle = 0.2;
      if (dist < 3.5) throttle = -0.5;
      car.drive(dt, throttle, steer, false, this.city);
      car.updateVisual(dt);
      // Ramming damage to the player's car.
      if (playerCar && !playerCar.dead && dist < 4.5 && Math.abs(car.speed) > 6) {
        playerCar.health -= Math.abs(car.speed) * 0.4;
        car.health -= 3;
        car.speed *= 0.3;
      }
    }

    // Cops on foot sprint at the player and close in for the arrest.
    for (const cop of this.cops) {
      const dx = pos.x - cop.x;
      const dz = pos.z - cop.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 1.6) {
        const wantedHeading = Math.atan2(-dz, dx);
        let diff = wantedHeading - cop.heading;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        cop.heading += Math.max(-4 * dt, Math.min(4 * dt, diff));
        const nextX = cop.x + Math.cos(cop.heading) * 7.5 * dt;
        const nextZ = cop.z - Math.sin(cop.heading) * 7.5 * dt;
        const settled = this.city.resolve(nextX, nextZ, 0.5);
        cop.x = settled.x;
        cop.z = settled.z;
        cop.walkPhase += dt * 12;
        const swing = Math.sin(cop.walkPhase) * 0.7;
        cop.mesh.userData.legs[0].rotation.x = swing;
        cop.mesh.userData.legs[1].rotation.x = -swing;
      }
      cop.mesh.position.set(cop.x, 0, cop.z);
      cop.mesh.rotation.y = cop.heading;
    }
  }

  // Cops within arm's reach — main.js uses this for arrests and punches.
  copsInRange(playerPos, radius) {
    return this.cops.filter((cop) => Math.hypot(cop.x - playerPos.x, cop.z - playerPos.z) < radius);
  }

  // Returns true when the cop goes down.
  damageCop(cop, amount) {
    cop.health -= amount;
    if (cop.health <= 0) {
      this.scene.remove(cop.mesh);
      this.cops.splice(this.cops.indexOf(cop), 1);
      return true;
    }
    return false;
  }
}
