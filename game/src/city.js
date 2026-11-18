// Solara City builder — turns an empty scene into a sun-soaked coastal
// town: a 7x7 street grid, procedural buildings with lit windows, palms,
// streetlights, a beach, the bay and the Bayfront Pier. This module also
// owns collision (axis-aligned boxes around buildings and trees) and the
// street helpers traffic and police drive by.
import * as THREE from 'three';
import { CITY, PALETTE } from './config.js';

// Small deterministic PRNG so the city looks the same every visit.
function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Paints a building face: a flat wall colour with a grid of windows, a
// quarter of them warmly lit. One canvas texture per building.
function makeFacade(wallHex, storeys, windowsAcross, rng) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = wallHex;
  ctx.fillRect(0, 0, 128, 256);
  const cellW = 128 / windowsAcross;
  const cellH = 256 / storeys;
  for (let floor = 0; floor < storeys; floor += 1) {
    for (let col = 0; col < windowsAcross; col += 1) {
      ctx.fillStyle = rng() < 0.25 ? '#ffd98a' : '#2a4a6a';
      ctx.fillRect(col * cellW + cellW * 0.2, floor * cellH + cellH * 0.25, cellW * 0.6, cellH * 0.5);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export class City {
  constructor(scene) {
    this.scene = scene;
    this.colliders = [];
    this.buildings = [];
    this.streetlights = [];
    this.rng = seededRandom(20261117);
    this.buildGround();
    this.buildRoads();
    this.buildBlocks();
    this.buildStreetlights();
    this.buildPalms();
    this.buildPier();
  }

  addCollider(x, z, width, depth) {
    this.colliders.push({
      minX: x - width / 2,
      maxX: x + width / 2,
      minZ: z - depth / 2,
      maxZ: z + depth / 2,
    });
  }

  collides(x, z, radius) {
    for (const box of this.colliders) {
      const overlapX = x + radius > box.minX && x - radius < box.maxX;
      const overlapZ = z + radius > box.minZ && z - radius < box.maxZ;
      if (overlapX && overlapZ) return true;
    }
    return false;
  }

  // Slides a circle out of every collider it touches, then clamps it to
  // the playable area. Returns the corrected position.
  resolve(x, z, radius) {
    for (const box of this.colliders) {
      const nearestX = Math.max(box.minX, Math.min(x, box.maxX));
      const nearestZ = Math.max(box.minZ, Math.min(z, box.maxZ));
      const dx = x - nearestX;
      const dz = z - nearestZ;
      const distSq = dx * dx + dz * dz;
      if (distSq >= radius * radius) continue;
      if (distSq > 0.000001) {
        const dist = Math.sqrt(distSq);
        x = nearestX + (dx / dist) * radius;
        z = nearestZ + (dz / dist) * radius;
      } else {
        // Dead centre inside the box: escape through the nearest face.
        const toLeft = x - box.minX;
        const toRight = box.maxX - x;
        const toTop = z - box.minZ;
        const toBottom = box.maxZ - z;
        const smallest = Math.min(toLeft, toRight, toTop, toBottom);
        if (smallest === toLeft) x = box.minX - radius;
        else if (smallest === toRight) x = box.maxX + radius;
        else if (smallest === toTop) z = box.minZ - radius;
        else z = box.maxZ + radius;
      }
    }
    const limit = CITY.half;
    x = Math.max(-limit, Math.min(limit, x));
    z = Math.max(-limit, Math.min(limit, z));
    return { x, z };
  }

  onRoad(x, z) {
    const reach = CITY.ROAD_WIDTH / 2 + 1;
    for (let i = 0; i < CITY.STREETS; i += 1) {
      if (Math.abs(x - CITY.street(i)) < reach) return true;
      if (Math.abs(z - CITY.street(i)) < reach) return true;
    }
    return false;
  }

  nearestStreetCoord(value) {
    let closest = CITY.street(0);
    let closestDist = Math.abs(value - closest);
    for (let i = 1; i < CITY.STREETS; i += 1) {
      const dist = Math.abs(value - CITY.street(i));
      if (dist < closestDist) {
        closestDist = dist;
        closest = CITY.street(i);
      }
    }
    return closest;
  }

  randomIntersection() {
    const pick = () => CITY.street(Math.floor(this.rng() * CITY.STREETS));
    return { x: pick(), z: pick() };
  }

  buildGround() {
    const scene = this.scene;
    const span = CITY.half + 30;

    // Grass far beyond the city edge.
    const grass = new THREE.Mesh(
      new THREE.PlaneGeometry(span * 2 + 400, span * 2 + 400),
      new THREE.MeshLambertMaterial({ color: PALETTE.ground }),
    );
    grass.rotation.x = -Math.PI / 2;
    grass.position.y = -0.05;
    scene.add(grass);

    // Sand strip along the south edge, then open water.
    const sand = new THREE.Mesh(
      new THREE.PlaneGeometry(span * 2 + 400, 26),
      new THREE.MeshLambertMaterial({ color: PALETTE.sand }),
    );
    sand.rotation.x = -Math.PI / 2;
    sand.position.set(0, 0, CITY.half + 28);
    scene.add(sand);

    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(span * 2 + 400, 220),
      new THREE.MeshLambertMaterial({ color: PALETTE.water }),
    );
    water.rotation.x = -Math.PI / 2;
    water.position.set(0, -0.02, CITY.half + 150);
    scene.add(water);

    // Pavement slab under the whole city.
    const slab = new THREE.Mesh(
      new THREE.BoxGeometry(CITY.half * 2, 0.2, CITY.half * 2),
      new THREE.MeshLambertMaterial({ color: PALETTE.sidewalk }),
    );
    slab.position.y = -0.1;
    scene.add(slab);
  }

  buildRoads() {
    const scene = this.scene;
    const asphalt = new THREE.MeshLambertMaterial({ color: PALETTE.road });
    const paint = new THREE.MeshBasicMaterial({ color: PALETTE.roadLine });
    const length = CITY.half * 2;
    for (let i = 0; i < CITY.STREETS; i += 1) {
      const centre = CITY.street(i);
      const eastWest = new THREE.Mesh(new THREE.PlaneGeometry(length, CITY.ROAD_WIDTH), asphalt);
      eastWest.rotation.x = -Math.PI / 2;
      eastWest.position.set(0, 0.01, centre);
      scene.add(eastWest);
      const northSouth = new THREE.Mesh(new THREE.PlaneGeometry(CITY.ROAD_WIDTH, length), asphalt);
      northSouth.rotation.x = -Math.PI / 2;
      northSouth.position.set(centre, 0.01, 0);
      scene.add(northSouth);
      // Dashed centre lines, skipping the intersections.
      for (let d = -CITY.half + 8; d < CITY.half - 4; d += 8) {
        if (Math.abs(d - this.nearestStreetCoord(d)) < 8) continue;
        const dashH = new THREE.Mesh(new THREE.PlaneGeometry(3, 0.4), paint);
        dashH.rotation.x = -Math.PI / 2;
        dashH.position.set(d, 0.02, centre);
        scene.add(dashH);
        const dashV = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 3), paint);
        dashV.rotation.x = -Math.PI / 2;
        dashV.position.set(centre, 0.02, d);
        scene.add(dashV);
      }
    }
  }

  buildBlocks() {
    const scene = this.scene;
    const rng = this.rng;
    const palette = PALETTE.building;
    const roofMat = new THREE.MeshLambertMaterial({ color: 0x8a8578 });
    for (let bx = 0; bx < CITY.STREETS - 1; bx += 1) {
      for (let bz = 0; bz < CITY.STREETS - 1; bz += 1) {
        const blockX = (CITY.street(bx) + CITY.street(bx + 1)) / 2;
        const blockZ = (CITY.street(bz) + CITY.street(bz + 1)) / 2;
        const count = 1 + Math.floor(rng() * 3);
        for (let k = 0; k < count; k += 1) {
          const w = 10 + rng() * 12;
          const d = 10 + rng() * 12;
          const h = 8 + Math.pow(rng(), 2) * 42;
          const jitterX = (rng() - 0.5) * (CITY.BLOCK - w - 4);
          const jitterZ = (rng() - 0.5) * (CITY.BLOCK - d - 4);
          const x = blockX + jitterX;
          const z = blockZ + jitterZ;
          const colour = palette[Math.floor(rng() * palette.length)];
          const wallHex = `#${new THREE.Color(colour).getHexString()}`;
          const storeys = Math.max(2, Math.round(h / 4));
          const windows = Math.max(2, Math.round(w / 4));
          const facade = new THREE.MeshLambertMaterial({ map: makeFacade(wallHex, storeys, windows, rng) });
          const tower = new THREE.Mesh(
            new THREE.BoxGeometry(w, h, d),
            [facade, facade, roofMat, roofMat, facade, facade],
          );
          tower.position.set(x, h / 2, z);
          scene.add(tower);
          // Rooftop plant on the taller towers.
          if (h > 20 && rng() < 0.6) {
            const plant = new THREE.Mesh(
              new THREE.BoxGeometry(w * 0.4, 2.5, d * 0.4),
              new THREE.MeshLambertMaterial({ color: 0x6a6558 }),
            );
            plant.position.set(x, h + 1.25, z);
            scene.add(plant);
          }
          this.addCollider(x, z, w, d);
          this.buildings.push({ x, z, w, d, h });
        }
      }
    }
  }

  buildStreetlights() {
    const scene = this.scene;
    const poleMat = new THREE.MeshLambertMaterial({ color: 0x3a3a3a });
    const bulbMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
    for (let i = 0; i < CITY.STREETS; i += 1) {
      const centre = CITY.street(i);
      for (let d = -CITY.half + 20; d < CITY.half; d += 52) {
        for (const [lx, lz] of [[centre + 7, d], [d, centre - 7]]) {
          const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 7, 6), poleMat);
          pole.position.set(lx, 3.5, lz);
          scene.add(pole);
          const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.45, 8, 6), bulbMat);
          bulb.position.set(lx, 7.1, lz);
          scene.add(bulb);
          this.streetlights.push({ x: lx, z: lz });
        }
      }
    }
  }

  plantPalm(x, z) {
    const scene = this.scene;
    const rng = this.rng;
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x7a5a3a });
    const leafMat = new THREE.MeshLambertMaterial({ color: 0x2e8b4a });
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, 5, 6), trunkMat);
    trunk.position.set(x, 2.5, z);
    trunk.rotation.z = (rng() - 0.5) * 0.2;
    scene.add(trunk);
    for (let k = 0; k < 6; k += 1) {
      const angle = (k / 6) * Math.PI * 2;
      const frond = new THREE.Mesh(new THREE.ConeGeometry(0.7, 4.5, 4), leafMat);
      frond.position.set(x + Math.cos(angle) * 1.2, 5.6, z + Math.sin(angle) * 1.2);
      frond.rotation.set(Math.sin(angle) * 1.1, 0, -Math.cos(angle) * 1.1);
      scene.add(frond);
    }
    this.addCollider(x, z, 0.8, 0.8);
  }

  buildPalms() {
    const rng = this.rng;
    for (let bx = 0; bx < CITY.STREETS - 1; bx += 1) {
      for (let bz = 0; bz < CITY.STREETS - 1; bz += 1) {
        const blockX = (CITY.street(bx) + CITY.street(bx + 1)) / 2;
        const blockZ = (CITY.street(bz) + CITY.street(bz + 1)) / 2;
        if (rng() < 0.7) this.plantPalm(blockX + (rng() - 0.5) * 30, blockZ + (rng() - 0.5) * 30);
      }
    }
    for (let x = -150; x <= 150; x += 18) {
      this.plantPalm(x + (rng() - 0.5) * 6, CITY.half + 16);
    }
  }

  buildPier() {
    const scene = this.scene;
    const timber = new THREE.MeshLambertMaterial({ color: 0x9a7a54 });
    const deck = new THREE.Mesh(new THREE.BoxGeometry(10, 0.6, 60), timber);
    deck.position.set(40, 0.4, CITY.half + 45);
    scene.add(deck);
    for (let z = CITY.half + 20; z < CITY.half + 72; z += 8) {
      const left = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 3, 6), timber);
      left.position.set(34, 0, z);
      scene.add(left);
      const right = left.clone();
      right.position.x = 46;
      scene.add(right);
    }
  }
}
