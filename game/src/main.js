// Solara City — an open-world crime game in the browser.
// Boots three.js, builds the city, and runs the game loop: Rico on foot or
// behind the wheel, traffic, pedestrians, police, combat, missions, the HUD,
// procedural audio and autosaving.
import * as THREE from 'three';
import { PALETTE, PLAYER, MONEY } from './config.js';
import { Input } from './input.js';
import { AudioEngine } from './audio.js';
import { City } from './city.js';
import { Car, CAR_TYPES } from './vehicles.js';
import { Traffic } from './traffic.js';
import { Pedestrians } from './pedestrians.js';
import { Player } from './player.js';
import { Police } from './police.js';
import { Combat } from './combat.js';
import { Missions } from './missions.js';
import { HUD } from './hud.js';
import { loadSave, saveGame } from './save.js';
import { setupShot } from './shots.js';

// --- Renderer, scene, lights ----------------------------------------------
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.sky);
scene.fog = new THREE.Fog(PALETTE.fog, 120, 320);

const camera = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, 0.1, 600);
camera.position.set(0, 30, 60);

const sun = new THREE.DirectionalLight(0xfff2d8, 2.2);
sun.position.set(80, 120, 40);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -180;
sun.shadow.camera.right = 180;
sun.shadow.camera.top = 180;
sun.shadow.camera.bottom = -180;
sun.shadow.camera.far = 400;
scene.add(sun);
scene.add(new THREE.HemisphereLight(0xbfe3ff, 0x8a7a5a, 1.1));

// --- World systems ---------------------------------------------------------
const input = new Input(canvas);
const audio = new AudioEngine();
const city = new City(scene);
const traffic = new Traffic(scene, city);
const peds = new Pedestrians(scene, city);
const police = new Police(scene, city, audio);
const combat = new Combat(scene, audio);
const missions = new Missions(scene, audio);
const hud = new HUD(city);

// Rico starts at Meridian Plaza — or where the save left him.
const saved = loadSave();
const player = new Player(scene, city, saved?.player?.x ?? 0, saved?.player?.z ?? 52);
if (saved) {
  player.money = saved.cash ?? MONEY.START_CASH;
  player.health = saved.player?.health ?? PLAYER.MAX_HEALTH;
  combat.ammo = saved.ammo ?? 60;
  missions.index = saved.missionIndex ?? 0;
  missions.completed = saved.missionsCompleted ?? 0;
}

// Parked cars along the avenues, free for the taking.
const parkedCars = [];
function parkCars() {
  const spots = [
    [0, -100, 0], [52, 48, Math.PI / 2], [-52, 104, 0], [104, -52, Math.PI],
    [-104, 52, Math.PI / 2], [0, 100, 0], [156, 0, Math.PI / 2], [-156, -52, 0],
    [52, -104, Math.PI], [-52, -52, Math.PI / 2], [104, 104, 0], [-104, -104, Math.PI],
  ];
  for (const [x, z, heading] of spots) {
    const type = CAR_TYPES[Math.floor(Math.random() * CAR_TYPES.length)];
    // Parked beside the road, not blocking it.
    parkedCars.push(new Car(scene, type, x + 8, z + 8, heading, { parked: true }));
  }
}
parkCars();

// The object the screenshot staging and the playtest hook into.
const game = {
  scene,
  player,
  police,
  missions,
  parkedCars,
  started: false,
  enterCar,
  startShowdown,
};

let paused = false;
let arrestTimer = 0;
let copHitTimer = 0;
let saveTimer = 0;
let deadTimer = 0;

// --- Saving ---------------------------------------------------------------
function doSave(silent) {
  const ok = saveGame({
    cash: player.money,
    missionIndex: missions.index,
    missionsCompleted: missions.completed,
    playerX: player.x,
    playerZ: player.z,
    health: player.health,
    ammo: combat.ammo,
  });
  if (ok && !silent) hud.toast('Progress saved');
}

// --- Cars ------------------------------------------------------------------
function nearestCar(maxDist) {
  let best = null;
  let bestDist = maxDist;
  const consider = (car) => {
    if (car.dead) return;
    const dist = Math.hypot(car.x - player.x, car.z - player.z);
    if (dist < bestDist) {
      best = car;
      bestDist = dist;
    }
  };
  for (const car of parkedCars) consider(car);
  for (const car of traffic.cars) consider(car);
  return best;
}

