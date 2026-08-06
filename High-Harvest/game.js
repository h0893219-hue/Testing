"use strict";

(() => {

const BOARD_SIZE = 600;
const TARGET_RTP = 0.92;
const PAYOUT_VALUE_SCALE = 0.0894;
const BASE_FEATURE_CHANCE = 0.075;
const BONUS_FEATURE_CHANCE = 0.01;
const COLORS = [
  { id: "lime", name: "ChillChilla", leaf: "Lime", hex: "#9ef05d", thumb: "assets/collector-chillchilla-thumb.webp", sheet: "assets/collector-chillchilla-sheet.webp", frames: 64, values: [0.05, 0.10, 0.20, 0.35, 0.80, 2.50, 10] },
  { id: "cyan", name: "Trauermücke", leaf: "Mint", hex: "#58dfe8", thumb: "assets/collector-fly-thumb.webp", sheet: "assets/collector-fly-sheet.webp", frames: 64, values: [0.05, 0.15, 0.30, 0.45, 1.20, 3.75, 15] },
  { id: "violet", name: "Schimmelbud", leaf: "Violet", hex: "#c26cff", thumb: "assets/collector-bud-thumb.webp", sheet: "assets/collector-bud-sheet.webp", frames: 80, values: [0.10, 0.20, 0.40, 0.60, 1.60, 5, 20] },
  { id: "ember", name: "Jointstummel", leaf: "Ember", hex: "#ff8a3d", thumb: "assets/collector-joint-thumb.webp", sheet: "assets/collector-joint-sheet.webp", frames: 64, values: [0.10, 0.25, 0.60, 1, 3, 10, 50] },
];

const FEATURE_DEFS = {
  upgrade: { label: "LEVEL UP", image: "assets/feature-grinder.webp", badge: "+" },
  upgradeAll: { label: "ALL UP", image: "assets/feature-controller.png", badge: "ALL" },
  transform: { label: "HOTBOX", image: "assets/feature-bong.webp", badge: "↻" },
  shuffle: { label: "PUFF PASS", image: "assets/feature-joint.webp", badge: "↝" },
  meteor: { label: "GROW BURST", image: "assets/feature-growlight.webp", badge: "!" },
  wild: { label: "ROSIN WILD", image: "assets/feature-rosin.webp", badge: "W" },
  bonus: { label: "GOLDSAMEN", image: "assets/feature-seeds.png", badge: "◆" },
  cloud: { label: "VAPE BRIDGE", image: "assets/feature-vaporizer.webp", badge: "☁" },
  coin: { label: "BROKKOLI", image: "assets/feature-brokkoli.webp", badge: "B" },
};

const BETS = [10, 20, 50, 100];
const state = {
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
  bonusWin: 0,
  roundWin: 0,
  deferredShuffle: 0,
  deferredMeteor: [],
  balance: 2500,
  betIndex: 1,
  busy: false,
  sound: true,
  activeCollector: -1,
  moveCount: 0,
  maxMoves: 110,
};

const $ = (selector) => document.querySelector(selector);
const els = {
  phaserBoard: $("#phaserBoard"), boardFrame: $("#boardFrame"), machine: $("#machine"), statusText: $("#statusText"),
  meterFill: $("#meterFill"), meterText: $("#meterText"), pendingFeatures: $("#pendingFeatures"),
  collectorStats: $("#collectorStats"), balanceValue: $("#balanceValue"), betValue: $("#betValue"),
  winValue: $("#winValue"), gridValue: $("#gridValue"), spinButton: $("#spinButton"),
  betDown: $("#betDown"), betUp: $("#betUp"), seedProgress: $("#seedProgress"),
  freeDropsValue: $("#freeDropsValue"), bonusWinText: $("#bonusWinText"), bonusCard: $("#bonusCard"),
  roundBanner: $("#roundBanner"), helpDialog: $("#helpDialog"), helpButton: $("#helpButton"),
  closeHelp: $("#closeHelp"), soundButton: $("#soundButton"),
};

class PhaserBoardRenderer {
  constructor(parent) {
    const Phaser = window.Phaser;
    this.Phaser = Phaser;
    this.scene = null;
    this.symbols = new Map();
    this.collectorViews = [];
    this.gridGraphics = null;
    this.gridDrawn = false;
    this.size = 6;
    this.levels = [1, 1, 1, 1];
    this.tweenRates = [];
    this.nextMetricAt = 0;
    this.activeRoute = null;
    this.gravityPromise = Promise.resolve();
    this.collectorGravityPromise = Promise.resolve();
    this.ready = new Promise((resolve) => { this.resolveReady = resolve; });
    const renderer = this;

    class HarvestScene extends Phaser.Scene {
      constructor() { super({ key: "harvest" }); }
      preload() {
        this.load.svg("leaf", "assets/leaf-420.svg", { width: 256, height: 256 });
        COLORS.forEach((color, index) => {
          this.load.spritesheet(`collector-${index}`, color.sheet, {
            frameWidth: 128,
            frameHeight: 228,
            endFrame: color.frames - 1,
          });
        });
        Object.entries(FEATURE_DEFS).forEach(([key, def]) => this.load.image(`feature-${key}`, def.image));
      }
      create() {
        renderer.scene = this;
        renderer.gridGraphics = this.add.graphics().setDepth(0);
        COLORS.forEach((color, index) => {
          this.anims.create({
            key: `idle-${index}`,
            frames: this.anims.generateFrameNumbers(`collector-${index}`, { start: 0, end: color.frames - 1 }),
            frameRate: 8,
            repeat: -1,
          });
        });
        renderer.resolveReady();
      }
      update(time) {
        if (time < renderer.nextMetricAt) return;
        renderer.nextMetricAt = time + 500;
        parent.dataset.fps = String(Math.round(this.game.loop.actualFps || 0));
        parent.dataset.renderer = this.game.renderer.type === Phaser.WEBGL ? "WebGL" : "Canvas";
      }
    }

    this.game = new Phaser.Game({
      type: Phaser.AUTO,
      parent,
      width: BOARD_SIZE,
      height: BOARD_SIZE,
      backgroundColor: "#0b1a11",
      transparent: false,
      antialias: true,
      render: { antialias: true, roundPixels: false, powerPreference: "high-performance" },
      fps: { target: 60, smoothStep: true },
      scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
      scene: HarvestScene,
      audio: { noAudio: true },
      banner: false,
    });
  }

  colorNumber(hex) { return Number.parseInt(hex.slice(1), 16); }
  cellSize() { return BOARD_SIZE / this.size; }
  cellCenter(row, col) {
    const cell = this.cellSize();
    return { x: col * cell + cell / 2, y: row * cell + cell / 2 };
  }

  drawGrid() {
    const graphics = this.gridGraphics;
    const cell = this.cellSize();
    const gap = Math.max(4, 8 - (this.size - 6) * 1.5);
    graphics.clear();
    for (let row = 0; row < this.size; row++) for (let col = 0; col < this.size; col++) {
      graphics.fillStyle(0x183222, 0.58);
      graphics.fillRoundedRect(col * cell + gap / 2, row * cell + gap / 2, cell - gap, cell - gap, Math.max(8, cell * .11));
      graphics.lineStyle(1, 0xffffff, .07);
      graphics.strokeRoundedRect(col * cell + gap / 2, row * cell + gap / 2, cell - gap, cell - gap, Math.max(8, cell * .11));
    }
  }

  destroySymbols() {
    this.symbols.forEach((view) => {
      this.scene?.tweens.killTweensOf(view);
      view.destroy(true);
    });
    this.symbols.clear();
  }

  createLeaf(symbol, row, col) {
    const scene = this.scene;
    const cell = this.cellSize();
    const { x, y } = this.cellCenter(row, col);
    const container = scene.add.container(x, y).setDepth(4);
    const glow = scene.add.circle(0, 0, cell * .28, this.colorNumber(COLORS[symbol.color].hex), .12);
    const leaf = scene.add.image(0, 0, "leaf").setTint(this.colorNumber(COLORS[symbol.color].hex)).setDisplaySize(cell * .68, cell * .68);
    const badge = scene.add.circle(cell * .28, cell * .27, Math.max(9, cell * .095), 0xf7efcf, 1).setStrokeStyle(2, this.colorNumber(COLORS[symbol.color].hex), 1);
    const level = scene.add.text(cell * .28, cell * .27, String(this.levels[symbol.color]), { fontFamily: "Arial", fontSize: `${Math.max(10, cell * .105)}px`, color: "#132015", fontStyle: "bold" }).setOrigin(.5);
    container.add([glow, leaf, badge, level]);
    container.symbolRef = symbol;
    container.levelText = level;
    return container;
  }

  createFeature(symbol, row, col) {
    const scene = this.scene;
    const cell = this.cellSize();
    const { x, y } = this.cellCenter(row, col);
    const def = FEATURE_DEFS[symbol.feature];
    const container = scene.add.container(x, y).setDepth(5);
    const panelColor = symbol.feature === "coin" ? 0x173d20 : symbol.feature === "cloud" ? 0x123641 : 0x372b13;
    const panel = scene.add.rectangle(0, 0, cell * .78, cell * .78, panelColor, .9).setStrokeStyle(1, symbol.feature === "cloud" ? 0x79e1f9 : 0xf6c44b, .45);
    const image = scene.add.image(0, 0, `feature-${symbol.feature}`).setDisplaySize(cell * .62, cell * .62);
    const badgeText = symbol.feature === "coin" ? `${formatMultiplier(payoutMultiplier(symbol.value))}×` : symbol.feature === "upgrade" ? `+${symbol.power || 1}` : def.badge;
    const badge = scene.add.rectangle(cell * .29, -cell * .29, Math.max(24, badgeText.length * 9 + 8), Math.max(20, cell * .2), 0xf6c44b, 1).setStrokeStyle(1, 0xffef9b, .6);
    const text = scene.add.text(cell * .29, -cell * .29, badgeText, { fontFamily: "Arial", fontSize: `${Math.max(9, cell * .09)}px`, color: "#1a1205", fontStyle: "bold" }).setOrigin(.5);
    container.add([panel, image, badge, text]);
    container.symbolRef = symbol;
    if (symbol.feature === "meteor") scene.tweens.add({ targets: container, scale: 1.07, duration: 650, yoyo: true, repeat: -1, ease: "Sine.InOut" });
    return container;
  }

  renderBoard(grid, size, levels, dropPlan = null) {
    if (!this.scene) return;
    const sizeChanged = this.size !== size;
    const reusable = sizeChanged ? new Map() : new Map([...this.symbols.values()].map((view) => [view.symbolRef, view]));
    if (sizeChanged) this.destroySymbols();
    else this.symbols = new Map();
    this.size = size;
    this.levels = [...levels];
    if (sizeChanged || !this.gridDrawn) {
      this.drawGrid();
      this.gridDrawn = true;
    }
    const drops = [];
    grid.forEach((symbol, index) => {
      if (!symbol) return;
      const row = Math.floor(index / size);
      const col = index % size;
      const target = this.cellCenter(row, col);
      const reused = reusable.has(symbol);
      const view = reusable.get(symbol) || (symbol.kind === "leaf" ? this.createLeaf(symbol, row, col) : this.createFeature(symbol, row, col));
      reusable.delete(symbol);
      this.symbols.set(index, view);
      if (view.levelText) view.levelText.setText(String(this.levels[symbol.color]));
      const drop = dropPlan?.get(symbol);
      if (drop) {
        const targetY = target.y;
        const distance = Math.max(1, row - drop.fromRow);
        this.scene.tweens.killTweensOf(view);
        view.x = target.x;
        if (!reused || drop.isNew) view.y = drop.fromRow * this.cellSize() + this.cellSize() / 2;
        view.alpha = drop.isNew ? .22 : 1;
        view.angle = drop.isNew ? (Math.random() - .5) * 9 : 0;
        drops.push(new Promise((resolve) => {
          this.scene.tweens.add({
            targets: view,
            y: targetY,
            alpha: 1,
            angle: 0,
            delay: col * 34 + (drop.isNew ? 105 + drop.order * 58 : 0),
            duration: Math.min(680, 260 + distance * 62),
            ease: "Bounce.Out",
            onComplete: resolve,
          });
        }));
      } else {
        view.setPosition(target.x, target.y);
      }
    });
    reusable.forEach((view) => {
      this.scene.tweens.killTweensOf(view);
      view.destroy(true);
    });
    this.gravityPromise = drops.length ? Promise.all(drops) : Promise.resolve();
  }

  waitForGravity() { return Promise.all([this.gravityPromise, this.collectorGravityPromise]); }

  removeSymbol(row, col) {
    const index = row * this.size + col;
    const view = this.symbols.get(index);
    if (view) {
      this.scene?.tweens.killTweensOf(view);
      view.destroy(true);
      this.symbols.delete(index);
    }
  }

  destroyCollectors() {
    this.collectorViews.forEach((view) => {
      this.scene?.tweens.killTweensOf(view.container);
      this.scene?.tweens.killTweensOf(view.sprite);
      view.container.destroy(true);
    });
    this.collectorViews = [];
  }

  createCollector(collector, index, gravity = false) {
    const scene = this.scene;
    const cell = this.cellSize();
    const { x, y } = this.cellCenter(collector.row, collector.col);
    const color = this.colorNumber(COLORS[collector.color].hex);
    const container = scene.add.container(x, y).setDepth(20);
    const glow = scene.add.circle(0, 0, cell * .37, color, .13).setStrokeStyle(Math.max(2, cell * .025), color, .9);
    const sprite = scene.add.sprite(0, -cell * .05, `collector-${collector.color}`, 0);
    sprite.setDisplaySize(cell * .66, cell * 1.18).play(`idle-${collector.color}`);
    const badge = scene.add.circle(cell * .3, cell * .3, Math.max(10, cell * .105), color, 1).setStrokeStyle(2, 0xf5edcb, 1);
    const level = scene.add.text(cell * .3, cell * .3, String(this.levels[collector.color]), { fontFamily: "Arial", fontSize: `${Math.max(10, cell * .105)}px`, color: "#0b150d", fontStyle: "bold" }).setOrigin(.5);
    container.add([glow, sprite, badge, level]);
    this.collectorViews[index] = { container, sprite, level, color: collector.color };
    if (gravity) {
      container.y = -cell * (1.4 + index * .18);
      container.alpha = .15;
      container.angle = index % 2 ? 5 : -5;
      return new Promise((resolve) => {
        scene.tweens.add({
          targets: container,
          y,
          alpha: 1,
          angle: 0,
          delay: 90 + index * 75,
          duration: 650 + index * 35,
          ease: "Bounce.Out",
          onComplete: resolve,
        });
      });
    }
    return Promise.resolve();
  }

  syncCollectors(collectors, size, levels, force = false, gravity = false) {
    if (!this.scene) return;
    const sizeChanged = this.size !== size;
    this.size = size;
    this.levels = [...levels];
    if (force || this.collectorViews.length !== collectors.length || this.collectorViews.some((view, index) => view.color !== collectors[index].color)) {
      this.destroyCollectors();
      this.collectorGravityPromise = Promise.all(collectors.map((collector, index) => this.createCollector(collector, index, gravity)));
      return;
    }
    collectors.forEach((collector, index) => {
      const view = this.collectorViews[index];
      const { x, y } = this.cellCenter(collector.row, collector.col);
      if (!this.scene.tweens.isTweening(view.container) || sizeChanged) view.container.setPosition(x, y);
      view.level.setText(String(levels[collector.color]));
    });
  }

  previewPath(index, row, col, color, jump) {
    const scene = this.scene;
    const view = this.collectorViews[index];
    if (!scene || !view) return Promise.resolve();
    if (this.activeRoute) this.activeRoute.destroy(true);

    const start = { x: view.container.x, y: view.container.y };
    const target = this.cellCenter(row, col);
    const route = scene.add.container(0, 0).setDepth(15);
    const graphics = scene.add.graphics();
    const tint = this.colorNumber(color);
    const bend = jump ? -this.cellSize() * .28 : 0;
    const control = { x: (start.x + target.x) / 2, y: (start.y + target.y) / 2 + bend };
    const pointAt = (t) => {
      const u = 1 - t;
      return {
        x: u * u * start.x + 2 * u * t * control.x + t * t * target.x,
        y: u * u * start.y + 2 * u * t * control.y + t * t * target.y,
      };
    };

    graphics.lineStyle(Math.max(12, this.cellSize() * .14), tint, .13);
    graphics.beginPath(); graphics.moveTo(start.x, start.y);
    for (let i = 1; i <= 18; i++) { const p = pointAt(i / 18); graphics.lineTo(p.x, p.y); }
    graphics.strokePath();
    graphics.lineStyle(Math.max(3, this.cellSize() * .035), tint, .88);
    graphics.beginPath(); graphics.moveTo(start.x, start.y);
    for (let i = 1; i <= 18; i++) { const p = pointAt(i / 18); graphics.lineTo(p.x, p.y); }
    graphics.strokePath();
    route.add(graphics);

    const targetRing = scene.add.circle(target.x, target.y, Math.max(12, this.cellSize() * .16), tint, .1)
      .setStrokeStyle(Math.max(3, this.cellSize() * .028), tint, 1);
    route.add(targetRing);
    scene.tweens.add({ targets: targetRing, scale: 1.3, alpha: .35, duration: 210, yoyo: true, repeat: 1, ease: "Sine.InOut" });

    const pulseCount = jump ? 8 : 5;
    for (let i = 0; i < pulseCount; i++) {
      const p = pointAt((i + 1) / (pulseCount + 1));
      const pulse = scene.add.circle(p.x, p.y, Math.max(4, this.cellSize() * .045), 0xffffff, .95)
        .setStrokeStyle(Math.max(2, this.cellSize() * .018), tint, 1);
      pulse.setScale(.3).setAlpha(.15);
      route.add(pulse);
      scene.tweens.add({ targets: pulse, scale: 1.25, alpha: 1, duration: 115, delay: i * 34, yoyo: true, hold: 35, ease: "Sine.InOut" });
    }
    this.activeRoute = route;
    scene.tweens.add({
      targets: route,
      alpha: 0,
      delay: jump ? 430 : 300,
      duration: 180,
      onComplete: () => {
        if (this.activeRoute === route) this.activeRoute = null;
        route.destroy(true);
      },
    });
    return new Promise((resolve) => scene.time.delayedCall(jump ? 210 : 155, resolve));
  }

  moveCollector(index, row, col, jump) {
    const scene = this.scene;
    const view = this.collectorViews[index];
    const target = this.cellCenter(row, col);
    if (!scene || !view) return Promise.resolve();
    const duration = jump ? 420 : 285;
    let tweenFrames = 0;
    scene.tweens.killTweensOf(view.container);
    scene.tweens.killTweensOf(view.sprite);
    scene.tweens.add({ targets: view.sprite, scaleX: view.sprite.scaleX * 1.12, scaleY: view.sprite.scaleY * 1.12, angle: -3, duration: duration / 2, yoyo: true, ease: "Sine.InOut" });
    if (jump) scene.tweens.add({ targets: view.sprite, y: view.sprite.y - this.cellSize() * .2, duration: duration / 2, yoyo: true, ease: "Sine.Out" });
    return new Promise((resolve) => {
      scene.tweens.add({
        targets: view.container,
        x: target.x,
        y: target.y,
        duration,
        ease: jump ? "Cubic.InOut" : "Cubic.Out",
        onUpdate: () => { tweenFrames++; },
        onComplete: () => {
          this.tweenRates.push(tweenFrames / (duration / 1000));
          this.tweenRates = this.tweenRates.slice(-20);
          els.phaserBoard.dataset.tweenFps = String(Math.round(this.tweenRates.reduce((sum, value) => sum + value, 0) / this.tweenRates.length));
          resolve();
        },
      });
    });
  }

  burstAt(row, col, color, count = 6) {
    const scene = this.scene;
    if (!scene) return;
    const origin = this.cellCenter(row, col);
    const tint = this.colorNumber(color);
    for (let i = 0; i < count; i++) {
      const particle = scene.add.circle(origin.x, origin.y, 3 + Math.random() * 3, tint, 1).setDepth(40);
      scene.tweens.add({ targets: particle, x: origin.x + rand(100) - 50, y: origin.y + rand(90) - 65, alpha: 0, scale: .15, duration: 620, ease: "Cubic.Out", onComplete: () => particle.destroy() });
    }
  }

  floatScore(row, col, text, color) {
    const scene = this.scene;
    if (!scene) return;
    const origin = this.cellCenter(row, col);
    const score = scene.add.text(origin.x, origin.y, text, { fontFamily: "Arial", fontSize: `${Math.max(18, this.cellSize() * .18)}px`, color, fontStyle: "bold", stroke: "#000000", strokeThickness: 4 }).setOrigin(.5).setDepth(50);
    scene.tweens.add({ targets: score, y: origin.y - this.cellSize() * .65, alpha: 0, scale: 1.15, duration: 850, ease: "Cubic.Out", onComplete: () => score.destroy() });
  }

  destroy() { this.game?.destroy(true); }
}

const renderer = new PhaserBoardRenderer(els.phaserBoard);
Object.defineProperty(window, "highHarvestFps", { configurable: true, get: () => Math.round(renderer.game?.loop?.actualFps || 0) });

let audioContext;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const rand = (max) => Math.floor(Math.random() * max);
const pick = (arr) => arr[rand(arr.length)];
const cellIndex = (row, col) => row * state.size + col;
const getCell = (row, col) => state.grid[cellIndex(row, col)];
const setCell = (row, col, value) => { state.grid[cellIndex(row, col)] = value; };
const occupied = (row, col, ignore = -1) => state.collectors.some((c, i) => i !== ignore && c.row === row && c.col === col);
const formatNumber = (value) => Math.floor(value).toLocaleString("de-DE");
const currentBet = () => BETS[state.betIndex];
const payoutMultiplier = (value) => value * PAYOUT_VALUE_SCALE;
const formatMultiplier = (value) => value.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 3 });
const wholeCredits = (value) => {
  const whole = Math.floor(value);
  return whole + (Math.random() < value - whole ? 1 : 0);
};

