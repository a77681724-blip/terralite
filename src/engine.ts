// src/engine.ts — Terraria-like sandbox engine.
// Physics, mining/building, crafting, enemies, boss, day/night, lighting, quests, rendering.

import {
  AIR, STONE, WOOD, LEAVES, COPPER, IRON, TORCH, WORKBENCH, FURNACE, PORTAL,
  BEDROCK, SHARD, HOLLOW_GATE, SKY_SPIRE,
  TILE, TILES, isSolid, ITEMS, RECIPES, generateWorld, getTile, setTile,
  buildSkyRealm, skyLayout,
  type World, type Recipe, type SkyLayout,
} from "./world";
import { audio } from "./audio";
import { initSprites, getSprite } from "./sprites";
import { tileTexture, wallTexture, TEX } from "./pixart";
import { CHAPTER2_ENDING, SECRET_TRUST } from "./story";
import { t, tQuest } from "./i18n";
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
const LAST_WORLD_KEY = "terralite_last_world";

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
  // Chapter II — The Debt of Light
  c2Active: boolean;
  heirFed: number;
  shardsFound: number;
  ending: string | null;
  story: string | null;
  /** Waypoint to the toll gate while Chapter II's XXI quest is active. */
  c2Track: { x: number; y: number; dist: number; coins: number; total: number } | null;
  /** Standing next to a Chapter II chime that is still waiting to be rung. */
  nearChime: boolean;
}
export interface EngineCallbacks {
  onState: (s: EngineState) => void;
  onGameOver: () => void;
  onVictory: () => void;
  onStory?: (id: string) => void;
}

interface Enemy {
  type: "slime" | "zombie" | "bat" | "king" | "wisp" | "herald" | "auditor" | "storm";
  x: number; y: number; vx: number; vy: number;
  w: number; h: number; hp: number; maxHp: number;
  facing: number; onGround: boolean; hopT: number; hitFlash: number; t: number;
  spawnT: number; knock: number; swoopT: number;
}
interface Particle { x: number; y: number; vx: number; vy: number; life: number; max: number; size: number; color: string; grav: number; ring?: boolean; sway?: number; }
interface FloatText { x: number; y: number; vy: number; life: number; text: string; color: string; }

interface QuestDef { title: string; text: string; done: string; reward: string; }

// Chapter II quest slots. Keep these as constants: story triggers, shard
// spawning and the summit check all key off them.
const C2_START = 11;
const C2_CLOUDPATH = 11;
const C2_FEED = 12;
const C2_MOTES = 13;
const C2_NAME = 14;
const C2_WISPS = 15;
const C2_ESSENCE = 16;
const C2_BLADE = 17;
const C2_SHRINES = 18;
const C2_SHARD1 = 19;
const C2_TOLL = 20;
const C2_SIGIL = 21;
const C2_AUDITOR = 22;
const C2_UNDERSKY = 23;
const C2_CHIMES = 24;
const C2_SHARD2 = 25;
const C2_SIEGE = 26;
const C2_HERALD = 27;
const C2_TRUST = 28;
const C2_SHARD3 = 29;
const C2_STORM = 30;
const C2_WITNESS = 31;
const C2_CONFESSION = 32;
const C2_BELL = 33;
const C2_LAST = 34;

