// Solara City — every shared tuning number in one place.
// City layout, movement speeds, wanted rules, palette and money.
// The other modules import from here instead of hard-coding numbers.

// The street grid: 7 avenues each way, evenly spaced. Blocks sit between
// them; the playable area runs a little past the outer streets.
export const CITY = {
  STREETS: 7,
  SPACING: 52,
  ROAD_WIDTH: 12,
  BLOCK: 40,
  half: 162,
  // Centre line of street number i, running from -156 up to +156.
  street(index) {
    return (index - (CITY.STREETS - 1) / 2) * CITY.SPACING;
  },
};

// Rico on foot.
export const PLAYER = {
  WALK_SPEED: 7,
  RUN_SPEED: 12,
  RADIUS: 0.7,
  MAX_HEALTH: 100,
};

// Arcade car handling, shared by the player, traffic and police.
export const CAR = {
  ACCEL: 26,
  BRAKE: 40,
  MAX_SPEED: 42,
  MAX_REVERSE: 12,
  TURN_RATE: 2.1,
  DRAG: 0.6,
};

// Wanted rules: how long to stay hidden before a star drops, and how many
// units each star level fields.
export const WANTED = {
  MAX: 5,
  DECAY_TIME: 25,
  COPS_PER_STAR: [0, 2, 3, 4, 6, 8],
};

// The look: bright coastal daylight, warm sand, turquoise bay.
export const PALETTE = {
  sky: 0x87c5e8,
  fog: 0x9fd4ec,
  road: 0x3a3f46,
  roadLine: 0xf5d90a,
  sidewalk: 0x9a938a,
  ground: 0x7fae6b,
  sand: 0xe8d8a8,
  water: 0x2e8fc7,
  building: [0xe8e0d0, 0xd8c8b0, 0xc0d0e0, 0xe0b8a0, 0xb8c8b0, 0xd8d0c0, 0xf0e8d8],
  windowDay: 0x2a4a6a,
  windowLit: 0xffd98a,
};

// Story payouts, one per mission in order, and Rico's starting cash.
export const MONEY = {
  MISSION_REWARD: [500, 800, 1000, 1500, 2500],
  START_CASH: 250,
};

export const SAVE_KEY = 'solara-city-save-v1';
