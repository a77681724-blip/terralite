// src/pixart.ts — procedural pixel-art texture generation (Terraria-style).
// Each tile is rendered into a 16x16 offscreen canvas once (cached), then blitted
// to the world with nearest-neighbour scaling for a crisp retro look.
// Background "wall" textures are also generated for caves.

import { GRASS, DIRT, STONE, WOOD, LEAVES, SAND, COAL, COPPER, IRON, GOLD, DIAMOND, PLANK, GLASS, WORKBENCH, FURNACE } from "./world";

export const TEX = 16; // logical pixel resolution per tile

const PAL = {
  dirt: ["#7c5230", "#6e4827", "#5f3f22", "#865a35", "#704a29", "#82552f"],
  grass: ["#5aa83a", "#6cba42", "#4f9433", "#7fce52", "#53a238"],
  stone: ["#8a8f9c", "#7e8390", "#72778a", "#949aaa", "#6a6f7c", "#888d99"],
  wood: ["#6e4626", "#5d3a1f", "#7d502a", "#553318", "#724625"],
  leaves: ["#3f8f2f", "#357a27", "#4aa036", "#2c6320", "#49a039"],
  sand: ["#dcc06e", "#d0b458", "#e3cb82", "#c7a84a", "#d8bd66"],
  plank: ["#b07a43", "#9c6a38", "#c08a50", "#8a5c30", "#a8723f"],
  speckle: {
    copper: ["#cf7d38", "#b5672a", "#dd9350"],
    iron: ["#c9a98f", "#b89476", "#e0c4aa"],
    gold: ["#f2d248", "#e2c034", "#fbea7c"],
    diamond: ["#7ff0ec", "#5fdcd6", "#c4fbf8"],
    coal: ["#1c1e22", "#2a2d33", "#0f1114"],
  } as Record<string, string[]>,
};

function hash(x: number, y: number, s: number): number {
  let n = (Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(s, 83492791)) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}
function pick<T>(arr: T[], x: number, y: number, s: number): T {
  return arr[Math.floor(hash(x, y, s) * arr.length) % arr.length];
}

function noiseFill(c: CanvasRenderingContext2D, pal: string[], seed: number, y0 = 0, y1 = TEX) {
  for (let y = y0; y < y1; y++) {
    for (let x = 0; x < TEX; x++) {
      c.fillStyle = pick(pal, x, y, seed);
      c.fillRect(x, y, 1, 1);
    }
  }
}
function edgeShade(c: CanvasRenderingContext2D) {
  // subtle depth: darker bottom + right, lighter top-left
  c.fillStyle = "rgba(0,0,0,0.16)";
  c.fillRect(0, TEX - 1, TEX, 1);
  c.fillRect(TEX - 1, 0, 1, TEX);
  c.fillStyle = "rgba(255,255,255,0.10)";
  c.fillRect(0, 0, TEX, 1);
}

function cracks(c: CanvasRenderingContext2D, seed: number, col = "rgba(40,42,50,0.6)") {
  c.strokeStyle = col;
  c.lineWidth = 1;
  const n = 1 + Math.floor(hash(seed, 3, 5) * 2);
  for (let i = 0; i < n; i++) {
    let x = 2 + Math.floor(hash(seed, i, 11) * 11);
    let y = 2 + Math.floor(hash(seed, i, 23) * 11);
    c.beginPath();
    c.moveTo(x, y);
    const steps = 2 + Math.floor(hash(seed, i, 31) * 3);
    for (let s = 0; s < steps; s++) {
      x += Math.round((hash(seed, i, s) - 0.5) * 6);
      y += Math.round((hash(seed, i, s + 9) - 0.5) * 6);
      c.lineTo(x, y);
    }
    c.stroke();
  }
}