const CHIME_ORDER = [1, 2, 0];

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
  // Chapter II — The Skyhold
  { title: "XII — The Cloudpath", text: "Cross the cloud path to the far island", done: "The sky opens its ledger.", reward: "+20 Max HP" },
  { title: "XIII — The Hungry Heir", text: "Feed the slime heir 5 Slime Gel", done: "It remembers every drop.", reward: "+5 Gel" },
  { title: "XIV — Motes of the Fallen Sky", text: "Collect 3 skylight motes above the islands", done: "The sky's loose light gathers in your pack.", reward: "+10 Max HP" },
  { title: "XV — A Name for the Heavy", text: "Feed Pell 3 more Slime Gel (8 total)", done: "The heir has a name — and a voice.", reward: "+10 Max HP" },
  { title: "XVI — Wings in the Static", text: "Defeat 5 sky wisps", done: "The static goes quiet.", reward: "+5 Gel" },
  { title: "XVII — Storm Essence", text: "Gather 8 Storm Essence", done: "Bottled lightning hums against your ribs.", reward: "+6 Torches" },
  { title: "XVIII — The Skyforged Edge", text: "Craft the Skyforged Blade (8 essence)", done: "The blade weighs less than a promise.", reward: "+20 Max HP" },
  { title: "XIX — The Lantern Shrines", text: "Light the three lantern shrines with torches", done: "Three small suns hold the clouds together.", reward: "+10 Max HP" },
  { title: "XX — The Ledger I", text: "Touch the first memory shard", done: "The First Warden's signature.", reward: "+10 Max HP" },
  { title: "XXI — The Toll Road", text: "Collect 5 sky coins, then pay at the toll gate on the second isle — follow the gold marker", done: "The Collector accepts names, not coin.", reward: "+10 Max HP" },
  { title: "XXII — The Warden's Sigil", text: "Recover the Warden's sigil from the fourth isle", done: "The seal still remembers your hand.", reward: "+5 Gel" },
  { title: "XXIII — The Auditor", text: "Defeat the Auditor", done: "The arithmetic of the sky is torn.", reward: "+20 Max HP" },
  { title: "XXIV — The Undersky", text: "Recover 3 pages from the archive island", done: "The Order's lie is written in its own hand.", reward: "+10 Max HP" },
  { title: "XXV — The Hymn of Return", text: "Ring the chimes in the order II → III → I", done: "The sky remembers the song.", reward: "+10 Max HP" },
  { title: "XXVI — The Ledger II", text: "Touch the second memory shard", done: "A payment plan made of light.", reward: "+10 Max HP" },
  { title: "XXVII — The Choir of Interest", text: "Survive 45 seconds at the archive", done: "The interest is paid in static.", reward: "+20 Max HP" },
  { title: "XXVIII — The Hollow Herald", text: "Defeat the Hollow Herald", done: "The Collector loses its voice.", reward: "+10 Gel" },
  { title: "XXIX — A Heavier Crown", text: "Raise the heir's trust to 15 Slime Gel", done: "It is heavy enough to wear a crown.", reward: "+20 Max HP" },
  { title: "XXX — The Ledger III", text: "Touch the third memory shard", done: "The Order's lie is exposed.", reward: "+10 Max HP" },
  { title: "XXXI — The Stormfather", text: "Defeat the Stormfather at the last camp", done: "The First Warden's apology breaks.", reward: "+20 Max HP" },
  { title: "XXXII — The Witness Stones", text: "Touch the four witness stones on the climb", done: "Four names, one blank stone.", reward: "+10 Max HP" },
  { title: "XXXIII — Mira's Confession", text: "Meet Mira at the last camp before the bell", done: "You know which ending she is writing.", reward: "+10 Max HP" },
  { title: "XXXIV — The Silent Bell", text: "Ring the silent bell at the summit isle", done: "The bell rings once — and the sky answers.", reward: "+10 Gel" },
  { title: "XXXV — The Last Step", text: "Climb to the summit where Mira waits", done: "The sky is ready to fall.", reward: "The fall" },
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
  private stepDustT = 0;

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

  // Chapter II — The Debt of Light
  private c2Active = false;
  private c2Seen = false;
  private c2Act2Seen = false;
  private c2Act3Seen = false;
  private c2Ending: string | null = null;
  private heirFed = 0;
  private shardsFound = 0;
  private moteBits = 0;
  private sigilFound = false;
  private bellRung = false;
  private wispsKilled = 0;
  private heraldDefeated = false;
  private c2NameSeen = false;
  private coinBits = 0;
  private tollPaid = false;
  private auditorIntroSeen = false;
  private auditorDefeated = false;
  private pageBits = 0;
  private chimeBits = 0;
  private chimeStep = 0;
  private chimeHover = -1;
  private siegeIntroSeen = false;
  private siegeActive = false;
  private siegeT = 0;
  private siegeSpawnT = 0;
  private siegeDone = false;
  private heraldIntroSeen = false;
  private stormIntroSeen = false;
  private stormDefeated = false;
  private witnessBits = 0;
  private confessionSeen = false;
  private c2TrustSeen = false;
  private storyId: string | null = null;
  private shardPos: { x: number; y: number; idx: number } | null = null;
  private gatePos: { x: number; y: number } | null = null;
  private heirX = 0;
  private heirY = 0;
  private heirHop = 0;
  private portalMsgCd = 0;
  private sky: SkyLayout | null = null;
  private flashT = 0;

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
    Engine.setLastWorldId(this.currentWorldId);
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
    this.showBanner(loaded ? t("welcome_back") : tQuest(0).title, loaded ? `${t("day")} ${this.dayCount} · ${t("auto_saved")}` : t("welcome_survivor"));
    this.prepareChapter2();
    if (this.c2Active && !this.c2Seen) {
      this.triggerStory("c2_intro");
      this.saveGame();
    }
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
      for (let i = 0; i < 4; i++) this.dust(this.px, this.py + 20, "rgba(190,170,140,0.8)");
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

  /**
   * Rings the chime the player is standing next to. Chimes only sound on an
   * explicit action (right-click or the mobile button), never on proximity.
   */
  ringNearbyChime(): boolean {
    if (this.questIndex !== C2_CHIMES || this.chimeStep >= CHIME_ORDER.length) return false;
    const near = this.chimeInReach();
    if (near < 0) return false;
    const l = this.sky ?? skyLayout(this.world);
    const cx = (l.chimes[near].x + 0.5) * TILE;
    const cy = (l.chimes[near].y + 0.5) * TILE;
    // Already rung — ignore, so a stray click while standing beside a chime
    // that just sounded cannot wipe the sequence.
    if (this.chimeBits & (1 << near)) return true;
    if (near === CHIME_ORDER[this.chimeStep]) {
      this.chimeBits |= 1 << near;
      this.chimeStep++;
      audio.playSfx("levelup");
      for (let k = 0; k < 10; k++) this.dust(cx, cy, "#bff3ff");
      this.showBanner("THE HYMN OF RETURN", `${this.chimeStep} / ${CHIME_ORDER.length}`);
      if (this.chimeStep >= CHIME_ORDER.length) {
        this.particles.push({ x: cx, y: cy, vx: 0, vy: 0, life: 0.8, max: 0.8, size: 140, color: "rgba(190,243,255,0.9)", grav: 0, ring: true });
        this.triggerStory("c2_chimes");
      }
      this.saveGame();
    } else {
      this.chimeBits = 0;
      this.chimeStep = 0;
      audio.playSfx("hurt");
      for (let k = 0; k < 8; k++) this.dust(cx, cy, "#ff8b8b");
      this.showBanner("DISCORD", "The chimes fall silent — begin again");
      this.saveGame();
    }
    return true;
  }

  private chimeInReach(): number {
    const l = this.sky ?? skyLayout(this.world);
    for (let i = 0; i < l.chimes.length; i++) {
      const c = l.chimes[i];
      if (this.nearTile(c.x, c.y, 2.4)) return i;
    }
    return -1;
  }

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

  static getLastWorldId(): number | null {
    try {
      const raw = localStorage.getItem(LAST_WORLD_KEY);
      if (raw === null) return null;
      const id = Number(raw);
      return Number.isFinite(id) ? id : null;
    } catch {
      return null;
    }
  }

  static setLastWorldId(id: number) {
    try {
      localStorage.setItem(LAST_WORLD_KEY, String(id));
    } catch { /* ignore */ }
  }

  /**
   * World that "Play Free" should open. Creates and registers one when the
   * player has none, so the free world shows up in the Worlds tab.
   */
  static ensureFreeWorld(defaultName: string): number {
    const list = Engine.getWorldList();
    if (list.length === 0) {
      // An old free-play save exists but was never listed — adopt it.
      if (Engine.hasSaveForWorld(0)) {
        Engine.saveWorldList([{ id: 0, name: defaultName }]);
        return 0;
      }
      return Engine.createNewWorld(defaultName);
    }
    const last = Engine.getLastWorldId();
    if (last !== null && list.some((w) => w.id === last)) return last;
    const withSave = list.filter((w) => Engine.hasSaveForWorld(w.id));
    return (withSave.length > 0 ? withSave[withSave.length - 1] : list[list.length - 1]).id;
  }

  /**
   * World where Chapter II is unlocked (the Slime King already fell).
   * Returns null while every world is still in Chapter I.
   */
  static getChapter2WorldId(): number | null {
    const unlocked: { id: number; inProgress: boolean }[] = [];
    for (const w of Engine.getWorldList()) {
      try {
        const raw = localStorage.getItem(SAVE_KEY_PREFIX + w.id);
        if (!raw) continue;
        const d = JSON.parse(raw);
        if (!(d?.kingDefeated || d?.victory || d?.c2?.active)) continue;
        unlocked.push({ id: w.id, inProgress: !!d.c2?.active && !d.c2?.ending });
      } catch {
        /* corrupt save — skip */
      }
    }
    if (unlocked.length === 0) return null;
    const last = Engine.getLastWorldId();
    const recent = unlocked.find((u) => u.id === last);
    if (recent) return recent.id;
    const ongoing = unlocked.find((u) => u.inProgress);
    return (ongoing ?? unlocked[0]).id;
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
    Engine.setLastWorldId(worldId);
    const loaded = this.loadGame();
    if (loaded) {
      this.applySave(loaded);
      // Only rebuild the terrain when the save comes from another world id;
      // otherwise the saved blocks (and player position) must be kept.
      if (loaded.currentWorldId !== undefined && loaded.currentWorldId !== worldId) {
        this.world = generateWorld(worldId);
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
      this.currentWorldId = worldId;
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
    this.showBanner(loaded ? t("welcome_back") : tQuest(0).title, loaded ? `${t("day")} ${this.dayCount} · ${t("auto_saved")}` : t("welcome_survivor"));
    this.prepareChapter2();
    if (this.c2Active && !this.c2Seen) {
      this.triggerStory("c2_intro");
      this.saveGame();
    }
    this.raf = requestAnimationFrame((t) => this.loop(t));
  }

  /** Resume free-play in the current world after the victory cinematic ends. */
  resumeAfterVictory() {
    this.victory = false;
    this.gameover = false;
    this.hp = Math.max(this.hp, this.maxHp);
    if (this.c2Ending) {
      // The fall is the ending. Continuing must not leave the player standing
      // on the summit where Mira waits, so wake them up back on the ground.
      this.returnToGround();
      this.showBanner(t("aft_hut_title"), t("aft_hut_sub"));
      this.saveGame();
      this.pushState();
    }
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
    this.c2Active = false;
    this.c2Seen = false;
    this.c2Act2Seen = false;
    this.c2Act3Seen = false;
    this.c2Ending = null;
    this.heirFed = 0;
    this.shardsFound = 0;
    this.moteBits = 0;
    this.sigilFound = false;
    this.bellRung = false;
    this.wispsKilled = 0;
    this.heraldDefeated = false;
    this.c2NameSeen = false;
    this.coinBits = 0;
    this.tollPaid = false;
    this.auditorIntroSeen = false;
    this.auditorDefeated = false;
    this.pageBits = 0;
    this.chimeBits = 0;
    this.chimeStep = 0;
    this.chimeHover = -1;
    this.siegeIntroSeen = false;
    this.siegeActive = false;
    this.siegeT = 0;
    this.siegeSpawnT = 0;
    this.siegeDone = false;
    this.heraldIntroSeen = false;
    this.stormIntroSeen = false;
    this.stormDefeated = false;
    this.witnessBits = 0;
    this.confessionSeen = false;
    this.c2TrustSeen = false;
    this.storyId = null;
    this.shardPos = null;
    this.gatePos = null;
  }

  private saveGame() {
    if (!this.world) return;
    this.saveCounter = (this.saveCounter + 1) % 100000;
    try {
      const data = {
        v: 4,
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
        c2: {
          active: this.c2Active,
          seen: this.c2Seen,
          act2: this.c2Act2Seen,
          act3: this.c2Act3Seen,
          ending: this.c2Ending,
          heirFed: this.heirFed,
          shards: this.shardsFound,
          shard: this.shardPos,
          gate: this.gatePos,
          motes: this.moteBits,
          sigil: this.sigilFound,
          bell: this.bellRung,
          wisps: this.wispsKilled,
          herald: this.heraldDefeated,
          nameSeen: this.c2NameSeen,
          coins: this.coinBits,
          toll: this.tollPaid,
          auditorIntro: this.auditorIntroSeen,
          auditor: this.auditorDefeated,
          pages: this.pageBits,
          chimes: this.chimeBits,
          chimeStep: this.chimeStep,
          siegeIntro: this.siegeIntroSeen,
          siege: this.siegeDone,
          heraldIntro: this.heraldIntroSeen,
          stormIntro: this.stormIntroSeen,
          storm: this.stormDefeated,
          witness: this.witnessBits,
          confession: this.confessionSeen,
          trustSeen: this.c2TrustSeen,
        },
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
    const c2 = d.c2 ?? null;
    this.c2Active = !!c2?.active;
    this.c2Seen = !!c2?.seen;
    this.c2Act2Seen = !!c2?.act2;
    this.c2Act3Seen = !!c2?.act3;
    this.c2Ending = c2?.ending ?? null;
    this.heirFed = c2?.heirFed ?? 0;
    this.shardsFound = c2?.shards ?? 0;
    this.shardPos = c2?.shard ?? null;
    this.gatePos = c2?.gate ?? null;
    this.moteBits = c2?.motes ?? 0;
    this.sigilFound = !!c2?.sigil;
    this.bellRung = !!c2?.bell;
    this.wispsKilled = c2?.wisps ?? 0;
    this.heraldDefeated = !!c2?.herald;
    this.c2NameSeen = !!c2?.nameSeen;
    this.coinBits = c2?.coins ?? 0;
    this.tollPaid = !!c2?.toll;
    this.auditorIntroSeen = !!c2?.auditorIntro;
    this.auditorDefeated = !!c2?.auditor;
    this.pageBits = c2?.pages ?? 0;
    this.chimeBits = c2?.chimes ?? 0;
    this.chimeStep = Math.max(0, Math.min(3, c2?.chimeStep ?? 0));
    this.chimeHover = -1;
    this.siegeIntroSeen = !!c2?.siegeIntro;
    this.siegeDone = !!c2?.siege;
    this.siegeActive = false;
    this.siegeT = 0;
    this.siegeSpawnT = 0;
    this.heraldIntroSeen = !!c2?.heraldIntro;
    this.stormIntroSeen = !!c2?.stormIntro;
    this.stormDefeated = !!c2?.storm;
    this.witnessBits = c2?.witness ?? 0;
    this.confessionSeen = !!c2?.confession;
    this.c2TrustSeen = !!c2?.trustSeen;
    this.storyId = null;
    this.sky = null;
    // Chapter II is unlocked by the King's death, not only by the legacy
    // `victory` flag: older builds cleared that flag on "continue in world",
    // which left such saves stuck on a dead Chapter-I quest index.
    const chapterOneDone = !!(d.kingDefeated || d.victory || (d.questIndex ?? 0) >= 11);
    if (chapterOneDone && !this.c2Active && !this.c2Ending) {
      this.c2Active = true;
      this.c2Seen = false;
      this.kingDefeated = true;
      this.questIndex = 11;
    }
    const saveV = d.v ?? 1;
    if (this.c2Active && !this.c2Ending) {
      this.kingDefeated = true;
      if (saveV < 3) {
        // Chapter II used to be five beats long. Older saves restart the new
        // chain at the heir (or at the Cloudpath) without losing trust.
        this.c2Act2Seen = false;
        this.shardsFound = 0;
        this.moteBits = 0;
        this.sigilFound = false;
        this.bellRung = false;
        this.wispsKilled = 0;
        this.heraldDefeated = false;
        this.resetNewC2Progress();
        this.questIndex = (d.questIndex ?? 0) >= C2_FEED ? C2_FEED : C2_START;
      } else if (saveV < 4) {
        // The chain grew from 15 to 24 Chapter-II quests. v3 saves keep their
        // place by mapping the old slot onto the equivalent new one.
        const old = d.questIndex ?? C2_START;
        const map: Record<number, number> = {
          11: C2_CLOUDPATH, 12: C2_FEED, 13: C2_MOTES, 14: C2_WISPS, 15: C2_ESSENCE,
          16: C2_BLADE, 17: C2_SHRINES, 18: C2_SHARD1, 19: C2_SIGIL, 20: C2_SHARD2,
          21: C2_HERALD, 22: C2_TRUST, 23: C2_SHARD3, 24: C2_BELL, 25: C2_LAST,
        };
        this.questIndex = old >= 26 ? C2_LAST : map[old] ?? C2_START;
        this.resetNewC2Progress();
      }
      if (this.questIndex < C2_START || this.questIndex > C2_LAST) this.questIndex = C2_START;
      // Legacy Chapter-II saves placed shards and the gate on the ground.
      // The chapter now lives in the clouds, so discard those leftovers.
      if (this.shardPos) {
        setTile(this.world, this.shardPos.x, this.shardPos.y, AIR);
        this.shardPos = null;
      }
      if (this.gatePos) {
        this.clearGateAt(this.gatePos);
        this.gatePos = null;
      }
      // Older saves may have spent all their gel before the heir quest;
      // the sky has no slimes to farm, so guarantee the opening feedings.
      if (this.questIndex <= C2_FEED && this.count("gel") < 5) {
        this.addItem("gel", 5 - this.count("gel"));
      }
    }
    // The chapter is over: wake up on the ground instead of the summit. The
    // finale already played, so it must not throw the player off again.
    if (this.c2Ending) {
      this.questIndex = QUESTS.length;
      this.c2Seen = true;
      this.returnToGround();
    }
    // Endings are shown live; loading an ended world keeps it playable.
    this.victory = false;
    this.heirX = this.px + 34;
    this.heirY = this.py;
    console.log("Loaded world", this.currentWorldId, "questIndex:", this.questIndex, "chapter2:", this.c2Active);
    this.fallDistance = 0;
    this.shakeX = 0;
    this.shakeY = 0;
  }

  /** New Chapter-II features default to untouched when upgrading a v3 save. */
  private resetNewC2Progress() {
    this.c2Act3Seen = false;
    this.c2NameSeen = false;
    this.coinBits = 0;
    this.tollPaid = false;
    this.auditorIntroSeen = false;
    this.auditorDefeated = false;
    this.pageBits = 0;
    this.chimeBits = 0;
    this.chimeStep = 0;
    this.chimeHover = -1;
    this.siegeIntroSeen = false;
    this.siegeActive = false;
    this.siegeT = 0;
    this.siegeSpawnT = 0;
    this.siegeDone = false;
    this.heraldIntroSeen = false;
    this.stormIntroSeen = false;
    this.stormDefeated = false;
    this.witnessBits = 0;
    this.confessionSeen = false;
    this.c2TrustSeen = false;
  }

  /** Put the player back under an ordinary sky after the Chapter-II finale. */
  private returnToGround() {
    this.sky = null;
    this.siegeActive = false;
    this.siegeT = 0;
    const sx = this.world.spawnX;
    const groundY = this.world.surfaceY[sx] * TILE;
    this.px = sx * TILE;
    this.py = groundY - 22;
    this.pvx = 0;
    this.pvy = 0;
    this.onGround = true;
    this.fallDistance = 0;
    this.heirX = this.px + 34;
    this.heirY = this.py;
    this.camX = Math.max(0, Math.min(this.world.w * TILE - this.viewW, this.px - this.viewW / 2));
    this.camY = Math.max(0, Math.min(this.world.h * TILE - this.viewH, this.py - this.viewH / 2));
    this.dayFrac = 0.27;
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

  // ---------- Chapter II — The Debt of Light ----------
  /** Feed one gel to the last slime heir. Raises trust for the secret ending. */
  feedHeir(): boolean {
    if (!this.c2Active || this.c2Ending || this.storyId) return false;
    if (this.heirFed >= SECRET_TRUST) return false;
    if (this.count("gel") <= 0) return false;
    this.removeItem("gel", 1);
    this.heirFed++;
    audio.playSfx("pickup");
    this.float(this.heirX, this.heirY - 26, `♥ ${this.heirFed}`, this.heirFed >= SECRET_TRUST ? "#ffe08a" : "#9fe08a");
    for (let i = 0; i < 5; i++) this.dust(this.heirX, this.heirY, "#9fe08a");
    if (this.heirFed === SECRET_TRUST) {
      this.showBanner("THE HEIR IS FULL", "It is heavy enough to wear a crown");
    }
    this.checkQuest();
    this.pushState();
    this.saveGame();
    return true;
  }

  /** Close the current story card and continue the chapter chain. */
  dismissStory() {
    if (!this.storyId) return;
    const id = this.storyId;
    this.storyId = null;
    if (id === "c2_intro") {
      this.c2Seen = true;
      this.enterSkyRealm(true);
    } else if (id === "c2_auditor") {
      this.spawnAuditor();
    } else if (id === "c2_herald_intro") {
      this.spawnHerald();
    } else if (id === "c2_stormfather") {
      this.spawnStormfather();
    } else if (id === "c2_siege") {
      this.beginSiege();
    } else if (id === "c2_final") {
      // Chapter II has one ending now: the fall at the summit.
      this.finishChapter2();
      return;
    }
    this.checkQuest();
    this.saveGame();
    this.pushState();
  }

  /** Close the final chapter with its single canonical ending. */
  private finishChapter2() {
    if (!this.c2Active || this.c2Ending) return;
    this.c2Ending = CHAPTER2_ENDING;
    this.questIndex = QUESTS.length;
    this.victory = true;
    this.gameover = false;
    audio.playSfx("victory");
    audio.setTrack("day");
    this.showBanner(t("c2_sky_title"), t("c2_sky_sub"));
    this.saveGame();
    this.pushState();
    this.cb.onVictory();
  }

  private triggerStory(id: string) {
    if (this.storyId === id) return;
    this.storyId = id;
    this.keys = {};
    this.mouseDown = false;
    this.rightDown = false;
    this.cb.onStory?.(id);
    this.pushState();
  }

  /** Bring a loaded save up to the clouds when its chapter is already open. */
  private prepareChapter2() {
    if (!this.c2Active || this.c2Ending) return;
    if (this.c2Seen) {
      const tx = Math.max(0, Math.min(this.world.w - 1, Math.floor(this.px / TILE)));
      const inSky = this.py / TILE < this.world.surfaceY[tx] - 8;
      this.enterSkyRealm(!inSky);
    }
    this.ensureC2Objects();
  }

  /**
   * Carve the Skyhold into the world and (optionally) place the player on the
   * arrival island. The archipelago is part of the saved world, so it stays
   * consistent across reloads.
   */
  private enterSkyRealm(toArrival: boolean, islandIdx = 0) {
    this.sky = buildSkyRealm(this.world);
    if (this.shardPos) this.shardPos = null;
    if (this.gatePos) {
      this.clearGateAt(this.gatePos);
      this.gatePos = null;
    }
    if (!toArrival) return;
    const isl = this.sky.islands[Math.max(0, Math.min(this.sky.islands.length - 1, islandIdx))];
    const x = isl.x;
    const y = isl.top;
    this.px = (x + 0.5) * TILE;
    this.py = y * TILE - 24;
    this.pvx = 0;
    this.pvy = 0;
    this.fallDistance = 0;
    this.heirX = this.px + 34;
    this.heirY = this.py;
    this.camX = Math.max(0, Math.min(this.world.w * TILE - this.viewW, this.px - this.viewW / 2));
    this.camY = Math.max(-this.viewH * 0.34, Math.min(this.world.h * TILE - this.viewH, this.py - this.viewH / 2));
    this.dayFrac = 0.22;
    this.flashT = 1.1;
    for (let i = 0; i < 26; i++) this.dust(this.px, this.py, "#dff4ff");
    this.showBanner("THE SKYHOLD", "The clouds remember the First Warden");
  }

  /** If the player slips off the islands, the clouds carry them back to the nearest isle. */
  private skyRescue() {
    if (!this.c2Active || !this.c2Seen || this.c2Ending) return;
    const tx = Math.max(0, Math.min(this.world.w - 1, Math.floor(this.px / TILE)));
    if (this.py / TILE < this.world.surfaceY[tx] - 5) return;
    const l = this.sky ?? skyLayout(this.world);
    const here = this.px / TILE;
    let best = 0;
    for (let i = 1; i < l.islands.length; i++) {
      if (Math.abs(l.islands[i].x - here) < Math.abs(l.islands[best].x - here)) best = i;
    }
    this.enterSkyRealm(true, best);
    this.showBanner("THE CLOUDS CATCH YOU", "The Skyhold pulls you back");
  }

  private ensureC2Objects() {
    if (!this.c2Active || this.c2Ending) return;
    this.sky = skyLayout(this.world);
    if (!this.shardPos) {
      if (this.questIndex === C2_SHARD1 && this.shardsFound < 1) this.spawnShard(1);
      else if (this.questIndex === C2_SHARD2 && this.shardsFound < 2) this.spawnShard(2);
      else if (this.questIndex === C2_SHARD3 && this.shardsFound < 3) this.spawnShard(3);
    }
    if (this.questIndex === C2_AUDITOR && !this.auditorDefeated) {
      if (!this.auditorIntroSeen) {
        this.auditorIntroSeen = true;
        this.triggerStory("c2_auditor");
      } else if (!this.enemies.some((e) => e.type === "auditor")) {
        this.spawnAuditor();
      }
    }
    if (this.questIndex === C2_HERALD && !this.heraldDefeated) {
      if (!this.heraldIntroSeen) {
        this.heraldIntroSeen = true;
        this.triggerStory("c2_herald_intro");
      } else if (!this.enemies.some((e) => e.type === "herald")) {
        this.spawnHerald();
      }
    }
    if (
      this.questIndex === C2_STORM &&
      !this.stormDefeated &&
      this.stormIntroSeen &&
      !this.enemies.some((e) => e.type === "storm")
    ) {
      this.spawnStormfather();
    }
  }

  private spawnAuditor() {
    this.enemies.push({
      type: "auditor", x: this.px + 90, y: this.py - 80, vx: 0, vy: 0,
      w: 48, h: 52, hp: 460, maxHp: 460, facing: -1, onGround: false,
      hopT: 0, hitFlash: 0, t: 0, spawnT: 0, knock: 0, swoopT: 2.2,
    });
    audio.playSfx("bossSpawn");
    this.showBanner("THE AUDITOR", "Weighing your years");
  }

  private spawnStormfather() {
    const l = this.sky ?? skyLayout(this.world);
    this.enemies.push({
      type: "storm", x: (l.camp.x - 3) * TILE, y: (l.camp.y - 2) * TILE, vx: 0, vy: 0,
      w: 78, h: 64, hp: 720, maxHp: 720, facing: -1, onGround: false,
      hopT: 0, hitFlash: 0, t: 0, spawnT: 0, knock: 0, swoopT: 2.6,
    });
    audio.playSfx("bossSpawn");
    this.showBanner("THE STORMFATHER", "The First Warden's apology");
  }

  private beginSiege() {
    this.siegeActive = true;
    this.siegeT = 45;
    this.siegeSpawnT = 0.8;
    this.showBanner("THE CHOIR OF INTEREST", "Hold the archive for 45 seconds");
  }

  private spawnHerald() {
    this.enemies.push({
      type: "herald", x: this.px + 90, y: this.py - 80, vx: 0, vy: 0,
      w: 54, h: 46, hp: 320, maxHp: 320, facing: -1, onGround: false,
      hopT: 0, hitFlash: 0, t: 0, spawnT: 0, knock: 0, swoopT: 2.5,
    });
    audio.playSfx("bossSpawn");
    this.showBanner("THE HOLLOW HERALD", "The sky sends its collector");
  }

  private spawnShard(idx: number) {
    if (!this.sky) this.sky = buildSkyRealm(this.world);
    const pos = this.sky.shards[Math.max(0, Math.min(2, idx - 1))];
    setTile(this.world, pos.x, pos.y, SHARD);
    this.shardPos = { x: pos.x, y: pos.y, idx };
    this.showBanner("A MEMORY SHARD", "It hums with the weight of the sky");
    this.pushState();
  }

  /** Remove a Hollow Gate that was spawned before its quest was reached. */
  private clearGateAt(pos: { x: number; y: number }) {
    const gx = pos.x - 1;
    const surf = pos.y + 3;
    for (let dx = -5; dx <= 6; dx++) {
      for (let dy = 1; dy <= 8; dy++) {
        const tx = gx + dx;
        const ty = surf - dy;
        const t = getTile(this.world, tx, ty);
        if (t === HOLLOW_GATE || t === BEDROCK) setTile(this.world, tx, ty, AIR);
      }
    }
  }

  private updateStoryTriggers() {
    if (this.gameover || this.victory || this.storyId) return;
    this.skyRescue();
    if (!this.c2Active || this.c2Ending) return;
    this.ensureC2Objects();
    const l = this.sky ?? skyLayout(this.world);

    if (this.questIndex === C2_MOTES) {
      for (let i = 0; i < l.motes.length; i++) {
        if (this.moteBits & (1 << i)) continue;
        const m = l.motes[i];
        if (!this.nearTile(m.x, m.y, 1.7)) continue;
        this.moteBits |= 1 << i;
        audio.playSfx("pickup");
        const cx = (m.x + 0.5) * TILE;
        const cy = (m.y + 0.5) * TILE;
        for (let k = 0; k < 10; k++) this.dust(cx, cy, "#ffe9a8");
        this.particles.push({ x: cx, y: cy, vx: 0, vy: 0, life: 0.45, max: 0.45, size: 56, color: "rgba(255,235,160,0.9)", grav: 0, ring: true });
        this.showBanner("SKYLIGHT MOTE", `${this.moteCount()} / 3`);
        this.checkQuest();
        this.saveGame();
        return;
      }
    }

    if (this.questIndex === C2_TOLL && !this.tollPaid) {
      for (let i = 0; i < l.coins.length; i++) {
        if (this.coinBits & (1 << i)) continue;
        const c = l.coins[i];
        if (!this.nearTile(c.x, c.y, 2.6)) continue;
        this.coinBits |= 1 << i;
        audio.playSfx("pickup");
        const cx = (c.x + 0.5) * TILE;
        const cy = (c.y + 0.5) * TILE;
        for (let k = 0; k < 8; k++) this.dust(cx, cy, "#ffe08a");
        this.showBanner("SKY COIN", `${this.coinCount()} / 5`);
        this.saveGame();
        return;
      }
      if (this.coinCount() >= 5 && this.nearTile(l.toll.x, l.toll.y, 2.8)) {
        this.tollPaid = true;
        audio.playSfx("levelup");
        const cx = (l.toll.x + 0.5) * TILE;
        const cy = (l.toll.y + 0.5) * TILE;
        for (let k = 0; k < 16; k++) this.dust(cx, cy, "#ffe08a");
        this.particles.push({ x: cx, y: cy, vx: 0, vy: 0, life: 0.6, max: 0.6, size: 90, color: "rgba(255,224,138,0.9)", grav: 0, ring: true });
        this.triggerStory("c2_toll");
        this.saveGame();
        return;
      }
    }

    if (this.questIndex === C2_SIGIL && !this.sigilFound) {
      const s = l.sigil;
      if (this.nearTile(s.x, s.y, 1.7)) {
        this.sigilFound = true;
        audio.playSfx("levelup");
        const cx = (s.x + 0.5) * TILE;
        const cy = (s.y + 0.5) * TILE;
        for (let k = 0; k < 14; k++) this.dust(cx, cy, "#ffe08a");
        this.particles.push({ x: cx, y: cy, vx: 0, vy: 0, life: 0.5, max: 0.5, size: 72, color: "rgba(255,224,138,0.9)", grav: 0, ring: true });
        this.showBanner("THE WARDEN'S SIGIL", "It still remembers your hand");
        this.checkQuest();
        this.saveGame();
        return;
      }
    }

    if (this.questIndex === C2_UNDERSKY) {
      for (let i = 0; i < l.pages.length; i++) {
        if (this.pageBits & (1 << i)) continue;
        const p = l.pages[i];
        if (!this.nearTile(p.x, p.y, 2.4)) continue;
        this.pageBits |= 1 << i;
        audio.playSfx("pickup");
        const cx = (p.x + 0.5) * TILE;
        const cy = (p.y + 0.5) * TILE;
        for (let k = 0; k < 8; k++) this.dust(cx, cy, "#d9c8ff");
        this.showBanner("TORN PAGE", `${this.pageCount()} / 3`);
        this.saveGame();
        if (this.pageCount() >= 3) {
          this.triggerStory("c2_undersky");
        }
        return;
      }
    }

    // Chimes only ring on explicit input (right-click / mobile button); walking
    // past one just highlights it as interactive.
    if (this.questIndex === C2_CHIMES && this.chimeStep < CHIME_ORDER.length) {
      this.chimeHover = this.chimeInReach();
    }

    if (this.questIndex === C2_SIEGE && !this.siegeDone) {
      if (!this.siegeIntroSeen) {
        if (this.nearTile(l.archive.x, l.archive.y, 4.0)) {
          this.siegeIntroSeen = true;
          this.triggerStory("c2_siege");
          this.saveGame();
          return;
        }
      } else if (!this.siegeActive) {
        // Resumed a save mid-siege (or the player died and returned).
        this.beginSiege();
      }
    }

    if (this.questIndex === C2_STORM && !this.stormDefeated && !this.stormIntroSeen) {
      if (this.nearTile(l.camp.x, l.camp.y, 7)) {
        this.stormIntroSeen = true;
        this.triggerStory("c2_stormfather");
        this.saveGame();
        return;
      }
    }

    if (this.questIndex === C2_WITNESS) {
      for (let i = 0; i < l.witness.length; i++) {
        if (this.witnessBits & (1 << i)) continue;
        const s = l.witness[i];
        if (!this.nearTile(s.x, s.y, 2.4)) continue;
        this.witnessBits |= 1 << i;
        audio.playSfx("levelup");
        const cx = (s.x + 0.5) * TILE;
        const cy = (s.y + 0.5) * TILE;
        for (let k = 0; k < 12; k++) this.dust(cx, cy, "#cfe8ff");
        this.particles.push({ x: cx, y: cy, vx: 0, vy: 0, life: 0.5, max: 0.5, size: 70, color: "rgba(207,232,255,0.9)", grav: 0, ring: true });
        this.showBanner("A WITNESS STONE", `${this.witnessCount()} / 4`);
        this.saveGame();
        if (this.witnessCount() >= 4) this.triggerStory("c2_witness");
        return;
      }
    }

    if (this.questIndex === C2_CONFESSION && !this.confessionSeen) {
      if (this.nearTile(l.camp.x, l.camp.y, 3.2)) {
        this.confessionSeen = true;
        this.triggerStory("c2_confession");
        this.saveGame();
        return;
      }
    }

    if (this.questIndex === C2_BELL && !this.bellRung) {
      const b = l.bell;
      if (this.nearTile(b.x, b.y, 1.8)) {
        this.bellRung = true;
        audio.playSfx("levelup");
        audio.playSfx("victory");
        const cx = (b.x + 0.5) * TILE;
        const cy = (b.y + 0.5) * TILE;
        for (let k = 0; k < 18; k++) this.dust(cx, cy, "#ffefb0");
        this.particles.push({ x: cx, y: cy, vx: 0, vy: 0, life: 0.8, max: 0.8, size: 130, color: "rgba(255,239,176,0.9)", grav: 0, ring: true });
        this.shakeX = 6;
        this.shakeY = 4;
        this.showBanner("THE SILENT BELL", "It rings once — and the sky answers");
        this.checkQuest();
        this.saveGame();
        return;
      }
    }

    if (this.shardPos) {
      const cx = this.shardPos.x * TILE + TILE / 2;
      const cy = this.shardPos.y * TILE + TILE / 2;
      if (Math.hypot(cx - this.px, cy - this.py) < TILE * 3.6) {
        const idx = this.shardPos.idx;
        setTile(this.world, this.shardPos.x, this.shardPos.y, AIR);
        this.shardPos = null;
        this.shardsFound = Math.max(this.shardsFound, idx);
        audio.playSfx("levelup");
        for (let i = 0; i < 14; i++) this.dust(cx, cy, "#8ff0ff");
        this.particles.push({ x: cx, y: cy, vx: 0, vy: 0, life: 0.5, max: 0.5, size: 90, color: "rgba(143,240,255,0.9)", grav: 0, ring: true });
        this.triggerStory(`c2_shard${idx}`);
        return;
      }
    }

    if (this.questIndex >= C2_LAST) {
      const cx = (l.summit.x + 0.5) * TILE;
      const cy = l.summit.y * TILE;
      if (Math.hypot(cx - this.px, cy - this.py) < TILE * 2.4) {
        this.triggerStory("c2_final");
      }
    }
  }

  /** Waves of interest attack the archive while the player holds the ring. */
  private updateSiege(dt: number) {
    if (!this.siegeActive || this.storyId || this.gameover || this.victory) return;
    this.siegeT -= dt;
    this.siegeSpawnT -= dt;
    const l = this.sky ?? skyLayout(this.world);
    if (this.siegeSpawnT <= 0) {
      this.siegeSpawnT = this.siegeT < 18 ? 2.6 : 3.4;
      const count = this.siegeT < 18 ? 2 : 1;
      for (let i = 0; i < count; i++) {
        if (this.enemies.filter((e) => e.type === "wisp").length >= 7) break;
        const sx = (l.archive.x + (i === 0 ? -7 : 7) + Math.random() * 3) * TILE;
        const sy = (l.archive.y - 5 - Math.random() * 2) * TILE;
        this.enemies.push({
          type: "wisp", x: sx, y: sy, vx: 0, vy: 0,
          w: 26, h: 22, hp: 28, maxHp: 28, facing: -1, onGround: false, hopT: 0,
          hitFlash: 0, t: 0, spawnT: 0, knock: 0, swoopT: 2 + Math.random() * 2,
        });
      }
    }
    if (this.siegeT <= 0) {
      this.siegeActive = false;
      this.siegeDone = true;
      this.showBanner("THE ARCHIVE HOLDS", "The interest is paid in static");
      audio.playSfx("victory");
      for (let i = 0; i < 20; i++) this.dust((l.archive.x + 0.5) * TILE, (l.archive.y + 0.5) * TILE, "#bff3ff");
      this.checkQuest();
      this.saveGame();
    }
  }

  private nearTile(tx: number, ty: number, rTiles: number): boolean {
    return Math.hypot((tx + 0.5) * TILE - this.px, (ty + 0.5) * TILE - this.py) < TILE * rTiles;
  }

  private moteCount(): number {
    let n = 0;
    for (let i = 0; i < 3; i++) if (this.moteBits & (1 << i)) n++;
    return n;
  }

  private coinCount(): number {
    let n = 0;
    for (let i = 0; i < 5; i++) if (this.coinBits & (1 << i)) n++;
    return n;
  }

  private pageCount(): number {
    let n = 0;
    for (let i = 0; i < 3; i++) if (this.pageBits & (1 << i)) n++;
    return n;
  }

  private witnessCount(): number {
    let n = 0;
    for (let i = 0; i < 4; i++) if (this.witnessBits & (1 << i)) n++;
    return n;
  }

  private shrinesLit(): number {
    const l = this.sky ?? skyLayout(this.world);
    let n = 0;
    for (const s of l.shrines) {
      let lit = false;
      for (let dy = -2; dy <= 0 && !lit; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (getTile(this.world, s.x + dx, s.y + dy) === TORCH) { lit = true; break; }
        }
      }
      if (lit) n++;
    }
    return n;
  }

  /** Lantern shrines, skylight motes, the Warden's sigil and the silent bell. */
  private drawSkyQuestObjects(ctx: CanvasRenderingContext2D) {
    const l = this.sky ?? skyLayout(this.world);
    const t = this.frame * 0.05;

    for (const s of l.shrines) {
      const cx = (s.x + 0.5) * TILE;
      const base = (s.y + 1) * TILE;
      const lit = this.shrineLit(s);
      if (!lit && this.questIndex === C2_SHRINES) {
        // a thin beacon so the next shrine can be found across the isles
        const beam = ctx.createLinearGradient(0, base - 280, 0, base - 16);
        beam.addColorStop(0, "rgba(150,220,255,0)");
        beam.addColorStop(1, "rgba(150,220,255,0.22)");
        ctx.fillStyle = beam;
        ctx.fillRect(cx - 7, base - 280, 14, 264);
      }
      if (lit) {
        const g = ctx.createRadialGradient(cx, base - 18, 2, cx, base - 18, 44);
        g.addColorStop(0, "rgba(255,208,120,0.5)");
        g.addColorStop(1, "rgba(255,170,60,0)");
        ctx.fillStyle = g;
        ctx.fillRect(cx - 44, base - 62, 88, 88);
      }
      // pedestal
      ctx.fillStyle = "#8aabc4";
      ctx.beginPath();
      ctx.moveTo(cx - 10, base);
      ctx.lineTo(cx - 6, base - 12);
      ctx.lineTo(cx + 6, base - 12);
      ctx.lineTo(cx + 10, base);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#c3d9ea";
      ctx.fillRect(cx - 7, base - 15, 14, 4);
      // rune bowl
      ctx.fillStyle = lit ? "#ffd88a" : "#5d7b93";
      ctx.beginPath();
      ctx.ellipse(cx, base - 17, 6, 3.2, 0, 0, Math.PI * 2);
      ctx.fill();
      if (lit) {
        const fl = 0.8 + 0.2 * Math.sin(this.frame * 0.3 + s.x);
        ctx.fillStyle = "#ffb045";
        ctx.beginPath();
        ctx.ellipse(cx, base - 23, 3.6, 7 * fl, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#fff2c0";
        ctx.beginPath();
        ctx.ellipse(cx, base - 23, 1.6, 3.6 * fl, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    if (this.questIndex === C2_MOTES) {
      for (let i = 0; i < l.motes.length; i++) {
        if (this.moteBits & (1 << i)) continue;
        const m = l.motes[i];
        const cx = (m.x + 0.5) * TILE;
        const cy = (m.y + 0.5) * TILE + Math.sin(t + i * 2.1) * 4;
        const g = ctx.createRadialGradient(cx, cy, 1, cx, cy, 24);
        g.addColorStop(0, "rgba(255,244,190,0.75)");
        g.addColorStop(0.5, "rgba(255,225,130,0.32)");
        g.addColorStop(1, "rgba(255,210,90,0)");
        ctx.fillStyle = g;
        ctx.fillRect(cx - 24, cy - 24, 48, 48);
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(Math.sin(t * 0.8 + i) * 0.25);
        ctx.fillStyle = "#fff6cf";
        ctx.beginPath();
        ctx.moveTo(0, -9);
        ctx.lineTo(6, 0);
        ctx.lineTo(0, 9);
        ctx.lineTo(-6, 0);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,0.85)";
        ctx.lineWidth = 1.2;
        ctx.stroke();
        ctx.restore();
        for (let k = 0; k < 3; k++) {
          const a = t * 1.4 + (k * Math.PI * 2) / 3 + i;
          ctx.fillStyle = "rgba(255,250,210,0.9)";
          ctx.fillRect(cx + Math.cos(a) * 14 - 1, cy + Math.sin(a) * 6 - 1, 2, 2);
        }
      }
    }

    if (this.questIndex === C2_SIGIL && !this.sigilFound) {
      const s = l.sigil;
      const cx = (s.x + 0.5) * TILE;
      const cy = (s.y + 0.5) * TILE + Math.sin(t * 1.2) * 5;
      const g = ctx.createRadialGradient(cx, cy, 1, cx, cy, 30);
      g.addColorStop(0, "rgba(255,226,140,0.7)");
      g.addColorStop(1, "rgba(255,200,80,0)");
      ctx.fillStyle = g;
      ctx.fillRect(cx - 30, cy - 30, 60, 60);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(Math.sin(t * 0.6) * 0.12);
      ctx.fillStyle = "#ffd23b";
      ctx.beginPath();
      ctx.moveTo(0, -14);
      ctx.lineTo(10, -6);
      ctx.lineTo(7, 8);
      ctx.lineTo(0, 14);
      ctx.lineTo(-7, 8);
      ctx.lineTo(-10, -6);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#7a5a12";
      ctx.fillRect(-2, -9, 4, 14);
      ctx.fillRect(-6, -2, 12, 3);
      ctx.strokeStyle = "rgba(255,255,255,0.8)";
      ctx.lineWidth = 1.4;
      ctx.stroke();
      ctx.restore();
    }

    if (this.questIndex === C2_TOLL && !this.tollPaid) {
      // the toll gate: two cloudstone posts and a slot that eats coins
      const tx = (l.toll.x + 0.5) * TILE;
      const ty = (l.toll.y + 0.5) * TILE;
      ctx.fillStyle = "#8aabc4";
      ctx.fillRect(tx - 20, ty - 18, 6, 30);
      ctx.fillRect(tx + 14, ty - 18, 6, 30);
      ctx.fillStyle = "#c3d9ea";
      ctx.fillRect(tx - 24, ty - 24, 48, 8);
      ctx.fillStyle = "#5d7b93";
      ctx.fillRect(tx - 5, ty - 17, 10, 3);
      const g = ctx.createRadialGradient(tx, ty - 14, 1, tx, ty - 14, 26);
      g.addColorStop(0, "rgba(255,224,138,0.55)");
      g.addColorStop(1, "rgba(255,200,80,0)");
      ctx.fillStyle = g;
      ctx.fillRect(tx - 26, ty - 40, 52, 52);

      // waypoint: a gold diamond and a light pillar so the gate reads across isles
      const pulse = 0.55 + 0.45 * Math.sin(t * 1.6);
      const dy = ty - 86 + Math.sin(t * 1.3) * 7;
      const beam = ctx.createLinearGradient(0, ty - 360, 0, ty - 20);
      beam.addColorStop(0, "rgba(255,214,90,0)");
      beam.addColorStop(1, `rgba(255,214,90,${0.1 + 0.08 * pulse})`);
      ctx.fillStyle = beam;
      ctx.fillRect(tx - 5, ty - 360, 10, 340);
      const halo = ctx.createRadialGradient(tx, dy, 2, tx, dy, 36);
      halo.addColorStop(0, `rgba(255,214,90,${0.35 + 0.35 * pulse})`);
      halo.addColorStop(1, "rgba(255,200,80,0)");
      ctx.fillStyle = halo;
      ctx.fillRect(tx - 36, dy - 36, 72, 72);
      ctx.save();
      ctx.translate(tx, dy);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = "#1a1408";
      ctx.fillRect(-10, -10, 20, 20);
      ctx.fillStyle = "#ffd23b";
      ctx.fillRect(-8, -8, 16, 16);
      ctx.fillStyle = "#fff2b0";
      ctx.fillRect(-4, -4, 8, 8);
      ctx.restore();
      ctx.fillStyle = "#ffe9a8";
      ctx.beginPath();
      ctx.moveTo(tx - 8, dy + 17);
      ctx.lineTo(tx + 8, dy + 17);
      ctx.lineTo(tx, dy + 27);
      ctx.closePath();
      ctx.fill();

      for (let i = 0; i < 5; i++) {
        if (this.coinBits & (1 << i)) continue;
        const cx = (l.coins[i].x + 0.5) * TILE;
        const cy = (l.coins[i].y + 0.5) * TILE + Math.sin(t * 1.3 + i) * 3;
        const cg = ctx.createRadialGradient(cx, cy, 1, cx, cy, 18);
        cg.addColorStop(0, `rgba(255,220,120,${0.35 + 0.2 * pulse})`);
        cg.addColorStop(1, "rgba(255,200,80,0)");
        ctx.fillStyle = cg;
        ctx.fillRect(cx - 18, cy - 18, 36, 36);
        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(Math.max(0.25, Math.abs(Math.cos(t * 1.1 + i))), 1);
        ctx.fillStyle = "#ffd23b";
        ctx.beginPath();
        ctx.arc(0, 0, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#b8860b";
        ctx.beginPath();
        ctx.arc(0, 0, 4.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#fff2b0";
        ctx.fillRect(-1, -3, 2, 6);
        ctx.restore();
      }
    }

    if (this.questIndex === C2_UNDERSKY) {
      for (let i = 0; i < l.pages.length; i++) {
        if (this.pageBits & (1 << i)) continue;
        const p = l.pages[i];
        const cx = (p.x + 0.5) * TILE;
        const cy = (p.y + 0.5) * TILE + Math.sin(t * 1.1 + i * 1.7) * 4;
        const g = ctx.createRadialGradient(cx, cy, 1, cx, cy, 22);
        g.addColorStop(0, "rgba(220,205,255,0.6)");
        g.addColorStop(1, "rgba(170,150,240,0)");
        ctx.fillStyle = g;
        ctx.fillRect(cx - 22, cy - 22, 44, 44);
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(Math.sin(t * 0.7 + i) * 0.25);
        ctx.fillStyle = "#f3ecff";
        ctx.fillRect(-6, -8, 12, 16);
        ctx.fillStyle = "#b8a6e6";
        ctx.fillRect(-4, -5, 8, 1);
        ctx.fillRect(-4, -2, 8, 1);
        ctx.fillRect(-4, 1, 6, 1);
        ctx.fillStyle = "#7a68b8";
        ctx.fillRect(-6, -8, 2, 16);
        ctx.restore();
      }
    }

    if (this.questIndex === C2_CHIMES && this.chimeStep < CHIME_ORDER.length) {
      for (let i = 0; i < l.chimes.length; i++) {
        const c = l.chimes[i];
        const cx = (c.x + 0.5) * TILE;
        const base = (c.y + 1) * TILE;
        const next = CHIME_ORDER[this.chimeStep] === i;
        const lit = (this.chimeBits & (1 << i)) !== 0;
        const hover = this.chimeHover === i && !lit;
        ctx.fillStyle = "#7d94a8";
        ctx.fillRect(cx - 2, base - 34, 4, 34);
        ctx.fillRect(cx - 2, base - 34, 18, 3);
        const bx = cx + 14;
        const by = base - 26;
        if (next || hover) {
          const g = ctx.createRadialGradient(bx, by, 1, bx, by, hover ? 30 : 24);
          g.addColorStop(0, hover ? "rgba(230,251,255,0.85)" : "rgba(190,243,255,0.6)");
          g.addColorStop(1, "rgba(140,220,255,0)");
          ctx.fillStyle = g;
          const r = hover ? 30 : 24;
          ctx.fillRect(bx - r, by - r, r * 2, r * 2);
        }
        ctx.fillStyle = lit ? "#d8f6ff" : hover ? "#e6fbff" : next ? "#a8dcf0" : "#7a9db5";
        ctx.beginPath();
        ctx.moveTo(bx - 6, by + 5);
        ctx.quadraticCurveTo(bx - 7, by - 7, bx, by - 9);
        ctx.quadraticCurveTo(bx + 7, by - 7, bx + 6, by + 5);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "#4f6a7c";
        ctx.fillRect(bx - 7, by + 5, 14, 2);
      }
    }

    if (this.questIndex === C2_WITNESS) {
      for (let i = 0; i < l.witness.length; i++) {
        const w = l.witness[i];
        const cx = (w.x + 0.5) * TILE;
        const base = (w.y + 1) * TILE;
        const lit = (this.witnessBits & (1 << i)) !== 0;
        ctx.fillStyle = lit ? "#e8f4ff" : "#5d6f86";
        ctx.beginPath();
        ctx.moveTo(cx - 7, base);
        ctx.lineTo(cx - 5, base - 20);
        ctx.lineTo(cx + 4, base - 22);
        ctx.lineTo(cx + 8, base);
        ctx.closePath();
        ctx.fill();
        if (lit) {
          const g = ctx.createRadialGradient(cx, base - 14, 1, cx, base - 14, 24);
          g.addColorStop(0, "rgba(207,232,255,0.6)");
          g.addColorStop(1, "rgba(160,200,255,0)");
          ctx.fillStyle = g;
          ctx.fillRect(cx - 24, base - 38, 48, 48);
          ctx.fillStyle = "#bff3ff";
          ctx.fillRect(cx - 2, base - 17, 4, 2);
          ctx.fillRect(cx - 1, base - 14, 2, 6);
        } else {
          ctx.fillStyle = "#3f4c5c";
          ctx.fillRect(cx - 2, base - 16, 4, 2);
          ctx.fillRect(cx - 1, base - 13, 2, 5);
        }
      }
    }

    // the archive isle — the Order's reading room, held together by static
    const arx = (l.archive.x + 0.5) * TILE;
    const ary = (l.archive.y + 1) * TILE;
    if (this.questIndex >= C2_AUDITOR && this.questIndex <= C2_SIEGE + 1) {
      const siege = this.questIndex === C2_SIEGE && !this.siegeDone;
      const g = ctx.createRadialGradient(arx, ary - 22, 2, arx, ary - 22, 60);
      g.addColorStop(0, siege ? "rgba(140,235,255,0.42)" : "rgba(180,205,255,0.2)");
      g.addColorStop(1, "rgba(120,180,255,0)");
      ctx.fillStyle = g;
      ctx.fillRect(arx - 60, ary - 82, 120, 120);
      ctx.fillStyle = "#8aabc4";
      ctx.fillRect(arx - 18, ary - 14, 36, 14);
      ctx.fillStyle = "#b9d2e4";
      ctx.fillRect(arx - 14, ary - 20, 28, 6);
      ctx.fillStyle = "#f3ecff";
      ctx.fillRect(arx - 7, ary - 26, 14, 7);
      ctx.fillStyle = "#7a68b8";
      ctx.fillRect(arx - 7, ary - 26, 2, 7);
      for (let k = 0; k < 3; k++) {
        const a = t * 0.8 + (k * Math.PI * 2) / 3;
        ctx.fillStyle = "rgba(220,240,255,0.75)";
        ctx.fillRect(arx + Math.cos(a) * 30 - 2, ary - 30 + Math.sin(a) * 12 - 2, 4, 4);
      }
    }

    // the Warden's camp on the far isle
    const cpx = (l.camp.x + 0.5) * TILE;
    const cpy = (l.camp.y + 1) * TILE;
    if (this.questIndex >= C2_STORM - 1) {
      ctx.fillStyle = "#6f879b";
      ctx.beginPath();
      ctx.moveTo(cpx - 26, cpy);
      ctx.lineTo(cpx - 10, cpy - 26);
      ctx.lineTo(cpx + 6, cpy);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#cfe0ee";
      ctx.beginPath();
      ctx.moveTo(cpx - 22, cpy - 3);
      ctx.lineTo(cpx - 10, cpy - 22);
      ctx.lineTo(cpx + 2, cpy - 3);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#7d94a8";
      ctx.fillRect(cpx + 14, cpy - 30, 2, 30);
      ctx.fillStyle = this.stormDefeated ? "#7dd3fc" : "#e8f4ff";
      ctx.fillRect(cpx + 15, cpy - 30, 12, 7);
      const g = ctx.createRadialGradient(cpx + 12, cpy - 6, 1, cpx + 12, cpy - 6, 26);
      g.addColorStop(0, "rgba(255,190,110,0.45)");
      g.addColorStop(1, "rgba(255,150,60,0)");
      ctx.fillStyle = g;
      ctx.fillRect(cpx - 14, cpy - 32, 52, 40);
      ctx.fillStyle = "#ffb45a";
      ctx.beginPath();
      ctx.ellipse(cpx + 12, cpy - 5, 3, 5 + Math.sin(this.frame * 0.3) * 1.5, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    const b = l.bell;
    const bx = (b.x + 0.5) * TILE;
    const by = (b.y + 0.5) * TILE + Math.sin(t * 0.7) * 2;
    const active = this.questIndex === C2_BELL && !this.bellRung;
    if (active) {
      const g = ctx.createRadialGradient(bx, by, 1, bx, by, 34);
      g.addColorStop(0, "rgba(255,240,180,0.55)");
      g.addColorStop(1, "rgba(255,220,120,0)");
      ctx.fillStyle = g;
      ctx.fillRect(bx - 34, by - 34, 68, 68);
    }
    ctx.fillStyle = this.bellRung ? "#8d7a4a" : "#ffe08a";
    ctx.beginPath();
    ctx.moveTo(bx - 10, by + 8);
    ctx.quadraticCurveTo(bx - 11, by - 10, bx, by - 13);
    ctx.quadraticCurveTo(bx + 11, by - 10, bx + 10, by + 8);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = this.bellRung ? "#5f5232" : "#b8860b";
    ctx.fillRect(bx - 11, by + 8, 22, 3);
    ctx.fillStyle = "#2b2313";
    ctx.beginPath();
    ctx.arc(bx, by + 12, 2.5, 0, Math.PI * 2);
    ctx.fill();
    if (!this.bellRung) {
      ctx.fillStyle = "rgba(255,250,220,0.9)";
      ctx.fillRect(bx - 1, by - 11, 2, 8);
    }
  }

  private shrineLit(s: { x: number; y: number }): boolean {
    for (let dy = -2; dy <= 0; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (getTile(this.world, s.x + dx, s.y + dy) === TORCH) return true;
      }
    }
    return false;
  }

  private updateHeir(dt: number) {
    if (!this.c2Active || this.c2Ending) return;
    const targetX = this.px - this.pface * 36;
    const targetY = this.py + 12;
    const dx = targetX - this.heirX;
    this.heirX += dx * Math.min(1, dt * 2.2);
    this.heirY += (targetY - this.heirY) * Math.min(1, dt * 4);
    this.heirHop += dt * (Math.abs(dx) > 6 ? 7 : 2);
    if (Math.abs(dx) > 14 && Math.random() < dt * 3) {
      this.dust(this.heirX, this.heirY + 10, "rgba(150,220,140,0.5)");
    }
  }

  private inSky(): boolean {
    return this.c2Active && this.c2Seen && !this.c2Ending && this.py / TILE < 36;
  }

  /** Soft, parallaxing cloud banks behind the floating islands. */
  private drawSkyClouds(ctx: CanvasRenderingContext2D) {
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    const t = this.frame;
    for (let i = 0; i < 16; i++) {
      const layer = i % 4;
      const px = ((i * 211 + this.camX * (0.06 + layer * 0.05) + t * (0.15 + layer * 0.1)) % (this.viewW + 420)) - 210;
      const py = ((i * 137 + this.camY * 0.05 + Math.sin(t * 0.004 + i) * 22) % (this.viewH + 280)) - 140;
      const r = 80 + layer * 38 + (i % 3) * 20;
      const a = 0.055 + layer * 0.022;
      const g = ctx.createRadialGradient(px, py, 2, px, py, r);
      g.addColorStop(0, `rgba(255,255,255,${a})`);
      g.addColorStop(0.55, `rgba(226,243,255,${a * 0.55})`);
      g.addColorStop(1, "rgba(210,235,255,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(px, py, r, r * 0.46, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(px + r * 0.45, py + 6, r * 0.62, r * 0.32, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  /** Golden pillar marking the highest point of the Skyhold. */
  private drawSummitBeam(ctx: CanvasRenderingContext2D) {
    if (!this.sky) return;
    const sx = (this.sky.summit.x + 0.5) * TILE;
    const sy = this.sky.summit.y * TILE;
    const pulse = 0.75 + 0.25 * Math.sin(this.frame * 0.03);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const g = ctx.createLinearGradient(0, 0, 0, sy);
    g.addColorStop(0, "rgba(255,240,190,0)");
    g.addColorStop(0.6, `rgba(255,226,150,${0.045 * pulse})`);
    g.addColorStop(1, `rgba(255,238,180,${0.22 * pulse})`);
    ctx.fillStyle = g;
    ctx.fillRect(sx - 28, 0, 56, sy);
    for (let i = 0; i < 14; i++) {
      const fy = ((this.frame * 0.9 + i * 37) % Math.max(1, sy));
      const fx = sx + Math.sin(this.frame * 0.02 + i * 1.9) * 16;
      ctx.fillStyle = `rgba(255,245,205,${0.18 + 0.25 * Math.sin(this.frame * 0.05 + i)})`;
      ctx.fillRect(fx, sy - fy, 2, 2);
    }
    ctx.restore();
  }

  /** Mira, waiting on the summit. Her book is the only bright thing about her. */
  private drawMira(ctx: CanvasRenderingContext2D) {
    if (!this.sky) return;
    const x = (this.sky.mira.x + 0.5) * TILE;
    const footY = this.sky.mira.y * TILE;
    const t = this.frame * 0.05;
    const bob = Math.sin(t) * 1.2;
    const sway = Math.sin(t * 0.7) * 1.5;
    ctx.save();
    ctx.translate(x, footY + bob);

    ctx.globalAlpha = 0.25;
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.ellipse(0, 2, 15, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    // faint violet halo: the Collector's mark
    const halo = ctx.createRadialGradient(0, -34, 2, 0, -34, 38);
    halo.addColorStop(0, "rgba(167,139,250,0.16)");
    halo.addColorStop(1, "rgba(167,139,250,0)");
    ctx.fillStyle = halo;
    ctx.fillRect(-38, -72, 76, 76);

    // cloak
    ctx.fillStyle = "#241f33";
    ctx.beginPath();
    ctx.moveTo(-9 + sway, -48);
    ctx.lineTo(9 + sway, -48);
    ctx.lineTo(17, 0);
    ctx.lineTo(-17, 0);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#332a47";
    ctx.beginPath();
    ctx.moveTo(-6, -44);
    ctx.lineTo(5, -44);
    ctx.lineTo(8, 0);
    ctx.lineTo(-10, 0);
    ctx.closePath();
    ctx.fill();
    // amber trim
    ctx.strokeStyle = "rgba(251,191,36,0.65)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-15, -3);
    ctx.lineTo(-9, -42);
    ctx.moveTo(15, -3);
    ctx.lineTo(9, -42);
    ctx.stroke();

    // hood and face
    ctx.fillStyle = "#1b1727";
    ctx.beginPath();
    ctx.arc(0 + sway, -55, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#e6d6bf";
    ctx.beginPath();
    ctx.arc(0 + sway, -54, 6.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#2b2238";
    ctx.fillRect(-4 + sway, -56, 2, 2);
    ctx.fillRect(3 + sway, -56, 2, 2);

    // the ledger
    const glow = 0.55 + 0.25 * Math.sin(this.frame * 0.12);
    ctx.fillStyle = `rgba(255,220,140,${glow})`;
    ctx.fillRect(9, -36, 12, 15);
    ctx.fillStyle = "rgba(90,60,25,0.8)";
    ctx.fillRect(9, -36, 2, 15);
    ctx.strokeStyle = "rgba(255,240,190,0.7)";
    ctx.lineWidth = 1;
    ctx.strokeRect(9.5, -35.5, 11, 14);
    ctx.restore();
  }

  private drawHeir(ctx: CanvasRenderingContext2D) {
    if (!this.c2Active || this.c2Ending) return;
    const x = this.heirX;
    const hop = Math.abs(Math.sin(this.heirHop)) * 3;
    const y = this.heirY - hop;
    ctx.save();
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.ellipse(x, this.py + 24, 12, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    const g = ctx.createRadialGradient(x - 3, y - 4, 2, x, y, 16);
    g.addColorStop(0, "#c9ffb0");
    g.addColorStop(0.55, "#7fe06a");
    g.addColorStop(1, "#3f9c3a");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(x, y, 13, 11, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.beginPath();
    ctx.ellipse(x - 4, y - 4, 3, 2, -0.5, 0, Math.PI * 2);
    ctx.fill();
    const blink = Math.sin(this.frame * 0.05) > 0.97 ? 0.2 : 1;
    ctx.fillStyle = "#1c2a16";
    ctx.fillRect(x - 5, y - 2, 2, 3 * blink);
    ctx.fillRect(x + 3, y - 2, 2, 3 * blink);
    if (this.heirFed >= SECRET_TRUST) {
      ctx.fillStyle = "#ffe08a";
      ctx.beginPath();
      ctx.moveTo(x - 6, y - 12);
      ctx.lineTo(x - 3, y - 18);
      ctx.lineTo(x, y - 13);
      ctx.lineTo(x + 3, y - 18);
      ctx.lineTo(x + 6, y - 12);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  private bossActive(): boolean {
    return this.enemies.some((e) => e.type === "king" || e.type === "herald" || e.type === "auditor" || e.type === "storm");
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
      // Right-click next to a chime rings it instead of placing a block.
      if (e.button === 2 && this.ringNearbyChime()) {
        this.rightDown = false;
        return;
      }
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
    // A story card is on screen — freeze the sim (rendering continues).
    if (this.storyId) return;
    // day cycle — the Skyhold is held at dawn for the whole chapter
    if (this.c2Active && this.c2Seen && !this.c2Ending) this.dayFrac = 0.22;
    else this.dayFrac = (this.dayFrac + dt / DAY_LEN) % 1;
    const night = this.isNightNow();
    const wantTrack = this.bossActive() ? "boss" : night ? "night" : "day";
    audio.setTrack(wantTrack);

    this.placeCd = Math.max(0, this.placeCd - dt);
    this.attackCd = Math.max(0, this.attackCd - dt);
    this.swingT = Math.max(0, this.swingT - dt);
    this.invuln = Math.max(0, this.invuln - dt);
    this.hurtT = Math.max(0, this.hurtT - dt);
    this.portalMsgCd = Math.max(0, this.portalMsgCd - dt);
    this.bannerT = Math.max(0, this.bannerT - dt);
    this.flashT = Math.max(0, this.flashT - dt);
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
    this.updateHeir(dt);
    this.updateStoryTriggers();
    this.updateSiege(dt);

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
    const skyCamTop = this.c2Active && this.c2Seen && !this.c2Ending ? -this.viewH * 0.34 : 0;
    this.camY = Math.max(skyCamTop, Math.min(this.world.h * TILE - this.viewH, this.camY));

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
      if (this.onGround) {
        this.walkT += dt * 14;
        // running dust puffs
        this.stepDustT -= dt;
        if (this.stepDustT <= 0) {
          this.stepDustT = 0.24;
          for (let i = 0; i < 2; i++) this.dust(this.px - this.pface * 6, this.py + 20, "rgba(190,170,140,0.8)");
        }
      }
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
        for (let i = 0; i < 4; i++) this.dust(this.px, this.py + 20, "rgba(190,170,140,0.8)");
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
        for (let i = 0; i < Math.min(8, 2 + Math.floor(this.fallDistance / 120)); i++) {
          this.dust(this.px, this.py + 20, "rgba(190,170,140,0.8)");
        }
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
      if (this.c2Active && !this.c2Ending) {
        // The portals sleep while the Ledger is unfinished.
        if (this.portalMsgCd <= 0) {
          this.portalMsgCd = 5;
          this.showBanner("THE PORTALS SLEEP", "The Ledger must be finished here");
        }
        return;
      }
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
    const burstColor =
      e.type === "zombie" ? "#6fae5a"
      : e.type === "bat" ? "#9a7bff"
      : e.type === "storm" ? "#d6eaff"
      : e.type === "auditor" ? "#ffe8a8"
      : e.type === "wisp" || e.type === "herald" ? "#8fe8ff"
      : "#5fd06f";
    for (let i = 0; i < 8; i++) this.dust(e.x, e.y, burstColor);
    // shockwave ring
    this.particles.push({ x: e.x, y: e.y, vx: 0, vy: 0, life: 0.35, max: 0.35, size: e.w * 1.6 + 14, color: "rgba(255,255,255,0.9)", grav: 0, ring: true });
    if (e.type === "king") {
      this.kingDefeated = true;
      this.addItem("gold_bar", 15);
      this.addItem("diamond", 10);
      this.addItem("gel", 30);
      audio.playSfx("victory");
      if (!this.c2Active || this.c2Ending) {
        this.showBanner("THE KING FALLS", "Dawn breaks — and the sky begins to count");
        this.c2Active = true;
        this.c2Act2Seen = false;
        this.c2Act3Seen = false;
        this.c2Ending = null;
        this.heirFed = 0;
        this.shardsFound = 0;
        this.shardPos = null;
        this.moteBits = 0;
        this.sigilFound = false;
        this.bellRung = false;
        this.wispsKilled = 0;
        this.heraldDefeated = false;
        this.c2NameSeen = false;
        this.resetNewC2Progress();
        if (this.gatePos) {
          this.clearGateAt(this.gatePos);
          this.gatePos = null;
        }
        this.sky = null;
        this.questIndex = C2_START;
        this.heirX = this.px + 34;
        this.heirY = this.py;
        this.triggerStory("c2_intro");
      } else {
        this.showBanner("THE KING FALLS AGAIN", "The debt does not care how many times you win");
      }
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
    if (e.type === "wisp") {
      this.wispsKilled++;
      const n = 1 + (Math.random() < 0.5 ? 1 : 0);
      this.addItem("essence", n);
      this.float(e.x, e.y - 18, `+${n} ✨`, "#a8f0ff");
    }
    if (e.type === "herald") {
      this.heraldDefeated = true;
      this.addItem("essence", 6);
      this.addItem("gel", 8);
      audio.playSfx("victory");
      this.showBanner("THE HOLLOW HERALD FALLS", "The sky has no more collectors");
      this.triggerStory("c2_herald_end");
      this.saveGame();
      return;
    }
    if (e.type === "auditor") {
      this.auditorDefeated = true;
      this.addItem("essence", 5);
      this.addItem("gel", 10);
      audio.playSfx("victory");
      this.showBanner("THE AUDITOR BALANCED", "The ledger loses a page");
      this.triggerStory("c2_auditor_end");
      this.saveGame();
      return;
    }
    if (e.type === "storm") {
      this.stormDefeated = true;
      this.addItem("essence", 10);
      this.addItem("gel", 15);
      audio.playSfx("victory");
      this.showBanner("THE STORMFATHER FALLS", "The first apology, finally heard");
      this.triggerStory("c2_stormfather_end");
      this.saveGame();
      return;
    }
    this.checkQuest();
  }

  // ---------- enemies ----------
  private trySpawn(night: boolean) {
    if (this.c2Active && this.c2Seen && !this.c2Ending) {
      // The sky has its own wildlife: wisps, and only once the ledger starts.
      if (this.questIndex < C2_WISPS || this.questIndex >= C2_LAST) return;
      if (this.siegeActive || this.bossActive()) return;
      if (this.enemies.filter((e) => e.type === "wisp").length >= 3) return;
      const x = Math.max(80, Math.min(this.world.w * TILE - 80, this.px + (Math.random() < 0.5 ? -1 : 1) * (this.viewW * 0.45 + 40)));
      this.enemies.push({
        type: "wisp", x, y: Math.max(TILE * 3, this.py - 120 - Math.random() * 120), vx: 0, vy: 0,
        w: 26, h: 22, hp: 24, maxHp: 24, facing: -1, onGround: false, hopT: 0,
        hitFlash: 0, t: 0, spawnT: 0, knock: 0, swoopT: 2 + Math.random() * 2.5,
      });
      return;
    }
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
      if (e.type === "bat" || e.type === "wisp" || e.type === "herald" || e.type === "auditor" || e.type === "storm") {
        const bossFlyer = e.type === "herald" || e.type === "auditor" || e.type === "storm";
        const storm = e.type === "storm";
        const auditor = e.type === "auditor";
        const wisp = e.type === "wisp";
        const hover = storm ? 46 : auditor ? 38 : bossFlyer ? 34 : wisp ? 72 : 60;
        const calmA = storm ? 0.55 : auditor ? 0.8 : bossFlyer ? 0.7 : wisp ? 0.9 : 1;
        const maxV = storm ? 110 : auditor ? 150 : bossFlyer ? 130 : wisp ? 160 : 260;
        const dive = storm ? 280 : auditor ? 340 : bossFlyer ? 300 : wisp ? 360 : 500;
        e.swoopT -= dt;
        if (e.swoopT > 0) {
          // normal flight
          e.vy += (this.py - hover - e.y) * 1.4 * calmA * dt;
          e.vy = Math.max(-maxV, Math.min(maxV, e.vy));
          e.vx += Math.sign(dx) * (wisp ? 50 : 60) * calmA * dt;
          e.vx = Math.max(-maxV * 0.6, Math.min(maxV * 0.6, e.vx));
        } else if (e.swoopT > (bossFlyer ? -0.55 : -0.3)) {
          // swoop phase: rapid dive toward player
          const targetX = this.px;
          const targetY = this.py - (bossFlyer ? 20 : 30);
          e.vx += Math.sign(targetX - e.x) * dive * 0.8 * dt;
          e.vy += Math.sign(targetY - e.y) * dive * 0.8 * dt;
          e.vx = Math.max(-dive, Math.min(dive, e.vx));
          e.vy = Math.max(-dive, Math.min(dive, e.vy));
        } else {
          // reset swoop cooldown
          e.swoopT = storm ? 4 + Math.random() * 1.5 : bossFlyer ? 3 + Math.random() * 2 : 2 + Math.random() * 3;
        }
        // collide with solid tiles (so flyers can't pass through your walls)
        this.flyCollide(e, dt);
        e.y += Math.sin(e.t * (bossFlyer ? 4 : 8)) * 1.2;
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
        const dmg =
          e.type === "king" ? 22
          : e.type === "storm" ? 24
          : e.type === "auditor" ? 18
          : e.type === "herald" ? 16
          : e.type === "zombie" ? 14
          : e.type === "wisp" ? 6
          : 8;
        this.hurt(dmg);
      }
      // despawning: far away enemies are removed (bosses stay)
      const dist = Math.abs(e.x - this.px);
      if (dist > this.viewW * 2 && e.type !== "king" && e.type !== "herald") {
        this.enemies.splice(i, 1);
      } else if (dist > this.viewW && e.type !== "king" && e.type !== "herald") {
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
    if (this.victory || this.gameover || this.storyId) return;
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
      // Chapter II
      case C2_CLOUDPATH: {
        const l = this.sky ?? skyLayout(this.world);
        done = this.px >= (l.islands[1].x - 4) * TILE;
        break;
      }
      case C2_FEED: done = this.heirFed >= 5; break;
      case C2_MOTES: done = this.moteCount() >= 3; break;
      case C2_NAME: done = this.heirFed >= 8; break;
      case C2_WISPS: done = this.wispsKilled >= 5; break;
      case C2_ESSENCE: done = this.count("essence") >= 8; break;
      case C2_BLADE: done = this.count("skyblade") >= 1; break;
      case C2_SHRINES: done = this.shrinesLit() >= 3; break;
      case C2_SHARD1: done = this.shardsFound >= 1; break;
      case C2_TOLL: done = this.tollPaid; break;
      case C2_SIGIL: done = this.sigilFound; break;
      case C2_AUDITOR: done = this.auditorDefeated; break;
      case C2_UNDERSKY: done = this.pageCount() >= 3; break;
      case C2_CHIMES: done = this.chimeStep >= CHIME_ORDER.length; break;
      case C2_SHARD2: done = this.shardsFound >= 2; break;
      case C2_SIEGE: done = this.siegeDone; break;
      case C2_HERALD: done = this.heraldDefeated; break;
      case C2_TRUST: done = this.heirFed >= SECRET_TRUST; break;
      case C2_SHARD3: done = this.shardsFound >= 3; break;
      case C2_STORM: done = this.stormDefeated; break;
      case C2_WITNESS: done = this.witnessCount() >= 4; break;
      case C2_CONFESSION: done = this.confessionSeen; break;
      case C2_BELL: done = this.bellRung; break;
      // C2_LAST is completed by the final story at the summit.
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
      case C2_CLOUDPATH: this.maxHp += 20; this.hp = Math.min(this.maxHp, this.hp + 20); break;
      case C2_FEED: this.addItem("gel", 5); break;
      case C2_MOTES: this.maxHp += 10; this.hp = Math.min(this.maxHp, this.hp + 10); break;
      case C2_NAME: this.maxHp += 10; this.hp = Math.min(this.maxHp, this.hp + 10); break;
      case C2_WISPS: this.addItem("gel", 5); break;
      case C2_ESSENCE: this.addItem("torch", 6); break;
      case C2_BLADE: this.maxHp += 20; this.hp = Math.min(this.maxHp, this.hp + 20); break;
      case C2_SHRINES: this.maxHp += 10; this.hp = Math.min(this.maxHp, this.hp + 10); break;
      case C2_SHARD1: this.maxHp += 10; this.hp = Math.min(this.maxHp, this.hp + 10); break;
      case C2_TOLL: this.maxHp += 10; this.hp = Math.min(this.maxHp, this.hp + 10); break;
      case C2_SIGIL: this.addItem("gel", 5); break;
      case C2_AUDITOR: this.maxHp += 20; this.hp = Math.min(this.maxHp, this.hp + 20); break;
      case C2_UNDERSKY: this.maxHp += 10; this.hp = Math.min(this.maxHp, this.hp + 10); break;
      case C2_CHIMES: this.maxHp += 10; this.hp = Math.min(this.maxHp, this.hp + 10); break;
      case C2_SHARD2: this.maxHp += 10; this.hp = Math.min(this.maxHp, this.hp + 10); break;
      case C2_SIEGE: this.maxHp += 20; this.hp = Math.min(this.maxHp, this.hp + 20); break;
      case C2_HERALD: this.addItem("gel", 10); break;
      case C2_TRUST: this.maxHp += 20; this.hp = Math.min(this.maxHp, this.hp + 20); break;
      case C2_SHARD3: this.maxHp += 10; this.hp = Math.min(this.maxHp, this.hp + 10); break;
      case C2_STORM: this.maxHp += 20; this.hp = Math.min(this.maxHp, this.hp + 20); break;
      case C2_WITNESS: this.maxHp += 10; this.hp = Math.min(this.maxHp, this.hp + 10); break;
      case C2_CONFESSION: this.maxHp += 10; this.hp = Math.min(this.maxHp, this.hp + 10); break;
      case C2_BELL: this.addItem("gel", 10); break;
    }
    audio.playSfx("levelup");
    this.showBanner("QUEST COMPLETE", q.title);
    this.float(this.px, this.py - 40, q.reward, "#9fff9f");
    this.questIndex++;
    if (this.questIndex === C2_MOTES && !this.c2Act2Seen) {
      // Feeding the heir opens Act II.
      this.c2Act2Seen = true;
      this.triggerStory("c2_act2");
    } else if (this.questIndex === C2_NAME && !this.c2NameSeen) {
      this.c2NameSeen = true;
      this.triggerStory("c2_heir_name");
    } else if (this.questIndex === C2_SHARD3 && !this.c2TrustSeen) {
      this.c2TrustSeen = true;
      this.triggerStory("c2_heir_trust");
    } else if (this.questIndex === C2_STORM && !this.c2Act3Seen) {
      this.c2Act3Seen = true;
      this.triggerStory("c2_act3");
    } else if (this.questIndex === C2_LAST) {
      this.showBanner("THE SUMMIT", "Mira waits where the sky ends");
    }
    this.saveGame();
    this.pushState();
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
      if (p.sway) p.vx = Math.sin((p.max - p.life) * 4 + p.sway) * 18;
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
      // sample a few visible tiles: falling leaves from trees, sparks from torches
      for (let s = 0; s < 3; s++) {
        const tx = Math.floor((this.camX + Math.random() * this.viewW) / TILE);
        const ty = Math.floor((this.camY + Math.random() * this.viewH) / TILE);
        if (tx < 0 || tx >= this.world.w || ty < 0 || ty >= this.world.h) continue;
        const id = getTile(this.world, tx, ty);
        if (id === LEAVES && Math.random() < 0.3 && this.particles.length < 280) {
          this.particles.push({
            x: tx * TILE + Math.random() * TILE, y: ty * TILE + TILE,
            vx: 0, vy: 14, life: 2.2 + Math.random(), max: 3, size: 3,
            color: Math.random() < 0.5 ? "#4aa036" : "#357a27", grav: 26, sway: tx * 1.7,
          });
        } else if (id === TORCH && Math.random() < 0.25 && this.particles.length < 280) {
          this.particles.push({
            x: tx * TILE + TILE / 2 + (Math.random() - 0.5) * 4, y: ty * TILE + TILE - 18,
            vx: (Math.random() - 0.5) * 12, vy: -30 - Math.random() * 20, life: 0.7, max: 0.7,
            size: 2, color: Math.random() < 0.5 ? "#ffcf6b" : "#ff9d3c", grav: -20,
          });
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
    const boss = this.enemies.find((e) => e.type === "king" || e.type === "herald" || e.type === "auditor" || e.type === "storm");
    const bossName =
      boss?.type === "herald" ? "Hollow Herald"
      : boss?.type === "auditor" ? "The Auditor"
      : boss?.type === "storm" ? "The Stormfather"
      : "Slime King";
    const pxTile = Math.floor(this.px / TILE);
    const pyTile = Math.floor(this.py / TILE);
    let nearPortal = false;
    for (let dy = -3; dy <= 3; dy++) {
      for (let dx = -3; dx <= 3; dx++) {
        if (getTile(this.world, pxTile + dx, pyTile + dy) === PORTAL) { nearPortal = true; break; }
      }
      if (nearPortal) break;
    }
    let c2Track: EngineState["c2Track"] = null;
    if (this.c2Active && !this.c2Ending && this.questIndex === C2_TOLL && !this.tollPaid) {
      const l = this.sky ?? skyLayout(this.world);
      const dx = (l.toll.x + 0.5) * TILE - this.px;
      const dy = (l.toll.y + 0.5) * TILE - this.py;
      c2Track = { x: l.toll.x, y: l.toll.y, dist: Math.hypot(dx, dy) / TILE, coins: this.coinCount(), total: l.coins.length };
    }
    const nearChime = this.questIndex === C2_CHIMES && this.chimeStep < CHIME_ORDER.length && this.chimeInReach() >= 0;
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
      boss: boss ? { name: bossName, hp: Math.max(0, boss.hp), maxHp: boss.maxHp } : null,
      mineProgress: this.mineTX >= 0 ? Math.min(1, this.mineProg / (TILES[getTile(this.world, this.mineTX, this.mineTY)]?.hp || 1)) : 0,
      inventory: this.inv.map((s) => (s ? { id: s.id, count: s.count } : null)),
      stations: { workbench: this.workbenchCount > 0, furnace: this.furnaceCount > 0 },
      craftable,
      depth: Math.max(0, Math.floor(this.py / TILE) - this.world.surfaceY[Math.floor(this.px / TILE)]),
      nearPortal,
      savedAt: this.saveCounter,
      playerTX: pxTile,
      playerTY: pyTile,
      c2Active: this.c2Active,
      heirFed: this.heirFed,
      shardsFound: this.shardsFound,
      ending: this.c2Ending,
      story: this.storyId,
      c2Track,
      nearChime,
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
    if (this.inSky()) this.drawSkyClouds(ctx);

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
      const a = Math.max(0, p.life / p.max);
      if (p.ring) {
        // expanding shockwave ring (on enemy death)
        const r = p.size * (1 - p.life / p.max);
        ctx.globalAlpha = a;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 2 + a * 2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.stroke();
        continue;
      }
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      const rot = p.sway ? (p.max - p.life) * 5 : 0;
      if (rot) {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(rot);
        ctx.fillRect(-p.size, -p.size / 2, p.size * 2, p.size);
        ctx.restore();
      } else {
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      }
    }
    ctx.globalAlpha = 1;
    for (const e of this.enemies) this.drawEnemy(ctx, e);
    if (this.c2Active && !this.c2Ending && this.sky) {
      this.drawSummitBeam(ctx);
      this.drawSkyQuestObjects(ctx);
    }
    this.drawHeir(ctx);
    if (this.c2Active && !this.c2Ending) this.drawMira(ctx);
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

    if (this.flashT > 0) {
      ctx.fillStyle = `rgba(236,248,255,${Math.min(0.92, this.flashT * 0.85)})`;
      ctx.fillRect(0, 0, this.viewW, this.viewH);
    }

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
        } else if (id === SHARD) {
          const fl = 0.75 + 0.25 * Math.sin(this.frame * 0.07 + tx);
          const r = TILE * 2.4 * fl;
          ctx.globalAlpha = 0.34 * fl;
          ctx.drawImage(spr, 0, 0, spr.width, spr.height, tx * TILE + TILE / 2 - r, ty * TILE + TILE / 2 - r, r * 2, r * 2);
        } else if (id === HOLLOW_GATE) {
          const fl = 0.7 + 0.3 * Math.sin(this.frame * 0.04 + ty * 0.9);
          const r = TILE * 1.7 * fl;
          ctx.globalAlpha = 0.2 * fl;
          ctx.drawImage(spr, 0, 0, spr.width, spr.height, tx * TILE + TILE / 2 - r, ty * TILE + TILE / 2 - r, r * 2, r * 2);
        } else if (id === SKY_SPIRE) {
          const fl = 0.8 + 0.2 * Math.sin(this.frame * 0.04 + tx * 0.8);
          const r = TILE * 1.3 * fl;
          ctx.globalAlpha = 0.14 * fl;
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

    // dawn/dusk horizon glow — warm band while the sun kisses the horizon
    const dusk = 1 - Math.min(1, Math.abs(bright) / 0.28);
    if (dusk > 0) {
      const hy = this.viewH * 0.42;
      const hg = ctx.createLinearGradient(0, hy - 70, 0, hy + 90);
      hg.addColorStop(0, "rgba(255,150,70,0)");
      hg.addColorStop(0.5, `rgba(255,145,65,${0.22 * dusk})`);
      hg.addColorStop(1, "rgba(255,90,40,0)");
      ctx.fillStyle = hg;
      ctx.fillRect(0, hy - 70, this.viewW, 160);
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
      // birds drifting far away
      ctx.strokeStyle = "rgba(40,60,80,0.55)";
      ctx.lineWidth = 2;
      for (let i = 0; i < 3; i++) {
        const bx = ((this.frame * (1.4 + i * 0.5) + i * 420) % (this.viewW + 80)) - 40;
        const by = 52 + Math.sin(this.frame * 0.01 + i * 2.4) * 14 + i * 26;
        const fl = Math.sin(this.frame * 0.25 + i * 1.3) * 3;
        ctx.beginPath();
        ctx.moveTo(bx - 6, by - fl);
        ctx.lineTo(bx, by);
        ctx.lineTo(bx + 6, by - fl);
        ctx.stroke();
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
      // moon craters
      ctx.fillStyle = "rgba(160,170,210,0.5)";
      ctx.beginPath();
      ctx.arc(cx - 5, cy - 4, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx + 6, cy + 5, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx + 2, cy - 8, 2, 0, Math.PI * 2);
      ctx.fill();
      // shooting star (once per cycle)
      const meteorCycle = 780;
      const mf = this.frame % meteorCycle;
      if (mf < 30) {
        const mi = Math.floor(this.frame / meteorCycle);
        const mx0 = ((mi * 977) % Math.floor(this.viewW * 0.7)) + this.viewW * 0.1;
        const my0 = ((mi * 613) % Math.floor(this.viewH * 0.25)) + 20;
        const p = mf / 30;
        const mx = mx0 + p * 130;
        const my = my0 + p * 60;
        const a = Math.sin(p * Math.PI);
        ctx.strokeStyle = `rgba(220,235,255,${0.8 * a})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(mx - 40, my - 18);
        ctx.lineTo(mx, my);
        ctx.stroke();
      }
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
    if (id === SHARD) {
      // floating memory shard — bobbing crystal with an orbiting halo
      const t = this.frame * 0.05;
      const cx = x + TILE / 2;
      const cy = y + TILE / 2 + Math.sin(t + tx * 0.8) * 3;
      const halo = ctx.createRadialGradient(cx, cy, 1, cx, cy, 26);
      halo.addColorStop(0, "rgba(150,240,255,0.55)");
      halo.addColorStop(0.5, "rgba(90,200,255,0.22)");
      halo.addColorStop(1, "rgba(60,160,220,0)");
      ctx.fillStyle = halo;
      ctx.fillRect(cx - 26, cy - 26, 52, 52);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(Math.sin(t * 0.7) * 0.18);
      const grd = ctx.createLinearGradient(0, -14, 0, 14);
      grd.addColorStop(0, "#e8ffff");
      grd.addColorStop(0.45, "#8ff0ff");
      grd.addColorStop(1, "#2b8fb5");
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.moveTo(0, -14);
      ctx.lineTo(7, -2);
      ctx.lineTo(4, 12);
      ctx.lineTo(-4, 12);
      ctx.lineTo(-7, -2);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "rgba(220,255,255,0.8)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      ctx.beginPath();
      ctx.moveTo(0, -12);
      ctx.lineTo(3, -2);
      ctx.lineTo(0, 9);
      ctx.lineTo(-2, -2);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      for (let i = 0; i < 3; i++) {
        const a = t * 1.6 + (i * Math.PI * 2) / 3;
        ctx.fillStyle = "rgba(200,250,255,0.85)";
        ctx.fillRect(cx + Math.cos(a) * 17 - 1.5, cy + Math.sin(a) * 7 - 1.5, 3, 3);
      }
      return;
    }
    if (id === HOLLOW_GATE) {
      // the doorway into the Hollow Silence — a void with drifting violet motes
      const vg = ctx.createLinearGradient(x, y, x, y + TILE);
      vg.addColorStop(0, "#150e22");
      vg.addColorStop(1, "#05040a");
      ctx.fillStyle = vg;
      ctx.fillRect(x, y, TILE, TILE);
      const fl = 0.55 + 0.45 * Math.sin(this.frame * 0.06 + ty * 1.3);
      for (let i = 0; i < 3; i++) {
        const seed = (tx * 31 + ty * 17 + i * 91) % 997;
        const mx = x + 4 + ((seed * 7) % (TILE - 8));
        const my = y + TILE - ((this.frame * 0.35 + seed) % (TILE + 10));
        const a = Math.max(0, 1 - Math.abs(my - (y + TILE / 2)) / (TILE * 0.8));
        ctx.fillStyle = `rgba(190,150,255,${(0.12 + 0.45 * a) * fl})`;
        ctx.fillRect(mx, my, 2, 2);
      }
      if (ty % 2 === 0) {
        const rx = x + TILE / 2;
        const ry = y + TILE / 2;
        ctx.strokeStyle = `rgba(185,125,255,${0.22 + 0.2 * fl})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(rx - 6, ry - 5);
        ctx.lineTo(rx + 5, ry - 5);
        ctx.moveTo(rx - 5, ry + 1);
        ctx.lineTo(rx + 5, ry + 1);
        ctx.moveTo(rx, ry - 5);
        ctx.lineTo(rx, ry + 6);
        ctx.stroke();
      }
      // violet rim on the outer edges of the monument
      ctx.strokeStyle = "rgba(150,95,230,0.55)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      if (getTile(this.world, tx - 1, ty) !== HOLLOW_GATE) { ctx.moveTo(x + 1, y); ctx.lineTo(x + 1, y + TILE); }
      if (getTile(this.world, tx + 1, ty) !== HOLLOW_GATE) { ctx.moveTo(x + TILE - 1, y); ctx.lineTo(x + TILE - 1, y + TILE); }
      if (getTile(this.world, tx, ty - 1) !== HOLLOW_GATE) { ctx.moveTo(x, y + 1); ctx.lineTo(x + TILE, y + 1); }
      ctx.stroke();
      return;
    }
    // blit cached pixel-art texture (4 variants for variety). The textures
    // already bake in edge shading, so no per-tile overlays are needed here.
    const v = (tx * 7 ^ ty * 13) & 3;
    // leaves sway gently in the wind
    const ox = id === LEAVES ? Math.sin(this.frame * 0.045 + (tx + ty * 3) * 0.7) * 1.6 : 0;
    ctx.drawImage(tileTexture(id, v), 0, 0, TEX, TEX, x + ox, y, TILE, TILE);
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

    const moving = this.onGround && Math.abs(this.pvx) > 4;
    const airborne = !this.onGround && !this.flying;
    const bob = moving ? Math.abs(Math.sin(this.walkT)) * -2 : this.onGround ? Math.sin(this.frame * 0.06) * 0.6 : 0;

    ctx.save();
    ctx.globalAlpha = blink ? 0.4 : 1;
    const spr = getSprite("player");
    if (spr) {
      this.blitFeet(ctx, spr, x, y + 22 + bob, 56, this.pface, 1);
    } else {
      this.drawWarden(ctx, x, y + bob, moving, airborne, this.pface, this.walkT);
    }
    ctx.restore();

    // tool / weapon in hand (drawn over the body)
    this.drawTool(ctx, x, y + bob);

    // swing slash arc
    if (this.swingT > 0) {
      const p = 1 - this.swingT / 0.18;
      const reach = TILE * 1.6;
      ctx.save();
      ctx.translate(x, y - 6);
      ctx.scale(this.pface, 1);
      ctx.strokeStyle = `rgba(255,255,255,${0.7 * (1 - p)})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(8, 0, reach, -1.2 + p * 2.2, 0.2 + p * 2.2);
      ctx.stroke();
      ctx.strokeStyle = `rgba(255,220,150,${0.35 * (1 - p)})`;
      ctx.lineWidth = 6;
      ctx.stroke();
      ctx.restore();
    }
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

  /** Fully procedural animated Warden: walk cycle with swinging legs & arms,
      tunic with gold trim, spiky hair — mirrors the marketing art style. */
  private drawWarden(ctx: CanvasRenderingContext2D, x: number, y: number, moving: boolean, airborne: boolean, face: number, walkT: number) {
    const OL = "#241208";
    const legSwing = moving ? Math.sin(walkT) : 0;
    const armSwing = moving ? Math.sin(walkT + Math.PI) * 0.5 : 0;
    const breathe = moving ? 0 : Math.sin(this.frame * 0.06) * 0.5;

    ctx.save();
    ctx.translate(x, y);
    ctx.scale(face, 1);
    if (moving) ctx.rotate(0.05); // slight forward lean while running

    const leg = (phase: number, back: boolean) => {
      let ang = legSwing * phase;
      if (airborne) ang = phase > 0 ? 0.45 : -0.35; // tucked jump pose
      ctx.save();
      ctx.translate(phase > 0 ? 2.5 : -2.5, 9);
      ctx.rotate(ang);
      // upper leg (pants)
      ctx.fillStyle = back ? "#4a3020" : "#5a3a22";
      ctx.fillRect(-3.5, 0, 7, 9);
      // boot
      ctx.fillStyle = back ? "#2e1c10" : "#3a2614";
      ctx.fillRect(-4, 8, 9, 5);
      ctx.fillStyle = OL;
      ctx.fillRect(-4, 12, 9, 1.5);
      ctx.restore();
    };
    const arm = (phase: number, back: boolean) => {
      let ang = armSwing * phase;
      if (airborne) ang = phase > 0 ? -0.7 : 0.3;
      ctx.save();
      ctx.translate(phase > 0 ? 6.5 : -6.5, -7 + breathe);
      ctx.rotate(ang);
      // sleeve (tunic color, darker on the back arm)
      ctx.fillStyle = back ? "#2f5f9c" : "#3a78c8";
      ctx.fillRect(-2.5, 0, 5, 7);
      // forearm with leather bracer
      ctx.fillStyle = "#e8bc90";
      ctx.fillRect(-2, 6.5, 4, 4);
      ctx.fillStyle = "#7a4a22";
      ctx.fillRect(-2.5, 9.5, 5, 2.5);
      ctx.restore();
    };

    // back limbs → torso → head → front limbs (correct depth order)
    leg(-1, true);
    arm(-1, true);

    // torso — blue tunic with gold trim
    ctx.fillStyle = OL;
    ctx.fillRect(-10, -12, 20, 23);
    const tg = ctx.createLinearGradient(0, -12, 0, 11);
    tg.addColorStop(0, "#5aa0e0");
    tg.addColorStop(0.5, "#3a78c8");
    tg.addColorStop(1, "#264f8a");
    ctx.fillStyle = tg;
    ctx.fillRect(-9, -11, 18, 21);
    // gold trim: collar + belt
    ctx.fillStyle = "#e7c14a";
    ctx.fillRect(-9, 2, 18, 4);
    ctx.fillStyle = "#b8860b";
    ctx.fillRect(-9, 5, 18, 1);
    ctx.fillStyle = "#ffe79a";
    ctx.fillRect(-2, 3, 4, 2);
    // subtle chest highlight
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    ctx.fillRect(-6, -10, 3, 12);

    // head
    const hy = -26 + breathe;
    ctx.fillStyle = OL;
    ctx.fillRect(-8, hy, 16, 16);
    const hg = ctx.createLinearGradient(0, hy, 0, hy + 16);
    hg.addColorStop(0, "#fbd9aa");
    hg.addColorStop(1, "#e0b07c");
    ctx.fillStyle = hg;
    ctx.fillRect(-7, hy + 1, 14, 14);
    // hair — spiky, covers the top
    ctx.fillStyle = "#6e4a26";
    ctx.fillRect(-7, hy, 14, 5);
    ctx.fillStyle = OL;
    ctx.beginPath();
    ctx.moveTo(-7, hy + 1);
    ctx.lineTo(-4, hy - 4);
    ctx.lineTo(-1, hy + 1);
    ctx.lineTo(2, hy - 5);
    ctx.lineTo(5, hy);
    ctx.lineTo(7, hy - 3);
    ctx.lineTo(8, hy + 3);
    ctx.lineTo(-7, hy + 3);
    ctx.closePath();
    ctx.fillStyle = "#5a3a1e";
    ctx.fill();
    ctx.fillStyle = "#8a6236";
    ctx.fillRect(-5, hy, 4, 2);
    // eye (facing side)
    ctx.fillStyle = "#1a2230";
    ctx.fillRect(2, hy + 6, 3, 3);
    ctx.fillStyle = "#fff";
    ctx.fillRect(3, hy + 6.5, 1, 1);
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
    const flyer = e.type === "bat" || e.type === "wisp" || e.type === "herald" || e.type === "auditor" || e.type === "storm";
    ctx.save();
    ctx.globalAlpha = flyer ? 0.1 : 0.26;
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.ellipse(e.x, e.y + e.h / 2 + 2, e.w * 0.5, flyer ? 3 : 5, 0, 0, Math.PI * 2);
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
    } else if (e.type === "wisp" || e.type === "herald") {
      const big = e.type === "herald";
      const r = big ? 24 : 11;
      // cold aura
      const aura = ctx.createRadialGradient(0, 0, 1, 0, 0, r * 2.7);
      aura.addColorStop(0, big ? "rgba(140,225,255,0.5)" : "rgba(180,250,240,0.45)");
      aura.addColorStop(1, "rgba(90,200,255,0)");
      ctx.fillStyle = aura;
      ctx.fillRect(-r * 2.7, -r * 2.7, r * 5.4, r * 5.4);
      // wings
      const flap = Math.sin(e.t * (big ? 7 : 13)) * (big ? 7 : 4);
      ctx.fillStyle = flash ? "#fff" : big ? "rgba(120,190,235,0.85)" : "rgba(210,255,245,0.8)";
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(s * r * 0.4, -r * 0.2);
        ctx.quadraticCurveTo(s * r * 2.2, -flap - r, s * r * 1.35, r * 0.55);
        ctx.closePath();
        ctx.fill();
      }
      // body
      const body = ctx.createRadialGradient(-r * 0.3, -r * 0.4, 1, 0, 0, r);
      body.addColorStop(0, big ? "#dff7ff" : "#f0fffb");
      body.addColorStop(0.5, big ? "#6fa8cc" : "#8fe8d8");
      body.addColorStop(1, big ? "#2f5a7a" : "#3fa89e");
      ctx.fillStyle = flash ? "#fff" : body;
      ctx.beginPath();
      ctx.ellipse(0, 0, r, r * 0.82, 0, 0, Math.PI * 2);
      ctx.fill();
      // eyes
      ctx.fillStyle = big ? "#ff5a7a" : "#16303a";
      ctx.fillRect(-r * 0.42, -r * 0.14, big ? 3 : 2, big ? 4 : 3);
      ctx.fillRect(r * 0.18, -r * 0.14, big ? 3 : 2, big ? 4 : 3);
      if (big) {
        // the Collector's hollow crown
        ctx.fillStyle = "#c4b5fd";
        ctx.beginPath();
        ctx.moveTo(-r * 0.72, -r * 0.55);
        ctx.lineTo(-r * 0.45, -r * 1.12);
        ctx.lineTo(-r * 0.14, -r * 0.65);
        ctx.lineTo(r * 0.16, -r * 1.2);
        ctx.lineTo(r * 0.44, -r * 0.65);
        ctx.lineTo(r * 0.72, -r * 1.05);
        ctx.lineTo(r * 0.72, -r * 0.5);
        ctx.closePath();
        ctx.fill();
      }
      // drifting trail
      for (let i = 0; i < (big ? 5 : 3); i++) {
        const a = e.t * 2 + i * 1.7;
        ctx.fillStyle = big ? "rgba(190,235,255,0.5)" : "rgba(220,255,250,0.6)";
        ctx.fillRect(Math.cos(a) * r * 1.2 - 1, Math.sin(a) * r * 0.9 + r * 0.8, 2, 2);
      }
    } else if (e.type === "auditor") {
      const bob = Math.sin(e.t * 2.2) * 2;
      // cold halo of arithmetic
      const halo = ctx.createRadialGradient(0, bob, 2, 0, bob, 54);
      halo.addColorStop(0, "rgba(255,232,168,0.22)");
      halo.addColorStop(1, "rgba(255,210,110,0)");
      ctx.fillStyle = halo;
      ctx.fillRect(-54, -54, 108, 108);
      // robe
      ctx.fillStyle = OL;
      ctx.beginPath();
      ctx.moveTo(-14, -30 + bob);
      ctx.lineTo(14, -30 + bob);
      ctx.lineTo(22, 24 + bob);
      ctx.lineTo(-22, 24 + bob);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = flash ? "#fff" : "#2f2a3d";
      ctx.beginPath();
      ctx.moveTo(-12, -29 + bob);
      ctx.lineTo(12, -29 + bob);
      ctx.lineTo(19, 22 + bob);
      ctx.lineTo(-19, 22 + bob);
      ctx.closePath();
      ctx.fill();
      // gold trim
      ctx.strokeStyle = "rgba(255,214,120,0.7)";
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(-18, 20 + bob);
      ctx.lineTo(-10, -27 + bob);
      ctx.moveTo(18, 20 + bob);
      ctx.lineTo(10, -27 + bob);
      ctx.stroke();
      // mask
      ctx.fillStyle = OL;
      ctx.fillRect(-13, -48 + bob, 26, 22);
      ctx.fillStyle = flash ? "#fff" : "#e8ddc4";
      ctx.fillRect(-12, -47 + bob, 24, 20);
      ctx.fillStyle = "#2f2a3d";
      ctx.fillRect(-8, -41 + bob, 6, 4);
      ctx.fillRect(2, -41 + bob, 6, 4);
      ctx.fillStyle = "#ffb84d";
      ctx.fillRect(-7, -40 + bob, 4, 2);
      ctx.fillRect(3, -40 + bob, 4, 2);
      ctx.fillStyle = OL;
      ctx.fillRect(-4, -33 + bob, 8, 2);
      // scales of the debt
      ctx.strokeStyle = "#f3d58a";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-22, -8 + bob);
      ctx.lineTo(22, -8 + bob);
      ctx.moveTo(0, -8 + bob);
      ctx.lineTo(0, 4 + bob);
      ctx.stroke();
      ctx.fillStyle = "#f3d58a";
      ctx.beginPath();
      ctx.arc(-22, -5 + bob, 4.5, 0, Math.PI * 2);
      ctx.arc(22, -5 + bob, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#8a6a2a";
      ctx.fillRect(-2, 4 + bob, 4, 8);
    } else if (e.type === "storm") {
      const bob = Math.sin(e.t * 1.4) * 3;
      // the storm body
      const g = ctx.createRadialGradient(-8, -8 + bob, 4, 0, bob, 52);
      g.addColorStop(0, flash ? "#fff" : "#e6f2ff");
      g.addColorStop(0.45, flash ? "#fff" : "#8fa9c4");
      g.addColorStop(1, flash ? "#fff" : "#3d5470");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(0, bob, 38, 26, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(-22, 6 + bob, 20, 16, 0, 0, Math.PI * 2);
      ctx.ellipse(22, 6 + bob, 22, 17, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(0, -16 + bob, 22, 16, 0, 0, Math.PI * 2);
      ctx.fill();
      // lightning cracks
      ctx.strokeStyle = "rgba(255,238,150,0.9)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-12, -4 + bob);
      ctx.lineTo(-4, 6 + bob);
      ctx.lineTo(-9, 8 + bob);
      ctx.lineTo(2, 20 + bob);
      ctx.stroke();
      // storm eyes and mouth
      ctx.fillStyle = "#12202c";
      ctx.fillRect(-14, -6 + bob, 8, 5);
      ctx.fillRect(6, -6 + bob, 8, 5);
      ctx.fillStyle = "#ffe98a";
      ctx.fillRect(-12, -5 + bob, 4, 2);
      ctx.fillRect(8, -5 + bob, 4, 2);
      ctx.fillStyle = "rgba(10,20,30,0.75)";
      ctx.beginPath();
      ctx.ellipse(0, 10 + bob, 10, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      // cloudstone crown
      ctx.fillStyle = "#c3d9ea";
      ctx.beginPath();
      ctx.moveTo(-20, -26 + bob);
      ctx.lineTo(-12, -42 + bob);
      ctx.lineTo(-4, -28 + bob);
      ctx.lineTo(4, -44 + bob);
      ctx.lineTo(12, -28 + bob);
      ctx.lineTo(20, -40 + bob);
      ctx.lineTo(22, -22 + bob);
      ctx.closePath();
      ctx.fill();
      // rain
      for (let i = 0; i < 6; i++) {
        const ry = ((e.t * 90 + i * 23) % 70) - 5;
        ctx.fillStyle = "rgba(170,215,255,0.55)";
        ctx.fillRect(-30 + i * 12 + Math.sin(e.t + i) * 2, ry + bob, 1.5, 6);
      }
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
