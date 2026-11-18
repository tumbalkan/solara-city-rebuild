// HUD — health bar, cash, ammo, wanted stars, the mission objective line,
// the speedometer, toast messages, and the circular canvas minimap showing
// roads, buildings, traffic, police, enemies and the mission marker.
// Plain DOM plus a 2D canvas: no textures, no images.
import { CITY, PLAYER } from './config.js';

export class HUD {
  constructor(city) {
    this.city = city;
    this.root = document.getElementById('hud');
    this.minimap = document.getElementById('minimap');
    this.mm = this.minimap.getContext('2d');
    this.starsEl = document.getElementById('stars');
    this.healthEl = document.getElementById('health-fill');
    this.healthText = document.getElementById('health-text');
    this.cashEl = document.getElementById('cash');
    this.ammoEl = document.getElementById('ammo');
    this.objectiveEl = document.getElementById('objective');
    this.speedEl = document.getElementById('speed');
    this.toastEl = document.getElementById('toast');
    this.hintEl = document.getElementById('hint');
    this.toastTimer = 0;
  }

  setStars(count) {
    this.starsEl.textContent = '★'.repeat(count) + '☆'.repeat(5 - count);
    this.starsEl.classList.toggle('hot', count > 0);
  }

  setHealth(health) {
    const pct = Math.max(0, (health / PLAYER.MAX_HEALTH) * 100);
    this.healthEl.style.width = `${pct}%`;
    this.healthEl.classList.toggle('low', pct < 30);
    this.healthText.textContent = `${Math.ceil(health)}`;
  }

  setCash(amount) {
    this.cashEl.textContent = `$${amount.toLocaleString()}`;
  }

  setAmmo(count) {
    this.ammoEl.textContent = `🔫 ${count}`;
  }

  setObjective(text) {
    this.objectiveEl.textContent = text;
  }

  setSpeed(kmh, driving) {
    this.speedEl.style.display = driving ? 'block' : 'none';
    if (driving) this.speedEl.textContent = `${Math.round(Math.abs(kmh))} km/h`;
  }

  setHint(text) {
    this.hintEl.textContent = text;
  }

  toast(text, seconds = 3) {
    this.toastEl.textContent = text;
    this.toastEl.classList.add('show');
    this.toastTimer = seconds;
  }

  update(dt) {
    if (this.toastTimer <= 0) return;
    this.toastTimer -= dt;
    if (this.toastTimer <= 0) this.toastEl.classList.remove('show');
  }

  // North-up minimap: the whole city scaled into the round canvas.
  drawMinimap(state) {
    const g = this.mm;
    const width = this.minimap.width;
    const height = this.minimap.height;
    const scale = width / (CITY.half * 2 + 40);
    const toX = (x) => width / 2 + x * scale;
    const toY = (z) => height / 2 + z * scale;
    g.clearRect(0, 0, width, height);

    // Land, then the bay and the sand strip along the bottom edge.
    g.fillStyle = '#6f9a5e';
    g.fillRect(0, 0, width, height);
    const shoreY = toY(CITY.half + 14);
    g.fillStyle = '#2e8fc7';
    g.fillRect(0, shoreY, width, height - shoreY);
    g.fillStyle = '#e8d8a8';
    g.fillRect(0, shoreY - 4, width, 4);

    // City pavement.
    g.fillStyle = '#8a8478';
    g.fillRect(toX(-CITY.half), toY(-CITY.half), CITY.half * 2 * scale, CITY.half * 2 * scale);

    // Roads.
    g.strokeStyle = '#3a3f46';
    g.lineWidth = Math.max(2, CITY.ROAD_WIDTH * scale);
    for (let i = 0; i < CITY.STREETS; i += 1) {
      const s = CITY.street(i);
      g.beginPath();
      g.moveTo(toX(-CITY.half), toY(s));
      g.lineTo(toX(CITY.half), toY(s));
      g.stroke();
      g.beginPath();
      g.moveTo(toX(s), toY(-CITY.half));
      g.lineTo(toX(s), toY(CITY.half));
      g.stroke();
    }

    // Buildings.
    g.fillStyle = '#b8b0a0';
    for (const b of this.city.buildings) {
      g.fillRect(toX(b.x - b.w / 2), toY(b.z - b.d / 2), b.w * scale, b.d * scale);
    }

    // Mission target: a gold dot with a dark ring.
    if (state.target) {
      g.fillStyle = '#ffd23f';
      g.beginPath();
      g.arc(toX(state.target.x), toY(state.target.z), 6, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = '#000';
      g.lineWidth = 1.5;
      g.stroke();
    }

    const dot = (x, z, colour, radius = 3) => {
      g.fillStyle = colour;
      g.beginPath();
      g.arc(toX(x), toY(z), radius, 0, Math.PI * 2);
      g.fill();
    };
    for (const car of state.traffic ?? []) dot(car.x, car.z, '#ffffff', 2.5);
    for (const car of state.policeCars ?? []) dot(car.x, car.z, '#4488ff', 3.5);
    for (const enemy of state.enemies ?? []) dot(enemy.x, enemy.z, '#ff3333', 3.5);

    // The player: a white arrow along their heading.
    const p = state.player;
    g.save();
    g.translate(toX(p.x), toY(p.z));
    g.rotate(Math.atan2(p.dirZ, p.dirX));
    g.fillStyle = '#ffffff';
    g.strokeStyle = '#000';
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(8, 0);
    g.lineTo(-5, -5);
    g.lineTo(-5, 5);
    g.closePath();
    g.fill();
    g.stroke();
    g.restore();
  }
}