function nuggets(c: CanvasRenderingContext2D, speckle: string[], seed: number) {
  const blobs = 3 + Math.floor(hash(seed, 1, 7) * 3);
  for (let i = 0; i < blobs; i++) {
    const bx = 2 + Math.floor(hash(seed, i, 13) * 11);
    const by = 2 + Math.floor(hash(seed, i, 17) * 11);
    const col = speckle[i % speckle.length];
    // cluster of 2-3 px
    c.fillStyle = col;
    c.fillRect(bx, by, 1, 1);
    if (hash(seed, i, 19) > 0.4) c.fillRect(bx + 1, by, 1, 1);
    if (hash(seed, i, 29) > 0.5) c.fillRect(bx, by + 1, 1, 1);
    if (hash(seed, i, 39) > 0.6) c.fillRect(bx + 1, by + 1, 1, 1);
    // tiny highlight
    c.fillStyle = "rgba(255,255,255,0.5)";
    c.fillRect(bx, by, 1, 1);
  }
}

const tileCache = new Map<number, HTMLCanvasElement>();

function newCanvas(): { cv: HTMLCanvasElement; c: CanvasRenderingContext2D } {
  const cv = document.createElement("canvas");
  cv.width = TEX;
  cv.height = TEX;
  const c = cv.getContext("2d")!;
  c.imageSmoothingEnabled = false;
  return { cv, c };
}

function buildTile(id: number, variant: number): HTMLCanvasElement {
  const { cv, c } = newCanvas();
  const seed = id * 53 + variant * 131;
  switch (id) {
    case DIRT:
      noiseFill(c, PAL.dirt, seed);
      // a few small pebbles
      c.fillStyle = "#5a4126";
      for (let i = 0; i < 4; i++) {
        const x = Math.floor(hash(seed, i, 5) * 15), y = Math.floor(hash(seed, i, 9) * 15);
        c.fillRect(x, y, 1, 1);
      }
      edgeShade(c);
      break;
    case GRASS:
      noiseFill(c, PAL.dirt, seed);
      // grass cap
      noiseFill(c, PAL.grass, seed + 1, 0, 3);
      // blades poking up
      c.fillStyle = pick(PAL.grass, 0, 0, seed);
      for (let x = 0; x < TEX; x += 1) {
        if (hash(seed, x, 2) > 0.55) c.fillRect(x, 0, 1, 1);
        if (hash(seed, x, 5) > 0.7) c.fillRect(x, 3, 1, 1);
      }
      c.fillStyle = "rgba(0,0,0,0.18)";
      c.fillRect(0, 3, TEX, 1);
      edgeShade(c);
      break;
    case STONE:
      noiseFill(c, PAL.stone, seed);
      cracks(c, seed);
      edgeShade(c);
      break;
    case COAL:
    case COPPER:
    case IRON:
    case GOLD:
    case DIAMOND: {
      const sp = PAL.speckle[
        id === COPPER ? "copper" : id === IRON ? "iron" : id === GOLD ? "gold" : id === COAL ? "coal" : "diamond"
      ];
      noiseFill(c, PAL.stone, seed);
      nuggets(c, sp, seed + 9);
      if (id === DIAMOND) {
        c.fillStyle = "rgba(200,255,255,0.25)";
        c.fillRect(0, 0, TEX, TEX);
      }
      edgeShade(c);
      break;
    }
    case WOOD: {
      noiseFill(c, PAL.wood, seed);
      // vertical bark streaks
      c.fillStyle = "#4a2c14";
      for (let x = 1; x < TEX; x += 4) {
        c.fillRect(x, 0, 1, TEX);
        c.fillRect(x + 1, 0, 1, TEX);
      }
      c.fillStyle = "rgba(255,255,255,0.06)";
      c.fillRect(4, 0, 1, TEX);
      edgeShade(c);
      break;
    }
    case LEAVES: {
      noiseFill(c, PAL.leaves, seed);
      // punch holes for a leafy, non-solid feel
      for (let i = 0; i < 6; i++) {
        const x = Math.floor(hash(seed, i, 3) * 15), y = Math.floor(hash(seed, i, 7) * 15);
        c.clearRect(x, y, 1, 1);
        c.clearRect(x + 1, y, 1, 1);
      }
      c.fillStyle = "#5fb83f";
      for (let i = 0; i < 5; i++) c.fillRect(Math.floor(hash(seed, i, 41) * 15), Math.floor(hash(seed, i, 43) * 15), 1, 1);
      break;
    }
    case SAND:
      noiseFill(c, PAL.sand, seed);
      c.fillStyle = "#b89d44";
      for (let i = 0; i < 6; i++) c.fillRect(Math.floor(hash(seed, i, 5) * 15), Math.floor(hash(seed, i, 9) * 15), 1, 1);
      edgeShade(c);
      break;
    case PLANK: {
      noiseFill(c, PAL.plank, seed);
      c.fillStyle = "rgba(0,0,0,0.30)";
      c.fillRect(0, 5, TEX, 1);
      c.fillRect(0, 10, TEX, 1);
      // nails
      c.fillStyle = "#3a2410";
      c.fillRect(2, 2, 1, 1);
      c.fillRect(13, 7, 1, 1);
      c.fillRect(4, 12, 1, 1);
      edgeShade(c);
      break;
    }
    case GLASS:
      c.fillStyle = "rgba(150,205,225,0.28)";
      c.fillRect(0, 0, TEX, TEX);
      c.strokeStyle = "rgba(210,240,250,0.8)";
      c.strokeRect(0.5, 0.5, TEX - 1, TEX - 1);
      c.fillStyle = "rgba(255,255,255,0.5)";
      c.fillRect(2, 2, 3, 1);
      c.fillRect(2, 2, 1, 4);
      break;
    case WORKBENCH: {
      // top
      noiseFill(c, PAL.plank, seed, 0, 5);
      c.fillStyle = "#5a3a1c";
      c.fillRect(0, 5, TEX, 1);
      // legs
      c.fillStyle = "#634222";
      c.fillRect(2, 6, 2, 10);
      c.fillRect(12, 6, 2, 10);
      // tools on top
      c.fillStyle = "#caa06a";
      c.fillRect(6, 1, 4, 1);
      break;
    }
    case FURNACE: {
      noiseFill(c, PAL.stone, seed);
      c.fillStyle = "#2c2733";
      c.fillRect(4, 7, 8, 7);
      const g = c.createLinearGradient(0, 7, 0, 14);
      g.addColorStop(0, "#ffd24a");
      g.addColorStop(1, "#e0501a");
      c.fillStyle = g;
      c.fillRect(5, 9, 6, 4);
      c.fillStyle = "#ffe79a";
      c.fillRect(6, 9, 2, 1);
      c.fillStyle = "rgba(0,0,0,0.4)";
      c.fillRect(4, 6, 8, 1);
      break;
    }
    default:
      c.fillStyle = "#ff00ff";
      c.fillRect(0, 0, TEX, TEX);
  }
  return cv;
}