function enterCar(car) {
  // A car that isn't Rico's yet is a theft — and the PD notices.
  if (!car.stolen) {
    car.stolen = true;
    police.addStars(1, 'Grand theft auto');
    hud.toast('Car stolen! +1 ★ wanted');
  }
  // If it was a traffic car, take it out of the AI fleet.
  const inTraffic = traffic.cars.indexOf(car);
  if (inTraffic >= 0) traffic.cars.splice(inTraffic, 1);
  player.enterCar(car);
  audio.doorSlam();
}

function exitCar() {
  player.exitCar();
  audio.doorSlam();
}

// --- Missions and wanted events --------------------------------------------
function startShowdown() {
  combat.clearEnemies();
  const spots = [[36, 165], [46, 175], [30, 185], [50, 195], [40, 205]];
  for (const [x, z] of spots) combat.spawnEnemy(x, z);
  hud.toast('The Red Jacks are on the pier — take them out!');
  peds.scare(40, 180, 60);
}

missions.onEvent = (type, payload) => {
  if (type === 'start') {
    hud.toast(`${payload.mission.title}: ${payload.mission.brief}`, 5);
  } else if (type === 'step') {
    const step = payload.step;
    if (step.startStars) police.addStars(step.startStars, 'mission heat');
    if (step.id === 'clear') startShowdown();
    hud.setObjective(missions.objectiveText());
  } else if (type === 'complete') {
    player.money += payload.reward;
    hud.toast(`Mission complete! +$${payload.reward}`, 4);
    audio.cash();
    doSave(true);
  } else if (type === 'fail') {
    hud.toast(`Mission failed: ${payload.reason}. Press M to retry.`, 4);
  }
};

police.onWantedChange = (stars, reason) => {
  hud.setStars(stars);
  if (stars > 0 && reason && reason !== 'decay') {
    hud.toast(`Wanted level ${stars} — ${reason}`, 2.5);
  }
  if (stars === 0 && reason === 'decay') hud.toast('You lost the cops!', 2.5);
};

// --- Combat resolution ------------------------------------------------------
function resolveShot(hit) {
  if (!hit) return;
  if (hit.kind === 'ped') {
    peds.knockDown(hit.ref);
    peds.scare(hit.ref.x, hit.ref.z, 25);
    police.addStars(1, 'Assault');
  } else if (hit.kind === 'cop') {
    if (police.damageCop(hit.ref, 50)) police.addStars(2, 'Cop down');
    else police.addStars(1, 'Attacking police');
  } else if (hit.kind === 'enemy') {
    if (combat.damageEnemy(hit.ref, 34)) {
      hud.toast(`Red Jack down — ${combat.enemies.length} left`);
      if (missions.active && missions.step?.type === 'kill-all') {
        missions.step.text = `Take out the Red Jacks (${combat.enemies.length} left)`;
      }
    }
  } else if (hit.kind === 'car') {
    hit.ref.health -= 20;
    if (hit.ref.police) police.addStars(1, 'Attacking police');
    if (hit.ref.health <= 0) hit.ref.dead = true;
  }
}

function resolvePunch(hit) {
  if (!hit) return;
  if (hit.kind === 'ped') {
    peds.knockDown(hit.ref);
    police.addStars(1, 'Assault');
  } else if (hit.kind === 'cop') {
    if (police.damageCop(hit.ref, 25)) police.addStars(2, 'Cop down');
  } else if (hit.kind === 'enemy') {
    combat.damageEnemy(hit.ref, 25);
  }
}

// Shoot from Rico toward the point the camera is looking at.
function aimDirection() {
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  dir.y = 0;
  dir.normalize();
  return dir;
}

// --- Screens ----------------------------------------------------------------
const startScreen = document.getElementById('start-screen');
const pauseScreen = document.getElementById('pause-screen');
const wastedScreen = document.getElementById('wasted-screen');
const bustedScreen = document.getElementById('busted-screen');

function startGame() {
  audio.init();
  audio.resume();
  game.started = true;
  startScreen.style.display = 'none';
  document.getElementById('hud').style.display = 'block';
  input.requestLock();
  const greeting = saved
    ? 'Welcome back to Solara City'
    : 'Welcome to Solara City — press M to start your first job';
  hud.toast(greeting, 4);
  hud.setObjective(missions.objectiveText());
}

