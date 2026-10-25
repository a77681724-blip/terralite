// src/world.ts — tile/item/recipe data + procedural world generation.

// ---- Tile IDs ----
export const AIR = 0;
export const GRASS = 1;
export const DIRT = 2;
export const STONE = 3;
export const WOOD = 4;
export const LEAVES = 5;
export const SAND = 6;
export const COPPER = 7;
export const IRON = 8;
export const GOLD = 9;
export const DIAMOND = 10;
export const COAL = 11;
export const PLANK = 12;
export const TORCH = 13;
export const GLASS = 14;
export const BEDROCK = 15;
export const WORKBENCH = 16;
export const FURNACE = 17;
export const PORTAL = 21;
export const WATER = 18;

export const TILE = 32; // 16px pixel-art source * 2 = crisp retro scaling
export const WORLD_W = 480;
export const WORLD_H = 170;

export interface TileDef {
  name: string;
  solid: boolean;
  color: string;
  shade: string; // darker accent
  light?: number; // light emitted (0..15)
  minTier: number; // pickaxe tier required to mine
  hp: number; // hits to break (scaled by tool power)
  drop?: string; // item dropped
  dropMin?: number;
  dropMax?: number;
  speckle?: string; // ore nugget color
  bg?: boolean; // non-collidable decoration (torch, plant)
}

export const TILES: TileDef[] = [];
TILES[AIR] = { name: "Air", solid: false, color: "#000", shade: "#000", minTier: 0, hp: 1 };
TILES[GRASS] = { name: "Grass", solid: true, color: "#5fae3a", shade: "#3c7d24", minTier: 0, hp: 2, drop: "dirt", dropMin: 1, dropMax: 1 };
TILES[DIRT] = { name: "Dirt", solid: true, color: "#8a5a32", shade: "#5f3c1f", minTier: 0, hp: 2, drop: "dirt", dropMin: 1, dropMax: 1 };
TILES[STONE] = { name: "Stone", solid: true, color: "#8a8f9c", shade: "#5c606c", minTier: 1, hp: 8, drop: "stone", dropMin: 1, dropMax: 1 };
TILES[WOOD] = { name: "Wood", solid: true, color: "#7a5230", shade: "#523319", minTier: 0, hp: 6, drop: "wood", dropMin: 1, dropMax: 2 };
TILES[LEAVES] = { name: "Leaves", solid: false, color: "#3f8f2f", shade: "#2c6320", minTier: 0, hp: 1, drop: "apple", dropMin: 1, dropMax: 1 };
TILES[SAND] = { name: "Sand", solid: true, color: "#e0c878", shade: "#b69a4e", minTier: 0, hp: 2, drop: "sand", dropMin: 1, dropMax: 1 };
TILES[COPPER] = { name: "Copper Ore", solid: true, color: "#8a8f9c", shade: "#5c606c", minTier: 1, hp: 10, drop: "copper_ore", speckle: "#c87a3a" };
TILES[IRON] = { name: "Iron Ore", solid: true, color: "#8a8f9c", shade: "#5c606c", minTier: 2, hp: 14, drop: "iron_ore", speckle: "#c9a98f" };
TilesGold(GOLD, "Gold Ore", "gold_ore", "#e7c84a", 16, 2);
TILES[DIAMOND] = { name: "Diamond Ore", solid: true, color: "#8a8f9c", shade: "#5c606c", minTier: 3, hp: 26, drop: "diamond", speckle: "#6fe6e0", light: 3 };
TILES[COAL] = { name: "Coal", solid: true, color: "#7c8088", shade: "#3a3d42", minTier: 1, hp: 7, drop: "coal", speckle: "#1c1e22" };
TILES[PLANK] = { name: "Planks", solid: true, color: "#b07a43", shade: "#7c5226", minTier: 0, hp: 5, drop: "plank" };
TILES[TORCH] = { name: "Torch", solid: false, color: "#ffcf6b", shade: "#a86a1e", light: 12, minTier: 0, hp: 1, drop: "torch", bg: true };
TILES[GLASS] = { name: "Glass", solid: true, color: "#bfe6ef", shade: "#7fb6c4", minTier: 0, hp: 2, drop: "glass", light: 1 };
TILES[BEDROCK] = { name: "Bedrock", solid: true, color: "#2a2733", shade: "#17151c", minTier: 99, hp: 9999 };
TILES[WORKBENCH] = { name: "Workbench", solid: true, color: "#9a6a3a", shade: "#634222", minTier: 0, hp: 6, drop: "workbench" };
TILES[FURNACE] = { name: "Furnace", solid: true, color: "#5a5560", shade: "#342f3a", light: 5, minTier: 0, hp: 8, drop: "furnace" };
TILES[PORTAL] = { name: "Portal", solid: false, color: "#9b59b6", shade: "#6c3483", light: 8, minTier: 99, hp: 9999 };
TILES[WATER] = { name: "Water", solid: false, color: "#3366cc", shade: "#1a3d8a", minTier: 99, hp: 9999 };