function sound(frequency = 420, duration = 0.07, type = "sine", volume = 0.035) {
  if (!state.sound) return;
  try {
    audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(volume, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + duration);
    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.start(); oscillator.stop(audioContext.currentTime + duration);
  } catch (_) { /* Audio is optional. */ }
}

function createSymbol(forceLeaf = false) {
  const featureChance = state.inBonus ? BONUS_FEATURE_CHANCE : BASE_FEATURE_CHANCE;
  if (!forceLeaf && Math.random() < featureChance) {
    const roll = Math.random();
    if (roll < 0.19) return { kind: "feature", feature: "upgrade", power: 1 + rand(3), fresh: true };
    if (roll < 0.25) return { kind: "feature", feature: "upgradeAll", power: 1 + rand(3), fresh: true };
    if (roll < 0.37) return { kind: "feature", feature: "coin", value: pick([1, 2, 3, 5, 10, 20]), fresh: true };
    if (roll < 0.49) return { kind: "feature", feature: "transform", fresh: true };
    if (roll < 0.59) return { kind: "feature", feature: "shuffle", fresh: true };
    if (roll < 0.69) return { kind: "feature", feature: "cloud", fresh: true };
    if (roll < 0.78) return { kind: "feature", feature: "meteor", fresh: true };
    if (roll < 0.90) return { kind: "feature", feature: "wild", fresh: true };
    return { kind: "feature", feature: "bonus", fresh: true };
  }
  return { kind: "leaf", color: rand(4), fresh: true };
}

