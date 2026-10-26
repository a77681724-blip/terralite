import { useEffect, useRef, useState } from "react";
import { audio } from "./audio";
import { t } from "./i18n";
import { ENDINGS, type EndingId } from "./story";
import { getSprite, getWhite, initSprites } from "./sprites";

interface CloudPuff { dx: number; dy: number; dr: number; shade: number; }
interface Cloud {
  x: number; y: number; z: number; r: number; a: number;
  puffs: CloudPuff[];
}
interface Dust { x: number; y: number; z: number; }
interface Shard { x: number; y: number; z: number; spin: number; size: number; }

interface Palette {
  top: string;
  mid: string;
  low: string;
  accent: string;
  glow: string;
  cloud: string;
  cloudLight: string;
  cloudShade: string;
}

const PALETTES: Record<EndingId, Palette> = {
  crown: {
    top: "#06060d", mid: "#231607", low: "#6b4610",
    accent: "#fbbf24", glow: "rgba(251,191,36,0.55)", cloud: "255,232,180",
    cloudLight: "#ffeec6", cloudShade: "#6d5226",
  },
  debt: {
    top: "#05060f", mid: "#191130", low: "#3d2c63",
    accent: "#c4b5fd", glow: "rgba(167,139,250,0.5)", cloud: "206,198,255",
    cloudLight: "#ded7ff", cloudShade: "#4a4275",
  },
  dawn: {
    top: "#061028", mid: "#2d2a5e", low: "#ff9a5a",
    accent: "#7dd3fc", glow: "rgba(255,190,120,0.5)", cloud: "255,242,224",
    cloudLight: "#fff3e2", cloudShade: "#b5836e",
  },
};

const TAU = Math.PI * 2;
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (a: number, b: number, v: number) => {
  const x = clamp01((v - a) / (b - a));
  return x * x * (3 - 2 * x);
};

function makePuff(color = "#ffffff"): HTMLCanvasElement {
  const cv = document.createElement("canvas");
  cv.width = cv.height = 256;
  const c = cv.getContext("2d")!;
  const g = c.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.62, "rgba(255,255,255,1)");
  g.addColorStop(0.8, "rgba(255,255,255,0.9)");
  g.addColorStop(0.92, "rgba(255,255,255,0.5)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  c.fillStyle = g;
  c.fillRect(0, 0, 256, 256);
  c.globalCompositeOperation = "source-in";
  c.fillStyle = color;
  c.fillRect(0, 0, 256, 256);
  return cv;
}

function resetCloud(c: Cloud, far: boolean) {
  c.x = rand(-800, 800);
  c.y = far ? rand(-1000, 1000) : rand(900, 1800);
  c.z = rand(400, 1300);
  c.r = rand(80, 180);
  c.a = rand(0.6, 0.9);
  c.puffs = [];
  const n = Math.round(rand(5, 8));
  for (let i = 0; i < n; i++) {
    const ang = rand(0, TAU);
    const rad = rand(0, 0.55);
    c.puffs.push({
      dx: Math.cos(ang) * rad * 1.45,
      dy: Math.sin(ang) * rad * 0.5,
      dr: rand(0.45, 0.85),
      shade: Math.random(),
    });
  }
}