document.getElementById('play-btn').addEventListener('click', startGame);
document.getElementById('resume-btn').addEventListener('click', () => {
  paused = false;
  pauseScreen.style.display = 'none';
  input.requestLock();
});
document.getElementById('save-btn').addEventListener('click', () => doSave(false));
document.getElementById('restart-btn').addEventListener('click', () => location.reload());
document.getElementById('wasted-btn').addEventListener('click', () => respawn('hospital'));
document.getElementById('busted-btn').addEventListener('click', () => respawn('station'));
canvas.addEventListener('click', () => {
  if (game.started && !paused) input.requestLock();
});

function respawn(place) {
  wastedScreen.style.display = 'none';
  bustedScreen.style.display = 'none';
  const fine = Math.min(player.money, 200);
  player.money -= fine;
  player.health = PLAYER.MAX_HEALTH;
  police.clearStars();
  combat.clearEnemies();
  if (missions.active) missions.failMission(place === 'hospital' ? 'Wasted' : 'Busted');
  if (player.inCar) player.exitCar();
  player.x = place === 'hospital' ? -52 : 52;
  player.z = place === 'hospital' ? -52 : -104;
  player.mesh.position.set(player.x, 0, player.z);
  player.mesh.visible = true;
  deadTimer = 0;
  const message = place === 'hospital'
    ? `Patched up at St. Marina Hospital (-$${fine})`
    : `Released from Solara PD (-$${fine})`;
  hud.toast(message, 4);
  input.requestLock();
}

function showWasted() {
  if (deadTimer > 0) return;
  deadTimer = 1;
  wastedScreen.style.display = 'flex';
  input.releaseLock();
}

function showBusted() {
  if (deadTimer > 0) return;
  deadTimer = 1;
  bustedScreen.style.display = 'flex';
  input.releaseLock();
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// --- Main loop ---------------------------------------------------------------
const clock = new THREE.Clock();
let fpsFrames = 0;
let fpsTime = performance.now();

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);

  if (!game.started || paused) {
    // Behind the start screen the camera slowly orbits the city.
    if (!game.started) {
      const angle = clock.elapsedTime * 0.05;
      camera.position.set(Math.sin(angle) * 90, 45, Math.cos(angle) * 90);
      camera.lookAt(0, 0, 0);
      renderer.render(scene, camera);
    }
    input.endFrame();
    return;
  }

  // Menu keys: pause, mute, start a mission.
  if (input.pressed('KeyP') || input.pressed('Escape')) {
    paused = true;
    pauseScreen.style.display = 'flex';
    input.releaseLock();
  }
  if (input.mutePressed) audio.setMuted(!audio.muted);
  if (input.pressed('KeyM') && !missions.active && !missions.done) missions.start();
  if (input.pressed('KeyM') && missions.done) hud.toast('All missions complete — enjoy Solara City!');

  const playerCar = player.inCar;

  if (playerCar) {
    driveCar(dt, playerCar);
  } else {
    onFoot();
    audio.setEngine(0, false);
  }
  player.update(dt, input, camera);

  // World systems.
  traffic.update(dt, playerCar);
  peds.update(dt, player.pos, playerCar ? Math.abs(playerCar.speed) : player.speed);
  police.update(dt, player, playerCar);
  combat.update(
    dt,
    player.pos,
    (dmg) => {
      if (player.damage(dmg)) showWasted();
    },
    city,
  );
  missions.update(dt, {
    player,
    police,
    enemiesLeft: combat.enemies.length,
    inCar: Boolean(playerCar),
  });

  policePressure(dt, playerCar);
  updateHUD(dt, playerCar);

  // Autosave every half minute.
  saveTimer += dt;
  if (saveTimer > 30) {
    saveTimer = 0;
    doSave(true);
  }

  renderer.render(scene, camera);

  // Real-time FPS, exposed for the playtest.
  fpsFrames += 1;
  const now = performance.now();
  if (now - fpsTime >= 1000) {
    window.__fps = Math.round((fpsFrames * 1000) / (now - fpsTime));
    fpsFrames = 0;
    fpsTime = now;
  }
  input.endFrame();
}