export function tileTexture(id: number, variant: number): HTMLCanvasElement {
  const key = id * 100 + variant;
  let t = tileCache.get(key);
  if (!t) {
    t = buildTile(id, variant);
    tileCache.set(key, t);
  }
  return t;
}

// ---- Background walls (shown behind dug-out underground tiles) ----
const wallCache = new Map<number, HTMLCanvasElement>();
function buildWall(kind: "dirt" | "stone", variant: number): HTMLCanvasElement {
  const { cv, c } = newCanvas();
  const seed = (kind === "dirt" ? 900 : 1400) + variant * 17;
  if (kind === "dirt") {
    const pal = PAL.dirt.map((p) => shade(p, 0.55));
    noiseFill(c, pal, seed);
    c.fillStyle = "rgba(0,0,0,0.25)";
    for (let i = 0; i < 5; i++) c.fillRect(Math.floor(hash(seed, i, 3) * 15), Math.floor(hash(seed, i, 7) * 15), 1, 1);
  } else {
    const pal = PAL.stone.map((p) => shade(p, 0.5));
    noiseFill(c, pal, seed);
    cracks(c, seed, "rgba(20,22,28,0.5)");
  }
  return cv;
}
export function wallTexture(kind: "dirt" | "stone", variant: number): HTMLCanvasElement {
  const key = (kind === "dirt" ? 0 : 1000) + variant;
  let t = wallCache.get(key);
  if (!t) {
    t = buildWall(kind, variant);
    wallCache.set(key, t);
  }
  return t;
}

function shade(hex: string, f: number): string {
  const h = hex.replace("#", "");
  const r = Math.round(parseInt(h.substring(0, 2), 16) * f);
  const g = Math.round(parseInt(h.substring(2, 4), 16) * f);
  const b = Math.round(parseInt(h.substring(4, 6), 16) * f);
  return `rgb(${r},${g},${b})`;
}

export { shade };