function resetBaseProgress() {
  state.size = 6;
  state.levels = [1, 1, 1, 1];
  state.bridges = [false, false, false, false];
  state.meter = 0;
  state.meterGoal = 20;
  state.pending = 0;
  state.seeds = 0;
  state.bonusQueued = false;
  state.deferredShuffle = 0;
  state.deferredMeteor = [];
}

function createDrop() {
  state.grid = Array.from({ length: state.size * state.size }, () => createSymbol());
  state.collectors = [];
  const spots = new Set();
  while (spots.size < 4) spots.add(rand(state.size * state.size));
  [...spots].forEach((index, color) => {
    const row = Math.floor(index / state.size);
    const col = index % state.size;
    state.collectors.push({ color, row, col });
    state.grid[index] = null;
  });
  state.bridges = [false, false, false, false];
  state.moveCount = 0;
  renderBoard(buildDropPlan());
  renderCollectors(true, true);
  updateUI();
}

function leafSvg() {
  return `<svg viewBox="0 0 100 100" aria-hidden="true">
    <path class="leaf-body" d="M50 91C46 72 45 39 50 7c6 31 6 52 1 77 8-22 20-48 35-62-2 19-14 41-30 57 14-16 27-25 41-27-8 18-23 31-40 36 13-7 27-10 37-8-11 12-24 17-39 15l-3 11h-5l2-12c-14 3-29-2-41-14 12-2 26 1 38 8C29 81 13 69 4 50c16 2 30 12 41 28C30 60 20 39 18 20c15 14 27 39 32 62Z"/>
    <path class="leaf-vein" d="M49 91 50 22M50 77 27 35M50 78 73 36M47 82 18 58M53 83 83 59M46 87 20 77M53 88 79 78"/>
  </svg>`;
}

