// Combat — Rico's hitscan pistol and fists, muzzle flash and tracer lines,
// and the rival Red Jacks gang: armed enemies who advance and shoot back
// during the Bayfront Showdown.
import * as THREE from 'three';

export class Combat {
  constructor(scene, audio) {
    this.scene = scene;
    this.audio = audio;
    this.ammo = 60;
    this.cooldown = 0;
    this.enemies = [];
    this.tracers = [];
    this.muzzle = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 6, 6),
      new THREE.MeshBasicMaterial({ color: 0xffee88 }),
    );
    this.muzzle.visible = false;
    this.scene.add(this.muzzle);
  }

  // A Red Jack: red jacket, pistol, hunts the player once spawned.
  spawnEnemy(x, z) {
    const group = new THREE.Group();
    const skin = new THREE.MeshLambertMaterial({ color: 0x8a5a3a });
    const jacket = new THREE.MeshLambertMaterial({ color: 0xb02020 });
    const pants = new THREE.MeshLambertMaterial({ color: 0x222222 });

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.29, 8, 8), skin);
    head.position.y = 1.64;
    group.add(head);

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.78, 0.35), jacket);
    torso.position.y = 1.12;
    group.add(torso);

    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.78, 0.29), pants);
    legL.position.set(-0.17, 0.39, 0);
    group.add(legL);
    const legR = legL.clone();
    legR.position.x = 0.17;
    group.add(legR);

    const gun = new THREE.Mesh(
      new THREE.BoxGeometry(0.35, 0.12, 0.1),
      new THREE.MeshLambertMaterial({ color: 0x111111 }),
    );
    gun.position.set(0.45, 1.1, 0.3);
    group.add(gun);

    group.position.set(x, 0, z);
    this.scene.add(group);
    const enemy = {
      mesh: group,
      x,
      z,
      heading: 0,
      health: 60,
      shootTimer: 1 + Math.random(),
      walkPhase: 0,
      legs: [legL, legR],
    };
    this.enemies.push(enemy);
    return enemy;
  }

  clearEnemies() {
    for (const enemy of this.enemies) this.scene.remove(enemy.mesh);
    this.enemies = [];
  }

  // One hitscan shot from the player along a direction. targets carries the
  // shootable things in the world; returns the closest hit, if any.
  shoot(from, dir, targets) {
    if (this.cooldown > 0 || this.ammo <= 0) return null;
    this.cooldown = 0.22;
    this.ammo -= 1;
    this.audio.gunshot();

    this.muzzle.position.copy(from).addScaledVector(dir, 1.2);
    this.muzzle.visible = true;
    setTimeout(() => {
      this.muzzle.visible = false;
    }, 60);

    const end = from.clone().addScaledVector(dir, 90);
    let best = null;
    let bestDist = 90;
    const consider = (x, z, radius, kind, ref) => {
      const dx = x - from.x;
      const dz = z - from.z;
      const along = dx * dir.x + dz * dir.z;
      if (along < 0 || along > bestDist) return;
      const closestX = from.x + dir.x * along;
      const closestZ = from.z + dir.z * along;
      const miss = Math.hypot(x - closestX, z - closestZ);
      if (miss < radius) {
        best = { kind, ref, dist: along };
        bestDist = along;
      }
    };
    for (const ped of targets.peds ?? []) {
      if (ped.state !== 'down') consider(ped.x, ped.z, 0.9, 'ped', ped);
    }
    for (const cop of targets.cops ?? []) consider(cop.x, cop.z, 0.9, 'cop', cop);
    for (const enemy of this.enemies) consider(enemy.x, enemy.z, 0.9, 'enemy', enemy);
    for (const car of targets.cars ?? []) {
      if (!car.dead) consider(car.x, car.z, 2.4, 'car', car);
    }
    if (best) end.copy(from).addScaledVector(dir, best.dist);
    this.spawnTracer(from, end);
    return best;
  }

  spawnTracer(from, to) {
    const geometry = new THREE.BufferGeometry().setFromPoints([from, to]);
    const line = new THREE.Line(
      geometry,
      new THREE.LineBasicMaterial({ color: 0xffee88, transparent: true, opacity: 0.9 }),
    );
    this.scene.add(line);
    this.tracers.push({ line, t: 0.08 });
  }

  // A punch: short reach, in front of the player.
  punch(from, heading, targets) {
    if (this.cooldown > 0) return null;
    this.cooldown = 0.45;
    this.audio.punch();
    const reachX = from.x + Math.cos(heading) * 1.6;
    const reachZ = from.z - Math.sin(heading) * 1.6;
    const within = (x, z) => Math.hypot(x - reachX, z - reachZ) < 1.6;
    for (const ped of targets.peds ?? []) {
      if (ped.state !== 'down' && within(ped.x, ped.z)) return { kind: 'ped', ref: ped };
    }
    for (const cop of targets.cops ?? []) {
      if (within(cop.x, cop.z)) return { kind: 'cop', ref: cop };
    }
    for (const enemy of this.enemies) {
      if (within(enemy.x, enemy.z)) return { kind: 'enemy', ref: enemy };
    }
    return null;
  }

  // Enemies close the distance, then fire wild shots at the player.
  // onPlayerHit receives the damage when a shot lands.
  update(dt, playerPos, onPlayerHit, city) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    for (const tracer of this.tracers) tracer.t -= dt;
    this.tracers = this.tracers.filter((tracer) => {
      if (tracer.t > 0) return true;
      this.scene.remove(tracer.line);
      return false;
    });

    for (const enemy of this.enemies) {
      const dx = playerPos.x - enemy.x;
      const dz = playerPos.z - enemy.z;
      const dist = Math.hypot(dx, dz);
      const wantedHeading = Math.atan2(-dz, dx);
      let diff = wantedHeading - enemy.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      enemy.heading += Math.max(-4 * dt, Math.min(4 * dt, diff));

      if (dist > 14) {
        const nextX = enemy.x + Math.cos(enemy.heading) * 6 * dt;
        const nextZ = enemy.z - Math.sin(enemy.heading) * 6 * dt;
        const settled = city.resolve(nextX, nextZ, 0.5);
        enemy.x = settled.x;
        enemy.z = settled.z;
        enemy.walkPhase += dt * 10;
        enemy.legs[0].rotation.x = Math.sin(enemy.walkPhase) * 0.6;
        enemy.legs[1].rotation.x = -Math.sin(enemy.walkPhase) * 0.6;
      }
      enemy.mesh.position.set(enemy.x, 0, enemy.z);
      enemy.mesh.rotation.y = enemy.heading;

      enemy.shootTimer -= dt;
      if (enemy.shootTimer <= 0 && dist < 45) {
        enemy.shootTimer = 0.9 + Math.random() * 0.8;
        const from = new THREE.Vector3(enemy.x, 1.4, enemy.z);
        const to = new THREE.Vector3(
          playerPos.x + (Math.random() - 0.5) * 6,
          1.2,
          playerPos.z + (Math.random() - 0.5) * 6,
        );
        this.spawnTracer(from, to);
        this.audio.gunshot();
        if (Math.random() < 0.35) onPlayerHit(8 + Math.random() * 8);
      }
    }
  }

  // Returns true when the enemy is killed.
  damageEnemy(enemy, amount) {
    enemy.health -= amount;
    if (enemy.health <= 0) {
      this.scene.remove(enemy.mesh);
      this.enemies.splice(this.enemies.indexOf(enemy), 1);
      return true;
    }
    return false;
  }
}
