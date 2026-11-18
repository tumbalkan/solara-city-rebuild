// Traffic — AI cars that cruise the street grid, turn at intersections,
// brake for the car ahead and for the player's ride. The city never feels
// empty because these fourteen never stop moving.
import { Car, CAR_TYPES } from './vehicles.js';
import { CITY } from './config.js';

const TRAFFIC_COUNT = 14;

export class Traffic {
  constructor(scene, city) {
    this.scene = scene;
    this.city = city;
    this.cars = [];
    for (let i = 0; i < TRAFFIC_COUNT; i += 1) this.spawn();
  }

  pickType() {
    return CAR_TYPES[Math.floor(Math.random() * CAR_TYPES.length)];
  }

  spawn() {
    const horizontal = Math.random() < 0.5;
    const street = CITY.street(Math.floor(Math.random() * CITY.STREETS));
    const along = (Math.random() * 2 - 1) * (CITY.half - 10);
    const dir = Math.random() < 0.5 ? 1 : -1;
    const lane = 3;
    let x;
    let z;
    let heading;
    if (horizontal) {
      x = along;
      z = street + (dir > 0 ? lane : -lane);
      heading = dir > 0 ? 0 : Math.PI;
    } else {
      x = street + (dir > 0 ? -lane : lane);
      z = along;
      heading = dir > 0 ? -Math.PI / 2 : Math.PI / 2;
    }
    const car = new Car(this.scene, this.pickType(), x, z, heading);
    car.ai = {
      targetSpeed: 9 + Math.random() * 5,
      horizontal,
      dir,
      nextTurnAt: this.chooseTurn(horizontal, dir, x, z),
    };
    this.cars.push(car);
  }

  // Picks one of the next few intersections ahead as the turning point.
  chooseTurn(horizontal, dir, x, z) {
    const along = horizontal ? x : z;
    const ahead = [];
    for (let i = 0; i < CITY.STREETS; i += 1) {
      const streetPos = CITY.street(i);
      const isAhead = dir > 0 ? streetPos > along + 10 : streetPos < along - 10;
      if (isAhead) ahead.push(streetPos);
    }
    if (ahead.length === 0) return null;
    ahead.sort((a, b) => Math.abs(a - along) - Math.abs(b - along));
    const pool = Math.min(3, ahead.length);
    return ahead[Math.floor(Math.random() * pool)];
  }

  // Distance to the nearest car directly ahead, or null when the road is clear.
  carAhead(car) {
    const fx = Math.cos(car.heading);
    const fz = -Math.sin(car.heading);
    for (const other of this.cars) {
      if (other === car || other.dead) continue;
      const dx = other.x - car.x;
      const dz = other.z - car.z;
      const dist = Math.hypot(dx, dz);
      const forward = dx * fx + dz * fz;
      const sideways = Math.abs(dx * -fz + dz * fx);
      if (dist < 12 && forward > 0 && sideways < 2.5) return dist;
    }
    return null;
  }

  // Is the player's car in this AI car's path?
  playerAhead(car, playerCar) {
    if (!playerCar || playerCar.dead) return null;
    const dx = playerCar.x - car.x;
    const dz = playerCar.z - car.z;
    const dist = Math.hypot(dx, dz);
    const fx = Math.cos(car.heading);
    const fz = -Math.sin(car.heading);
    const forward = dx * fx + dz * fz;
    const sideways = Math.abs(dx * -fz + dz * fx);
    if (dist < 10 && forward > 0 && sideways < 2.5) return dist;
    return null;
  }

  update(dt, playerCar) {
    for (const car of this.cars) {
      if (car.dead) continue;
      const ai = car.ai;
      const along = ai.horizontal ? car.x : car.z;

      // Reached the chosen intersection: snap to its centre, turn, swap axis.
      if (ai.nextTurnAt !== null) {
        const arrived = ai.dir > 0 ? along >= ai.nextTurnAt : along <= ai.nextTurnAt;
        if (arrived) {
          const turn = Math.random() < 0.5 ? Math.PI / 2 : -Math.PI / 2;
          if (ai.horizontal) car.mesh.position.x = ai.nextTurnAt;
          else car.mesh.position.z = ai.nextTurnAt;
          car.heading += turn;
          const h = ((car.heading % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
          if (h < Math.PI / 4 || h > Math.PI * 7 / 4) {
            ai.horizontal = true;
            ai.dir = 1;
          } else if (h > Math.PI * 3 / 4 && h < Math.PI * 5 / 4) {
            ai.horizontal = true;
            ai.dir = -1;
          } else if (h >= Math.PI / 4 && h <= Math.PI * 3 / 4) {
            ai.horizontal = false;
            ai.dir = -1;
          } else {
            ai.horizontal = false;
            ai.dir = 1;
          }
          ai.nextTurnAt = this.chooseTurn(ai.horizontal, ai.dir, car.x, car.z);
        }
      }

      // Throttle: full speed unless something is ahead or we're at cruise.
      let throttle = 1;
      const gap = this.carAhead(car);
      if (gap !== null && gap < 9) throttle = gap < 5 ? -1 : 0;
      const playerGap = this.playerAhead(car, playerCar);
      if (playerGap !== null) throttle = playerGap < 5 ? -1 : 0;
      if (car.speed > ai.targetSpeed) throttle = 0;

      // Ease back toward the lane centre.
      const street = this.city.nearestStreetCoord(ai.horizontal ? car.z : car.x);
      const laneSign = ai.horizontal ? (ai.dir > 0 ? 1 : -1) : (ai.dir > 0 ? -1 : 1);
      const laneCentre = street + 3 * laneSign;
      const offset = (ai.horizontal ? car.z : car.x) - laneCentre;
      const steer = Math.max(-1, Math.min(1, -offset * 0.25));
      car.drive(dt, throttle, steer, false, this.city);
      car.updateVisual(dt);

      // A car that left town (or died off-screen) is replaced by a fresh one.
      if (Math.abs(car.x) > CITY.half + 5 || Math.abs(car.z) > CITY.half + 5) {
        car.remove();
        this.cars.splice(this.cars.indexOf(car), 1);
        this.spawn();
      }
    }
  }

  // The player's car shunting traffic: both take damage, the AI car spins.
  collideWith(playerCar) {
    if (!playerCar || playerCar.dead) return false;
    let crashed = false;
    for (const car of this.cars) {
      if (car.dead) continue;
      const dist = Math.hypot(car.x - playerCar.x, car.z - playerCar.z);
      if (dist >= 4.2) continue;
      const impact = Math.abs(playerCar.speed) + Math.abs(car.speed);
      if (impact <= 4) continue;
      car.health -= impact;
      playerCar.health -= impact * 0.5;
      playerCar.speed *= 0.4;
      car.speed = -car.speed * 0.3;
      crashed = true;
    }
    return crashed;
  }
}