function symbolMarkup(symbol) {
  if (!symbol) return "";
  const fresh = symbol.fresh ? " new" : "";
  if (symbol.kind === "leaf") {
    const color = COLORS[symbol.color];
    return `<div class="symbol leaf-symbol${fresh}" style="--leaf:${color.hex}" title="${color.leaf}-Hanfblatt">${leafSvg()}<span class="symbol-level">${state.levels[symbol.color]}</span></div>`;
  }
  const def = FEATURE_DEFS[symbol.feature];
  const classes = [
    symbol.feature === "meteor" ? "meteor-symbol" : "",
    symbol.feature === "coin" ? "coin-symbol" : "",
    symbol.feature === "cloud" ? "cloud-symbol" : "",
  ].filter(Boolean).join(" ");
  const badge = symbol.feature === "coin"
    ? `${formatMultiplier(payoutMultiplier(symbol.value))}×`
    : symbol.feature === "upgrade"
      ? `+${symbol.power || 1}`
      : def.badge;
  return `<div class="symbol feature-symbol${classes ? ` ${classes}` : ""}${fresh}" title="${def.label}"><img src="${def.image}" alt=""><span class="feature-badge">${badge}</span></div>`;
}

function buildDropPlan(previousGrid = [], previousSize = state.size) {
  const previousPositions = new Map();
  previousGrid.forEach((symbol, index) => {
    if (symbol) previousPositions.set(symbol, { row: Math.floor(index / previousSize), col: index % previousSize });
  });
  const plan = new Map();
  const newByColumn = Array.from({ length: state.size }, () => []);
  state.grid.forEach((symbol, index) => {
    if (!symbol) return;
    const row = Math.floor(index / state.size);
    const col = index % state.size;
    const previous = previousPositions.get(symbol);
    if (previous && previous.col === col && previous.row < row) {
      plan.set(symbol, { fromRow: previous.row, isNew: false, order: 0 });
    } else if (!previous) {
      newByColumn[col].push({ symbol, row });
    }
  });
  newByColumn.forEach((entries) => {
    entries.sort((a, b) => b.row - a.row).forEach(({ symbol }, order) => {
      plan.set(symbol, { fromRow: -1 - order, isNew: true, order });
    });
  });
  return plan;
}

