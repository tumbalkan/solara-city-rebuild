// Save system — Rico's progress lives in localStorage: cash, which mission
// he's on, how many he's finished, where he stands and his health and ammo.
// The wanted level never saves: every fresh load starts clean.
import { SAVE_KEY } from './config.js';

export function loadSave() {
  let raw = null;
  try {
    raw = localStorage.getItem(SAVE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return null;
    return data;
  } catch {
    return null;
  }
}

export function saveGame(state) {
  const snapshot = {
    version: 1,
    savedAt: new Date().toISOString(),
    cash: state.cash,
    missionIndex: state.missionIndex,
    missionsCompleted: state.missionsCompleted,
    player: { x: state.playerX, z: state.playerZ, health: state.health },
    ammo: state.ammo,
  };
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(snapshot));
    return true;
  } catch {
    return false;
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    // Private mode or disabled storage: nothing to clear.
  }
}