export default function Chapter2Ending({
  ending,
  onContinueWorld,
  onNewWorld,
  onMenu,
}: {
  ending: EndingId;
  onContinueWorld: () => void;
  onNewWorld: () => void;
  onMenu: () => void;
}) {
  const def = ENDINGS[ending];
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [showText, setShowText] = useState(false);
  const [shown, setShown] = useState(1);

  useEffect(() => {
    audio.setTrack(ending === "dawn" ? "day" : "menu");
  }, [ending]);

  useEffect(() => {
    const timer = window.setTimeout(() => setShowText(true), 11500);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!showText) return;
    setShown(1);
    const timer = window.setInterval(() => {
      setShown((n) => {
        if (n >= def.lines.length) {
          window.clearInterval(timer);
          return n;
        }
        return n + 1;
      });
    }, 1500);
    return () => window.clearInterval(timer);
  }, [showText, def.lines.length, ending]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    initSprites();

    const pal = PALETTES[ending];
    const puff = makePuff();
    const cloudLight = makePuff(pal.cloudLight);
    const cloudShade = makePuff(pal.cloudShade);
    const clouds: Cloud[] = Array.from({ length: 80 }, () => {
      const c = {} as Cloud;
      resetCloud(c, true);
      return c;
    });
    const dust: Dust[] = Array.from({ length: 300 }, () => ({
      x: rand(-1100, 1100), y: rand(-1400, 1400), z: rand(60, 1300),
    }));
    const shards: Shard[] = Array.from({ length: 20 }, () => ({
      x: rand(-900, 900), y: rand(-1000, 1000), z: rand(180, 1100),
      spin: rand(0, TAU), size: rand(18, 44),
    }));

    let raf = 0;
    let start = 0;
    let last = 0;
    let w = 0;
    let h = 0;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.6);
      w = canvas.clientWidth || window.innerWidth;
      h = canvas.clientHeight || window.innerHeight;
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const project = (p: { x: number; y: number; z: number }, roll: number, pitch: number, focal: number) => {
      const cr = Math.cos(roll), sr = Math.sin(roll);
      const x1 = p.x * cr - p.y * sr;
      const y1 = p.x * sr + p.y * cr;
      const cp = Math.cos(pitch), sp = Math.sin(pitch);
      const y2 = y1 * cp - p.z * sp;
      const z2 = y1 * sp + p.z * cp;
      if (z2 < 30) return null;
      const s = focal / z2;
      return { sx: w / 2 + x1 * s, sy: h / 2 + y2 * s, s, z: z2 };
    };

    const drawSky = (tSec: number, fall: number) => {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, pal.top);
      g.addColorStop(0.45, pal.mid);
      g.addColorStop(1, fall > 0 ? pal.low : pal.mid);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);

      // the dim sun / hollow eye far above
      const sunY = h * (fall > 0 ? 0.18 - Math.min(0.08, fall * 0.004) : 0.2);
      const rg = ctx.createRadialGradient(w / 2, sunY, 4, w / 2, sunY, Math.min(w, h) * 0.55);
      rg.addColorStop(0, pal.glow);
      rg.addColorStop(0.35, ending === "dawn" ? "rgba(255,190,120,0.16)" : "rgba(255,255,255,0.06)");
      rg.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = rg;
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 0.5 + 0.08 * Math.sin(tSec * 0.8);
      ctx.fillStyle = ending === "debt" ? "rgba(210,200,255,0.5)" : "rgba(255,240,210,0.55)";
      ctx.beginPath();
      ctx.arc(w / 2, sunY, Math.min(w, h) * 0.045, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;

      // god rays behind the cloud deck
      if (fall > 0) {
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.translate(w / 2, sunY);
        const rayLen = Math.max(w, h) * 1.5;
        for (let i = 0; i < 11; i++) {
          const ang = (i / 11) * TAU + fall * 0.05 + Math.sin(i * 7.3) * 0.08;
          const half = 0.045 + 0.03 * (0.5 + 0.5 * Math.sin(i * 2.7 + fall * 0.7));
          ctx.fillStyle = ending === "debt"
            ? `rgba(196,181,253,${0.028 + 0.02 * (0.5 + 0.5 * Math.sin(i * 3.1 + fall))})`
            : `rgba(255,228,170,${0.035 + 0.025 * (0.5 + 0.5 * Math.sin(i * 3.1 + fall))})`;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(Math.cos(ang - half) * rayLen, Math.sin(ang - half) * rayLen);
          ctx.lineTo(Math.cos(ang + half) * rayLen, Math.sin(ang + half) * rayLen);
          ctx.closePath();
          ctx.fill();
        }
        ctx.restore();
        ctx.globalCompositeOperation = "source-over";
      }
    };

    const drawSummit = (tSec: number) => {
      drawSky(tSec, 0);

      // slow parallax cloud bank below the ledge
      const puffSize = Math.min(w, h) * 0.9;
      for (let i = 0; i < 9; i++) {
        const px = ((i * 317 + tSec * 9) % (w + puffSize * 2)) - puffSize;
        const py = h * (0.72 + (i % 3) * 0.07) + Math.sin(tSec * 0.25 + i) * 8;
        ctx.globalAlpha = 0.1 + (i % 3) * 0.04;
        ctx.drawImage(puff, px, py - puffSize * 0.4, puffSize, puffSize * 0.62);
      }
      ctx.globalAlpha = 1;

      // the summit: cloudstone deck and altar silhouettes
      const deckY = h * 0.8;
      ctx.fillStyle = "#0a101c";
      ctx.beginPath();
      ctx.moveTo(0, deckY + h * 0.09);
      ctx.lineTo(w * 0.16, deckY - h * 0.012);
      ctx.lineTo(w * 0.33, deckY + h * 0.022);
      ctx.lineTo(w * 0.47, deckY - h * 0.018);
      ctx.lineTo(w * 0.62, deckY + h * 0.015);
      ctx.lineTo(w * 0.78, deckY - h * 0.02);
      ctx.lineTo(w, deckY + h * 0.03);
      ctx.lineTo(w, h);
      ctx.lineTo(0, h);
      ctx.closePath();
      ctx.fill();
      // rim light
      const rim = ctx.createLinearGradient(0, deckY - 14, 0, deckY + 36);
      rim.addColorStop(0, pal.glow);
      rim.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = rim;
      ctx.beginPath();
      ctx.moveTo(w * 0.62, deckY + h * 0.015);
      ctx.lineTo(w * 0.78, deckY - h * 0.02);
      ctx.lineTo(w, deckY + h * 0.03);
      ctx.lineTo(w, deckY + 6);
      ctx.lineTo(w * 0.78, deckY - h * 0.02 + 6);
      ctx.lineTo(w * 0.62, deckY + h * 0.015 + 6);
      ctx.closePath();
      ctx.fill();

      // altar column
      ctx.fillStyle = "#0d1524";
      ctx.fillRect(w * 0.72, deckY - h * 0.2, w * 0.05, h * 0.2);
      ctx.fillStyle = "rgba(255,255,255,0.06)";
      ctx.fillRect(w * 0.72, deckY - h * 0.2, 2, h * 0.2);

      const push = smooth(0.55, 1.7, tSec);
      const shake = push > 0 && push < 1 ? (1 - Math.abs(push - 0.5) * 2) * 5 : 0;
      ctx.save();
      ctx.translate(Math.sin(tSec * 47) * shake, Math.cos(tSec * 39) * shake);

      // Mira — robed, hooded, book glowing in her hands
      const mx = w * 0.79;
      const my = deckY - 4;
      const mh = Math.min(h * 0.42, 330);
      ctx.save();
      ctx.translate(mx, my - mh * 0.48);
      // robe
      const robe = ctx.createLinearGradient(0, -mh * 0.5, 0, mh * 0.5);
      robe.addColorStop(0, "#1a2238");
      robe.addColorStop(1, "#070b14");
      ctx.fillStyle = robe;
      ctx.beginPath();
      ctx.moveTo(0, -mh * 0.5);
      ctx.quadraticCurveTo(mh * 0.24, -mh * 0.2, mh * 0.3, mh * 0.5);
      ctx.lineTo(-mh * 0.3, mh * 0.5);
      ctx.quadraticCurveTo(-mh * 0.24, -mh * 0.2, 0, -mh * 0.5);
      ctx.closePath();
      ctx.fill();
      // hood
      ctx.fillStyle = "#0b1120";
      ctx.beginPath();
      ctx.arc(0, -mh * 0.47, mh * 0.13, Math.PI, 0);
      ctx.lineTo(mh * 0.09, -mh * 0.34);
      ctx.lineTo(-mh * 0.09, -mh * 0.34);
      ctx.closePath();
      ctx.fill();
      // amber trim + eyes
      ctx.strokeStyle = "rgba(252,211,77,0.6)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-mh * 0.09, -mh * 0.34);
      ctx.lineTo(0, -mh * 0.52);
      ctx.lineTo(mh * 0.09, -mh * 0.34);
      ctx.stroke();
      ctx.fillStyle = "rgba(255,224,138,0.9)";
      ctx.fillRect(-mh * 0.045, -mh * 0.435, 2, 3);
      ctx.fillRect(mh * 0.03, -mh * 0.435, 2, 3);
      // ledger
      const bookGlow = 0.55 + 0.3 * Math.sin(tSec * 3.2);
      ctx.globalAlpha = bookGlow;
      ctx.fillStyle = "rgba(252,211,77,0.9)";
      ctx.fillRect(-mh * 0.08, -mh * 0.16, mh * 0.16, mh * 0.09);
      ctx.globalAlpha = 0.28 * bookGlow;
      ctx.beginPath();
      ctx.arc(0, -mh * 0.11, mh * 0.24, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
      // the pushing arm
      if (push > 0.2) {
        const reach = smooth(0.2, 0.75, push);
        ctx.strokeStyle = "#101a2e";
        ctx.lineWidth = mh * 0.055;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(-mh * 0.05, -mh * 0.24);
        ctx.lineTo(-mh * (0.1 + 0.42 * reach), -mh * 0.12);
        ctx.stroke();
        ctx.fillStyle = "rgba(255,224,138,0.85)";
        ctx.beginPath();
        ctx.arc(-mh * (0.12 + 0.42 * reach), -mh * 0.12, mh * 0.024, 0, TAU);
        ctx.fill();
      }
      ctx.restore();

      // the Warden at the edge
      const fallT = smooth(0.9, 2.35, tSec);
      const px = w * 0.36 - fallT * w * 0.16;
      const py = deckY - 26 + fallT * fallT * h * 0.26;
      const size = Math.min(w, h) * 0.2;
      const spr = getSprite("player");
      ctx.save();
      ctx.translate(px, py - size * 0.4);
      ctx.rotate(-fallT * 0.9 + Math.sin(tSec * 2.2) * 0.03);
      if (spr) {
        ctx.drawImage(spr, -size / 2, -size / 2, size, size);
      } else {
        ctx.fillStyle = "#e8d7b0";
        ctx.fillRect(-size * 0.18, -size * 0.45, size * 0.36, size * 0.6);
        ctx.beginPath();
        ctx.arc(0, -size * 0.5, size * 0.16, 0, TAU);
        ctx.fill();
      }
      ctx.restore();

      ctx.restore();

      // flash when the hand lands
      const fl = smooth(1.85, 2.25, tSec) * (1 - smooth(2.25, 2.6, tSec));
      if (fl > 0) {
        ctx.fillStyle = `rgba(255,250,235,${fl * 0.92})`;
        ctx.fillRect(0, 0, w, h);
      }
    };

    const drawFall = (tf: number, dt: number) => {
      const roll = Math.sin(tf * 0.23) * 0.42 + Math.sin(tf * 1.71) * 0.05;
      const pitch = Math.sin(tf * 0.31) * 0.14;
      const focal = Math.min(w, h) * 1.05;
      const speed = 1 + Math.min(1.6, tf * 0.18);

      drawSky(tf, tf);

      // distant drifting motes behind the clouds
      ctx.globalCompositeOperation = "lighter";
      for (const d of dust) {
        d.y -= 620 * speed * dt;
        d.z -= 26 * dt;
        if (d.y < -1500 || d.z < 40) {
          d.x = rand(-1200, 1200);
          d.y = rand(900, 1600);
          d.z = rand(300, 1300);
        }
      }
      for (const c of clouds) {
        c.y -= 250 * speed * dt;
        c.z -= 34 * dt;
        if (c.y < -1500) c.y += 3000;
        if (c.z < 60) resetCloud(c, false);
      }
      for (const s of shards) {
        s.y -= 300 * speed * dt;
        s.z -= 20 * dt;
        s.spin += dt * 1.2;
        if (s.y < -1500 || s.z < 80) {
          s.x = rand(-1100, 1100);
          s.y = rand(900, 1500);
          s.z = rand(240, 1200);
        }
      }
      // depth sort far -> near: layered, sunlit cumulus
      const sorted = [...clouds].sort((a, b) => b.z - a.z);
      for (const c of sorted) {
        const p = project(c, roll, pitch, focal);
        if (!p) continue;
        const s = c.r * p.s;
        if (p.sx < -s * 2.4 || p.sx > w + s * 2.4 || p.sy < -s * 2.4 || p.sy > h + s * 2.4) continue;
        const fog = clamp01(1.1 - c.z / 1500);
        const lift = Math.sin(tf * 0.7 + c.r) * 0.04;
        ctx.globalAlpha = c.a * (0.72 + fog * 0.28);
        for (const pf of c.puffs) {
          const pr = s * pf.dr;
          ctx.drawImage(cloudLight, p.sx + pf.dx * s - pr, p.sy + pf.dy * s + lift * s - pr, pr * 2, pr * 2);
        }
        // shaded belly gives each billboard volume
        ctx.globalAlpha = c.a * 0.42;
        for (const pf of c.puffs) {
          if (pf.shade < 0.45) continue;
          const pr = s * pf.dr * 0.9;
          const oy = p.sy + pf.dy * s + lift * s + pr * 0.34;
          const ox = p.sx + pf.dx * s - pr * 0.08;
          ctx.drawImage(cloudShade, ox - pr, oy - pr, pr * 2, pr * 2);
        }
        // sun-side rim
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = c.a * 0.24 * fog;
        for (const pf of c.puffs) {
          if (pf.shade > 0.3) continue;
          const pr = s * pf.dr * 0.7;
          ctx.drawImage(cloudLight, p.sx + pf.dx * s - pr, p.sy + pf.dy * s - s * 0.16 - pr, pr * 2, pr * 2);
        }
        ctx.globalCompositeOperation = "source-over";
      }
      ctx.globalAlpha = 1;

      // passing through cloud layers
      const veil = (v: number) => {
        if (v <= 0.005) return;
        const veilGrad = ctx.createLinearGradient(0, 0, 0, h);
        veilGrad.addColorStop(0, `rgba(${pal.cloud},${v * 0.75})`);
        veilGrad.addColorStop(0.7, `rgba(${pal.cloud},${v * 0.32})`);
        veilGrad.addColorStop(1, `rgba(${pal.cloud},${v * 0.06})`);
        ctx.fillStyle = veilGrad;
        ctx.fillRect(0, 0, w, h);
      };
      veil(smooth(0.9, 1.7, tf) * (1 - smooth(2.2, 3.0, tf)) * 0.15);
      veil(smooth(4.1, 4.9, tf) * (1 - smooth(5.4, 6.2, tf)) * 0.13);

      // the fall is over once the landing flash hits
      const falling = tf < 7.15;

      // speed streaks
      if (falling) {
        ctx.globalCompositeOperation = "lighter";
        ctx.strokeStyle = `rgba(${pal.cloud},0.5)`;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        for (const d of dust) {
          const p = project(d, roll, pitch, focal);
          const q = project({ x: d.x * 0.985, y: d.y + 170, z: d.z + 48 }, roll, pitch, focal);
          if (!p || !q) continue;
          if (p.sx < -40 || p.sx > w + 40 || p.sy < -40 || p.sy > h + 40) continue;
          ctx.globalAlpha = 0.18 + clamp01(1 - d.z / 1300) * 0.55;
          ctx.moveTo(p.sx, p.sy);
          ctx.lineTo(q.sx, q.sy);
        }
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = "source-over";
      }

      // tumbling memory shards
      for (const s of falling ? shards : []) {
        const p = project(s, roll, pitch, focal);
        if (!p) continue;
        const r = s.size * p.s;
        if (r < 1.5) continue;
        if (p.sx < -80 || p.sx > w + 80 || p.sy < -80 || p.sy > h + 80) continue;
        const a = s.spin + tf * 0.4;
        ctx.save();
        ctx.translate(p.sx, p.sy);
        ctx.rotate(a);
        const sx = r * (0.55 + 0.45 * Math.abs(Math.cos(a * 1.7)));
        const grad = ctx.createLinearGradient(-sx, -r, sx, r);
        grad.addColorStop(0, "#ffffff");
        grad.addColorStop(0.45, pal.accent);
        grad.addColorStop(1, "rgba(120,190,255,0.15)");
        ctx.globalAlpha = 0.4 + clamp01(1 - s.z / 1200) * 0.5;
        ctx.shadowColor = pal.accent;
        ctx.shadowBlur = 18;
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(0, -r);
        ctx.lineTo(sx, 0);
        ctx.lineTo(0, r);
        ctx.lineTo(-sx, 0);
        ctx.closePath();
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = "rgba(255,255,255,0.75)";
        ctx.lineWidth = Math.max(0.6, r * 0.06);
        ctx.beginPath();
        ctx.moveTo(0, -r);
        ctx.lineTo(0, r);
        ctx.moveTo(-sx, 0);
        ctx.lineTo(sx, 0);
        ctx.stroke();
        ctx.restore();
      }
      ctx.globalAlpha = 1;

      // Mira watching from above — a fading silhouette
      const mi = (1 - smooth(0, 3.2, tf)) * 0.75;
      if (mi > 0.01) {
        ctx.save();
        ctx.globalAlpha = mi;
        const mh = Math.min(h * 0.7, 520);
        ctx.translate(w * 0.5, -mh * 0.05 + tf * 16);
        ctx.fillStyle = "#0a0f1c";
        ctx.beginPath();
        ctx.moveTo(0, -mh * 0.42);
        ctx.quadraticCurveTo(mh * 0.3, 0, mh * 0.34, mh * 0.45);
        ctx.lineTo(-mh * 0.34, mh * 0.45);
        ctx.quadraticCurveTo(-mh * 0.3, 0, 0, -mh * 0.42);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = `rgba(255,224,138,${mi * 0.8})`;
        ctx.fillRect(-mh * 0.045, -mh * 0.34, mh * 0.02, mh * 0.022);
        ctx.fillRect(mh * 0.025, -mh * 0.34, mh * 0.02, mh * 0.022);
        ctx.restore();
      }

      // the falling Warden
      const size = Math.min(w, h) * 0.2;
      const sway = Math.sin(tf * 1.15) * w * 0.055;
      const bob = Math.cos(tf * 0.83) * h * 0.06;
      const rot = tf * 1.15 + Math.sin(tf * 0.6) * 0.2;
      const spr = getSprite("player");
      const white = getWhite("player");
      if (falling) {
        ctx.save();
        ctx.translate(w / 2 + sway, h / 2 + bob);
        ctx.rotate(rot);
        if (spr) {
          if (white) {
            ctx.globalAlpha = 0.2;
            ctx.globalCompositeOperation = "lighter";
            ctx.drawImage(white, -size * 0.55, -size * 0.55, size * 1.1, size * 1.1);
            ctx.globalCompositeOperation = "source-over";
          }
          for (let i = 1; i <= 3; i++) {
            ctx.globalAlpha = 0.16 / i;
            ctx.drawImage(spr, -size / 2 - i * 5, -size / 2 - i * 9, size, size);
          }
          ctx.globalAlpha = 1;
          ctx.drawImage(spr, -size / 2, -size / 2, size, size);
        } else {
          ctx.fillStyle = "rgba(255,245,220,0.9)";
          ctx.beginPath();
          ctx.arc(0, -size * 0.12, size * 0.2, 0, TAU);
          ctx.fill();
          ctx.fillRect(-size * 0.12, 0, size * 0.24, size * 0.4);
        }
        ctx.restore();
      }

      // the heir follows in the secret ending
      if (falling && ending === "dawn" && tf > 2.6) {
        const a = smooth(2.6, 3.6, tf);
        const ss = size * 0.55;
        const sl = getSprite("slime");
        ctx.save();
        ctx.globalAlpha = a;
        ctx.translate(w / 2 - sway * 1.4 - size * 0.9, h / 2 + bob * 1.3 - size * 0.4);
        ctx.rotate(-rot * 0.6);
        if (sl) ctx.drawImage(sl, -ss / 2, -ss / 2, ss, ss);
        else {
          ctx.fillStyle = "rgba(140,240,140,0.9)";
          ctx.beginPath();
          ctx.arc(0, 0, ss * 0.4, 0, TAU);
          ctx.fill();
        }
        ctx.restore();
      }

      // landing flash and tableau
      const flash = Math.max(0, 1 - Math.abs(tf - 7.15) / 0.55);
      if (flash > 0) {
        ctx.fillStyle = ending === "debt"
          ? `rgba(220,210,255,${flash * 0.55})`
          : `rgba(255,248,230,${flash * 0.8})`;
        ctx.fillRect(0, 0, w, h);
      }
      const land = smooth(7.1, 8.0, tf);
      if (land > 0) drawTableau(land, tf);

      // vignette: light during the fall, deeper once the ending text arrives
      const vigEdge = 0.5 + smooth(7.1, 8.4, tf) * 0.32;
      const vg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.2, w / 2, h / 2, Math.max(w, h) * 0.74);
      vg.addColorStop(0, "rgba(3,5,10,0.08)");
      vg.addColorStop(1, `rgba(3,5,10,${vigEdge})`);
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, w, h);
    };

    const drawTableau = (a: number, tf: number) => {
      ctx.save();
      ctx.globalAlpha = a;
      if (ending === "crown") {
        const glow = ctx.createRadialGradient(w / 2, h * 0.68, 10, w / 2, h * 0.68, Math.min(w, h) * 0.55);
        glow.addColorStop(0, "rgba(251,191,36,0.5)");
        glow.addColorStop(1, "rgba(251,191,36,0)");
        ctx.fillStyle = glow;
        ctx.fillRect(0, 0, w, h);
        const cw = Math.min(w * 0.56, 520);
        const ch = cw * 0.44;
        const cx = w / 2;
        const cy = h * 0.7 + Math.sin(tf * 1.4) * 4;
        ctx.beginPath();
        ctx.moveTo(cx - cw * 0.5, cy);
        ctx.lineTo(cx - cw * 0.42, cy - ch * 0.9);
        ctx.lineTo(cx - cw * 0.2, cy - ch * 0.25);
        ctx.lineTo(cx, cy - ch * 1.15);
        ctx.lineTo(cx + cw * 0.2, cy - ch * 0.25);
        ctx.lineTo(cx + cw * 0.42, cy - ch * 0.9);
        ctx.lineTo(cx + cw * 0.5, cy);
        ctx.lineTo(cx + cw * 0.46, cy + ch * 0.34);
        ctx.lineTo(cx - cw * 0.46, cy + ch * 0.34);
        ctx.closePath();
        const fill = ctx.createLinearGradient(cx, cy - ch * 1.2, cx, cy + ch * 0.4);
        fill.addColorStop(0, "#5b4113");
        fill.addColorStop(0.55, "#2b1d06");
        fill.addColorStop(1, "#0c0802");
        ctx.fillStyle = fill;
        ctx.shadowColor = "rgba(251,191,36,0.9)";
        ctx.shadowBlur = 46;
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = "rgba(255,214,102,0.95)";
        ctx.lineWidth = 3.5;
        ctx.stroke();
        // the three gems of the deep
        const gems: [number, string][] = [[-0.28, "#ef4444"], [0, "#fbbf24"], [0.28, "#38bdf8"]];
        for (const [gx, col] of gems) {
          ctx.fillStyle = col;
          ctx.shadowColor = col;
          ctx.shadowBlur = 18;
          ctx.beginPath();
          ctx.arc(cx + cw * gx, cy + ch * 0.05, cw * 0.028, 0, TAU);
          ctx.fill();
        }
        ctx.shadowBlur = 0;
        // strata of the deep, in perspective
        ctx.strokeStyle = "rgba(251,191,36,0.18)";
        ctx.lineWidth = 1;
        for (let i = 0; i < 7; i++) {
          const yy = cy + ch * 0.45 + i * i * 3.4;
          ctx.beginPath();
          ctx.moveTo(cx - cw * (0.55 + i * 0.07), yy);
          ctx.quadraticCurveTo(cx, yy + 12, cx + cw * (0.55 + i * 0.07), yy);
          ctx.stroke();
        }
      } else if (ending === "debt") {
        const glow = ctx.createRadialGradient(w / 2, h * 0.78, 10, w / 2, h * 0.78, Math.min(w, h) * 0.6);
        glow.addColorStop(0, "rgba(255,224,160,0.42)");
        glow.addColorStop(0.5, "rgba(196,181,253,0.2)");
        glow.addColorStop(1, "rgba(196,181,253,0)");
        ctx.fillStyle = glow;
        ctx.fillRect(0, 0, w, h);
        // the returning thread
        const gx = w / 2 + Math.sin(tf * 0.9) * 10;
        const grad = ctx.createLinearGradient(0, h * 0.84, 0, h * 0.22);
        grad.addColorStop(0, "rgba(255,224,160,0.95)");
        grad.addColorStop(1, "rgba(196,181,253,0)");
        ctx.strokeStyle = grad;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(gx, h * 0.86);
        for (let i = 0; i <= 22; i++) {
          const p = i / 22;
          ctx.lineTo(gx + Math.sin(p * 9 + tf * 1.6) * (16 - p * 10), h * (0.86 - p * 0.62));
        }
        ctx.stroke();
        // ember sun, low
        const eg = ctx.createRadialGradient(w / 2, h * 0.74, 2, w / 2, h * 0.74, Math.min(w, h) * 0.2);
        eg.addColorStop(0, "rgba(255,190,120,0.7)");
        eg.addColorStop(1, "rgba(255,120,60,0)");
        ctx.fillStyle = eg;
        ctx.fillRect(0, 0, w, h);
      } else {
        // dawn: sun disc, aurora ribbons, tiny crowned slime
        const sy = h * 0.56;
        const sg = ctx.createRadialGradient(w / 2, sy, 4, w / 2, sy, Math.min(w, h) * 0.5);
        sg.addColorStop(0, "rgba(255,236,190,0.85)");
        sg.addColorStop(0.35, "rgba(255,170,90,0.4)");
        sg.addColorStop(1, "rgba(56,189,248,0)");
        ctx.fillStyle = sg;
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = "rgba(255,245,220,0.9)";
        ctx.beginPath();
        ctx.arc(w / 2, sy, Math.min(w, h) * 0.06, 0, TAU);
        ctx.fill();
        for (let i = 0; i < 4; i++) {
          const yy = h * (0.12 + i * 0.055);
          const grad = ctx.createLinearGradient(0, yy, w, yy + 40);
          grad.addColorStop(0, "rgba(125,211,252,0)");
          grad.addColorStop(0.5, `rgba(${i % 2 ? "167,243,208" : "125,211,252"},0.3)`);
          grad.addColorStop(1, "rgba(125,211,252,0)");
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.moveTo(0, yy);
          for (let x = 0; x <= w; x += 24) ctx.lineTo(x, yy + Math.sin(x * 0.006 + tf * 0.7 + i) * 26);
          ctx.lineTo(w, yy + 70);
          for (let x = w; x >= 0; x -= 24) ctx.lineTo(x, yy + 50 + Math.sin(x * 0.005 + tf * 0.5 + i) * 20);
          ctx.closePath();
          ctx.fill();
        }
        const sl = getSprite("slime");
        const ss = Math.min(w, h) * 0.16;
        ctx.save();
        ctx.translate(w / 2, h * 0.71 + Math.sin(tf * 1.5) * 5);
        if (sl) ctx.drawImage(sl, -ss / 2, -ss / 2, ss, ss);
        else {
          ctx.fillStyle = "rgba(140,240,140,0.9)";
          ctx.beginPath();
          ctx.ellipse(0, 0, ss * 0.4, ss * 0.33, 0, 0, TAU);
          ctx.fill();
        }
        ctx.fillStyle = "#ffe08a";
        ctx.beginPath();
        ctx.moveTo(-ss * 0.2, -ss * 0.34);
        ctx.lineTo(-ss * 0.1, -ss * 0.5);
        ctx.lineTo(0, -ss * 0.36);
        ctx.lineTo(ss * 0.1, -ss * 0.5);
        ctx.lineTo(ss * 0.2, -ss * 0.34);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
      ctx.restore();
    };

    const frame = (now: number) => {
      if (!start) { start = now; last = now; }
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const tSec = (now - start) / 1000;
      ctx.clearRect(0, 0, w, h);
      if (tSec < 2.35) {
        drawSummit(tSec);
      } else {
        const tf = tSec - 2.35;
        drawFall(tf, dt);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [ending]);

  const complete = showText && shown >= def.lines.length;
  const revealed = showText ? def.lines.slice(0, shown) : [];

  return (
    <div
      className="fixed inset-0 z-[200] overflow-y-auto bg-[#04060c] text-white"
      onClick={() => {
        if (!showText) setShowText(true);
        else if (!complete) setShown(def.lines.length);
      }}
    >
      <canvas ref={canvasRef} aria-hidden className="pointer-events-none fixed inset-0 h-full w-full" />
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_center,rgba(4,6,12,0.05),rgba(4,6,12,0.55))]" />

      <div className="relative z-10 mx-auto flex min-h-[100dvh] w-full max-w-2xl flex-col items-center justify-center px-6 py-12 text-center">
        <div className={`w-full transition-opacity duration-1000 ${showText ? "opacity-100" : "pointer-events-none opacity-0"}`}>
          <div className="mb-2 text-[10px] uppercase tracking-[0.5em] text-white/40">{t("c2_ending_label")}</div>
          <div className="mb-4 text-6xl" style={{ filter: `drop-shadow(0 0 26px ${def.glow})` }}>
            {def.icon}
          </div>
          <h1 className="end-title font-display text-4xl font-black sm:text-6xl" style={{ color: def.accent, textShadow: `0 0 34px ${def.glow}` }}>
            {t(def.titleKey)}
          </h1>
          <div className="mx-auto mt-6 h-px w-28" style={{ background: `linear-gradient(to right, transparent, ${def.accent}aa, transparent)` }} />

          <div className="mt-8 space-y-3">
            {revealed.map((key, i) => (
              <p
                key={key}
                className="end-in text-base leading-relaxed text-white/80 sm:text-lg"
                style={{ animationDelay: `${Math.min(i, 3) * 0.1}s` }}
              >
                {t(key)}
              </p>
            ))}
          </div>

          {!complete && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShown(def.lines.length);
              }}
              className="mt-10 text-xs uppercase tracking-[0.3em] text-white/40 transition-colors hover:text-white/70"
            >
              {t("skip")} ▸
            </button>
          )}
          {complete && (
            <div className="anim-rise mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onContinueWorld();
                }}
                className="rounded-xl px-7 py-3.5 text-base font-bold text-[#10131b] transition-transform hover:scale-105"
                style={{ background: `linear-gradient(135deg, ${def.accent}, #ffffffcc)`, boxShadow: `0 0 30px ${def.glow}` }}
              >
                ▶ {t("continue_world")}
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onNewWorld();
                }}
                className="rounded-xl border border-white/25 bg-white/5 px-7 py-3.5 text-base font-semibold text-white/90 backdrop-blur transition-colors hover:bg-white/15"
              >
                🌍 {t("new_world")}
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onMenu();
                }}
                className="text-sm text-white/45 transition-colors hover:text-white/70"
              >
                {t("main_menu")}
              </button>
            </div>
          )}
        </div>

        {!showText && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowText(true);
            }}
            className="fixed bottom-8 left-1/2 -translate-x-1/2 text-xs uppercase tracking-[0.3em] text-white/50 transition-colors hover:text-white/80"
          >
            {t("skip")} ▸
          </button>
        )}
      </div>
    </div>
  );
}
