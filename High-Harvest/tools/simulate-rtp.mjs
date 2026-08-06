#!/usr/bin/env node

// Headless Monte Carlo model for the game math in game.js. Keep the symbol
// weights, feature effects and collector rules in sync when changing the game.

const COLORS = [
  [0.05, 0.10, 0.20, 0.35, 0.80, 2.50, 10],
  [0.05, 0.15, 0.30, 0.45, 1.20, 3.75, 15],
  [0.10, 0.20, 0.40, 0.60, 1.60, 5, 20],
  [0.10, 0.25, 0.60, 1, 3, 10, 50],
];

const BET = Number.parseFloat(process.env.BET || "20");
const TARGET_RTP = 0.92;
const spins = Math.max(1, Number.parseInt(process.argv[2] || "100000", 10));
const payoutScale = Number.parseFloat(process.argv[3] || "1");
const baseFeatureChance = Number.parseFloat(process.env.BASE_FEATURE_CHANCE || "0.075");
const bonusFeatureChance = Number.parseFloat(process.env.BONUS_FEATURE_CHANCE || "0.01");
const allowRetrigger = process.env.ALLOW_RETRIGGER !== "false";
const leafValueScale = Number.parseFloat(process.env.LEAF_VALUE_SCALE || "0.0894");
const coinValueScale = Number.parseFloat(process.env.COIN_VALUE_SCALE || "0.0894");