function TilesGold(id: number, name: string, drop: string, speckle: string, hp: number, tier: number) {
  TILES[id] = { name, solid: true, color: "#8a8f9c", shade: "#5c606c", minTier: tier, hp, drop, speckle };
}

export function isSolid(id: number): boolean {
  return TILES[id]?.solid ?? false;
}

// ---- Items ----
export interface ItemDef {
  name: string;
  place?: number; // tile id to place
  max?: number;
  kind?: "tool" | "material";
  tool?: "pickaxe" | "sword" | "axe";
  tier?: number; // pickaxe tier
  power?: number; // mining damage per hit
  dmg?: number; // weapon damage
  color: string;
  icon: string; // emoji
  desc?: string;
}

export const ITEMS: Record<string, ItemDef> = {
  wood: { name: "Wood", place: WOOD, max: 99, kind: "material", color: "#7a5230", icon: "🪵" },
  dirt: { name: "Dirt", place: DIRT, max: 99, kind: "material", color: "#8a5a32", icon: "🟫" },
  stone: { name: "Stone", place: STONE, max: 99, kind: "material", color: "#8a8f9c", icon: "🪨" },
  sand: { name: "Sand", place: SAND, max: 99, kind: "material", color: "#e0c878", icon: "⏳" },
  coal: { name: "Coal", place: COAL, max: 99, kind: "material", color: "#3a3d42", icon: "⚫" },
  copper_ore: { name: "Copper Ore", place: COPPER, max: 99, kind: "material", color: "#c87a3a", icon: "🟠" },
  iron_ore: { name: "Iron Ore", place: IRON, max: 99, kind: "material", color: "#c9a98f", icon: "🔩" },
  gold_ore: { name: "Gold Ore", place: GOLD, max: 99, kind: "material", color: "#e7c84a", icon: "🟡" },
  diamond: { name: "Diamond", place: DIAMOND, max: 99, kind: "material", color: "#6fe6e0", icon: "💎" },
  plank: { name: "Planks", place: PLANK, max: 99, kind: "material", color: "#b07a43", icon: "🟧" },
  glass: { name: "Glass", place: GLASS, max: 99, kind: "material", color: "#bfe6ef", icon: "🔷" },
  torch: { name: "Torch", place: TORCH, max: 99, kind: "material", color: "#ffcf6b", icon: "🔥", desc: "Emits light" },
  apple: { name: "Apple", max: 99, kind: "material", color: "#e23b3b", icon: "🍎", desc: "Eat to heal 25 HP" },
  gel: { name: "Slime Gel", max: 99, kind: "material", color: "#6fe06f", icon: "🟢", desc: "Dropped by slimes" },
  copper_bar: { name: "Copper Bar", max: 99, kind: "material", color: "#d4823a", icon: "🟤" },
  iron_bar: { name: "Iron Bar", max: 99, kind: "material", color: "#cfd6df", icon: "⬜" },
  gold_bar: { name: "Gold Bar", max: 99, kind: "material", color: "#ffd23b", icon: "🥇" },
  workbench: { name: "Workbench", place: WORKBENCH, max: 99, kind: "material", color: "#9a6a3a", icon: "🛠️", desc: "Crafting station" },
  furnace: { name: "Furnace", place: FURNACE, max: 99, kind: "material", color: "#5a5560", icon: "🏭", desc: "Smelts ores into bars" },
  rotten_flesh: { name: "Rotten Flesh", max: 99, kind: "material", color: "#6fae5a", icon: "🍖", desc: "Eat to heal 5 HP" },
  // tools
  wood_pickaxe: { name: "Wooden Pickaxe", kind: "tool", tool: "pickaxe", tier: 1, power: 2, dmg: 4, color: "#b07a43", icon: "⛏️", desc: "Mines stone, coal & copper" },
  stone_pickaxe: { name: "Stone Pickaxe", kind: "tool", tool: "pickaxe", tier: 2, power: 4, dmg: 6, color: "#8a8f9c", icon: "⛏️", desc: "Mines iron & gold" },
  iron_pickaxe: { name: "Iron Pickaxe", kind: "tool", tool: "pickaxe", tier: 3, power: 7, dmg: 9, color: "#cfd6df", icon: "⛏️", desc: "Mines diamond — the strongest" },
  wood_sword: { name: "Wooden Sword", kind: "tool", tool: "sword", dmg: 9, color: "#b07a43", icon: "🗡️" },
  stone_sword: { name: "Stone Sword", kind: "tool", tool: "sword", dmg: 14, color: "#8a8f9c", icon: "🗡️" },
  copper_sword: { name: "Copper Sword", kind: "tool", tool: "sword", dmg: 18, color: "#d4823a", icon: "⚔️" },
  iron_sword: { name: "Iron Sword", kind: "tool", tool: "sword", dmg: 26, color: "#cfd6df", icon: "⚔️" },
  gold_sword: { name: "Gold Sword", kind: "tool", tool: "sword", dmg: 34, color: "#ffd23b", icon: "⚔️" },
  wood_axe: { name: "Wooden Axe", kind: "tool", tool: "axe", power: 3, dmg: 5, color: "#b07a43", icon: "🪓", desc: "Fells trees faster" },
  crown: { name: "Slime Crown", kind: "material", color: "#6fe06f", icon: "👑", desc: "Summons the Slime King at night" },
};

