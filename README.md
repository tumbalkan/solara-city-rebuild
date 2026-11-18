# Solara City

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/tumbalkan/solara-city-rebuild/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/tumbalkan/solara-city-rebuild/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

An open-world crime game for the [make.fun gta6-01 bounty](https://make.fun/bounty/gta6-01).
Rico Vega, a driver-for-hire, works five jobs for the fixer Mara across a sun-soaked
procedural city — stealing cars, outrunning the Solara PD, and settling a score on the
Bayfront Pier. Fully original: its own city, characters, vehicles, story, art and
procedurally synthesized sound. No GTA assets, names or music.

## Play

```bash
node serve.ts
# open http://localhost:8080
```

No build step, no network requests: static files under `game/`, three.js vendored
under `game/vendor/three/`.

## What's in the world

- **City** — a 7×7 street grid with procedural buildings, sidewalks, palms,
  streetlights, a beach and the bay (`src/city.js`)
- **Driving** — arcade car physics, handbrake, 6 car types to steal (`src/vehicles.js`)
- **Traffic & pedestrians** — AI cars that follow the grid and brake for you;
  walkers who flee from gunfire and speeding cars (`src/traffic.js`, `src/pedestrians.js`)
- **Wanted system** — 1–5 stars; police cars chase and ram, cops on foot pursue
  and arrest (`src/police.js`)
- **Combat** — hitscan pistol, melee, rival gang members who shoot back (`src/combat.js`)
- **Missions** — 5 story jobs with objective beacons, timers and cash rewards (`src/missions.js`)
- **HUD** — canvas minimap, health, cash, ammo, wanted stars, speedometer (`src/hud.js`)
- **Sound** — every effect synthesized live with Web Audio (`src/audio.js`)
- **Save** — progress in localStorage, autosaved every 30 s (`src/save.js`)

## Controls

WASD move/drive · Shift sprint · Mouse look · Click shoot · Q punch · E enter/exit car ·
Space handbrake · H horn · M mission · P pause

## License

MIT