function renderBoard(dropPlan = null) {
  renderer.renderBoard(state.grid, state.size, state.levels, dropPlan);
  state.grid.forEach((symbol) => { if (symbol) symbol.fresh = false; });
  els.gridValue.textContent = `${state.size}×${state.size}`;
}

function renderCollectors(force = false, gravity = false) {
  renderer.syncCollectors(state.collectors, state.size, state.levels, force, gravity);
}

function renderStats() {
  if (els.collectorStats.children.length !== COLORS.length) {
    els.collectorStats.innerHTML = COLORS.map((color) => `<div class="collector-stat" style="--collector:${color.hex}"><img src="${color.thumb}" alt=""><span><b>${color.name}</b><small></small></span><i class="level-chip"></i></div>`).join("");
  }
  COLORS.forEach((color, index) => {
    const stat = els.collectorStats.children[index];
    const value = payoutMultiplier(color.values[state.levels[index] - 1]);
    stat.classList.toggle("active", state.activeCollector >= 0 && state.collectors[state.activeCollector]?.color === index);
    stat.querySelector("small").textContent = `${formatMultiplier(value)}× je Blatt`;
    stat.querySelector(".level-chip").textContent = `L${state.levels[index]}`;
  });
}

function updateUI() {
  const bet = currentBet();
  els.balanceValue.textContent = formatNumber(state.balance);
  els.betValue.textContent = formatNumber(bet);
  els.winValue.textContent = formatNumber(state.roundWin);
  els.meterText.textContent = `${state.meter} / ${state.meterGoal}`;
  els.meterFill.style.width = `${Math.min(100, state.meter / state.meterGoal * 100)}%`;
  els.pendingFeatures.innerHTML = [0,1,2].map((i) => `<i class="${i < state.pending ? "ready" : ""}"></i>`).join("");
  [...els.seedProgress.querySelectorAll(".seed")].forEach((seed, index) => seed.classList.toggle("active", index < state.seeds));
  els.freeDropsValue.textContent = state.freeDrops;
  els.bonusWinText.textContent = `Bonusgewinn ${formatNumber(state.bonusWin)}`;
  els.bonusCard.classList.toggle("active", state.inBonus || state.bonusQueued);
  els.spinButton.disabled = state.busy || (!state.inBonus && state.balance < bet);
  els.spinButton.classList.toggle("busy", state.busy);
  els.betDown.disabled = state.busy || state.inBonus;
  els.betUp.disabled = state.busy || state.inBonus;
  renderStats();
  renderCollectors();
}