// ---- Recipes ----
export type Station = "none" | "workbench" | "furnace";
export interface Recipe {
  id: string;
  out: string;
  outCount: number;
  station: Station;
  ing: { id: string; n: number }[];
}
export const RECIPES: Recipe[] = [
  { id: "workbench", out: "workbench", outCount: 1, station: "none", ing: [{ id: "wood", n: 10 }] },
  { id: "torch", out: "torch", outCount: 4, station: "none", ing: [{ id: "wood", n: 1 }, { id: "coal", n: 1 }] },
  { id: "wood_pickaxe", out: "wood_pickaxe", outCount: 1, station: "workbench", ing: [{ id: "wood", n: 6 }] },
  { id: "wood_sword", out: "wood_sword", outCount: 1, station: "workbench", ing: [{ id: "wood", n: 6 }] },
  { id: "wood_axe", out: "wood_axe", outCount: 1, station: "workbench", ing: [{ id: "wood", n: 6 }] },
  { id: "furnace", out: "furnace", outCount: 1, station: "workbench", ing: [{ id: "stone", n: 20 }, { id: "torch", n: 3 }] },
  { id: "stone_pickaxe", out: "stone_pickaxe", outCount: 1, station: "workbench", ing: [{ id: "stone", n: 8 }, { id: "wood", n: 2 }] },
  { id: "stone_sword", out: "stone_sword", outCount: 1, station: "workbench", ing: [{ id: "stone", n: 8 }, { id: "wood", n: 2 }] },
  { id: "plank", out: "plank", outCount: 2, station: "workbench", ing: [{ id: "wood", n: 1 }] },
  { id: "glass", out: "glass", outCount: 1, station: "furnace", ing: [{ id: "sand", n: 2 }] },
  { id: "copper_bar", out: "copper_bar", outCount: 1, station: "furnace", ing: [{ id: "copper_ore", n: 3 }] },
  { id: "iron_bar", out: "iron_bar", outCount: 1, station: "furnace", ing: [{ id: "iron_ore", n: 3 }] },
  { id: "gold_bar", out: "gold_bar", outCount: 1, station: "furnace", ing: [{ id: "gold_ore", n: 4 }] },
  { id: "copper_sword", out: "copper_sword", outCount: 1, station: "workbench", ing: [{ id: "copper_bar", n: 8 }, { id: "wood", n: 2 }] },
  { id: "iron_sword", out: "iron_sword", outCount: 1, station: "workbench", ing: [{ id: "iron_bar", n: 9 }, { id: "wood", n: 2 }] },
  { id: "gold_sword", out: "gold_sword", outCount: 1, station: "workbench", ing: [{ id: "gold_bar", n: 10 }, { id: "wood", n: 2 }] },
  { id: "iron_pickaxe", out: "iron_pickaxe", outCount: 1, station: "workbench", ing: [{ id: "iron_bar", n: 12 }, { id: "wood", n: 3 }] },
  { id: "crown", out: "crown", outCount: 1, station: "workbench", ing: [{ id: "gel", n: 30 }, { id: "gold_bar", n: 3 }] },
];

