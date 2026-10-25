// src/engine.ts — Terraria-like sandbox engine.
// Physics, mining/building, crafting, enemies, boss, day/night, lighting, quests, rendering.

import {
  AIR, STONE, WOOD, LEAVES, COPPER, IRON, TORCH, WORKBENCH, FURNACE, PORTAL,
  TILE, TILES, isSolid, ITEMS, RECIPES, generateWorld, getTile, setTile,
  type World, type Recipe,
} from "./world";
import { audio } from "./audio";
import { tileTexture, wallTexture, TEX } from "./pixart";
import { initSprites, getSprite } from "./sprites";
import skyUrl from "./assets/bg_sky.jpg";

const REACH = 5; // tiles
const GRAVITY = 1500;
const JUMP_V = 540;
const MOVE_SPEED = 175;
const DAY_LEN = 120; // seconds full cycle
const HOTBAR = 10;
const INV_SIZE = 30;
const SAVE_KEY_PREFIX = "terralite_save_v1_";
const WORLD_LIST_KEY = "terralite_worlds";

function u8ToB64(arr: Uint8Array): string {
  let s = "";
  const chunk = 0x8000;
  for (let i = 0; i < arr.length; i += chunk) {
    s += String.fromCharCode.apply(null, arr.subarray(i, i + chunk) as unknown as number[]);
  }
  return btoa(s);
}
function b64ToU8(b64: string): Uint8Array {
  const s = atob(b64);
  const arr = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) arr[i] = s.charCodeAt(i);
  return arr;
}

export interface Slot {
  id: string;
  count: number;
}
export interface EngineState {
  hp: number;
  maxHp: number;
  defense: number;
  selected: number;
  dayFrac: number;
  isNight: boolean;
  dayCount: number;
  questTitle: string;
  questText: string;
  questDone: boolean;
  questIndex: number;
  banner: { title: string; sub: string; key: number } | null;
  boss: { name: string; hp: number; maxHp: number } | null;
  mineProgress: number;
  inventory: (Slot | null)[];
  stations: { workbench: boolean; furnace: boolean };
  craftable: string[];
  depth: number;
  nearPortal: boolean;
  savedAt: number;
  playerTX: number;
  playerTY: number;
}
export interface EngineCallbacks {
  onState: (s: EngineState) => void;
  onGameOver: () => void;
  onVictory: () => void;
}

interface Enemy {
  type: "slime" | "zombie" | "bat" | "king";
  x: number; y: number; vx: number; vy: number;
  w: number; h: number; hp: number; maxHp: number;
  facing: number; onGround: boolean; hopT: number; hitFlash: number; t: number;
  spawnT: number; knock: number; swoopT: number;
}
interface Particle { x: number; y: number; vx: number; vy: number; life: number; max: number; size: number; color: string; grav: number; }
interface FloatText { x: number; y: number; vy: number; life: number; text: string; color: string; }

interface QuestDef { title: string; text: string; done: string; reward: string; }

const QUESTS: QuestDef[] = [
  { title: "I — A New World", text: "Chop trees and gather 12 Wood", done: "You feel the spark of survival.", reward: "+1 Torch" },
  { title: "II — Sharper Tools", text: "Craft a Wooden Pickaxe (needs Workbench)", done: "Now you can dig into stone.", reward: "Unlocked mining" },
  { title: "III — Rock Bottom", text: "Mine 20 Stone", done: "A solid foundation for a base.", reward: "+10 Max HP" },
  { title: "IV — Make Camp", text: "Place a Workbench", done: "A home begins to take shape.", reward: "Crafting unlocked" },
  { title: "V — Light the Dark", text: "Craft a Torch (Wood + Coal)", done: "The shadows retreat a little.", reward: "+10 Max HP" },
  { title: "VI — Buried Treasure", text: "Mine 8 Copper Ore", done: "Glimmers of a richer age.", reward: "+1 Wood Sword" },
  { title: "VII — The Forge", text: "Build a Furnace & smelt 3 Copper Bars", done: "Fire returns to the land.", reward: "+20 Max HP" },
  { title: "VIII — Iron Will", text: "Mine Iron Ore & craft an Iron Pickaxe", done: "The deep yields its secret.", reward: "Unlocked deep mining" },
  { title: "IX — Armed & Ready", text: "Craft an Iron Sword", done: "You are ready to face the night.", reward: "+20 Max HP" },
  { title: "X — The Slime Crown", text: "Craft a Slime Crown", done: "It pulses with the King's hunger.", reward: "Boss summon ready" },
  { title: "XI — King of Slimes", text: "Use the Crown at night & slay the King", done: "The realm is yours!", reward: "VICTORY" },
];