function setStatus(text, busy = true) {
  els.statusText.textContent = text;
  els.statusText.parentElement.classList.toggle("busy", busy);
}

function neighbors(row, col) {
  return [[row - 1, col], [row + 1, col], [row, col - 1], [row, col + 1]].filter(([r, c]) => r >= 0 && c >= 0 && r < state.size && c < state.size);
}

function collectibleFor(symbol, collectorColor) {
  if (!symbol) return false;
  if (symbol.kind === "leaf") return symbol.color === collectorColor;
  return true;
}

function featurePriority(symbol) {
  if (!symbol) return 0;
  if (symbol.kind === "leaf") return 15;
  return { bonus: 100, meteor: 92, upgradeAll: 88, upgrade: 82, transform: 74, wild: 68, coin: 62, shuffle: 54, cloud: 50 }[symbol.feature] || 20;
}

function findMove(collectorIndex) {
  const collector = state.collectors[collectorIndex];
  const direct = neighbors(collector.row, collector.col)
    .filter(([r, c]) => !occupied(r, c, collectorIndex) && collectibleFor(getCell(r, c), collector.color))
    .map(([r, c]) => ({ r, c, jump: false, score: featurePriority(getCell(r, c)) + Math.random() * 8 }));
  if (direct.length) return direct.sort((a, b) => b.score - a.score)[0];
  if (!state.bridges[collector.color]) return null;
  const jumps = [];
  for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
    for (let distance = 2; distance <= 3; distance++) {
      const r = collector.row + dr * distance, c = collector.col + dc * distance;
      if (r < 0 || c < 0 || r >= state.size || c >= state.size) break;
      const between = Array.from({ length: distance - 1 }, (_, i) => getCell(collector.row + dr * (i + 1), collector.col + dc * (i + 1)));
      if (between.some(Boolean)) break;
      if (!occupied(r, c, collectorIndex) && collectibleFor(getCell(r, c), collector.color)) {
        jumps.push({ r, c, jump: true, score: featurePriority(getCell(r, c)) + Math.random() * 8 });
      }
    }
  }
  return jumps.sort((a, b) => b.score - a.score)[0] || null;
}

function collectorOrder() {
  return state.collectors.map((collector, index) => ({ index, value: COLORS[collector.color].values[state.levels[collector.color] - 1] }))
    .sort((a, b) => b.value - a.value || Math.random() - .5).map((entry) => entry.index);
}

async function moveCollector(index, move) {
  const collector = state.collectors[index];
  const symbol = getCell(move.r, move.c);
  const old = { row: collector.row, col: collector.col };
  state.activeCollector = index;
  if (move.jump) state.bridges[collector.color] = false;
  collector.row = move.r; collector.col = move.c;
  setCell(move.r, move.c, null);
  renderer.removeSymbol(move.r, move.c);
  renderStats();
  sound(350 + collector.color * 95 + state.levels[collector.color] * 18, .08, "triangle", .025);
  await renderer.previewPath(index, move.r, move.c, COLORS[collector.color].hex, move.jump);
  await renderer.moveCollector(index, move.r, move.c, move.jump);
  burstAt(move.r, move.c, COLORS[collector.color].hex, 7);
  await resolveSymbol(symbol, collector, { old, row: move.r, col: move.c });
  state.moveCount++;
}

async function resolveSymbol(symbol, collector, position) {
  if (!symbol) return;
  if (symbol.kind === "leaf") {
    const mult = COLORS[symbol.color].values[state.levels[symbol.color] - 1];
    const amount = currentBet() * payoutMultiplier(mult);
    award(amount, position.row, position.col, COLORS[symbol.color].hex);
    addMeter(1);
    return;
  }
  const feature = symbol.feature;
  setStatus(FEATURE_DEFS[feature].label, true);
  sound(feature === "meteor" ? 90 : 620, feature === "meteor" ? .35 : .12, feature === "meteor" ? "sawtooth" : "sine", .045);
  if (feature === "upgrade" || feature === "upgradeAll") {
    const targets = feature === "upgradeAll" ? [0,1,2,3] : [collector.color];
    targets.forEach((target) => { state.levels[target] = Math.min(7, state.levels[target] + (symbol.power || 1)); });
    showBanner(feature === "upgradeAll" ? `ALL CREW +${symbol.power}` : `${COLORS[collector.color].leaf.toUpperCase()} +${symbol.power}`);
    updateUI(); await sleep(420);
  } else if (feature === "wild") {
    const amount = currentBet() * payoutMultiplier(COLORS[collector.color].values[state.levels[collector.color] - 1]);
    award(amount, position.row, position.col, "#ffd76b"); addMeter(1);
  } else if (feature === "coin") {
    award(currentBet() * payoutMultiplier(symbol.value), position.row, position.col, "#b5ff76");
  } else if (feature === "bonus") {
    state.seeds++;
    if (state.seeds >= 3) { state.seeds -= 3; state.bonusQueued = true; showBanner("5 FREE DROPS"); }
    updateUI(); await sleep(320);
  } else if (feature === "cloud") {
    state.bridges[collector.color] = true; showBanner("VAPE BRIDGE"); await sleep(300);
  } else if (feature === "transform") {
    await transformLeaves(collector.color, position.row, position.col);
  } else if (feature === "shuffle") {
    state.deferredShuffle++;
    showBanner("PUFF PASS GELADEN");
    await sleep(260);
  } else if (feature === "meteor") {
    state.deferredMeteor.push({ row: position.row, col: position.col });
    showBanner("GROW BURST GELADEN");
    await sleep(300);
  }
}