let seed = 0x48525653;
function random() {
  seed ^= seed << 13;
  seed ^= seed >>> 17;
  seed ^= seed << 5;
  return (seed >>> 0) / 0x100000000;
}
const rand = (max) => Math.floor(random() * max);
const pick = (items) => items[rand(items.length)];
const shuffle = (items) => {
  for (let i = items.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
};

function freshState() {
  return {
    size: 6,
    grid: [],
    collectors: [],
    levels: [1, 1, 1, 1],
    bridges: [false, false, false, false],
    meter: 0,
    meterGoal: 20,
    pending: 0,
    seeds: 0,
    freeDrops: 0,
    inBonus: false,
    bonusQueued: false,
    deferredShuffle: 0,
    deferredMeteor: [],
    win: 0,
    moves: 0,
    maxMoves: 110,
  };
}

let state;
const indexFor = (row, col) => row * state.size + col;
const getCell = (row, col) => state.grid[indexFor(row, col)];
const setCell = (row, col, value) => { state.grid[indexFor(row, col)] = value; };
const occupied = (row, col, ignore = -1) => state.collectors.some((collector, index) => index !== ignore && collector.row === row && collector.col === col);

function createSymbol(forceLeaf = false) {
  const featureChance = state.inBonus ? bonusFeatureChance : baseFeatureChance;
  if (!forceLeaf && random() < featureChance) {
    const roll = random();
    if (roll < 0.19) return { kind: "feature", feature: "upgrade", power: 1 + rand(3) };
    if (roll < 0.25) return { kind: "feature", feature: "upgradeAll", power: 1 + rand(3) };
    if (roll < 0.37) return { kind: "feature", feature: "coin", value: pick([1, 2, 3, 5, 10, 20]) };
    if (roll < 0.49) return { kind: "feature", feature: "transform" };
    if (roll < 0.59) return { kind: "feature", feature: "shuffle" };
    if (roll < 0.69) return { kind: "feature", feature: "cloud" };
    if (roll < 0.78) return { kind: "feature", feature: "meteor" };
    if (roll < 0.90) return { kind: "feature", feature: "wild" };
    return state.inBonus && !allowRetrigger ? { kind: "leaf", color: rand(4) } : { kind: "feature", feature: "bonus" };
  }
  return { kind: "leaf", color: rand(4) };
}

function createDrop() {
  state.grid = Array.from({ length: state.size * state.size }, () => createSymbol());
  state.collectors = [];
  const spots = new Set();
  while (spots.size < 4) spots.add(rand(state.size * state.size));
  [...spots].forEach((cell, color) => {
    state.collectors.push({ color, row: Math.floor(cell / state.size), col: cell % state.size });
    state.grid[cell] = null;
  });
  state.bridges = [false, false, false, false];
  state.moves = 0;
}

function addMeter() {
  state.meter++;
  while (state.meter >= state.meterGoal && state.pending < 3) {
    state.meter -= state.meterGoal;
    state.pending++;
  }
}

function award(rawAmount) {
  const scaled = rawAmount * payoutScale;
  const whole = Math.floor(scaled);
  state.win += whole + (random() < scaled - whole ? 1 : 0);
}

function resolveSymbol(symbol, collector, position) {
  if (symbol.kind === "leaf") {
    award(BET * COLORS[symbol.color][state.levels[symbol.color] - 1] * leafValueScale);
    addMeter();
    return;
  }
  if (symbol.feature === "upgrade" || symbol.feature === "upgradeAll") {
    const targets = symbol.feature === "upgradeAll" ? [0, 1, 2, 3] : [collector.color];
    targets.forEach((target) => { state.levels[target] = Math.min(7, state.levels[target] + (symbol.power || 1)); });
  } else if (symbol.feature === "wild") {
    award(BET * COLORS[collector.color][state.levels[collector.color] - 1] * leafValueScale);
    addMeter();
  } else if (symbol.feature === "coin") {
    award(BET * symbol.value * coinValueScale);
  } else if (symbol.feature === "bonus") {
    state.seeds++;
    if (state.seeds >= 3) {
      state.seeds -= 3;
      state.bonusQueued = true;
    }
  } else if (symbol.feature === "cloud") {
    state.bridges[collector.color] = true;
  } else if (symbol.feature === "transform") {
    transformLeaves(collector.color, position.row, position.col);
  } else if (symbol.feature === "shuffle") {
    state.deferredShuffle++;
  } else if (symbol.feature === "meteor") {
    state.deferredMeteor.push({ row: position.row, col: position.col });
  }
}

function neighbors(row, col) {
  return [[row - 1, col], [row + 1, col], [row, col - 1], [row, col + 1]]
    .filter(([nextRow, nextCol]) => nextRow >= 0 && nextCol >= 0 && nextRow < state.size && nextCol < state.size);
}

function collectibleFor(symbol, color) {
  return Boolean(symbol) && (symbol.kind !== "leaf" || symbol.color === color);
}

function featurePriority(symbol) {
  if (!symbol) return 0;
  if (symbol.kind === "leaf") return 15;
  return { bonus: 100, meteor: 92, upgradeAll: 88, upgrade: 82, transform: 74, wild: 68, coin: 62, shuffle: 54, cloud: 50 }[symbol.feature] || 20;
}

function findMove(collectorIndex) {
  const collector = state.collectors[collectorIndex];
  const direct = neighbors(collector.row, collector.col)
    .filter(([row, col]) => !occupied(row, col, collectorIndex) && collectibleFor(getCell(row, col), collector.color))
    .map(([row, col]) => ({ row, col, jump: false, score: featurePriority(getCell(row, col)) + random() * 8 }));
  if (direct.length) return direct.sort((a, b) => b.score - a.score)[0];
  if (!state.bridges[collector.color]) return null;
  const jumps = [];
  for (const [deltaRow, deltaCol] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
    for (let distance = 2; distance <= 3; distance++) {
      const row = collector.row + deltaRow * distance;
      const col = collector.col + deltaCol * distance;
      if (row < 0 || col < 0 || row >= state.size || col >= state.size) break;
      const between = Array.from({ length: distance - 1 }, (_, i) => getCell(collector.row + deltaRow * (i + 1), collector.col + deltaCol * (i + 1)));
      if (between.some(Boolean)) break;
      if (!occupied(row, col, collectorIndex) && collectibleFor(getCell(row, col), collector.color)) {
        jumps.push({ row, col, jump: true, score: featurePriority(getCell(row, col)) + random() * 8 });
      }
    }
  }
  return jumps.sort((a, b) => b.score - a.score)[0] || null;
}

function collectorOrder() {
  return state.collectors.map((collector, index) => ({ index, value: COLORS[collector.color][state.levels[collector.color] - 1], tie: random() }))
    .sort((a, b) => b.value - a.value || a.tie - b.tie)
    .map(({ index }) => index);
}

function transformLeaves(color, originRow, originCol) {
  const candidates = [];
  for (let row = 0; row < state.size; row++) for (let col = 0; col < state.size; col++) {
    const symbol = getCell(row, col);
    const distance = Math.abs(row - originRow) + Math.abs(col - originCol);
    if (symbol?.kind === "leaf" && symbol.color !== color && distance <= 3) candidates.push([row, col]);
  }
  shuffle(candidates).slice(0, 4 + rand(5)).forEach(([row, col]) => setCell(row, col, { kind: "leaf", color }));
}

function shuffleCollectors() {
  state.collectors.map(({ row, col }) => indexFor(row, col)).forEach((cell) => { state.grid[cell] = createSymbol(true); });
  const candidates = shuffle(state.grid.map((symbol, index) => ({ symbol, index }))
    .filter(({ symbol }) => symbol?.kind === "leaf")
    .map(({ index }) => index));
  state.collectors.forEach((collector, collectorIndex) => {
    const cell = candidates[collectorIndex];
    collector.row = Math.floor(cell / state.size);
    collector.col = cell % state.size;
    state.grid[cell] = null;
  });
}

function expandGrid(newSize) {
  const oldSize = state.size;
  const oldGrid = state.grid;
  state.size = newSize;
  state.grid = Array.from({ length: newSize * newSize }, () => createSymbol());
  for (let row = 0; row < oldSize; row++) for (let col = 0; col < oldSize; col++) state.grid[row * newSize + col] = oldGrid[row * oldSize + col];
}

function growBurst(originRow, originCol) {
  const oldSize = state.size;
  for (let row = 0; row < oldSize; row++) for (let col = 0; col < oldSize; col++) {
    if (Math.abs(row - originRow) + Math.abs(col - originCol) <= 2 && getCell(row, col)?.kind === "leaf") setCell(row, col, null);
  }
  if (state.size < 8) expandGrid(state.size + 1);
  shuffleCollectors();
  state.meterGoal = 20 + (state.size - 6) * 8;
}

function releasePendingFeatures() {
  if (!state.pending) return false;
  const count = state.pending;
  state.pending = 0;
  const candidates = shuffle(state.grid.map((symbol, index) => ({ symbol, index }))
    .filter(({ symbol }) => symbol?.kind === "leaf")
    .map(({ index }) => index));
  const pool = ["upgrade", "coin", "transform", "cloud", "wild", "bonus", "meteor"];
  for (let i = 0; i < Math.min(candidates.length, count * 3); i++) {
    const feature = pick(pool);
    state.grid[candidates[i]] = feature === "upgrade"
      ? { kind: "feature", feature, power: 1 + rand(3) }
      : feature === "coin" ? { kind: "feature", feature, value: pick([2, 3, 5, 10]) }
      : { kind: "feature", feature };
  }
  return true;
}

function resolveDeferredFeatures() {
  if (!state.deferredShuffle && !state.deferredMeteor.length) return false;
  if (state.deferredShuffle) {
    state.deferredShuffle = 0;
    shuffleCollectors();
  }
  while (state.deferredMeteor.length) {
    const impact = state.deferredMeteor.shift();
    growBurst(Math.min(impact.row, state.size - 1), Math.min(impact.col, state.size - 1));
  }
  return true;
}

function applyGravityAndRefill() {
  for (let col = 0; col < state.size; col++) {
    const collectorRows = new Set(state.collectors.filter((collector) => collector.col === col).map((collector) => collector.row));
    const symbols = [];
    for (let row = 0; row < state.size; row++) if (!collectorRows.has(row) && getCell(row, col)) symbols.push(getCell(row, col));
    for (let row = state.size - 1; row >= 0; row--) {
      if (collectorRows.has(row)) setCell(row, col, null);
      else setCell(row, col, symbols.pop() || createSymbol());
    }
  }
}

function processCollections() {
  let collected = false;
  for (const index of collectorOrder()) {
    let move = findMove(index);
    while (move && state.moves < state.maxMoves) {
      collected = true;
      const collector = state.collectors[index];
      const symbol = getCell(move.row, move.col);
      collector.row = move.row;
      collector.col = move.col;
      if (move.jump) state.bridges[collector.color] = false;
      setCell(move.row, move.col, null);
      resolveSymbol(symbol, collector, move);
      state.moves++;
      move = findMove(index);
    }
  }
  return collected;
}

function playDrop() {
  let cascade = 0;
  while (cascade < 18 && state.moves < state.maxMoves) {
    if (processCollections()) {
      applyGravityAndRefill();
      cascade++;
    } else if (releasePendingFeatures()) {
      cascade++;
    } else if (resolveDeferredFeatures()) {
      cascade++;
    } else {
      break;
    }
  }
}

function playPaidSpin() {
  state = freshState();
  createDrop();
  playDrop();
  if (!state.bonusQueued) return { win: state.win, bonus: false, freeDrops: 0 };

  state.inBonus = true;
  state.bonusQueued = false;
  state.freeDrops = 5;
  let playedFreeDrops = 0;
  let firstFreeDrop = true;
  while (state.freeDrops > 0 && playedFreeDrops < 500) {
    createDrop();
    if (firstFreeDrop && state.pending) releasePendingFeatures();
    playDrop();
    firstFreeDrop = false;
    playedFreeDrops++;
    state.freeDrops--;
    if (state.bonusQueued) {
      state.freeDrops += 5;
      state.bonusQueued = false;
    }
  }
  return { win: state.win, bonus: true, freeDrops: playedFreeDrops };
}

let paid = 0;
let won = 0;
let hits = 0;
let bonuses = 0;
let freeDrops = 0;
let maxWin = 0;
for (let i = 0; i < spins; i++) {
  const result = playPaidSpin();
  paid += BET;
  won += result.win;
  if (result.win > 0) hits++;
  if (result.bonus) bonuses++;
  freeDrops += result.freeDrops;
  maxWin = Math.max(maxWin, result.win);
}

const rtp = won / paid;
console.log(JSON.stringify({
  spins,
  bet: BET,
  payoutScale,
  baseFeatureChance,
  bonusFeatureChance,
  allowRetrigger,
  leafValueScale,
  coinValueScale,
  rtp: Number((rtp * 100).toFixed(3)),
  target: TARGET_RTP * 100,
  suggestedScale: Number((payoutScale * TARGET_RTP / rtp).toFixed(6)),
  hitRate: Number((hits / spins * 100).toFixed(2)),
  bonusRate: Number((bonuses / spins * 100).toFixed(3)),
  averageFreeDropsPerBonus: bonuses ? Number((freeDrops / bonuses).toFixed(2)) : 0,
  maxWin,
}, null, 2));