// Driving: throttle, steering, handbrake, horn, exit, and the consequences
// of hitting things.
function driveCar(dt, car) {
  const throttle = (input.down('KeyW') ? 1 : 0) - (input.down('KeyS') ? 1 : 0);
  const steer = (input.down('KeyA') ? 1 : 0) - (input.down('KeyD') ? 1 : 0);
  const handbrake = input.down('Space');
  const crashed = car.drive(dt, throttle, steer, handbrake, city);
  if (crashed && Math.abs(car.speed) > 6) audio.crash();
  if (input.pressed('KeyH')) audio.horn();
  if (input.pressed('KeyE')) exitCar();
  if (input.clicked) audio.horn();
  audio.setEngine(Math.abs(car.speed) / 45, true);

  // Running someone over is a crime, and witnesses notice.
  const victims = peds.hitTest(car.x, car.z, 3.2);
  if (victims.length && Math.abs(car.speed) > 4) {
    for (const victim of victims) peds.knockDown(victim);
    peds.scare(car.x, car.z, 30);
    police.addStars(1, 'Hit and run');
  }
  if (traffic.collideWith(car)) audio.crash();
  if (car.dead) {
    hud.toast('Your car is wrecked!');
    exitCar();
  }
}

// On foot: enter a nearby car, shoot, or punch.
function onFoot() {
  if (input.pressed('KeyE')) {
    const car = nearestCar(5);
    if (car) enterCar(car);
  }
  if (input.clicked) {
    const hadAmmo = combat.ammo > 0;
    const from = new THREE.Vector3(player.x, 1.5, player.z);
    const hit = combat.shoot(from, aimDirection(), {
      peds: peds.peds,
      cops: police.cops,
      cars: [...parkedCars, ...traffic.cars, ...police.cars],
    });
    resolveShot(hit);
    if (hadAmmo) peds.scare(player.x, player.z, 30);
  }
  if (input.pressed('KeyQ')) {
    const hit = combat.punch(
      new THREE.Vector3(player.x, 0, player.z),
      player.heading,
      { peds: peds.peds, cops: police.cops },
    );
    resolvePunch(hit);
  }
}

// Cops arrest a player who stands still beside them, and punch one in reach.
function policePressure(dt, playerCar) {
  if (playerCar) {
    arrestTimer = 0;
    copHitTimer = 0;
    return;
  }
  if (police.wanted > 0) {
    const close = police.copsInRange(player.pos, 2.2);
    if (close.length > 0 && player.speed < 1) {
      arrestTimer += dt;
      if (arrestTimer > 2.5) showBusted();
    } else {
      arrestTimer = 0;
    }
  } else {
    arrestTimer = 0;
  }
  const adjacent = police.copsInRange(player.pos, 1.8);
  if (adjacent.length > 0) {
    copHitTimer += dt;
    if (copHitTimer > 0.8) {
      copHitTimer = 0;
      if (player.damage(6)) showWasted();
    }
  }
}

function updateHUD(dt, playerCar) {
  hud.setHealth(player.health);
  hud.setCash(player.money);
  hud.setAmmo(combat.ammo);
  hud.setObjective(missions.objectiveText());
  hud.setSpeed(playerCar ? playerCar.speed * 3.6 : 0, Boolean(playerCar));
  hud.setStars(police.wanted);
  hud.setHint(
    playerCar
      ? 'W/S drive · A/D steer · Space handbrake · E exit · H horn'
      : 'WASD move · Shift run · Mouse look · Click shoot · Q punch · E enter car · M mission · P pause',
  );
  hud.update(dt);
  const dirX = playerCar ? Math.cos(playerCar.heading) : Math.cos(player.heading);
  const dirZ = playerCar ? -Math.sin(playerCar.heading) : -Math.sin(player.heading);
  hud.drawMinimap({
    player: { x: player.pos.x, z: player.pos.z, dirX, dirZ },
    traffic: traffic.cars,
    policeCars: police.cars,
    enemies: combat.enemies,
    target: missions.targetPos(),
  });
}

// Screenshot staging (?shot=...) or normal play.
if (!setupShot(game)) {
  hud.setStars(0);
  hud.setHealth(player.health);
  hud.setCash(player.money);
}

// Debug hook for the playtest: state checks only, no cheats.
window.__game = game;
window.__state = () => ({
  started: game.started,
  inCar: Boolean(player.inCar),
  speed: player.inCar ? player.inCar.speed : player.speed,
  health: player.health,
  money: player.money,
  stars: police.wanted,
  mission: missions.current?.id ?? null,
  missionActive: missions.active,
  step: missions.step?.id ?? null,
  enemies: combat.enemies.length,
  traffic: traffic.cars.length,
  peds: peds.peds.length,
  policeCars: police.cars.length,
  x: player.pos.x,
  z: player.pos.z,
});
animate();