function addMeter(amount) {
  state.meter += amount;
  while (state.meter >= state.meterGoal && state.pending < 3) {
    state.meter -= state.meterGoal;
    state.pending++;
    sound(880, .16, "sine", .05);
    showBanner("FEATURE GELADEN");
  }
  updateUI();
}

function award(amount, row, col, color) {
  const credits = wholeCredits(amount);
  state.roundWin += credits;
  if (state.inBonus) state.bonusWin += credits;
  if (credits > 0) floatScore(row, col, `+${formatNumber(credits)}`, color);
  updateUI();
}

async function transformLeaves(color, row, col) {
  const candidates = [];
  for (let r = 0; r < state.size; r++) for (let c = 0; c < state.size; c++) {
    const symbol = getCell(r, c);
    const distance = Math.abs(r - row) + Math.abs(c - col);
    if (symbol?.kind === "leaf" && symbol.color !== color && distance <= 3) candidates.push([r, c]);
  }
  candidates.sort(() => Math.random() - .5).slice(0, 4 + rand(5)).forEach(([r, c]) => {
    setCell(r, c, { kind: "leaf", color, fresh: true }); burstAt(r, c, COLORS[color].hex, 3);
  });
  renderBoard(); showBanner("HOTBOX"); await sleep(520);
}

async function shuffleCollectors() {
  const oldSpots = state.collectors.map((collector) => cellIndex(collector.row, collector.col));
  oldSpots.forEach((index) => { state.grid[index] = createSymbol(true); });
  const candidates = state.grid.map((symbol, index) => ({ symbol, index }))
    .filter(({ symbol }) => symbol?.kind === "leaf")
    .map(({ index }) => index)
    .sort(() => Math.random() - .5);
  state.collectors.forEach((collector, collectorIndex) => {
    const index = candidates[collectorIndex];
    collector.row = Math.floor(index / state.size); collector.col = index % state.size;
    state.grid[index] = null;
  });
  renderBoard(); renderCollectors(); showBanner("PUFF PUFF PASS"); await sleep(600);
}

async function growBurst(originRow, originCol) {
  els.boardFrame.classList.remove("shake"); void els.boardFrame.offsetWidth; els.boardFrame.classList.add("shake");
  const oldSize = state.size;
  const remove = [];
  for (let r = 0; r < oldSize; r++) for (let c = 0; c < oldSize; c++) {
    if (Math.abs(r - originRow) + Math.abs(c - originCol) <= 2 && getCell(r, c)?.kind === "leaf") remove.push([r,c]);
  }
  remove.forEach(([r,c]) => { setCell(r,c,null); burstAt(r,c,"#f9d85b",6); });
  renderBoard(); await sleep(420);
  if (state.size < 8) await expandGrid(state.size + 1);
  await shuffleCollectors();
  showBanner(`GRID ${state.size}×${state.size}`);
  state.meterGoal = 20 + (state.size - 6) * 8;
  updateUI(); await sleep(450);
}

async function expandGrid(newSize) {
  const oldSize = state.size;
  const oldGrid = [...state.grid];
  state.size = newSize;
  state.grid = Array.from({ length: newSize * newSize }, () => createSymbol());
  for (let r = 0; r < oldSize; r++) for (let c = 0; c < oldSize; c++) state.grid[r * newSize + c] = oldGrid[r * oldSize + c];
  renderBoard(buildDropPlan(oldGrid, oldSize)); renderCollectors();
  await renderer.waitForGravity();
}

async function releasePendingFeatures() {
  if (!state.pending) return false;
  const count = state.pending;
  state.pending = 0;
  setStatus(`${count} Feature-Release${count > 1 ? "s" : ""}!`);
  showBanner(`${count}× FEATURE RELEASE`);
  const candidates = [];
  state.grid.forEach((symbol, index) => { if (symbol?.kind === "leaf") candidates.push(index); });
  candidates.sort(() => Math.random() - .5);
  const releaseCount = Math.min(candidates.length, count * 3);
  const pool = ["upgrade", "coin", "transform", "cloud", "wild", "bonus", "meteor"];
  for (let i = 0; i < releaseCount; i++) {
    const feature = pick(pool);
    state.grid[candidates[i]] = feature === "upgrade"
      ? { kind: "feature", feature, power: 1 + rand(3), fresh: true }
      : feature === "coin" ? { kind: "feature", feature, value: pick([2,3,5,10]), fresh: true }
      : { kind: "feature", feature, fresh: true };
  }
  renderBoard(); updateUI(); sound(760, .25, "sine", .05); await sleep(700);
  return true;
}

async function resolveDeferredFeatures() {
  if (!state.deferredShuffle && !state.deferredMeteor.length) return false;
  if (state.deferredShuffle) {
    state.deferredShuffle = 0;
    await shuffleCollectors();
  }
  while (state.deferredMeteor.length) {
    const impact = state.deferredMeteor.shift();
    await growBurst(
      Math.min(impact.row, state.size - 1),
      Math.min(impact.col, state.size - 1),
    );
  }
  return true;
}

