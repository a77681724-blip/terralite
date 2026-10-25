// src/sprites.ts — loads a single character atlas (on magenta background),
// removes the magenta via chroma-key, slices it into individual sprites with
// automatic content-trim, and exposes them. Also builds white silhouettes
// for hit-flash effects. Falls back gracefully if the image fails to load.

import atlasUrl from "./assets/char_atlas.jpg";

export type SpriteKey = "player" | "slime" | "zombie" | "bat" | "king";
const ORDER: SpriteKey[] = ["player", "slime", "zombie", "bat", "king"];

interface Pair {
  img: HTMLCanvasElement;
  white: HTMLCanvasElement;
}
const cache = new Map<SpriteKey, Pair>();
let listeners: Array<() => void> = [];

function colorDist(r1: number, g1: number, b1: number, r2: number, g2: number, b2: number): number {
  const dr = r1 - r2, dg = g1 - g2, db = b1 - b2;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

// Remove a uniform background (sampled from a corner) and feather the fringe.
function keyBackground(c: CanvasRenderingContext2D, w: number, h: number): void {
  let imgData: ImageData;
  try {
    imgData = c.getImageData(0, 0, w, h);
  } catch {
    return;
  }
  const data = imgData.data;
  // sample corners → background color (expect magenta)
  let br = 0, bg = 0, bb = 0, bn = 0;
  const pts = [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1], [1, 1], [w - 2, h - 2]];
  for (const [x, y] of pts) {
    const o = (y * w + x) * 4;
    br += data[o]; bg += data[o + 1]; bb += data[o + 2]; bn++;
  }
  br /= bn; bg /= bn; bb /= bn;
  const tol = 96, feather = 150;
  for (let p = 0; p < data.length; p += 4) {
    const a = data[p + 3];
    if (a === 0) continue;
    const d = colorDist(data[p], data[p + 1], data[p + 2], br, bg, bb);
    if (d < tol) {
      data[p + 3] = 0;
    } else if (d < feather) {
      data[p + 3] = Math.min(a, Math.round(a * (d - tol) / (feather - tol)));
    }
  }
  c.putImageData(imgData, 0, 0);
}

// Find content bounding box (alpha > threshold) within a sub-rectangle.
function contentBox(data: Uint8ClampedArray, w: number, x0: number, y0: number, cw: number, ch: number): { x: number; y: number; w: number; h: number } {
  let minX = cw, minY = ch, maxX = 0, maxY = 0, found = false;
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const o = ((y0 + y) * w + (x0 + x)) * 4;
      if (data[o + 3] > 40) {
        found = true;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (!found) return { x: 0, y: 0, w: cw, h: ch };
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

function cropTo(src: HTMLCanvasElement, box: { x: number; y: number; w: number; h: number }): HTMLCanvasElement {
  const cv = document.createElement("canvas");
  cv.width = box.w;
  cv.height = box.h;
  const c = cv.getContext("2d", { willReadFrequently: true })!;
  c.drawImage(src, box.x, box.y, box.w, box.h, 0, 0, box.w, box.h);
  return cv;
}

function makeWhite(src: HTMLCanvasElement): HTMLCanvasElement {
  const w = src.width, h = src.height;
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  const c = cv.getContext("2d", { willReadFrequently: true })!;
  c.drawImage(src, 0, 0);
  let imgData: ImageData;
  try {
    imgData = c.getImageData(0, 0, w, h);
  } catch {
    return cv;
  }
  const data = imgData.data;
  for (let p = 0; p < data.length; p += 4) {
    if (data[p + 3] > 0) {
      data[p] = 255; data[p + 1] = 255; data[p + 2] = 255; data[p + 3] = 255;
    }
  }
  c.putImageData(imgData, 0, 0);
  return cv;
}

let started = false;
export function initSprites(): void {
  if (started) return;
  started = true;
  const img = new Image();
  img.onload = () => {
    const W = img.naturalWidth || img.width;
    const H = img.naturalHeight || img.height;
    // 1. draw atlas + remove magenta background
    const full = document.createElement("canvas");
    full.width = W;
    full.height = H;
    const fc = full.getContext("2d", { willReadFrequently: true })!;
    fc.drawImage(img, 0, 0);
    keyBackground(fc, W, H);

    // 2. slice into N vertical cells, auto-trim each to its content
    const N = ORDER.length;
    const cellW = Math.floor(W / N);
    let raw: ImageData;
    try {
      raw = fc.getImageData(0, 0, W, H);
    } catch {
      // tainted canvas — bail
      return;
    }
    for (let i = 0; i < N; i++) {
      const box = contentBox(raw.data, W, i * cellW, 0, cellW, H);
      // pad a little
      const pad = 2;
      const pb = {
        x: Math.max(0, box.x - pad),
        y: Math.max(0, box.y - pad),
        w: Math.min(cellW - box.x, box.w + pad * 2),
        h: Math.min(H - box.y, box.h + pad * 2),
      };
      const spr = cropTo(full, pb);
      cache.set(ORDER[i], { img: spr, white: makeWhite(spr) });
    }
    listeners.forEach((l) => l());
  };
  img.onerror = () => {
    /* ignore — engine falls back to procedural drawing */
  };
  img.src = atlasUrl;
}

export function getSprite(key: SpriteKey): HTMLCanvasElement | null {
  return cache.get(key)?.img ?? null;
}
export function getWhite(key: SpriteKey): HTMLCanvasElement | null {
  return cache.get(key)?.white ?? null;
}
export function onSpritesReady(cb: () => void): () => void {
  // already loaded
  if (cache.size > 0) cb();
  listeners.push(cb);
  return () => {
    listeners = listeners.filter((l) => l !== cb);
  };
}
