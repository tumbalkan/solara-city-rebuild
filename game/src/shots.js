// Screenshot staging — `?shot=<name>` drops the game into a scene that
// shows several systems at once, skips the start screen, then sets
// window.__shotReady so the capture script can take the frame. Normal play
// never touches this.
import { Car, CAR_TYPES } from './vehicles.js';

// Each staging function puts Rico, a car and the world into a photogenic
// state. The playtest reads the same states back through window.__state.
const SHOTS = {
  // Cover: driving down the avenue, HUD, minimap and mission beacon live.
  driving(game) {
    const car = new Car(game.scene, CAR_TYPES[5], -60, 0, 0, {});
    game.parkedCars.push(car);
    game.player.x = -62;
    game.player.z = 3;
    game.player.mesh.position.set(-62, 0, 3);
    game.enterCar(car);
    car.speed = 18;
    game.missions.index = 0;
    game.missions.start();
    game.player.money = 1250;
  },

  // A police chase: three stars plus the theft star, patrol cars closing in.
  chase(game) {
    const car = new Car(game.scene, CAR_TYPES[1], 0, 52, 0, {});
    game.parkedCars.push(car);
    game.player.x = -2;
    game.player.z = 55;
    game.player.mesh.position.set(-2, 0, 55);
    game.enterCar(car);
    car.speed = 25;
    game.police.addStars(3, 'shot');
    const chaser = game.police.spawnCarAt(-24, 52, 0);
    chaser.speed = 22;
    const headOn = game.police.spawnCarAt(70, 52, Math.PI);
    headOn.speed = 18;
    game.player.money = 3250;
    game.missions.index = 3;
    game.missions.start();
    game.missions.stepIndex = 1;
    game.missions.enterStep();
  },

  // On foot in the plaza: pedestrians, traffic and a live objective.
  foot(game) {
    game.player.x = -8;
    game.player.z = 52;
    game.player.mesh.position.set(-8, 0, 52);
    game.player.camYaw = 2.6;
    game.player.camPitch = 0.35;
    game.missions.index = 1;
    game.missions.start();
    game.player.money = 750;
  },

  // The Bayfront Showdown: five Red Jacks on the pier, objective live.
  mission(game) {
    game.player.x = 40;
    game.player.z = 158;
    game.player.mesh.position.set(40, 0, 158);
    game.player.camYaw = Math.PI;
    game.player.camPitch = 0.3;
    game.missions.index = 4;
    game.missions.start();
    game.missions.stepIndex = 1;
    game.missions.enterStep();
    game.startShowdown();
    game.player.money = 4800;
  },
};

export function setupShot(game) {
  const params = new URLSearchParams(location.search);
  const name = params.get('shot');
  if (!name || !SHOTS[name]) return false;
  game.started = true;
  document.getElementById('start-screen').style.display = 'none';
  document.getElementById('hud').style.display = 'block';
  SHOTS[name](game);
  // Let a few frames settle — cars move, the minimap draws — then signal.
  let frames = 0;
  const waitForSettle = () => {
    frames += 1;
    if (frames > 12) {
      window.__shotReady = true;
      return;
    }
    requestAnimationFrame(waitForSettle);
  };
  requestAnimationFrame(waitForSettle);
  return true;
}