async function applyGravityAndRefill() {
  setStatus("Neue Blätter fallen …");
  const previousGrid = [...state.grid];
  const previousSize = state.size;
  for (let col = 0; col < state.size; col++) {
    const collectorRows = new Set(state.collectors.filter((c) => c.col === col).map((c) => c.row));
    let symbols = [];
    for (let row = 0; row < state.size; row++) if (!collectorRows.has(row) && getCell(row, col)) symbols.push(getCell(row, col));
    for (let row = state.size - 1; row >= 0; row--) {
      if (collectorRows.has(row)) { setCell(row, col, null); continue; }
      const symbol = symbols.pop() || createSymbol();
      setCell(row, col, symbol);
    }
  }
  renderBoard(buildDropPlan(previousGrid, previousSize)); sound(210, .08, "triangle", .025); await renderer.waitForGravity();
}

async function processCollections() {
  let anyCollected = false;
  for (const index of collectorOrder()) {
    let move = findMove(index);
    while (move && state.moveCount < state.maxMoves) {
      anyCollected = true;
      await moveCollector(index, move);
      move = findMove(index);
    }
  }
  state.activeCollector = -1; updateUI();
  return anyCollected;
}

async function playRound() {
  let cascade = 0;
  while (cascade < 18 && state.moveCount < state.maxMoves) {
    const collected = await processCollections();
    if (collected) {
      await applyGravityAndRefill();
      cascade++;
      continue;
    }
    if (await releasePendingFeatures()) { cascade++; continue; }
    if (await resolveDeferredFeatures()) { cascade++; continue; }
    break;
  }
  if (state.moveCount >= state.maxMoves) setStatus("Ernteschicht beendet – die Crew braucht Snacks.", false);
  await finishRound();
}

async function finishRound() {
  state.activeCollector = -1;
  if (state.inBonus) {
    state.freeDrops--;
    updateUI();
    if (state.bonusQueued) {
      state.freeDrops += 5; state.bonusQueued = false; showBanner("+5 FREE DROPS"); updateUI(); await sleep(1300);
    }
    if (state.freeDrops > 0) {
      setStatus(`Free Drop ${state.freeDrops} startet …`, true); await sleep(900); createDrop(); await renderer.waitForGravity(); return playRound();
    }
    const payout = state.bonusWin;
    state.balance += payout;
    showBanner(`BONUS +${formatNumber(payout)}`); setStatus("Bonus beendet. Fett geerntet.", false);
    state.inBonus = false; state.bonusWin = 0; state.roundWin = 0; state.busy = false; updateUI(); return;
  }
  if (state.bonusQueued) {
    state.inBonus = true; state.bonusQueued = false; state.freeDrops = 5; state.bonusWin = state.roundWin;
    showBanner("BONUS: 5 FREE DROPS"); setStatus("Grid, Level und Meter bleiben kleben.", true); updateUI();
    await sleep(1500); createDrop(); await renderer.waitForGravity();
    if (state.pending) await releasePendingFeatures();
    return playRound();
  }
  state.balance += state.roundWin;
  setStatus(state.roundWin ? `Runde zahlt ${formatNumber(state.roundWin)} Brokkoli.` : "Die Crew findet diesmal nur Krümel.", false);
  state.busy = false; updateUI();
}

async function startSpin() {
  if (state.busy || state.inBonus || state.balance < currentBet()) return;
  state.busy = true;
  state.balance -= currentBet();
  state.roundWin = 0;
  resetBaseProgress();
  setStatus("Die Crew fällt ein …", true);
  createDrop();
  sound(180, .12, "sawtooth", .035);
  await renderer.waitForGravity();
  await sleep(120);
  await playRound();
}

function burstAt(row, col, color, count = 6) {
  renderer.burstAt(row, col, color, count);
}

function floatScore(row, col, text, color) {
  renderer.floatScore(row, col, text, color);
}

function showBanner(text) {
  els.roundBanner.innerHTML = `<span>${text}</span>`;
  els.roundBanner.classList.remove("show"); void els.roundBanner.offsetWidth; els.roundBanner.classList.add("show");
}

function changeBet(direction) {
  if (state.busy || state.inBonus) return;
  state.betIndex = Math.max(0, Math.min(BETS.length - 1, state.betIndex + direction)); updateUI(); sound(320 + state.betIndex * 90, .05);
}

els.spinButton.addEventListener("click", startSpin);
els.betDown.addEventListener("click", () => changeBet(-1));
els.betUp.addEventListener("click", () => changeBet(1));
els.helpButton.addEventListener("click", () => els.helpDialog.showModal());
els.closeHelp.addEventListener("click", () => els.helpDialog.close());
els.helpDialog.addEventListener("click", (event) => { if (event.target === els.helpDialog) els.helpDialog.close(); });
els.soundButton.addEventListener("click", () => { state.sound = !state.sound; els.soundButton.classList.toggle("off", !state.sound); });
const handleKeydown = (event) => {
  if (event.code === "Space" && !els.helpDialog.open) { event.preventDefault(); startSpin(); }
  if (event.code === "Escape" && els.helpDialog.open) els.helpDialog.close();
};
window.addEventListener("keydown", handleKeydown);

renderer.ready.then(() => {
  resetBaseProgress();
  createDrop();
  state.grid = state.grid.map((symbol) => symbol?.kind === "feature" ? createSymbol(true) : symbol);
  renderBoard(buildDropPlan());
  renderCollectors(true, true);
  updateUI();
  setStatus("Bereit für die Ernte.", false);
});

window.highHarvestCleanup = () => {
  window.removeEventListener("keydown", handleKeydown);
  renderer.destroy();
  delete window.highHarvestFps;
  delete window.highHarvestCleanup;
};

})();