// ---- World object ----
export interface World {
  w: number;
  h: number;
  tiles: Uint8Array;
  surfaceY: Int16Array;
  spawnX: number;
  spawnY: number;
}

export function tileIndex(w: World, x: number, y: number): number {
  return y * w.w + x;
}
export function getTile(w: World, x: number, y: number): number {
  if (x < 0 || x >= w.w || y < 0) return AIR;
  if (y >= w.h) return BEDROCK;
  return w.tiles[y * w.w + x];
}
export function setTile(w: World, x: number, y: number, id: number) {
  if (x < 0 || x >= w.w || y < 0 || y >= w.h) return;
  w.tiles[y * w.w + x] = id;
}

function hash(x: number, y: number): number {
  let n = x * 374761393 + y * 668265263;
  n = (n ^ (n >> 13)) * 1274126177;
  return ((n ^ (n >> 16)) >>> 0) / 4294967295;
}

function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return function() {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateWorld(seed?: number): World {
  const useSeeded = seed !== undefined;
  const seededRng = useSeeded ? mulberry32(seed!) : null;
  function rand(): number {
    return seededRng ? seededRng() : Math.random();
  }

  const w: World = { w: WORLD_W, h: WORLD_H, tiles: new Uint8Array(WORLD_W * WORLD_H), surfaceY: new Int16Array(WORLD_W), spawnX: 0, spawnY: 0 };
  const baseY = 58;

  // surface height (layered sines + noise)
  for (let x = 0; x < w.w; x++) {
    let h = baseY;
    h += Math.sin(x * 0.03) * 8;
    h += Math.sin(x * 0.09 + 2) * 4;
    h += Math.sin(x * 0.21 + 1) * 2;
    h += (hash(x, 7) - 0.5) * 4;
    w.surfaceY[x] = Math.floor(Math.max(34, Math.min(w.h - 50, h)));
  }

  // fill columns
  for (let x = 0; x < w.w; x++) {
    const sy = w.surfaceY[x];
    for (let y = 0; y < w.h; y++) {
      let id: number;
      if (y < sy) id = AIR;
      else if (y === sy) id = GRASS;
      else if (y < sy + 5) id = DIRT;
      else if (y >= w.h - 3) id = BEDROCK;
      else id = STONE;
      w.tiles[y * w.w + x] = id;
    }
  }

  // carve caves with worms
  const worms = 26;
  for (let i = 0; i < worms; i++) {
    const sx = Math.floor(rand() * w.w);
    const sy = Math.floor(w.surfaceY[sx] + 14 + rand() * (w.h - w.surfaceY[sx] - 26));
    let x = sx;
    let y = sy;
    let ang = rand() * Math.PI * 2;
    const steps = 40 + Math.floor(rand() * 120);
    const rad = 2 + rand() * 3;
    for (let s = 0; s < steps; s++) {
      ang += (rand() - 0.5) * 0.6;
      if (rand() < 0.08) ang = -Math.PI / 2 + (rand() - 0.5);
      x += Math.cos(ang) * 1.4;
      y += Math.sin(ang) * 1.4;
      const xi = Math.floor(x);
      const yi = Math.floor(y);
      for (let dy = -Math.ceil(rad); dy <= Math.ceil(rad); dy++) {
        for (let dx = -Math.ceil(rad); dx <= Math.ceil(rad); dx++) {
          if (dx * dx + dy * dy <= rad * rad) {
            const tx = xi + dx;
            const ty = yi + dy;
            if (tx >= 0 && tx < w.w && ty > w.surfaceY[tx] + 3 && ty < w.h - 3) {
              if (w.tiles[ty * w.w + tx] !== BEDROCK) w.tiles[ty * w.w + tx] = AIR;
            }
          }
        }
      }
    }
  }

  // ore veins
  const oreTypes: { id: number; minD: number; maxD: number; size: number; rarity: number }[] = [
    { id: COAL, minD: 4, maxD: 999, size: 6, rarity: 0.012 },
    { id: COPPER, minD: 8, maxD: 999, size: 5, rarity: 0.01 },
    { id: IRON, minD: 22, maxD: 999, size: 5, rarity: 0.008 },
    { id: GOLD, minD: 40, maxD: 999, size: 4, rarity: 0.005 },
    { id: DIAMOND, minD: 60, maxD: 999, size: 3, rarity: 0.0025 },
  ];
  for (const ore of oreTypes) {
    for (let x = 0; x < w.w; x++) {
      for (let y = 0; y < w.h; y++) {
        if (w.tiles[y * w.w + x] !== STONE) continue;
        const depth = y - w.surfaceY[x];
        if (depth < ore.minD) continue;
        if (rand() < ore.rarity) {
          placeVein(w, x, y, ore.id, ore.size, rand);
        }
      }
    }
  }

  // a sand desert patch
  const dx0 = Math.floor(w.w * 0.7);
  const dx1 = Math.floor(w.w * 0.86);
  for (let x = dx0; x < dx1; x++) {
    const sy = w.surfaceY[x];
    for (let y = sy; y < sy + 6; y++) {
      if (w.tiles[y * w.w + x] === GRASS || w.tiles[y * w.w + x] === DIRT) w.tiles[y * w.w + x] = SAND;
    }
  }

  // trees on grass
  for (let x = 4; x < w.w - 4; x++) {
    const sy = w.surfaceY[x];
    if (w.tiles[sy * w.w + x] === GRASS && rand() < 0.16) {
      const th = 4 + Math.floor(rand() * 4);
      for (let i = 1; i <= th; i++) {
        const ty = sy - i;
        if (ty >= 0) w.tiles[ty * w.w + x] = WOOD;
      }
      // leaves
      const top = sy - th;
      for (let dy = -2; dy <= 1; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          if (Math.abs(dx) + Math.abs(dy) > 3) continue;
          const tx = x + dx;
          const ty = top + dy;
          if (tx >= 0 && tx < w.w && ty >= 0 && w.tiles[ty * w.w + tx] === AIR) w.tiles[ty * w.w + tx] = LEAVES;
        }
      }
    }
  }

  // portals on surface
  const portalCount = 2 + Math.floor(rand() * 2);
  for (let p = 0; p < portalCount; p++) {
    const px = 40 + Math.floor(rand() * (w.w - 80));
    const sy = w.surfaceY[px];
    if (sy >= 0 && sy < w.h) {
      w.tiles[sy * w.w + px] = PORTAL;
    }
  }

  w.spawnX = Math.floor(w.w / 2);
  w.spawnY = w.surfaceY[w.spawnX] - 4;
  return w;
}

function placeVein(w: World, x: number, y: number, id: number, size: number, rand: () => number) {
  let cx = x;
  let cy = y;
  for (let i = 0; i < size; i++) {
    if (cx >= 0 && cx < w.w && cy >= 0 && cy < w.h && w.tiles[cy * w.w + cx] === STONE) {
      w.tiles[cy * w.w + cx] = id;
    }
    cx += Math.floor(rand() * 3) - 1;
    cy += Math.floor(rand() * 3) - 1;
  }
}