export class Engine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private cb: EngineCallbacks;
  private world!: World;
  private dpr = 1;

  private raf = 0;
  private last = 0;
  private running = false;
  private paused = false;
  private uiOpen = false;

  // camera
  private camX = 0;
  private camY = 0;
  private viewW = 800;
  private viewH = 600;

  // input
  private keys: Record<string, boolean> = {};
  private mouseDown = false;
  private rightDown = false;
  private mouseTX = 0;
  private mouseTY = 0;
  private mouseWX = 0;
  private mouseWY = 0;
  private placeCd = 0;

  // player
  private px = 0;
  private py = 0;
  private pvx = 0;
  private pvy = 0;
  private pface = 1;
  private onGround = false;
  private hp = 100;
  private maxHp = 100;
  private defense = 0;
  private invuln = 0;
  private regenT = 0;
  private hurtT = 0;
  private selected = 0;
  private inv: (Slot | null)[] = new Array(INV_SIZE).fill(null);
  private swingT = 0;
  private attackCd = 0;
  private walkT = 0;

  // mining
  private mineTX = -1;
  private mineTY = -1;
  private mineProg = 0;
  private mineSfxT = 0;

  // fall damage
  private fallDistance = 0;

  // screen shake
  private shakeX = 0;
  private shakeY = 0;

  // entities
  private enemies: Enemy[] = [];
  private particles: Particle[] = [];
  private floats: FloatText[] = [];

  // world state
  private dayFrac = 0.18;
  private dayCount = 1;
  private workbenchCount = 0;
  private furnaceCount = 0;
  private kingDefeated = false;
  private spawnT = 0;
  private moteTimer = 0;
  private gameover = false;
  private victory = false;

  // multi-world portals
  private currentWorldId = 0;

  // quests
  private questIndex = 0;
  private stoneMined = 0;
  private copperMined = 0;
  private ironMined = 0;
  private banner: { title: string; sub: string; key: number } | null = null;
  private bannerT = 0;

  private stateT = 0;
  private frame = 0;

  // autosave
  private saveTimer = 5;
  private saveCounter = 0;
  // fps overlay
  private showFps = false;
  private fps = 0;
  private fpsFrames = 0;
  private fpsTimer = 0;

  // pre-rendered glow sprite (cached for performance)
  private glowSprite: HTMLCanvasElement | null = null;

  // painted sky backdrop (loaded async)
  private skyImg: HTMLCanvasElement | null = null;

  // light buffer for smooth Terraria-style lighting
  private lightBuf: HTMLCanvasElement | null = null;
  private lightImg: ImageData | null = null;
  private lightW = 0;
  private lightH = 0;
  private lightGrid: Float32Array | null = null;
  private lightTmp: Float32Array | null = null;

  constructor(canvas: HTMLCanvasElement, cb: EngineCallbacks) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: false })!;
    this.cb = cb;
  }

  start(mode: "new" | "auto" = "auto", worldId?: number) {
    if (worldId !== undefined) this.currentWorldId = worldId;
    if (mode === "new") this.clearSave();
    const loaded = mode === "auto" ? this.loadGame() : null;
    if (loaded) {
      this.applySave(loaded);
      if (this.currentWorldId > 0) {
        // Regenerate world with seed = worldId when loading a portal world
        this.world = generateWorld(this.currentWorldId);
        // clear a small pocket so the player doesn't get stuck in a tree
        const sx = this.world.spawnX;
        const surf = this.world.surfaceY[sx];
        for (let dx = -2; dx <= 2; dx++) {
          for (let dy = 12; dy >= 1; dy--) {
            const t = getTile(this.world, sx + dx, surf - dy);
            if (t === WOOD || t === LEAVES) setTile(this.world, sx + dx, surf - dy, AIR);
          }
        }
        this.px = this.world.spawnX * TILE;
        this.py = this.world.spawnY * TILE;
      }
    } else {
      this.world = generateWorld();
      this.resetProgress();
      // clear a small pocket so the player never spawns stuck in a tree
      const sx = this.world.spawnX;
      const surf = this.world.surfaceY[sx];
      for (let dx = -2; dx <= 2; dx++) {
        for (let dy = 12; dy >= 1; dy--) {
          const t = getTile(this.world, sx + dx, surf - dy);
          if (t === WOOD || t === LEAVES) setTile(this.world, sx + dx, surf - dy, AIR);
        }
      }
      this.px = this.world.spawnX * TILE;
      this.py = this.world.spawnY * TILE;
    }
    this.camX = this.px - 400;
    this.camY = this.py - 300;
    this.attach();
    this.resize();
    this.buildGlowSprite();
    initSprites();
    // load painted sky backdrop
    const im = new Image();
    im.onload = () => {
      const cv = document.createElement("canvas");
      cv.width = im.naturalWidth || im.width;
      cv.height = im.naturalHeight || im.height;
      cv.getContext("2d")!.drawImage(im, 0, 0);
      this.skyImg = cv;
    };
    im.src = skyUrl;
    audio.setTrack("day");
    this.running = true;
    this.last = performance.now();
    this.showBanner(loaded ? "Welcome back" : QUESTS[0].title, loaded ? `Day ${this.dayCount} · auto-saved` : "Welcome, survivor");
    this.raf = requestAnimationFrame((t) => this.loop(t));
  }

  destroy() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.detach();
  }

  setUiOpen(b: boolean) {
    this.uiOpen = b;
    if (b) this.keys = {};
  }
  setPaused(b: boolean) {
    this.paused = b;
    if (b) {
      this.keys = {};
      this.mouseDown = false;
      this.rightDown = false;
    }
  }
  selectSlot(i: number) {
    if (i >= 0 && i < HOTBAR) this.selected = i;
  }
  // ---------- touch controls ----------
  private placeMode = false;
  private jumpBuffer = 0; // makes taps reliably trigger a jump
  private jumpHeld = false;
  private flying = false; // cheat: free flight
  private godMode = false; // cheat: invincible
  setMoveLeft(p: boolean) { this.keys["KeyA"] = p; }
  setMoveRight(p: boolean) { this.keys["KeyD"] = p; }
  jumpNow() {
    // Immediate jump for touch controls. This avoids relying on "held" state
    // and makes a short tap behave like a real mobile-game jump button.
    if (this.flying) {
      this.keys["Space"] = true;
      return;
    }
    if (this.onGround) {
      this.pvy = -JUMP_V;
      this.onGround = false;
      this.jumpBuffer = 0;
      audio.playSfx("jump");
    } else {
      this.jumpBuffer = 0.18;
    }
  }
  setJump(p: boolean) {
    // rising edge -> jump immediately; release only stops flight ascend key.
    if (p && !this.jumpHeld) this.jumpNow();
    this.jumpHeld = p;
    this.keys["Space"] = p;
  }
  togglePlaceMode(): boolean {
    this.placeMode = !this.placeMode;
    audio.playSfx("click");
    return this.placeMode;
  }
  getPlaceMode(): boolean { return this.placeMode; }

  // ---------- public API for UI ----------
  getWorldForMinimap(): { w: number; h: number; tiles: Uint8Array } | null {
    return this.world ? { w: this.world.w, h: this.world.h, tiles: this.world.tiles } : null;
  }
  getPlayerTileX(): number { return Math.floor(this.px / TILE); }
  getPlayerTileY(): number { return Math.floor(this.py / TILE); }
  saveGameNow() { this.saveGame(); }

  // ---------- cheat / god menu ----------
  toggleFly(): boolean { this.flying = !this.flying; return this.flying; }
  toggleGod(): boolean { this.godMode = !this.godMode; return this.godMode; }
  getFly(): boolean { return this.flying; }
  getGod(): boolean { return this.godMode; }
  healFull() { this.hp = this.maxHp; }
  giveItem(id: string, n: number) { this.addItem(id, n); this.pushState(); this.saveGame(); }
  setDay() { this.dayFrac = 0.0; }
  setNight() { this.dayFrac = 0.5; }
  nextOreTier(): void {
    // give a full set of the best tools + materials
    ["wood", "stone", "coal", "copper_ore", "iron_ore", "gold_ore", "diamond", "copper_bar", "iron_bar", "gold_bar"].forEach((id) => this.addItem(id, 30));
    ["iron_pickaxe", "iron_sword", "gold_sword", "torch", "crown"].forEach((id) => this.addItem(id, 1));
    this.pushState();
    this.saveGame();
  }
  setSelectedByDelta(d: number) {
    let s = (this.selected + d) % HOTBAR;
    if (s < 0) s += HOTBAR;
    this.selected = s;
  }

  /** Move/swap two inventory slots (called from the inventory UI). */
  swapSlots(a: number, b: number) {
    if (a < 0 || b < 0 || a >= INV_SIZE || b >= INV_SIZE || a === b) return;
    const sa = this.inv[a];
    const sb = this.inv[b];
    if (sa && sb && sa.id === sb.id) {
      // merge stacks
      const max = ITEMS[sa.id]?.max ?? 99;
      const move = Math.min(max - sb.count, sa.count);
      if (move > 0) {
        sb.count += move;
        sa.count -= move;
        if (sa.count <= 0) this.inv[a] = null;
      }
    } else {
      this.inv[a] = sb;
      this.inv[b] = sa;
    }
    audio.playSfx("click");
    this.pushState();
    this.saveGame();
  }

  private saveKey(): string { return SAVE_KEY_PREFIX + this.currentWorldId; }

  // ---------- multi-world management ----------
  static getWorldList(): { id: number; name: string }[] {
    try {
      const raw = localStorage.getItem(WORLD_LIST_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        // migrate old number[] format
        if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === "number") {
          const migrated: { id: number; name: string }[] = parsed.map((id: number, i: number) => ({ id, name: `World ${i + 1}` }));
          Engine.saveWorldList(migrated);
          return migrated;
        }
        return parsed;
      }
    } catch { /* ignore */ }
    // migrate old single save
    try {
      const old = localStorage.getItem("terralite_save_v1");
      if (old) {
        const list = [{ id: 0, name: "World 1" }];
        localStorage.setItem(WORLD_LIST_KEY, JSON.stringify(list));
        localStorage.setItem(SAVE_KEY_PREFIX + "0", old);
        localStorage.removeItem("terralite_save_v1");
        return list;
      }
    } catch { /* ignore */ }
    return [];
  }

  static saveWorldList(list: { id: number; name: string }[]) {
    try {
      localStorage.setItem(WORLD_LIST_KEY, JSON.stringify(list));
    } catch { /* ignore */ }
  }

  static createNewWorld(name: string): number {
    const list = Engine.getWorldList();
    const nextId = list.length > 0 ? Math.max(...list.map((w) => w.id)) + 1 : 0;
    list.push({ id: nextId, name });
    Engine.saveWorldList(list);
    return nextId;
  }

  static deleteWorld(id: number) {
    let list = Engine.getWorldList();
    list = list.filter((w) => w.id !== id);
    Engine.saveWorldList(list);
    try {
      localStorage.removeItem(SAVE_KEY_PREFIX + id);
    } catch { /* ignore */ }
  }

  static renameWorld(id: number, name: string) {
    const list = Engine.getWorldList();
    const w = list.find((w) => w.id === id);
    if (w) { w.name = name; Engine.saveWorldList(list); }
  }

  static hasSave(): boolean {
    try {
      const list = Engine.getWorldList();
      return list.length > 0 && list.some((w) => {
        try { return localStorage.getItem(SAVE_KEY_PREFIX + w.id) !== null; }
        catch { return false; }
      });
    } catch {
      return false;
    }
  }

  static hasSaveForWorld(id: number): boolean {
    try {
      return localStorage.getItem(SAVE_KEY_PREFIX + id) !== null;
    } catch {
      return false;
    }
  }

  /** Start with a specific world (loads or creates). */
  startWithWorld(worldId: number) {
    this.currentWorldId = worldId;
    const loaded = this.loadGame();
    if (loaded) {
      this.applySave(loaded);
      if (this.currentWorldId > 0) {
        this.world = generateWorld(this.currentWorldId);
        const sx = this.world.spawnX;
        const surf = this.world.surfaceY[sx];
        for (let dx = -2; dx <= 2; dx++) {
          for (let dy = 12; dy >= 1; dy--) {
            const t = getTile(this.world, sx + dx, surf - dy);
            if (t === WOOD || t === LEAVES) setTile(this.world, sx + dx, surf - dy, AIR);
          }
        }
        this.px = this.world.spawnX * TILE;
        this.py = this.world.spawnY * TILE;
      }
    } else {
      this.world = generateWorld(worldId);
      this.resetProgress();
      this.currentWorldId = worldId;
      const sx = this.world.spawnX;
      const surf = this.world.surfaceY[sx];
      for (let dx = -2; dx <= 2; dx++) {
        for (let dy = 12; dy >= 1; dy--) {
          const t = getTile(this.world, sx + dx, surf - dy);
          if (t === WOOD || t === LEAVES) setTile(this.world, sx + dx, surf - dy, AIR);
        }
      }
      this.px = this.world.spawnX * TILE;
      this.py = this.world.spawnY * TILE;
    }
    this.camX = this.px - 400;
    this.camY = this.py - 300;
    this.attach();
    this.resize();
    this.buildGlowSprite();
    initSprites();
    const im = new Image();
    im.onload = () => {
      const cv = document.createElement("canvas");
      cv.width = im.naturalWidth || im.width;
      cv.height = im.naturalHeight || im.height;
      cv.getContext("2d")!.drawImage(im, 0, 0);
      this.skyImg = cv;
    };
    im.src = skyUrl;
    audio.setTrack("day");
    this.running = true;
    this.last = performance.now();
    this.showBanner(loaded ? "Welcome back" : QUESTS[0].title, loaded ? `Day ${this.dayCount} · auto-saved` : "Welcome, survivor");
    this.raf = requestAnimationFrame((t) => this.loop(t));
  }

  /** Resume free-play in the current world after the victory cinematic ends. */
  resumeAfterVictory() {
    this.victory = false;
    this.gameover = false;
    this.hp = Math.max(this.hp, this.maxHp);
    this.last = performance.now();
  }

  private resetProgress() {
    this.hp = 100;
    this.maxHp = 100;
    this.defense = 0;
    this.selected = 0;
    this.inv = new Array(INV_SIZE).fill(null);
    this.dayFrac = 0.18;
    this.dayCount = 1;
    this.workbenchCount = 0;
    this.furnaceCount = 0;
    this.kingDefeated = false;
    this.questIndex = 0;
    this.stoneMined = 0;
    this.copperMined = 0;
    this.ironMined = 0;
    this.gameover = false;
    this.victory = false;
    this.pvx = 0;
    this.pvy = 0;
    this.pface = 1;
    this.currentWorldId = 0;
    this.fallDistance = 0;
    this.shakeX = 0;
    this.shakeY = 0;
  }

  private saveGame() {
    if (!this.world) return;
    this.saveCounter = (this.saveCounter + 1) % 100000;
    try {
      const data = {
        v: 2,
        tiles: u8ToB64(this.world.tiles),
        surfaceY: Array.from(this.world.surfaceY),
        w: this.world.w,
        h: this.world.h,
        spawnX: this.world.spawnX,
        spawnY: this.world.spawnY,
        px: this.px,
        py: this.py,
        pface: this.pface,
        hp: this.hp,
        maxHp: this.maxHp,
        selected: this.selected,
        inv: this.inv.map((s) => (s ? { id: s.id, count: s.count } : null)),
        dayFrac: this.dayFrac,
        dayCount: this.dayCount,
        workbenchCount: this.workbenchCount,
        furnaceCount: this.furnaceCount,
        kingDefeated: this.kingDefeated,
        victory: this.victory,
        questIndex: this.questIndex,
        stoneMined: this.stoneMined,
        copperMined: this.copperMined,
        ironMined: this.ironMined,
        currentWorldId: this.currentWorldId,
      };
      localStorage.setItem(this.saveKey(), JSON.stringify(data));
      console.log("Saving world", this.currentWorldId, "questIndex:", this.questIndex, "victory:", this.victory);
    } catch {
      /* storage full / unavailable — ignore */
    }
  }

  private loadGame(): any | null {
    try {
      const raw = localStorage.getItem(this.saveKey());
      if (!raw) return null;
      const d = JSON.parse(raw);
      if (!d || !d.tiles || !d.surfaceY) return null;
      return d;
    } catch {
      return null;
    }
  }

  private applySave(d: any) {
    const tiles = b64ToU8(d.tiles);
    const surfaceY = Int16Array.from(d.surfaceY);
    this.world = { w: d.w, h: d.h, tiles, surfaceY, spawnX: d.spawnX, spawnY: d.spawnY };
    this.px = d.px;
    this.py = d.py;
    this.pface = d.pface ?? 1;
    this.pvx = 0;
    this.pvy = 0;
    this.hp = d.hp;
    this.maxHp = d.maxHp;
    this.selected = d.selected ?? 0;
    this.inv = (d.inv as (Slot | null)[]).map((s) => (s && s.id ? { id: s.id, count: s.count } : null));
    while (this.inv.length < INV_SIZE) this.inv.push(null);
    this.dayFrac = d.dayFrac ?? 0.18;
    this.dayCount = d.dayCount ?? 1;
    this.workbenchCount = d.workbenchCount ?? 0;
    this.furnaceCount = d.furnaceCount ?? 0;
    this.kingDefeated = !!d.kingDefeated;
    this.questIndex = d.questIndex ?? 0;
    this.stoneMined = d.stoneMined ?? 0;
    this.copperMined = d.copperMined ?? 0;
    this.ironMined = d.ironMined ?? 0;
    this.currentWorldId = d.currentWorldId ?? 0;
    this.gameover = false;
    this.victory = d.victory ?? false;
    console.log("Loaded world", this.currentWorldId, "questIndex:", this.questIndex, "victory:", this.victory);
    this.fallDistance = 0;
    this.shakeX = 0;
    this.shakeY = 0;
  }

  private clearSave() {
    try {
      localStorage.removeItem(this.saveKey());
    } catch {
      /* ignore */
    }
  }

  // ---------- inventory ----------
  private count(id: string): number {
    let n = 0;
    for (const s of this.inv) if (s && s.id === id) n += s.count;
    return n;
  }
  private addItem(id: string, count: number): number {
    const max = ITEMS[id]?.max ?? 99;
    // stack into existing
    for (const s of this.inv) {
      if (count <= 0) break;
      if (s && s.id === id && s.count < max) {
        const add = Math.min(max - s.count, count);
        s.count += add;
        count -= add;
      }
    }
    for (let i = 0; i < this.inv.length; i++) {
      if (count <= 0) break;
      if (!this.inv[i]) {
        const add = Math.min(max, count);
        this.inv[i] = { id, count: add };
        count -= add;
      }
    }
    return count;
  }
  private removeItem(id: string, n: number): boolean {
    if (this.count(id) < n) return false;
    for (let i = this.inv.length - 1; i >= 0; i--) {
      const s = this.inv[i];
      if (s && s.id === id) {
        const take = Math.min(s.count, n);
        s.count -= take;
        n -= take;
        if (s.count <= 0) this.inv[i] = null;
        if (n <= 0) break;
      }
    }
    return true;
  }
  private selectedSlot(): Slot | null {
    return this.inv[this.selected];
  }

  craft(recipeId: string) {
    const r = RECIPES.find((x) => x.id === recipeId);
    if (!r) return;
    if (!this.stationOk(r)) return;
    for (const ing of r.ing) if (this.count(ing.id) < ing.n) return;
    for (const ing of r.ing) this.removeItem(ing.id, ing.n);
    this.addItem(r.out, r.outCount);
    audio.playSfx("craft");
    this.float(this.px, this.py - 30, `+${r.outCount} ${ITEMS[r.out].name}`, "#ffe08a");
    this.checkQuest();
  }
  private stationOk(r: Recipe): boolean {
    if (r.station === "none") return true;
    if (r.station === "workbench") return this.workbenchCount > 0;
    if (r.station === "furnace") return this.furnaceCount > 0;
    return true;
  }

  consume(id: string) {
    if (this.count(id) <= 0) return;
    if (id === "apple") {
      this.removeItem("apple", 1);
      this.hp = Math.min(this.maxHp, this.hp + 25);
      audio.playSfx("pickup");
      this.float(this.px, this.py - 30, "+25 HP", "#7fff8f");
    }
    if (id === "rotten_flesh") {
      this.removeItem("rotten_flesh", 1);
      this.hp = Math.min(this.maxHp, this.hp + 5);
      audio.playSfx("pickup");
      this.float(this.px, this.py - 30, "+5 HP", "#7fff8f");
    }
  }

  summonBoss() {
    if (this.count("crown") <= 0) return;
    if (this.bossActive()) return;
    if (!this.isNightNow()) {
      this.showBanner("Wait for nightfall", "The King only answers the dark");
      return;
    }
    this.removeItem("crown", 1);
    this.spawnKing();
  }

  private bossActive(): boolean {
    return this.enemies.some((e) => e.type === "king");
  }
  private isNightNow(): boolean {
    return Math.sin(this.dayFrac * Math.PI * 2) < 0;
  }

  // ---------- input ----------
  private kd!: (e: KeyboardEvent) => void;
  private ku!: (e: KeyboardEvent) => void;
  private mm!: (e: PointerEvent) => void;
  private md!: (e: PointerEvent) => void;
  private mu!: (e: PointerEvent) => void;
  private wh!: (e: WheelEvent) => void;
  private bl!: () => void;
  private vis!: () => void;
  private unl!: () => void;
  private ro?: ResizeObserver;

  private attach() {
    this.kd = (e) => {
      // FPS overlay toggle: Ctrl + Windows(Meta) + Alt
      if (e.ctrlKey && e.altKey && e.metaKey) {
        e.preventDefault();
        this.showFps = !this.showFps;
        return;
      }
      const c = e.code;
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Space"].includes(c)) e.preventDefault();
      this.keys[c] = true;
      if (c.startsWith("Digit")) {
        const n = parseInt(c.slice(5), 10);
        this.selectSlot(n === 0 ? 9 : n - 1);
        audio.playSfx("click");
      }
    };
    this.ku = (e) => {
      this.keys[e.code] = false;
    };
    this.mm = (e) => {
      const r = this.canvas.getBoundingClientRect();
      this.mouseWX = (e.clientX - r.left) / r.width * this.viewW + this.camX;
      this.mouseWY = (e.clientY - r.top) / r.height * this.viewH + this.camY;
      this.mouseTX = Math.floor(this.mouseWX / TILE);
      this.mouseTY = Math.floor(this.mouseWY / TILE);
    };
    this.md = (e) => {
      if (this.uiOpen) return;
      audio.ensure();
      // keep target tile in sync with the press location (important for touch)
      const r = this.canvas.getBoundingClientRect();
      this.mouseWX = (e.clientX - r.left) / r.width * this.viewW + this.camX;
      this.mouseWY = (e.clientY - r.top) / r.height * this.viewH + this.camY;
      this.mouseTX = Math.floor(this.mouseWX / TILE);
      this.mouseTY = Math.floor(this.mouseWY / TILE);
      const placing = this.placeMode || e.button === 2;
      if (placing) {
        this.rightDown = true;
        this.tryPlace();
      } else if (e.button === 0) {
        this.mouseDown = true;
      }
    };
    this.mu = (e) => {
      const placing = this.placeMode || e.button === 2;
      if (placing) {
        this.rightDown = false;
      } else if (e.button === 0) {
        this.mouseDown = false;
        this.mineTX = -1;
        this.mineProg = 0;
      }
    };
    this.wh = (e) => {
      if (this.uiOpen) return;
      this.setSelectedByDelta(e.deltaY > 0 ? 1 : -1);
    };
    this.bl = () => {
      this.keys = {};
      this.mouseDown = false;
      this.rightDown = false;
    };
    this.vis = () => {
      if (document.hidden) this.saveGame();
    };
    this.unl = () => this.saveGame();
    window.addEventListener("keydown", this.kd);
    window.addEventListener("keyup", this.ku);
    this.canvas.addEventListener("pointermove", this.mm);
    this.canvas.addEventListener("pointerdown", this.md);
    window.addEventListener("pointerup", this.mu);
    this.canvas.addEventListener("wheel", this.wh, { passive: true });
    this.canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    window.addEventListener("blur", this.bl);
    document.addEventListener("visibilitychange", this.vis);
    window.addEventListener("beforeunload", this.unl);
    if (this.canvas.parentElement) {
      this.ro = new ResizeObserver(() => this.resize());
      this.ro.observe(this.canvas.parentElement);
    }
  }
  private detach() {
    window.removeEventListener("keydown", this.kd);
    window.removeEventListener("keyup", this.ku);
    this.canvas.removeEventListener("pointermove", this.mm);
    this.canvas.removeEventListener("pointerdown", this.md);
    window.removeEventListener("pointerup", this.mu);
    this.canvas.removeEventListener("wheel", this.wh);
    window.removeEventListener("blur", this.bl);
    document.removeEventListener("visibilitychange", this.vis);
    window.removeEventListener("beforeunload", this.unl);
    this.ro?.disconnect();
  }

  resize() {
    const parent = this.canvas.parentElement;
    const cw = parent ? parent.clientWidth : window.innerWidth;
    const ch = parent ? parent.clientHeight : window.innerHeight;
    this.dpr = 1; // cap to 1 for max FPS in Canvas2D (avoids 4K overdraw)
    // PERFORMANCE: render at a capped internal resolution and let CSS upscale.
    // This drastically cuts the number of tiles to draw (and pixels to shade)
    // while keeping pixel-art crisp via nearest-neighbour scaling.
    const MAX_W = 1000;
    let rw = cw;
    let rh = ch;
    if (cw > MAX_W) {
      const s = MAX_W / cw;
      rw = MAX_W;
      rh = Math.max(1, Math.round(ch * s));
    }
    this.viewW = rw;
    this.viewH = rh;
    // canvas element fills the screen (CSS size)...
    this.canvas.style.width = cw + "px";
    this.canvas.style.height = ch + "px";
    // ...but the backing store is the smaller logical size (fast to draw).
    this.canvas.width = rw;
    this.canvas.height = rh;
  }

  // ---------- loop ----------
  private loop(now: number) {
    if (!this.running) return;
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (dt > 0.05) dt = 0.05;
    if (!this.paused && !this.uiOpen && !this.gameover && !this.victory) this.update(dt);
    this.render();
    this.frame++;
    // FPS rolling average (twice per second)
    this.fpsFrames++;
    this.fpsTimer += dt;
    if (this.fpsTimer >= 0.5) {
      this.fps = Math.round(this.fpsFrames / this.fpsTimer);
      this.fpsFrames = 0;
      this.fpsTimer = 0;
    }
    this.stateT += dt;
    if (this.stateT > 0.08) {
      this.stateT = 0;
      this.pushState();
    }
    this.raf = requestAnimationFrame((t) => this.loop(t));
  }

  private update(dt: number) {
    // day cycle
    this.dayFrac = (this.dayFrac + dt / DAY_LEN) % 1;
    const night = this.isNightNow();
    const wantTrack = this.bossActive() ? "boss" : night ? "night" : "day";
    audio.setTrack(wantTrack);

    this.placeCd = Math.max(0, this.placeCd - dt);
    this.attackCd = Math.max(0, this.attackCd - dt);
    this.swingT = Math.max(0, this.swingT - dt);
    this.invuln = Math.max(0, this.invuln - dt);
    this.hurtT = Math.max(0, this.hurtT - dt);
    this.bannerT = Math.max(0, this.bannerT - dt);
    if (this.bannerT <= 0) this.banner = null;

    // regen
    if (this.hurtT <= 0 && this.hp < this.maxHp) {
      this.regenT -= dt;
      if (this.regenT <= 0) {
        this.hp = Math.min(this.maxHp, this.hp + 1);
        this.regenT = 0.6;
      }
    }

    // decay screen shake
    if (this.shakeX !== 0 || this.shakeY !== 0) {
      const decay = Math.max(0, 1 - dt / 0.15);
      this.shakeX *= decay;
      this.shakeY *= decay;
      if (Math.abs(this.shakeX) < 0.5) this.shakeX = 0;
      if (Math.abs(this.shakeY) < 0.5) this.shakeY = 0;
    }

    this.updatePlayer(dt);
    this.updateMining(dt);
    this.updatePlacing(dt);
    this.updateEnemies(dt);
    this.updateParticles(dt);
    this.updateAmbient(dt, night);

    // spawns
    this.spawnT -= dt;
    if (this.spawnT <= 0) {
      this.spawnT = night ? 2.2 : 5;
      this.trySpawn(night);
    }

    this.checkQuest();
    // camera
    const targetCX = this.px - this.viewW / 2;
    const targetCY = this.py - this.viewH / 2;
    this.camX += (targetCX - this.camX) * Math.min(1, dt * 8);
    this.camY += (targetCY - this.camY) * Math.min(1, dt * 8);
    this.camX = Math.max(0, Math.min(this.world.w * TILE - this.viewW, this.camX));
    this.camY = Math.max(0, Math.min(this.world.h * TILE - this.viewH, this.camY));

    // autosave periodically
    this.saveTimer -= dt;
    if (this.saveTimer <= 0) {
      this.saveTimer = 5;
      this.saveGame();
    }
  }

  // ---------- player physics ----------
  private updatePlayer(dt: number) {
    let move = 0;
    if (this.keys["KeyA"] || this.keys["ArrowLeft"]) move -= 1;
    if (this.keys["KeyD"] || this.keys["ArrowRight"]) move += 1;
    if (move !== 0) {
      this.pface = move > 0 ? 1 : -1;
      this.pvx = move * MOVE_SPEED;
      if (this.onGround) this.walkT += dt * 14;
    } else {
      this.pvx *= Math.pow(0.001, dt);
      if (Math.abs(this.pvx) < 4) this.pvx = 0;
    }
    if (this.flying) {
      // free flight: no gravity. W/Up rises, S/Down descends.
      this.pvy = 0;
      if (this.keys["Space"] || this.keys["KeyW"] || this.keys["ArrowUp"]) this.pvy = -MOVE_SPEED * 1.4;
      if (this.keys["KeyS"] || this.keys["ArrowDown"]) this.pvy = MOVE_SPEED * 1.4;
      this.integrateX(dt, 18, 44);
      this.py += this.pvy * dt;
      this.onGround = false;
    } else {
      // jump buffer: refresh while the jump key is held (covers keyboard Space
      // and holding the touch button). A quick tap is remembered briefly so it
      // still triggers; holding gives continuous hops when landing.
      const jumpKey = this.keys["Space"] || this.keys["KeyW"] || this.keys["ArrowUp"];
      if (jumpKey) this.jumpBuffer = 0.14;
      else this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);
      if (this.jumpBuffer > 0 && this.onGround) {
        this.pvy = -JUMP_V;
        this.onGround = false;
        this.jumpBuffer = 0;
        audio.playSfx("jump");
      }
      this.pvy += GRAVITY * dt;
      if (this.pvy > 900) this.pvy = 900;

      // track fall distance
      if (!this.onGround && this.pvy > 0) {
        this.fallDistance += this.pvy * dt;
      }

      this.integrateX(dt, 18, 44);
      const wasGround = this.onGround;
      this.onGround = this.integrateY(dt, 18, 44);
      if (!wasGround && this.onGround) {
        audio.playSfx("land");
        // fall damage
        if (this.fallDistance > 600 && !this.godMode) {
          const rawDmg = Math.floor((this.fallDistance - 600) / 30);
          const fallDmg = Math.min(40, Math.max(1, rawDmg - this.defense));
          this.hp -= fallDmg;
          this.invuln = 0.8;
          this.hurtT = 3;
          this.float(this.px, this.py - 30, `-${fallDmg} fall`, "#ff6b6b");
          for (let i = 0; i < 8; i++) this.dust(this.px, this.py, "#ff6b6b");
          this.shakeX = 8;
          this.shakeY = 5;
          audio.playSfx("hurt");
          if (this.hp <= 0) { this.hp = 0; this.die(); }
        }
        this.fallDistance = 0;
      }
    }

    // world bounds
    this.px = Math.max(8, Math.min(this.world.w * TILE - 8, this.px));
    if (!this.flying && !this.godMode && this.py > this.world.h * TILE + 200) {
      this.hp = 0;
      this.die();
    }

    // portal teleport
    const feetTX = Math.floor(this.px / TILE);
    const feetTY = Math.floor((this.py + 22) / TILE);
    if (getTile(this.world, feetTX, feetTY) === PORTAL) {
      this.currentWorldId++;
      this.world = generateWorld(this.currentWorldId);
      // find a portal in the new world to spawn at
      let found = false;
      for (let x = 0; x < this.world.w && !found; x++) {
        for (let y = 0; y < this.world.h && !found; y++) {
          if (getTile(this.world, x, y) === PORTAL) {
            // clear nearby trees so player doesn't get stuck
            for (let dx = -2; dx <= 2; dx++) {
              for (let dy = 12; dy >= 1; dy--) {
                const t = getTile(this.world, x + dx, y - dy);
                if (t === WOOD || t === LEAVES) setTile(this.world, x + dx, y - dy, AIR);
              }
            }
            this.px = x * TILE;
            this.py = (y - 2) * TILE;
            this.pvx = 0;
            this.pvy = 0;
            this.onGround = false;
            this.fallDistance = 0;
            found = true;
          }
        }
      }
      if (!found) {
        // fallback to spawn
        const sx = this.world.spawnX;
        const surf = this.world.surfaceY[sx];
        for (let dx = -2; dx <= 2; dx++) {
          for (let dy = 12; dy >= 1; dy--) {
            const t = getTile(this.world, sx + dx, surf - dy);
            if (t === WOOD || t === LEAVES) setTile(this.world, sx + dx, surf - dy, AIR);
          }
        }
        this.px = sx * TILE;
        this.py = this.world.spawnY * TILE;
        this.pvx = 0;
        this.pvy = 0;
        this.onGround = false;
        this.fallDistance = 0;
      }
      this.showBanner(`World ${this.currentWorldId}`, "You step through the portal…");
      this.saveGame();
    }
  }

  // Proper X/Y integration for the player (kept explicit for clarity).
  private integrateX(dt: number, w: number, h: number): void {
    this.px += this.pvx * dt;
    const top = Math.floor((this.py - h / 2) / TILE);
    const bot = Math.floor((this.py + h / 2 - 0.01) / TILE);
    if (this.pvx > 0) {
      const rx = Math.floor((this.px + w / 2) / TILE);
      for (let ty = top; ty <= bot; ty++) if (isSolid(getTile(this.world, rx, ty))) { this.px = rx * TILE - w / 2 - 0.01; this.pvx = 0; break; }
    } else if (this.pvx < 0) {
      const lx = Math.floor((this.px - w / 2) / TILE);
      for (let ty = top; ty <= bot; ty++) if (isSolid(getTile(this.world, lx, ty))) { this.px = (lx + 1) * TILE + w / 2 + 0.01; this.pvx = 0; break; }
    }
  }
  private integrateY(dt: number, w: number, h: number): boolean {
    this.py += this.pvy * dt;
    const left = Math.floor((this.px - w / 2) / TILE);
    const right = Math.floor((this.px + w / 2 - 0.01) / TILE);
    if (this.pvy > 0) {
      const by = Math.floor((this.py + h / 2) / TILE);
      for (let tx = left; tx <= right; tx++) if (isSolid(getTile(this.world, tx, by))) { this.py = by * TILE - h / 2 - 0.01; this.pvy = 0; return true; }
    } else if (this.pvy < 0) {
      const ty2 = Math.floor((this.py - h / 2) / TILE);
      for (let tx = left; tx <= right; tx++) if (isSolid(getTile(this.world, tx, ty2))) { this.py = (ty2 + 1) * TILE + h / 2 + 0.01; this.pvy = 0; break; }
    }
    return false;
  }

  // ---------- mining ----------
  private toolInfo(): { power: number; tier: number; dmg: number; kind: string } {
    const s = this.selectedSlot();
    if (s && ITEMS[s.id]?.kind === "tool") {
      const it = ITEMS[s.id];
      return { power: it.power ?? 1, tier: it.tier ?? 0, dmg: it.dmg ?? 4, kind: it.tool ?? "none" };
    }
    return { power: 1, tier: 0, dmg: 3, kind: "fist" };
  }
  private withinReach(tx: number, ty: number): boolean {
    const cx = tx * TILE + TILE / 2;
    const cy = ty * TILE + TILE / 2;
    const d = Math.hypot(cx - this.px, cy - (this.py - 8));
    return d <= REACH * TILE;
  }
  private updateMining(dt: number) {
    if (!this.mouseDown) {
      this.mineTX = -1;
      this.mineProg = 0;
      // attack fallback when holding LMB over no block
      return;
    }
    const tx = this.mouseTX;
    const ty = this.mouseTY;
    const id = getTile(this.world, tx, ty);
    if (id === AIR || !this.withinReach(tx, ty)) {
      this.tryAttack();
      this.mineTX = -1;
      return;
    }
    const def = TILES[id];
    const tool = this.toolInfo();
    if (def.minTier > tool.tier) {
      this.tryAttack();
      this.mineTX = -1;
      return;
    }
    if (tx !== this.mineTX || ty !== this.mineTY) {
      this.mineTX = tx;
      this.mineTY = ty;
      this.mineProg = 0;
      this.mineSfxT = 0; // play immediately on the first hit of a new block
    }
    this.mineProg += tool.power * dt * 3.2; // tune speed
    // periodic "tap" sound (NOT every frame — that sounded like a drill)
    this.mineSfxT -= dt;
    if (this.mineSfxT <= 0) {
      this.mineSfxT = 0.18;
      audio.playSfx(id === STONE || id >= COPPER ? "mineStone" : "mine");
    }
    if (Math.random() < 0.5) this.dust(tx * TILE + 15, ty * TILE + 15, def.color);
    if (this.mineProg >= def.hp) {
      this.breakTile(tx, ty, id);
      this.mineTX = -1;
      this.mineProg = 0;
    }
  }

  private breakTile(tx: number, ty: number, id: number) {
    const def = TILES[id];
    // structural: if wood/leaves part of tree, fine to break individually
    setTile(this.world, tx, ty, AIR);
    if (id === WORKBENCH) this.workbenchCount = Math.max(0, this.workbenchCount - 1);
    if (id === FURNACE) this.furnaceCount = Math.max(0, this.furnaceCount - 1);
    if (def.drop) {
      const n = (def.dropMin ?? 1) + (def.dropMax && def.dropMax > (def.dropMin ?? 1) ? Math.floor(Math.random() * (def.dropMax - (def.dropMin ?? 1) + 1)) : 0);
      this.addItem(def.drop, n);
      audio.playSfx("pickup");
      this.float(tx * TILE + 15, ty * TILE + 10, `+${n} ${ITEMS[def.drop].name}`, "#fff2b0");
    }
    audio.playSfx("break");
    for (let i = 0; i < 6; i++) this.dust(tx * TILE + 15, ty * TILE + 15, def.color);
    // stats for quests
    if (id === STONE) this.stoneMined++;
    if (id === COPPER) this.copperMined++;
    if (id === IRON) this.ironMined++;
    this.checkQuest();
  }

  // ---------- placing ----------
  private updatePlacing(dt: number) {
    if (this.rightDown && this.placeCd <= 0) {
      this.tryPlace();
      this.placeCd = 0.14;
    }
    void dt;
  }
  private tryPlace() {
    const s = this.selectedSlot();
    if (!s) return;
    const it = ITEMS[s.id];
    if (it?.place === undefined) return;
    const tx = this.mouseTX;
    const ty = this.mouseTY;
    if (!this.withinReach(tx, ty)) return;
    if (getTile(this.world, tx, ty) !== AIR) return;
    // don't place solid inside player
    if (isSolid(it.place)) {
      const pl = this.px - 9, pr = this.px + 9, pt = this.py - 22, pb = this.py + 22;
      const bl = tx * TILE, br = bl + TILE, bt = ty * TILE, bb = bt + TILE;
      if (pr > bl && pl < br && pb > bt && pt < bb) return;
    }
    setTile(this.world, tx, ty, it.place);
    if (it.place === TORCH) audio.playSfx("torch");
    else audio.playSfx("place");
    if (it.place === WORKBENCH) this.workbenchCount++;
    if (it.place === FURNACE) this.furnaceCount++;
    this.removeItem(s.id, 1);
    for (let i = 0; i < 4; i++) this.dust(tx * TILE + 15, ty * TILE + 15, it.color);
    this.checkQuest();
  }

  // ---------- combat ----------
  private tryAttack() {
    if (this.attackCd > 0) return;
    const tool = this.toolInfo();
    const reach = tool.kind === "sword" ? TILE * 1.9 : TILE * 1.5;
    const fx = this.px + this.pface * 8;
    let hitAny = false;
    for (const e of this.enemies) {
      const d = Math.hypot(e.x - fx, e.y - this.py);
      const inFront = (e.x - this.px) * this.pface >= -8;
      if (d < reach + e.w / 2 && inFront) {
        this.damageEnemy(e, tool.dmg);
        hitAny = true;
      }
    }
    if (hitAny || tool.kind === "sword") {
      this.swingT = 0.18;
      this.attackCd = tool.kind === "sword" ? 0.32 : 0.4;
      audio.playSfx("swing");
      if (hitAny) audio.playSfx("hitEnemy");
    } else {
      this.swingT = 0.12;
      this.attackCd = 0.3;
      audio.playSfx("swing");
    }
  }

  private damageEnemy(e: Enemy, dmg: number) {
    // critical hit from above (20% chance, 1.5x damage)
    let crit = false;
    if (this.py < e.y - e.h / 2 && Math.random() < 0.2) {
      dmg = Math.round(dmg * 1.5);
      crit = true;
    }
    e.hp -= dmg;
    e.hitFlash = 0.12;
    e.knock = this.pface;
    e.vx += this.pface * 160;
    e.vy = -120;
    this.float(e.x, e.y - 20, `${Math.round(dmg)}${crit ? "!" : ""}`, crit ? "#ffeb3b" : "#ffd0d0");
    for (let i = 0; i < 5; i++) this.dust(e.x, e.y, "#ff9b9b");
    this.shakeX = 4;
    this.shakeY = 3;
    if (e.hp <= 0) this.killEnemy(e);
  }

  private killEnemy(e: Enemy) {
    const idx = this.enemies.indexOf(e);
    if (idx < 0) return;
    this.enemies.splice(idx, 1);
    audio.playSfx("enemyDie");
    for (let i = 0; i < 8; i++) this.dust(e.x, e.y, e.type === "zombie" ? "#6fae5a" : e.type === "bat" ? "#9a7bff" : "#5fd06f");
    if (e.type === "king") {
      this.kingDefeated = true;
      this.addItem("gold_bar", 15);
      this.addItem("diamond", 10);
      this.addItem("gel", 30);
      this.showBanner("THE KING FALLS", "Dawn breaks eternal over your realm");
      // Instant victory: automatically advance all quests to completed
      // so speedrunning via the Cheat Menu correctly triggers the ending sequence.
      this.questIndex = QUESTS.length;
      this.victory = true;
      audio.playSfx("victory");
      audio.setTrack("day");
      this.cb.onVictory();
      this.pushState();
      this.saveGame();
      return;
    }
    // drops
    if (e.type === "slime") {
      this.addItem("gel", 1 + Math.floor(Math.random() * 2));
    }
    if (e.type === "zombie") {
      if (Math.random() < 0.4) this.addItem("wood", 1 + Math.floor(Math.random() * 2));
      if (Math.random() < 0.3) this.addItem("rotten_flesh", 1);
    }
  }

  // ---------- enemies ----------
  private trySpawn(night: boolean) {
    if (this.enemies.length >= 9) return;
    if (this.bossActive()) return;
    const sx = this.px + (Math.random() < 0.5 ? -1 : 1) * (this.viewW / 2 + 60 + Math.random() * 120);
    const stx = Math.floor(sx / TILE);
    if (stx < 2 || stx >= this.world.w - 2) return;
    const surf = this.world.surfaceY[stx];
    let type: Enemy["type"];
    if (night) type = Math.random() < 0.55 ? "zombie" : "bat";
    else type = "slime";
    const e: Enemy = {
      type, x: sx, y: (surf - 2) * TILE, vx: 0, vy: 0,
      w: type === "zombie" ? 22 : 30, h: type === "zombie" ? 42 : 26,
      hp: type === "zombie" ? 34 : 18, maxHp: type === "zombie" ? 34 : 18,
      facing: -1, onGround: false, hopT: Math.random(), hitFlash: 0, t: 0, spawnT: 0, knock: 0, swoopT: 0,
    };
    if (type === "bat") { e.y = (surf - 6) * TILE; e.h = 22; e.w = 26; e.hp = e.maxHp = 18; e.swoopT = 2 + Math.random() * 3; }
    this.enemies.push(e);
  }

  private spawnKing() {
    const stx = Math.floor(this.px / TILE);
    const surf = this.world.surfaceY[stx];
    const e: Enemy = {
      type: "king", x: this.px, y: (surf - 6) * TILE, vx: 0, vy: 0,
      w: 70, h: 60, hp: 700, maxHp: 700, facing: -1, onGround: false, hopT: 0, hitFlash: 0, t: 0, spawnT: 4, knock: 0, swoopT: 0,
    };
    this.enemies.push(e);
    audio.playSfx("bossSpawn");
    audio.setTrack("boss");
    this.showBanner("THE SLIME KING", "Destroy him!");
  }

  private updateEnemies(dt: number) {
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      e.t += dt;
      e.hitFlash = Math.max(0, e.hitFlash - dt);
      e.spawnT -= dt;
      const dx = this.px - e.x;
      e.facing = dx >= 0 ? 1 : -1;
      if (e.type === "bat") {
        e.swoopT -= dt;
        if (e.swoopT > 0) {
          // normal flight
          e.vy += (this.py - 60 - e.y) * 1.4 * dt;
          e.vy = Math.max(-260, Math.min(260, e.vy));
          e.vx += Math.sign(dx) * 60 * dt;
          e.vx = Math.max(-150, Math.min(150, e.vx));
        } else if (e.swoopT > -0.3) {
          // swoop phase: rapid dive toward player
          const targetX = this.px;
          const targetY = this.py - 30;
          e.vx += Math.sign(targetX - e.x) * 400 * dt;
          e.vy += Math.sign(targetY - e.y) * 400 * dt;
          e.vx = Math.max(-500, Math.min(500, e.vx));
          e.vy = Math.max(-500, Math.min(500, e.vy));
        } else {
          // reset swoop cooldown
          e.swoopT = 2 + Math.random() * 3;
        }
        // collide with solid tiles (so bats can't fly through your walls)
        this.flyCollide(e, dt);
        e.y += Math.sin(e.t * 8) * 1.2;
      } else {
        // ground physics + hop
        e.vy += GRAVITY * dt;
        e.hopT -= dt;
        if (e.type === "king") {
          if (e.onGround && e.hopT <= 0) {
            const rage = e.hp < e.maxHp / 2;
            e.vy = -460;
            e.vx = e.facing * (rage ? 280 : 180 + Math.random() * 80);
            e.hopT = rage ? 0.7 : 1.1;
            audio.playSfx("slime");
            if (e.spawnT <= 0) {
              const minionCount = rage ? 3 : 2;
              for (let mi = 0; mi < minionCount; mi++) {
                this.enemies.push({ type: "slime", x: e.x + (mi % 2 === 0 ? 30 : -30), y: e.y - 10, vx: (mi % 2 === 0 ? 1 : -1) * 120, vy: -200, w: 26, h: 22, hp: 16, maxHp: 16, facing: mi % 2 === 0 ? 1 : -1, onGround: false, hopT: 0.5, hitFlash: 0, t: 0, spawnT: 0, knock: 0, swoopT: 0 });
              }
              e.spawnT = rage ? 3 : 5;
            }
          }
        } else if (e.onGround && e.hopT <= 0) {
          e.vy = e.type === "zombie" ? -300 : -260;
          e.vx = e.facing * (e.type === "zombie" ? 100 : 90);
          e.hopT = e.type === "zombie" ? 0.7 : 1.1;
          audio.playSfx(e.type === "zombie" ? "slime" : "slime");
        }
        this.enemyCollide(e, dt);
      }
      // contact damage
      const overlap = Math.abs(e.x - this.px) < (e.w / 2 + 9) && Math.abs(e.y - this.py) < (e.h / 2 + 22);
      if (overlap && this.invuln <= 0) {
        this.hurt(e.type === "king" ? 22 : e.type === "zombie" ? 14 : 8);
      }
      // despawning: far away enemies are removed
      const dist = Math.abs(e.x - this.px);
      if (dist > this.viewW * 2) {
        this.enemies.splice(i, 1);
      } else if (dist > this.viewW) {
        if (Math.random() < 0.005) {
          this.enemies.splice(i, 1);
        }
      }
    }
  }

  private enemyCollide(e: Enemy, dt: number) {
    e.x += e.vx * dt;
    const top = Math.floor((e.y - e.h / 2) / TILE);
    const bot = Math.floor((e.y + e.h / 2 - 0.01) / TILE);
    if (e.vx > 0) {
      const rx = Math.floor((e.x + e.w / 2) / TILE);
      for (let ty = top; ty <= bot; ty++) if (isSolid(getTile(this.world, rx, ty))) { e.x = rx * TILE - e.w / 2 - 0.01; e.vx = 0; break; }
    } else if (e.vx < 0) {
      const lx = Math.floor((e.x - e.w / 2) / TILE);
      for (let ty = top; ty <= bot; ty++) if (isSolid(getTile(this.world, lx, ty))) { e.x = (lx + 1) * TILE + e.w / 2 + 0.01; e.vx = 0; break; }
    }
    e.y += e.vy * dt;
    const left = Math.floor((e.x - e.w / 2) / TILE);
    const right = Math.floor((e.x + e.w / 2 - 0.01) / TILE);
    e.onGround = false;
    if (e.vy > 0) {
      const by = Math.floor((e.y + e.h / 2) / TILE);
      for (let tx = left; tx <= right; tx++) if (isSolid(getTile(this.world, tx, by))) { e.y = by * TILE - e.h / 2 - 0.01; e.vy = 0; e.onGround = true; break; }
    } else if (e.vy < 0) {
      const ty2 = Math.floor((e.y - e.h / 2) / TILE);
      for (let tx = left; tx <= right; tx++) if (isSolid(getTile(this.world, tx, ty2))) { e.y = (ty2 + 1) * TILE + e.h / 2 + 0.01; e.vy = 0; break; }
    }
    // auto-jump small obstacles
    if (e.vx !== 0 && e.onGround) {
      const ahead = Math.floor((e.x + Math.sign(e.vx) * (e.w / 2 + 4)) / TILE);
      const at = Math.floor((e.y + e.h / 2 + 2) / TILE);
      if (isSolid(getTile(this.world, ahead, at))) e.vy = -300;
    }
  }

  /** Axis-separated collision for flying enemies (bats). They cannot pass
      through solid tiles — including blocks the player placed. */
  private flyCollide(e: Enemy, dt: number) {
    const halfW = e.w / 2;
    const halfH = e.h / 2;
    // X axis
    const nx = e.x + e.vx * dt;
    const top = Math.floor((e.y - halfH) / TILE);
    const bot = Math.floor((e.y + halfH - 0.01) / TILE);
    if (e.vx > 0) {
      const rx = Math.floor((nx + halfW) / TILE);
      for (let ty = top; ty <= bot; ty++) if (isSolid(getTile(this.world, rx, ty))) { e.vx = 0; break; }
    } else if (e.vx < 0) {
      const lx = Math.floor((nx - halfW) / TILE);
      for (let ty = top; ty <= bot; ty++) if (isSolid(getTile(this.world, lx, ty))) { e.vx = 0; break; }
    }
    e.x += e.vx * dt;
    // Y axis
    const ny = e.y + e.vy * dt;
    const left = Math.floor((e.x - halfW) / TILE);
    const right = Math.floor((e.x + halfW - 0.01) / TILE);
    if (e.vy > 0) {
      const by = Math.floor((ny + halfH) / TILE);
      for (let tx = left; tx <= right; tx++) if (isSolid(getTile(this.world, tx, by))) { e.vy = 0; break; }
    } else if (e.vy < 0) {
      const ty2 = Math.floor((ny - halfH) / TILE);
      for (let tx = left; tx <= right; tx++) if (isSolid(getTile(this.world, tx, ty2))) { e.vy = 0; break; }
    }
    e.y += e.vy * dt;
  }

  private hurt(dmg: number) {
    if (this.godMode || this.invuln > 0) return;
    const real = Math.max(1, dmg - this.defense);
    this.hp -= real;
    this.invuln = 0.8;
    this.hurtT = 3;
    this.pvx = this.pface > 0 ? -180 : 180;
    this.pvy = -200;
    audio.playSfx("hurt");
    this.float(this.px, this.py - 30, `-${real}`, "#ff6b6b");
    for (let i = 0; i < 8; i++) this.dust(this.px, this.py, "#ff6b6b");
    if (this.hp <= 0) {
      this.hp = 0;
      this.die();
    }
  }
  private die() {
    if (this.gameover) return;
    this.gameover = true;
    audio.playSfx("gameOver");
    audio.setTrack("none");
    this.cb.onGameOver();
  }

  // ---------- quests ----------
  private checkQuest() {
    if (this.victory || this.gameover) return;
    const q = QUESTS[this.questIndex];
    if (!q) return;
    let done = false;
    switch (this.questIndex) {
      case 0: done = this.count("wood") >= 12; break;
      case 1: done = this.count("wood_pickaxe") >= 1; break;
      case 2: done = this.stoneMined >= 20; break;
      case 3: done = this.workbenchCount > 0; break;
      case 4: done = this.count("torch") >= 1; break;
      case 5: done = this.copperMined >= 8; break;
      case 6: done = this.furnaceCount > 0 && this.count("copper_bar") >= 3; break;
      case 7: done = this.ironMined >= 6 && this.count("iron_pickaxe") >= 1; break;
      case 8: done = this.count("iron_sword") >= 1; break;
      case 9: done = this.count("crown") >= 1; break;
      case 10: done = this.kingDefeated; break;
    }
    if (!done) return;
    // reward
    switch (this.questIndex) {
      case 0: this.addItem("torch", 1); break;
      case 2: this.maxHp += 10; this.hp = Math.min(this.maxHp, this.hp + 10); break;
      case 4: this.maxHp += 10; this.hp = Math.min(this.maxHp, this.hp + 10); break;
      case 5: this.addItem("wood_sword", 1); break;
      case 6: this.maxHp += 20; this.hp = Math.min(this.maxHp, this.hp + 20); break;
      case 8: this.maxHp += 20; this.hp = Math.min(this.maxHp, this.hp + 20); break;
    }
    audio.playSfx("levelup");
    this.showBanner("QUEST COMPLETE", q.title);
    this.float(this.px, this.py - 40, q.reward, "#9fff9f");
    this.questIndex++;
    if (this.questIndex >= QUESTS.length) {
      this.victory = true;
      audio.playSfx("victory");
      audio.setTrack("day");
      this.cb.onVictory();
    }
  }

  private showBanner(title: string, sub: string) {
    this.banner = { title, sub, key: this.frame };
    this.bannerT = 3;
  }

  // ---------- particles ----------
  private dust(x: number, y: number, color: string) {
    if (this.particles.length > 300) return;
    const a = Math.random() * Math.PI * 2;
    const sp = 30 + Math.random() * 120;
    this.particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40, life: 0.5 + Math.random() * 0.4, max: 0.9, size: 2 + Math.random() * 3, color, grav: 500 });
  }
  private float(x: number, y: number, text: string, color: string) {
    this.floats.push({ x, y, vy: -34, life: 1.1, text, color });
  }
  private updateParticles(dt: number) {
    for (const p of this.particles) {
      p.life -= dt;
      p.vy += p.grav * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    for (const f of this.floats) {
      f.life -= dt;
      f.y += f.vy * dt;
      f.vy *= 0.96;
    }
    this.floats = this.floats.filter((f) => f.life > 0);
  }

  private updateAmbient(dt: number, night: boolean) {
    this.moteTimer -= dt;
    if (this.moteTimer <= 0) {
      this.moteTimer = 0.18;
      if (this.particles.length < 240) {
        const x = this.camX + Math.random() * this.viewW;
        const y = this.camY + Math.random() * this.viewH;
        const above = y / TILE < this.world.surfaceY[Math.floor(x / TILE)] - 2;
        if (above) {
          // floating pollen by day, fireflies by night
          if (night) {
            this.particles.push({ x, y, vx: Math.sin(this.frame * 0.05 + x) * 8, vy: -4, life: 2.5, max: 2.5, size: 2.4, color: "#fff39a", grav: 0 });
          } else {
            this.particles.push({ x, y, vx: (Math.random() - 0.5) * 10, vy: -8, life: 3, max: 3, size: 1.6, color: "rgba(255,255,255,0.7)", grav: 0 });
          }
        }
      }
    }
  }

  // ---------- state push ----------
  private pushState() {
    const night = this.isNightNow();
    const craftable: string[] = [];
    for (const r of RECIPES) {
      if (!this.stationOk(r)) continue;
      let ok = true;
      for (const ing of r.ing) if (this.count(ing.id) < ing.n) { ok = false; break; }
      if (ok) craftable.push(r.id);
    }
    const q = QUESTS[this.questIndex];
    const boss = this.enemies.find((e) => e.type === "king");
    const pxTile = Math.floor(this.px / TILE);
    const pyTile = Math.floor(this.py / TILE);
    let nearPortal = false;
    for (let dy = -3; dy <= 3; dy++) {
      for (let dx = -3; dx <= 3; dx++) {
        if (getTile(this.world, pxTile + dx, pyTile + dy) === PORTAL) { nearPortal = true; break; }
      }
      if (nearPortal) break;
    }
    this.cb.onState({
      hp: Math.round(this.hp),
      maxHp: this.maxHp,
      defense: this.defense,
      selected: this.selected,
      dayFrac: this.dayFrac,
      isNight: night,
      dayCount: this.dayCount,
      questTitle: q ? q.title : "Champion of Aethoria",
      questText: q ? q.text : "All quests complete.",
      questDone: this.questIndex >= QUESTS.length,
      questIndex: this.questIndex,
      banner: this.banner,
      boss: boss ? { name: "Slime King", hp: Math.max(0, boss.hp), maxHp: boss.maxHp } : null,
      mineProgress: this.mineTX >= 0 ? Math.min(1, this.mineProg / (TILES[getTile(this.world, this.mineTX, this.mineTY)]?.hp || 1)) : 0,
      inventory: this.inv.map((s) => (s ? { id: s.id, count: s.count } : null)),
      stations: { workbench: this.workbenchCount > 0, furnace: this.furnaceCount > 0 },
      craftable,
      depth: Math.max(0, Math.floor(this.py / TILE) - this.world.surfaceY[Math.floor(this.px / TILE)]),
      nearPortal,
      savedAt: this.saveCounter,
      playerTX: pxTile,
      playerTY: pyTile,
    });
  }

  // ---------- render ----------
  private render() {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    const night = this.isNightNow();
    const bright = Math.max(0.1, Math.sin(this.dayFrac * Math.PI * 2));
    this.drawSky(ctx, bright, night);

    const tx0 = Math.max(0, Math.floor(this.camX / TILE) - 1);
    const ty0 = Math.max(0, Math.floor(this.camY / TILE) - 1);
    const tx1 = Math.min(this.world.w - 1, Math.ceil((this.camX + this.viewW) / TILE) + 1);
    const ty1 = Math.min(this.world.h - 1, Math.ceil((this.camY + this.viewH) / TILE) + 1);

    ctx.save();
    const sx = Math.round(this.shakeX);
    const sy = Math.round(this.shakeY);
    ctx.translate(-Math.round(this.camX) + sx, -Math.round(this.camY) + sy);
    ctx.imageSmoothingEnabled = false;

    // background cave walls (behind empty tiles underground)
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        if (getTile(this.world, tx, ty) !== AIR) continue;
        const surf = this.world.surfaceY[tx];
        if (ty > surf) {
          const kind = ty - surf > 14 || ty > 90 ? "stone" : "dirt";
          const v = (tx * 7 ^ ty * 13) & 3;
          ctx.drawImage(wallTexture(kind, v), 0, 0, TEX, TEX, tx * TILE, ty * TILE, TILE, TILE);
        }
      }
    }

    // foreground tiles (direct blit with cheap AO overlays)
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const id = getTile(this.world, tx, ty);
        if (id === AIR) continue;
        this.drawTile(ctx, tx, ty, id);
      }
    }
    if (this.mineTX >= 0) this.drawCracks(ctx);
    this.drawTarget(ctx);
    // ghost placement preview
    const ghostSlot = this.selectedSlot();
    if (ghostSlot && ITEMS[ghostSlot.id]?.place !== undefined && this.withinReach(this.mouseTX, this.mouseTY)) {
      const gtx = this.mouseTX;
      const gty = this.mouseTY;
      if (getTile(this.world, gtx, gty) === AIR) {
        ctx.save();
        ctx.globalAlpha = 0.35;
        this.drawTile(ctx, gtx, gty, ITEMS[ghostSlot.id].place!);
        ctx.globalAlpha = 1;
        ctx.restore();
      }
    }

    // particles
    for (const p of this.particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
    for (const e of this.enemies) this.drawEnemy(ctx, e);
    if (!this.gameover) this.drawPlayer(ctx);

    // floating text (smooth)
    ctx.imageSmoothingEnabled = true;
    ctx.textAlign = "center";
    ctx.font = "bold 13px Rajdhani, sans-serif";
    for (const f of this.floats) {
      ctx.globalAlpha = Math.max(0, Math.min(1, f.life * 1.6));
      ctx.fillStyle = "#000";
      ctx.fillText(f.text, f.x + 1, f.y + 1);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    // smooth lighting overlay (darkness)
    this.drawLighting(tx0, ty0, tx1, ty1, bright);

    // additive bloom glow on light sources (shows through darkness)
    this.drawGlow(ctx, tx0, ty0, tx1, ty1);

    // atmospheric depth fog — underground gets a cool haze, deeper = denser
    const ptx = Math.floor(this.px / TILE);
    const surfHere = this.world.surfaceY[ptx];
    const depthHere = Math.max(0, this.py / TILE - surfHere);
    if (depthHere > 3) {
      const f = Math.min(0.5, (depthHere - 3) / 40);
      ctx.fillStyle = `rgba(20,26,42,${f})`;
      ctx.fillRect(0, 0, this.viewW, this.viewH);
    }

    // cinematic color grade — unifies the palette toward the menu's mood
    ctx.save();
    ctx.globalCompositeOperation = "soft-light";
    const cg = ctx.createLinearGradient(0, 0, 0, this.viewH);
    cg.addColorStop(0, night ? "rgba(40,30,80,0.5)" : "rgba(255,200,120,0.28)");
    cg.addColorStop(1, night ? "rgba(10,20,50,0.5)" : "rgba(60,140,180,0.22)");
    ctx.fillStyle = cg;
    ctx.fillRect(0, 0, this.viewW, this.viewH);
    ctx.restore();

    // vignette
    const vg = ctx.createRadialGradient(this.viewW / 2, this.viewH / 2, this.viewH * 0.35, this.viewW / 2, this.viewH / 2, this.viewH * 0.85);
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, "rgba(0,0,0,0.45)");
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, this.viewW, this.viewH);

    // FPS overlay (toggle: Ctrl + Win + Alt)
    if (this.showFps) {
      ctx.save();
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(8, this.viewH - 30, 104, 22);
      ctx.font = "bold 13px monospace";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillStyle = this.fps >= 50 ? "#7fff7f" : this.fps >= 30 ? "#ffd23b" : "#ff5a5a";
      ctx.fillText(`FPS: ${this.fps}`, 14, this.viewH - 19);
      ctx.restore();
    }
  }

  private buildGlowSprite() {
    const size = 128;
    const cv = document.createElement("canvas");
    cv.width = size;
    cv.height = size;
    const c = cv.getContext("2d")!;
    // soft halo: gentle falloff so it never looks like a bright "sun" dot
    const g = c.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, "rgba(255,255,255,0.5)");
    g.addColorStop(0.4, "rgba(255,255,255,0.18)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    c.fillStyle = g;
    c.fillRect(0, 0, size, size);
    this.glowSprite = cv;
  }

  private drawGlow(ctx: CanvasRenderingContext2D, tx0: number, ty0: number, tx1: number, ty1: number) {
    const night = this.isNightNow();
    if (!this.glowSprite) return;
    const spr = this.glowSprite;
    ctx.save();
    ctx.globalCompositeOperation = "lighter"; // additive glow
    ctx.translate(-Math.round(this.camX), -Math.round(this.camY));

    // player aura — subtle, just enough to feel alive in the dark (NOT a sun)
    const pr = TILE * 2.2;
    ctx.globalAlpha = night ? 0.1 : 0.03;
    ctx.drawImage(spr, 0, 0, spr.width, spr.height, this.px - pr, this.py - 4 - pr, pr * 2, pr * 2);

    // emissive tiles
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const id = getTile(this.world, tx, ty);
        if (id === TORCH) {
          const fl = 0.7 + 0.3 * Math.sin(this.frame * 0.3 + tx * 1.7);
          const r = TILE * 1.6 * fl;
          ctx.globalAlpha = 0.32 * fl;
          ctx.drawImage(spr, 0, 0, spr.width, spr.height, tx * TILE + TILE / 2 - r, ty * TILE + TILE - 13 - r, r * 2, r * 2);
        } else if (id === FURNACE) {
          const r = TILE * 1.2;
          ctx.globalAlpha = 0.24;
          ctx.drawImage(spr, 0, 0, spr.width, spr.height, tx * TILE + TILE / 2 - r, ty * TILE + TILE * 0.7 - r, r * 2, r * 2);
        } else if (id === PORTAL) {
          const fl = 0.7 + 0.3 * Math.sin(this.frame * 0.2 + tx * 2.1);
          const r = TILE * 2.0 * fl;
          ctx.globalAlpha = 0.3 * fl;
          ctx.drawImage(spr, 0, 0, spr.width, spr.height, tx * TILE + TILE / 2 - r, ty * TILE + TILE / 2 - r, r * 2, r * 2);
        }
      }
    }
    ctx.globalAlpha = 1;
    ctx.restore();
    ctx.globalCompositeOperation = "source-over";
  }

  private drawSky(ctx: CanvasRenderingContext2D, bright: number, night: boolean) {
    const top = night ? [8, 10, 26] : [70, 120, 200];
    const bot = night ? [20, 18, 40] : [170, 200, 235];
    const t = bright;
    const r = Math.round(top[0] * t + 8 * (1 - t));
    const g = Math.round(top[1] * t + 8 * (1 - t));
    const b = Math.round(top[2] * t + 20 * (1 - t));
    const r2 = Math.round(bot[0] * t + 20 * (1 - t));
    const g2 = Math.round(bot[1] * t + 16 * (1 - t));
    const b2 = Math.round(bot[2] * t + 34 * (1 - t));
    const grad = ctx.createLinearGradient(0, 0, 0, this.viewH);
    grad.addColorStop(0, `rgb(${r},${g},${b})`);
    grad.addColorStop(0.55, `rgb(${Math.round((r + r2) / 2)},${Math.round((g + g2) / 2)},${Math.round((b + b2) / 2)})`);
    grad.addColorStop(1, `rgb(${r2},${g2},${b2})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, this.viewW, this.viewH);

    // painted cinematic sky backdrop (day) — scrolls with slow parallax
    if (!night && this.skyImg) {
      const img = this.skyImg;
      const iw = img.width, ih = img.height;
      // cover the viewport width with parallax based on camera
      const skyWorldW = this.world.w * TILE;
      const par = (this.camX / skyWorldW) * (iw - this.viewW);
      const dawnDusk = 1 - Math.min(1, Math.abs(bright - 0.85) * 3);
      ctx.save();
      ctx.globalAlpha = 0.78 + dawnDusk * 0.2;
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(img, par, 0, this.viewW, ih, 0, 0, this.viewW, this.viewH * 0.72);
      // blend the bottom edge into the gradient so terrain meets sky smoothly
      const fade = ctx.createLinearGradient(0, this.viewH * 0.5, 0, this.viewH * 0.72);
      fade.addColorStop(0, "rgba(0,0,0,0)");
      fade.addColorStop(1, `rgba(${r2},${g2},${b2},0.9)`);
      ctx.globalAlpha = 1;
      ctx.fillStyle = fade;
      ctx.fillRect(0, this.viewH * 0.5, this.viewW, this.viewH * 0.22);
      ctx.restore();
      void iw;
    }

    // sun / moon
    const ang = this.dayFrac * Math.PI * 2 - Math.PI / 2;
    const cx = this.viewW / 2 + Math.cos(ang) * this.viewW * 0.42;
    const cy = this.viewH * 0.42 + Math.sin(ang) * this.viewH * 0.4;
    // volumetric god rays (daytime, when sun is up)
    if (!night && bright > 0.25 && cy < this.viewH * 0.6) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.translate(cx, cy);
      const rays = 8;
      for (let i = 0; i < rays; i++) {
        const spread = (-0.6 + i / (rays - 1)) * 1.0 + 1.35;
        const wob = Math.sin(this.frame * 0.012 + i * 1.7) * 0.04;
        ctx.save();
        ctx.rotate(spread + wob);
        const len = this.viewH * 1.5;
        const rg = ctx.createLinearGradient(0, 0, 0, len);
        rg.addColorStop(0, "rgba(255,240,205,0.13)");
        rg.addColorStop(0.5, "rgba(255,235,190,0.05)");
        rg.addColorStop(1, "rgba(255,235,190,0)");
        ctx.fillStyle = rg;
        ctx.beginPath();
        ctx.moveTo(-7, 0);
        ctx.lineTo(7, 0);
        ctx.lineTo(46, len);
        ctx.lineTo(-46, len);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
      ctx.restore();
    }
    ctx.save();
    if (!night) {
      const sg = ctx.createRadialGradient(cx, cy, 4, cx, cy, 60);
      sg.addColorStop(0, "rgba(255,245,200,0.95)");
      sg.addColorStop(1, "rgba(255,245,200,0)");
      ctx.fillStyle = sg;
      ctx.fillRect(cx - 60, cy - 60, 120, 120);
      ctx.fillStyle = "#fff6d8";
      ctx.beginPath();
      ctx.arc(cx, cy, 22, 0, Math.PI * 2);
      ctx.fill();
      // drifting pixel clouds
      ctx.globalAlpha = 0.85;
      const cloud = (bx: number, by: number, s: number) => {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(bx, by, 10 * s, 4 * s);
        ctx.fillRect(bx + 2 * s, by - 2 * s, 7 * s, 4 * s);
        ctx.fillRect(bx + 4 * s, by - 4 * s, 4 * s, 4 * s);
        ctx.fillStyle = "rgba(180,210,240,0.6)";
        ctx.fillRect(bx, by + 4 * s, 10 * s, 2 * s);
      };
      const drift = (this.camX + this.frame * 6) * 0.08;
      for (let i = 0; i < 5; i++) {
        const cxc = ((i * 380 + drift) % (this.viewW + 120)) - 60;
        const cyc = 40 + ((i * 53) % 90);
        cloud(cxc, cyc, 2 + (i % 2));
      }
      ctx.globalAlpha = 1;
    } else {
      // stars
      for (let i = 0; i < 60; i++) {
        const x = (i * 977) % this.viewW;
        const y = (i * 613) % (this.viewH * 0.6);
        ctx.globalAlpha = 0.4 + 0.5 * Math.sin(this.frame * 0.03 + i);
        ctx.fillStyle = "#cfe0ff";
        ctx.fillRect(x, y, 2, 2);
      }
      ctx.globalAlpha = 1;
      const mg = ctx.createRadialGradient(cx, cy, 4, cx, cy, 50);
      mg.addColorStop(0, "rgba(220,225,255,0.8)");
      mg.addColorStop(1, "rgba(220,225,255,0)");
      ctx.fillStyle = mg;
      ctx.fillRect(cx - 50, cy - 50, 100, 100);
      ctx.fillStyle = "#e8ebff";
      ctx.beginPath();
      ctx.arc(cx, cy, 18, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // parallax layered mountains / hills (3 layers, atmospheric tint)
    for (let layer = 0; layer < 3; layer++) {
      ctx.beginPath();
      const off = this.camX * (0.15 + layer * 0.18);
      const baseY = this.viewH * (0.52 + layer * 0.11);
      ctx.moveTo(0, this.viewH);
      for (let x = 0; x <= this.viewW; x += 14) {
        const y = baseY + Math.sin((x + off) * 0.008) * (38 - layer * 8) + Math.sin((x + off) * 0.027) * (16 - layer * 4) + Math.sin((x + off) * 0.05) * 6;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(this.viewW, this.viewH);
      ctx.closePath();
      const fade = 0.4 + layer * 0.22;
      if (night) {
        ctx.fillStyle = `rgba(${18 + layer * 4},${16 + layer * 4},${40 + layer * 5},${0.7 + layer * 0.12})`;
      } else {
        const tint = layer === 0 ? [86, 140, 96] : layer === 1 ? [64, 110, 78] : [46, 84, 64];
        ctx.fillStyle = `rgba(${tint[0]},${tint[1]},${tint[2]},${fade})`;
      }
      ctx.fill();
      // tree silhouettes on the nearest two layers (day)
      if (!night && layer < 2) {
        const treeColor = layer === 0 ? "rgba(40,86,52,0.6)" : "rgba(34,72,46,0.7)";
        ctx.fillStyle = treeColor;
        for (let x = 0; x <= this.viewW; x += 26) {
          const wob = Math.sin((x + off) * 0.008) * (38 - layer * 8);
          const wob2 = Math.sin((x + off) * 0.027) * (16 - layer * 4);
          const gy = baseY + wob + wob2;
          if (((x * 7 + layer * 99) % 100) > 62) {
            const th = 12 + ((x * 13) % 10);
            ctx.beginPath();
            ctx.moveTo(x, gy + 2);
            ctx.lineTo(x - 5, gy - th + 4);
            ctx.lineTo(x, gy - th - 3);
            ctx.lineTo(x + 5, gy - th + 4);
            ctx.closePath();
            ctx.fill();
          }
        }
      }
    }
  }

  private drawTile(ctx: CanvasRenderingContext2D, tx: number, ty: number, id: number) {
    const x = tx * TILE;
    const y = ty * TILE;
    if (id === PORTAL) {
      // animated portal (purple swirl)
      const cx = x + TILE / 2;
      const cy = y + TILE / 2;
      const fl = 0.7 + 0.3 * Math.sin(this.frame * 0.15 + tx * 2.3 + ty * 1.7);
      // glow
      const og = ctx.createRadialGradient(cx, cy, 1, cx, cy, 20);
      og.addColorStop(0, "rgba(180,100,220,0.6)");
      og.addColorStop(1, "rgba(120,50,180,0)");
      ctx.fillStyle = og;
      ctx.fillRect(cx - 20, cy - 20, 40, 40);
      // inner swirl
      ctx.fillStyle = "#9b59b6";
      ctx.beginPath();
      ctx.arc(cx, cy, 10 * fl, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#c39bd3";
      ctx.beginPath();
      ctx.arc(cx, cy, 6 * fl, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#e8daef";
      ctx.beginPath();
      ctx.arc(cx, cy, 3 * fl, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    if (id === TORCH) {
      // animated torch (pixel-art)
      const cx = x + TILE / 2;
      ctx.fillStyle = "#5a3a1c";
      ctx.fillRect(cx - 2, y + TILE - 16, 4, 14);
      const fl = 0.8 + 0.2 * Math.sin(this.frame * 0.3 + tx * 1.7);
      // outer flame glow
      const og = ctx.createRadialGradient(cx, y + TILE - 14, 1, cx, y + TILE - 14, 18);
      og.addColorStop(0, "rgba(255,180,60,0.5)");
      og.addColorStop(1, "rgba(255,140,40,0)");
      ctx.fillStyle = og;
      ctx.fillRect(cx - 18, y + TILE - 32, 36, 36);
      // flame body
      ctx.fillStyle = "#ff9d3c";
      ctx.beginPath();
      ctx.ellipse(cx, y + TILE - 15, 4, 7 * fl, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#ffd24a";
      ctx.beginPath();
      ctx.ellipse(cx, y + TILE - 15, 2.5, 5 * fl, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fff3c4";
      ctx.beginPath();
      ctx.ellipse(cx, y + TILE - 14, 1.2, 2.6 * fl, 0, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    // blit cached pixel-art texture (4 variants for variety). The textures
    // already bake in edge shading, so no per-tile overlays are needed here.
    const v = (tx * 7 ^ ty * 13) & 3;
    ctx.drawImage(tileTexture(id, v), 0, 0, TEX, TEX, x, y, TILE, TILE);
    // single cheap highlight on the top edge of surface-exposed blocks.
    if (!isSolid(getTile(this.world, tx, ty - 1))) {
      ctx.fillStyle = "rgba(255,255,255,0.12)";
      ctx.fillRect(x, y, TILE, 2);
    }
  }

  private drawCracks(ctx: CanvasRenderingContext2D) {
    const id = getTile(this.world, this.mineTX, this.mineTY);
    const def = TILES[id];
    if (!def) return;
    const prog = Math.min(1, this.mineProg / def.hp);
    const x = this.mineTX * TILE;
    const y = this.mineTY * TILE;
    ctx.strokeStyle = "rgba(0,0,0,0.55)";
    ctx.lineWidth = 2;
    const c = TILE / 2;
    const n = Math.floor(prog * 5);
    for (let i = 0; i < n; i++) {
      ctx.beginPath();
      const a = (i / 5) * Math.PI * 2;
      ctx.moveTo(x + c, y + c);
      ctx.lineTo(x + c + Math.cos(a) * (TILE * 0.42), y + c + Math.sin(a) * (TILE * 0.42));
      ctx.stroke();
    }
    // outline
    ctx.strokeStyle = "rgba(255,255,255,0.6)";
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y + 1, TILE - 2, TILE - 2);
  }

  private drawTarget(ctx: CanvasRenderingContext2D) {
    const tx = this.mouseTX;
    const ty = this.mouseTY;
    if (tx < 0 || ty < 0 || tx >= this.world.w || ty >= this.world.h) return;
    if (!this.withinReach(tx, ty)) {
      ctx.strokeStyle = "rgba(255,80,80,0.5)";
    } else {
      ctx.strokeStyle = "rgba(255,255,255,0.85)";
    }
    ctx.lineWidth = 2;
    ctx.strokeRect(tx * TILE + 1, ty * TILE + 1, TILE - 2, TILE - 2);
  }

  private drawPlayer(ctx: CanvasRenderingContext2D) {
    const x = this.px;
    const y = this.py;
    const blink = this.invuln > 0 && Math.floor(this.frame / 4) % 2 === 0;
    // drop shadow
    ctx.save();
    ctx.globalAlpha = this.onGround ? 0.3 : 0.15;
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.ellipse(x, y + 22, 13, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    const moving = this.onGround && this.pvx !== 0;
    const bob = moving ? Math.abs(Math.sin(this.walkT)) * -2 : this.onGround ? Math.sin(this.frame * 0.06) * 0.6 : 0;
    const footY = y + 22 + bob;
    const spr = getSprite("player");

    ctx.save();
    ctx.globalAlpha = blink ? 0.4 : 1;
    if (spr) {
      this.blitFeet(ctx, spr, x, footY, 56, this.pface, 1);
    } else {
      this.drawPlayerFallback(ctx, x, y + bob, moving, this.pface);
    }
    ctx.restore();

    // tool / weapon in hand (drawn over the body)
    this.drawTool(ctx, x, y + bob);
  }

  private drawPlayerFallback(ctx: CanvasRenderingContext2D, x: number, y: number, moving: boolean, face: number) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(face, 1);
    const legSwing = moving ? Math.sin(this.walkT) * 6 : 0;
    const OL = "#241208";
    ctx.fillStyle = OL;
    ctx.fillRect(-8, 8, 8, 16 + legSwing);
    ctx.fillRect(0, 8, 8, 16 - legSwing);
    ctx.fillStyle = "#5a3a22";
    ctx.fillRect(-7, 9, 6, 14 + legSwing);
    ctx.fillRect(1, 9, 6, 14 - legSwing);
    ctx.fillStyle = "#3a2614";
    ctx.fillRect(-7, 19 + legSwing, 7, 4);
    ctx.fillRect(1, 19 - legSwing, 7, 4);
    ctx.fillStyle = OL;
    ctx.fillRect(-10, -11, 20, 23);
    const tg = ctx.createLinearGradient(0, -11, 0, 12);
    tg.addColorStop(0, "#5aa0e0");
    tg.addColorStop(0.5, "#3a78c8");
    tg.addColorStop(1, "#264f8a");
    ctx.fillStyle = tg;
    ctx.fillRect(-9, -10, 18, 21);
    ctx.fillStyle = "#7a4a22";
    ctx.fillRect(-9, 3, 18, 4);
    ctx.fillStyle = "#e7c14a";
    ctx.fillRect(-2, 3, 4, 4);
    ctx.fillStyle = "rgba(255,245,200,0.5)";
    ctx.beginPath();
    ctx.arc(0, -3, 2.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = OL;
    ctx.fillRect(-8, -26, 16, 16);
    const hg = ctx.createLinearGradient(0, -26, 0, -10);
    hg.addColorStop(0, "#fbd9aa");
    hg.addColorStop(1, "#e0b07c");
    ctx.fillStyle = hg;
    ctx.fillRect(-7, -25, 14, 14);
    ctx.fillStyle = "#5a3a22";
    ctx.fillRect(-7, -26, 14, 6);
    ctx.fillStyle = "#1a2230";
    ctx.fillRect(3, -19, 3, 3);
    ctx.restore();
  }

  /** Draw a sprite with its feet at footY, scaled to height h. */
  private blitFeet(ctx: CanvasRenderingContext2D, spr: HTMLCanvasElement, cx: number, footY: number, h: number, facing: number, sy: number) {
    const sw = spr.width, sh = spr.height;
    const scale = h / sh;
    const dw = sw * scale;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.translate(cx, footY);
    ctx.scale(facing, sy);
    ctx.drawImage(spr, 0, 0, sw, sh, -dw / 2, -h, dw, h);
    ctx.restore();
  }
  private drawTool(ctx: CanvasRenderingContext2D, x: number, y: number) {
    const s = this.selectedSlot();
    const hasTool = s && ITEMS[s.id]?.kind === "tool";
    const swing = this.swingT > 0 ? Math.sin((1 - this.swingT / 0.18) * Math.PI) : 0;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(this.pface, 1);
    ctx.translate(7, -4);
    ctx.rotate(-0.25 - swing * 1.7);
    // forearm + wooden handle
    ctx.fillStyle = "#f0c08a";
    ctx.fillRect(0, 0, 5, 11);
    if (hasTool) {
      const it = ITEMS[s!.id];
      // BOLD material palette — each tier is unmistakably different.
      const mat: Record<string, { h: string; d: string; shaft: string; gem?: string }> = {
        wood: { h: "#c08a4e", d: "#7c5226", shaft: "#8a5a2c" },
        stone: { h: "#b4bac6", d: "#5c606c", shaft: "#7c5226" },
        copper: { h: "#f0933f", d: "#9c5018", shaft: "#7c5226" },
        iron: { h: "#eef2f8", d: "#8c93a3", shaft: "#5a3a22" },
        gold: { h: "#ffd23b", d: "#b8860b", shaft: "#5a3a22", gem: "#ff3b6d" },
      };
      const prefix = s!.id.split("_")[0];
      const m = mat[prefix] ?? mat.wood;
      const gem = m.gem;
      const OL = "#1a1408";
      ctx.translate(2, 0);
      ctx.rotate(0.35);
      // shared shaft (handle), color shifts for higher tiers
      ctx.strokeStyle = m.shaft;
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, 18);
      ctx.stroke();

      if (it.tool === "pickaxe") {
        // pick head: outlined dark back, bright front, gem for gold
        ctx.strokeStyle = OL;
        ctx.lineWidth = 7;
        ctx.beginPath();
        ctx.moveTo(-11, 14);
        ctx.quadraticCurveTo(0, 7, 11, 14);
        ctx.stroke();
        ctx.strokeStyle = m.d;
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(-11, 14);
        ctx.quadraticCurveTo(0, 8, 11, 14);
        ctx.stroke();
        ctx.strokeStyle = m.h;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(-10, 13);
        ctx.quadraticCurveTo(0, 9, 10, 13);
        ctx.stroke();
        if (gem) { ctx.fillStyle = gem; ctx.fillRect(-2, 10, 3, 3); }
      } else if (it.tool === "sword") {
        // crossguard
        ctx.fillStyle = gem ? "#ffd23b" : "#9a6a3a";
        ctx.fillRect(-6, 0, 12, 3);
        ctx.fillStyle = OL;
        ctx.fillRect(-2, 1, 4, 5);
        // blade with outline, color strongly by material
        ctx.fillStyle = OL;
        ctx.beginPath();
        ctx.moveTo(-3.5, 0);
        ctx.lineTo(3.5, 0);
        ctx.lineTo(2.5, -23);
        ctx.lineTo(0, -28);
        ctx.lineTo(-2.5, -23);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = m.d;
        ctx.beginPath();
        ctx.moveTo(-3, 0);
        ctx.lineTo(3, 0);
        ctx.lineTo(2, -22);
        ctx.lineTo(0, -26);
        ctx.lineTo(-2, -22);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = m.h;
        ctx.beginPath();
        ctx.moveTo(-2, 0);
        ctx.lineTo(2, 0);
        ctx.lineTo(1, -20);
        ctx.lineTo(0, -24);
        ctx.lineTo(-1, -20);
        ctx.closePath();
        ctx.fill();
        // shine streak
        ctx.fillStyle = "rgba(255,255,255,0.6)";
        ctx.fillRect(0, -23, 1, 19);
        if (gem) { ctx.fillStyle = gem; ctx.fillRect(-1.5, 2, 3, 3); }
      } else if (it.tool === "axe") {
        // axe head with outline, color by material
        ctx.fillStyle = OL;
        ctx.beginPath();
        ctx.moveTo(0, 4);
        ctx.quadraticCurveTo(15, 5, 15, 15);
        ctx.lineTo(12, 19);
        ctx.lineTo(0, 15);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = m.d;
        ctx.beginPath();
        ctx.moveTo(0, 5);
        ctx.quadraticCurveTo(14, 6, 14, 14);
        ctx.lineTo(11, 18);
        ctx.lineTo(0, 14);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = m.h;
        ctx.beginPath();
        ctx.moveTo(0, 6);
        ctx.quadraticCurveTo(12, 7, 12, 13);
        ctx.lineTo(0, 13);
        ctx.closePath();
        ctx.fill();
        if (gem) { ctx.fillStyle = gem; ctx.fillRect(7, 9, 3, 3); }
      }
    }
    ctx.restore();
  }

  private drawEnemy(ctx: CanvasRenderingContext2D, e: Enemy) {
    const flash = e.hitFlash > 0;
    const rage = e.type === "king" && e.hp < e.maxHp / 2;
    const OL = "#0a0f06";
    // drop shadow
    ctx.save();
    ctx.globalAlpha = e.type === "bat" ? 0.1 : 0.26;
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.ellipse(e.x, e.y + e.h / 2 + 2, e.w * 0.5, e.type === "bat" ? 3 : 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // ---- procedural models (each enemy has a distinct, unique appearance) ----
    ctx.save();
    ctx.translate(e.x, e.y);
    if (e.type === "slime" || e.type === "king") {
      const R = e.w / 2;
      const squish = e.onGround ? 1 + Math.sin(e.t * 3) * 0.03 : 0.84;
      const cy = e.h / 2 - R * squish;
      ctx.fillStyle = OL;
      ctx.beginPath();
      ctx.ellipse(0, cy, R + 1.5, R * squish + 1.5, 0, 0, Math.PI * 2);
      ctx.fill();
      const g = ctx.createRadialGradient(-R * 0.3, cy - R * 0.4, 2, 0, cy, R);
      if (e.type === "king") {
        if (rage) {
          g.addColorStop(0, "#ff7f7f");
          g.addColorStop(0.6, "#c83030");
          g.addColorStop(1, "#8f1e22");
        } else {
          g.addColorStop(0, "#7fe07f");
          g.addColorStop(0.6, "#3aa83a");
          g.addColorStop(1, "#1f6e22");
        }
      } else {
        g.addColorStop(0, "#bff7c2");
        g.addColorStop(0.6, "#5fd06f");
        g.addColorStop(1, "#2f8a3c");
      }
      ctx.fillStyle = flash ? "#fff" : g;
      ctx.beginPath();
      ctx.ellipse(0, cy, R, R * squish, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      ctx.beginPath();
      ctx.ellipse(-R * 0.35, cy - R * 0.45, R * 0.22, R * 0.16, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#0a1a0a";
      ctx.fillRect(-R * 0.45, cy - 2, 4, 5);
      ctx.fillRect(R * 0.1, cy - 2, 4, 5);
      ctx.fillStyle = e.type === "king" ? "#ff5a5a" : "#fff";
      ctx.fillRect(-R * 0.45, cy, 2, 2);
      ctx.fillRect(R * 0.1, cy, 2, 2);
      if (e.type === "king") {
        ctx.fillStyle = "#ffd23b";
        ctx.beginPath();
        ctx.moveTo(-R * 0.55, cy - R * squish + 1);
        ctx.lineTo(-R * 0.4, cy - R * squish - 12);
        ctx.lineTo(-R * 0.18, cy - R * squish - 4);
        ctx.lineTo(0, cy - R * squish - 16);
        ctx.lineTo(R * 0.18, cy - R * squish - 4);
        ctx.lineTo(R * 0.4, cy - R * squish - 12);
        ctx.lineTo(R * 0.55, cy - R * squish + 1);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "#ff3b5a";
        ctx.fillRect(-2, cy - R * squish - 9, 4, 4);
        ctx.fillStyle = "#3b9bff";
        ctx.fillRect(-R * 0.4 + 1, cy - R * squish - 9, 3, 3);
        ctx.fillRect(R * 0.4 - 4, cy - R * squish - 9, 3, 3);
      }
      // red tint overlay for rage mode
      if (rage) {
        ctx.globalAlpha = 0.25;
        ctx.fillStyle = "#ff0000";
        ctx.beginPath();
        ctx.ellipse(0, cy, R, R * squish, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    } else if (e.type === "zombie") {
      ctx.scale(e.facing, 1);
      const sh = Math.sin(e.t * 6) * 1.5;
      ctx.fillStyle = OL;
      ctx.fillRect(-9, 4, 8, 18);
      ctx.fillRect(1, 4, 8, 18);
      ctx.fillStyle = "#33402f";
      ctx.fillRect(-8, 5, 6, 16);
      ctx.fillRect(2, 5, 6, 16);
      ctx.fillStyle = OL;
      ctx.fillRect(-10, -6 + sh, 20, 22);
      ctx.fillStyle = flash ? "#fff" : "#3a5a32";
      ctx.fillRect(-9, -5 + sh, 18, 20);
      ctx.fillStyle = "#26401f";
      ctx.fillRect(-9, 9 + sh, 18, 4);
      ctx.fillStyle = flash ? "#fff" : "#5e8a4a";
      ctx.beginPath();
      ctx.moveTo(-9, 12 + sh);
      ctx.lineTo(-5, 18);
      ctx.lineTo(-1, 12 + sh);
      ctx.fill();
      ctx.fillStyle = OL;
      ctx.fillRect(-8, -22 + sh, 16, 16);
      ctx.fillStyle = flash ? "#fff" : "#7aa862";
      ctx.fillRect(-7, -21 + sh, 14, 14);
      ctx.fillStyle = "#3a5a2a";
      ctx.fillRect(-7, -21 + sh, 14, 4);
      ctx.fillStyle = "#1a0f0a";
      ctx.fillRect(2, -16 + sh, 3, 3);
      ctx.fillRect(-4, -16 + sh, 3, 3);
      ctx.fillStyle = OL;
      ctx.fillRect(8, -2 + sh, 8, 6);
      ctx.fillStyle = flash ? "#fff" : "#6f9a58";
      ctx.fillRect(9, -1 + sh, 7, 4);
    } else if (e.type === "bat") {
      const flap = Math.sin(e.t * 20) * 7;
      const tilt = Math.sin(e.t * 10) * 0.1;
      ctx.rotate(tilt);
      ctx.fillStyle = OL;
      ctx.beginPath();
      ctx.moveTo(-2, 0);
      ctx.lineTo(-17, -flap - 1);
      ctx.lineTo(-11, 5);
      ctx.closePath();
      ctx.moveTo(2, 0);
      ctx.lineTo(17, -flap - 1);
      ctx.lineTo(11, 5);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = flash ? "#fff" : "#8a6ad8";
      ctx.beginPath();
      ctx.moveTo(-2, 0);
      ctx.lineTo(-16, -flap);
      ctx.lineTo(-11, 4);
      ctx.closePath();
      ctx.moveTo(2, 0);
      ctx.lineTo(16, -flap);
      ctx.lineTo(11, 4);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = OL;
      ctx.beginPath();
      ctx.ellipse(0, 0, 9, 8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = flash ? "#fff" : "#6a4ac0";
      ctx.beginPath();
      ctx.ellipse(0, 0, 8, 7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = OL;
      ctx.fillRect(-5, -11, 3, 4);
      ctx.fillRect(2, -11, 3, 4);
      ctx.fillStyle = "#ff3b3b";
      ctx.fillRect(-4, -1, 2, 2);
      ctx.fillRect(2, -1, 2, 2);
    }
    ctx.restore();
  }

  // ---------- smooth Terraria-style lighting ----------
  private drawLighting(tx0: number, ty0: number, tx1: number, ty1: number, bright: number) {
    const ctx = this.ctx;
    const night = this.isNightNow();

    const gw = tx1 - tx0 + 1;
    const gh = ty1 - ty0 + 1;
    if (gw <= 0 || gh <= 0) return;

    // (re)allocate buffers
    if (!this.lightBuf || this.lightW !== gw || this.lightH !== gh) {
      this.lightW = gw;
      this.lightH = gh;
      this.lightBuf = document.createElement("canvas");
      this.lightBuf.width = gw;
      this.lightBuf.height = gh;
      this.lightImg = this.lightBuf.getContext("2d")!.createImageData(gw, gh);
      this.lightGrid = new Float32Array(gw * gh);
      this.lightTmp = new Float32Array(gw * gh);
    }
    const grid = this.lightGrid!;
    const tmp = this.lightTmp!;

    // base light from sky: lit where open to the sky (at/above surface), fading underground
    const skyAmbient = Math.max(bright, night ? 0.16 : 0.25);
    for (let j = 0; j < gh; j++) {
      const ty = ty0 + j;
      for (let i = 0; i < gw; i++) {
        const tx = tx0 + i;
        const surf = this.world.surfaceY[tx];
        let l: number;
        if (ty <= surf) {
          l = skyAmbient; // open sky
        } else {
          const d = ty - surf;
          l = skyAmbient * Math.max(0, 1 - d / 3) * 0.4; // a little bleed into topsoil
        }
        grid[j * gw + i] = l;
      }
    }

    // point lights (player + emissive tiles) add soft radial glow
    const addLight = (wx: number, wy: number, rTiles: number, intensity: number) => {
      const r = rTiles;
      const cx = (wx / TILE) - tx0;
      const cy = (wy / TILE) - ty0;
      const i0 = Math.max(0, Math.floor(cx - r));
      const i1 = Math.min(gw - 1, Math.ceil(cx + r));
      const j0 = Math.max(0, Math.floor(cy - r));
      const j1 = Math.min(gh - 1, Math.ceil(cy + r));
      const rpx = r;
      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
          const dist = Math.hypot(i + 0.5 - cx, j + 0.5 - cy);
          if (dist < rpx) {
            const v = (1 - dist / rpx);
            const g = grid[j * gw + i];
            grid[j * gw + i] = Math.min(1, Math.max(g, v * v * intensity));
          }
        }
      }
    };
    addLight(this.px, this.py - 6, 6.5, night ? 1 : 0.7);
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const id = getTile(this.world, tx, ty);
        const L = TILES[id]?.light ?? 0;
        if (L > 0) {
          addLight(tx * TILE + TILE / 2, ty * TILE + TILE / 2, L * 0.5 + 2, 1);
        }
      }
    }

    // box blur (separable, radius 2) → smooth, spreading light like Terraria
    const blurX = (src: Float32Array, dst: Float32Array) => {
      for (let j = 0; j < gh; j++) {
        for (let i = 0; i < gw; i++) {
          let s = src[j * gw + i], n = 1;
          if (i > 0) { s += src[j * gw + i - 1]; n++; }
          if (i < gw - 1) { s += src[j * gw + i + 1]; n++; }
          dst[j * gw + i] = s / n;
        }
      }
    };
    const blurY = (src: Float32Array, dst: Float32Array) => {
      for (let j = 0; j < gh; j++) {
        for (let i = 0; i < gw; i++) {
          let s = src[j * gw + i], n = 1;
          if (j > 0) { s += src[(j - 1) * gw + i]; n++; }
          if (j < gh - 1) { s += src[(j + 1) * gw + i]; n++; }
          dst[j * gw + i] = s / n;
        }
      }
    };
    blurX(grid, tmp);
    blurY(tmp, grid);

    // write to image data (darkness with night tint)
    const data = this.lightImg!.data;
    const dr = night ? 4 : 0;
    const dg = night ? 7 : 0;
    const db = night ? 18 : 3;
    for (let p = 0; p < grid.length; p++) {
      const light = Math.min(1, grid[p]);
      const dark = (1 - light) * 255;
      const o = p * 4;
      data[o] = dr;
      data[o + 1] = dg;
      data[o + 2] = db;
      data[o + 3] = dark;
    }
    this.lightBuf!.getContext("2d")!.putImageData(this.lightImg!, 0, 0);

    // blit scaled-up with smoothing for soft gradients
    const ox = tx0 * TILE - this.camX;
    const oy = ty0 * TILE - this.camY;
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.lightBuf!, 0, 0, gw, gh, ox, oy, gw * TILE, gh * TILE);
    ctx.restore();
  }
}
