import { useEffect, useRef, useState } from "react";
import { audio } from "./audio";
import { t } from "./i18n";
import { getSprite, initSprites } from "./sprites";

type Stage = "fall" | "black" | "wake" | "cabin";

const TAU = Math.PI * 2;
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (a: number, b: number, v: number) => {
  const x = clamp01((v - a) / (b - a));
  return x * x * (3 - 2 * x);
};
const lerp = (a: number, b: number, v: number) => a + (b - a) * v;

interface Cloud { x: number; y: number; r: number; a: number; v: number; }
interface Streak { x: number; y: number; len: number; v: number; a: number; }

function makePuff(color: string): HTMLCanvasElement {
  const cv = document.createElement("canvas");
  cv.width = cv.height = 256;
  const c = cv.getContext("2d")!;
  const g = c.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.62, "rgba(255,255,255,1)");
  g.addColorStop(0.82, "rgba(255,255,255,0.85)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  c.fillStyle = g;
  c.fillRect(0, 0, 256, 256);
  c.globalCompositeOperation = "source-in";
  c.fillStyle = color;
  c.fillRect(0, 0, 256, 256);
  return cv;
}

export default function Aftermath({ onDone }: { onDone: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fadeRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<{ name: Stage; at: number }>({ name: "fall", at: 0 });
  const timersRef = useRef<number[]>([]);
  const leaveRef = useRef(0);
  const [stage, setStage] = useState<Stage>("fall");
  const [canFinish, setCanFinish] = useState(false);
  const [leaving, setLeaving] = useState(false);

  const go = (name: Stage) => {
    stageRef.current = { name, at: performance.now() };
    setStage(name);
    if (name === "black") audio.playSfx("hurt");
    if (name === "cabin") audio.playSfx("click");
  };

  useEffect(() => {
    audio.setTrack("none");
    stageRef.current = { name: "fall", at: performance.now() };
    timersRef.current = [
      window.setTimeout(() => go("black"), 5000),
      window.setTimeout(() => go("wake"), 6200),
      window.setTimeout(() => go("cabin"), 13300),
    ];
    return () => {
      for (const id of timersRef.current) window.clearTimeout(id);
      timersRef.current = [];
      if (leaveRef.current) window.clearTimeout(leaveRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (stage !== "cabin") {
      setCanFinish(false);
      return;
    }
    const id = window.setTimeout(() => setCanFinish(true), 3200);
    return () => window.clearTimeout(id);
  }, [stage]);

  const skip = () => {
    if (stage === "cabin") return;
    for (const id of timersRef.current) window.clearTimeout(id);
    timersRef.current = [];
    audio.playSfx("click");
    go("cabin");
  };

  const finish = () => {
    if (!canFinish || leaving) return;
    setLeaving(true);
    audio.playSfx("levelup");
    leaveRef.current = window.setTimeout(onDone, 700);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    initSprites();

    const puffLight = makePuff("#e4efff");
    const puffWarm = makePuff("#ffc78a");
    const puffDark = makePuff("#16233a");

    const clouds: Cloud[] = Array.from({ length: 18 }, () => ({
      x: rand(0, 1), y: rand(-0.3, 1.3), r: rand(0.07, 0.22), a: rand(0.2, 0.6), v: rand(0.55, 1.35),
    }));
    const streaks: Streak[] = Array.from({ length: 46 }, () => ({
      x: rand(0, 1), y: rand(0, 1), len: rand(0.05, 0.17), v: rand(0.7, 1.7), a: rand(0.12, 0.5),
    }));
    const motes = Array.from({ length: 52 }, () => ({
      x: rand(0, 1), y: rand(0, 1), r: rand(0.7, 2.4), p: rand(0, TAU), v: rand(0.006, 0.02),
    }));
    const dust = Array.from({ length: 40 }, () => ({
      x: rand(0, 1), y: rand(0, 1), r: rand(0.6, 2.2), p: rand(0, TAU), v: rand(0.005, 0.018),
    }));
    const grass = Array.from({ length: 120 }, () => ({
      x: rand(0, 1), h: rand(0.015, 0.055), p: rand(0, TAU),
    }));
    const knots = Array.from({ length: 34 }, () => ({
      x: rand(0, 1), y: rand(0.06, 0.7), r: rand(1, 4),
    }));

    let w = 0;
    let h = 0;
    let raf = 0;
    let last = performance.now();

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

    const drawFall = (tf: number, dt: number) => {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, "#04060f");
      g.addColorStop(0.34, "#0a1932");
      g.addColorStop(0.7, "#16344e");
      g.addColorStop(1, tf > 3.4 ? "#7a5137" : "#22475e");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);

      // the light we are falling toward
      const glowY = h * 0.94;
      const rg = ctx.createRadialGradient(w * 0.5, glowY, 8, w * 0.5, glowY, Math.min(w, h) * 0.85);
      rg.addColorStop(0, `rgba(255,198,132,${0.08 + tf * 0.035})`);
      rg.addColorStop(0.45, `rgba(255,160,100,${0.03 + tf * 0.012})`);
      rg.addColorStop(1, "rgba(255,150,90,0)");
      ctx.fillStyle = rg;
      ctx.fillRect(0, 0, w, h);

      // speed streaks
      ctx.strokeStyle = "rgba(220,240,255,0.65)";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (const s of streaks) {
        s.y -= s.v * dt * 1.9;
        if (s.y < -0.25) {
          s.y = 1.25;
          s.x = rand(0, 1);
          s.v = rand(0.7, 1.7);
        }
        const x = s.x * w;
        const y = s.y * h;
        ctx.globalAlpha = s.a;
        ctx.moveTo(x, y);
        ctx.lineTo(x, y - s.len * h);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;

      // cloud deck rushing upward
      for (const c of clouds) {
        c.y -= c.v * dt * 0.6;
        if (c.y < -0.32) {
          c.y = 1.32;
          c.x = rand(0, 1);
          c.r = rand(0.07, 0.22);
          c.a = rand(0.2, 0.6);
        }
        const r = c.r * Math.min(w, h);
        const alpha = c.a * (0.55 + 0.35 * Math.sin(tf * 1.4 + c.x * 7));
        ctx.globalAlpha = alpha * 0.38;
        ctx.drawImage(puffDark, c.x * w - r, c.y * h - r * 0.55 + r * 0.16, r * 2.1, r * 1.3);
        ctx.globalAlpha = alpha;
        ctx.drawImage(c.y > 0.45 ? puffWarm : puffLight, c.x * w - r, c.y * h - r * 0.6, r * 2, r * 1.2);
      }
      ctx.globalAlpha = 1;

      // the island we left, shrinking above
      const iy = -h * 0.16 - tf * 34;
      ctx.save();
      ctx.translate(w * 0.5, iy);
      const iw = Math.min(w * 0.7, 980);
      ctx.fillStyle = "#05080e";
      ctx.beginPath();
      ctx.moveTo(-iw / 2, 0);
      ctx.quadraticCurveTo(-iw * 0.26, -h * 0.085, 0, -h * 0.09);
      ctx.quadraticCurveTo(iw * 0.28, -h * 0.095, iw / 2, 0);
      ctx.quadraticCurveTo(iw * 0.2, h * 0.055, 0, h * 0.095);
      ctx.quadraticCurveTo(-iw * 0.24, h * 0.05, -iw / 2, 0);
      ctx.fill();
      ctx.fillRect(-iw * 0.035, -h * 0.22, iw * 0.07, h * 0.13);
      for (let i = 0; i < 7; i++) {
        const px = (-0.4 + i * 0.135) * iw;
        ctx.globalAlpha = 0.3;
        ctx.drawImage(puffLight, px - iw * 0.1, h * 0.04, iw * 0.22, iw * 0.09);
      }
      ctx.globalAlpha = 1;
      ctx.restore();

      // the falling Warden
      const size = Math.min(w, h) * 0.2;
      const sway = Math.sin(tf * 1.65) * w * 0.045;
      const bob = Math.cos(tf * 0.95) * h * 0.025;
      const rot = tf * 1.55 + Math.sin(tf * 0.7) * 0.16;
      const spr = getSprite("player");
      ctx.save();
      ctx.translate(w / 2 + sway, h / 2 + bob);
      ctx.rotate(rot);
      if (spr) {
        ctx.globalAlpha = 0.16;
        ctx.drawImage(spr, -size * 0.62, -size * 0.62, size * 1.24, size * 1.24);
        ctx.globalAlpha = 0.4;
        for (let i = 1; i <= 3; i++) ctx.drawImage(spr, -size / 2 - i * 4, -size / 2 - i * 7, size, size);
        ctx.globalAlpha = 1;
        ctx.drawImage(spr, -size / 2, -size / 2, size, size);
      } else {
        ctx.fillStyle = "rgba(255,245,220,0.92)";
        ctx.beginPath();
        ctx.arc(0, -size * 0.12, size * 0.2, 0, TAU);
        ctx.fill();
        ctx.fillRect(-size * 0.12, 0, size * 0.24, size * 0.4);
      }
      ctx.restore();

      // impact flash as the ground arrives
      const flash = smooth(4.45, 4.96, tf);
      if (flash > 0) {
        ctx.fillStyle = `rgba(255,240,220,${flash * 0.92})`;
        ctx.fillRect(0, 0, w, h);
      }
    };

    const drawBlack = (tf: number) => {
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, w, h);
      const fl = 1 - smooth(0.02, 0.45, tf);
      if (fl > 0) {
        ctx.fillStyle = `rgba(255,236,214,${fl * 0.9})`;
        ctx.fillRect(0, 0, w, h);
      }
    };

    const drawHooded = (x: number, y: number, hgt: number, kneel: boolean, tf: number, alpha: number) => {
      const bend = kneel ? 0.16 : 0;
      const headR = hgt * 0.075;
      const top = -hgt * (kneel ? 0.6 : 0.8);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(x, y);
      const cloak = ctx.createLinearGradient(0, top, 0, 0);
      cloak.addColorStop(0, "#2b322d");
      cloak.addColorStop(0.5, "#131a16");
      cloak.addColorStop(1, "#060907");
      const neckY = top + headR * 1.5;
      const shoulderW = hgt * 0.155;
      const hemW = hgt * 0.2;
      ctx.fillStyle = cloak;
      ctx.beginPath();
      ctx.moveTo(bend * hgt - headR * 0.8, neckY);
      ctx.quadraticCurveTo(-shoulderW, neckY + hgt * 0.02, -shoulderW, -hgt * 0.62);
      ctx.quadraticCurveTo(-hemW, -hgt * 0.28, -hemW, 0);
      ctx.quadraticCurveTo(0, hgt * 0.04, hemW, 0);
      ctx.quadraticCurveTo(hemW, -hgt * 0.28, shoulderW, -hgt * 0.62);
      ctx.quadraticCurveTo(shoulderW, neckY + hgt * 0.02, bend * hgt + headR * 0.8, neckY);
      ctx.closePath();
      ctx.fill();
      // hood
      ctx.fillStyle = "#0f1512";
      ctx.beginPath();
      ctx.ellipse(bend * hgt, top + headR * 0.85, headR * 1.3, headR * 1.55, 0, 0, TAU);
      ctx.fill();
      // face in shadow
      ctx.fillStyle = "#030504";
      ctx.beginPath();
      ctx.ellipse(bend * hgt, top + headR * 0.98, headR * 0.82, headR * 1.16, 0, 0, TAU);
      ctx.fill();
      const blink = 0.55 + 0.45 * Math.sin(tf * 1.7 + 2);
      ctx.fillStyle = `rgba(255,206,132,${0.8 * blink})`;
      ctx.fillRect(bend * hgt - headR * 0.4, top + headR * 0.95, headR * 0.17, headR * 0.1);
      ctx.fillRect(bend * hgt + headR * 0.23, top + headR * 0.95, headR * 0.17, headR * 0.1);
      // scarf
      ctx.strokeStyle = "rgba(126,104,76,0.7)";
      ctx.lineWidth = Math.max(2, headR * 0.28);
      ctx.beginPath();
      ctx.moveTo(bend * hgt - headR * 0.8, top + headR * 1.45);
      ctx.quadraticCurveTo(0, top + headR * 1.7, headR * 0.8, top + headR * 1.45);
      ctx.stroke();
      ctx.restore();
    };

    const drawWake = (tf: number) => {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, "#08161f");
      g.addColorStop(0.5, "#203634");
      g.addColorStop(0.76, "#2c3b2c");
      g.addColorStop(1, "#080b07");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);

      // cold dawn at the horizon
      const horizon = h * 0.68;
      const hg = ctx.createRadialGradient(w * 0.5, horizon, 4, w * 0.5, horizon, Math.min(w, h) * 0.7);
      hg.addColorStop(0, "rgba(255,180,118,0.32)");
      hg.addColorStop(0.4, "rgba(170,140,120,0.1)");
      hg.addColorStop(1, "rgba(120,140,150,0)");
      ctx.fillStyle = hg;
      ctx.fillRect(0, 0, w, h);

      // distant treeline
      ctx.fillStyle = "#0c1714";
      ctx.beginPath();
      ctx.moveTo(0, horizon);
      for (let x = 0; x <= w; x += w / 18) {
        ctx.lineTo(x, horizon - Math.sin(x * 0.013 + 1.2) * h * 0.035 - h * 0.012);
      }
      ctx.lineTo(w, h * 0.78);
      ctx.lineTo(0, h * 0.78);
      ctx.closePath();
      ctx.fill();

      // near trees at the edges
      ctx.fillStyle = "#050a08";
      for (const [tx, th] of [[0.03, 0.55], [0.95, 0.62]] as const) {
        const x = tx * w;
        ctx.fillRect(x - w * 0.012, horizon - h * th, w * 0.024, h * th + h * 0.12);
        ctx.beginPath();
        ctx.ellipse(x, horizon - h * th, w * 0.12, h * 0.11, 0, 0, TAU);
        ctx.fill();
      }

      // grass floor
      const groundY = h * 0.755;
      ctx.fillStyle = "#0a100a";
      ctx.fillRect(0, groundY, w, h - groundY);
      ctx.strokeStyle = "rgba(88,116,72,0.45)";
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      for (const bl of grass) {
        const x = bl.x * w;
        const bh = bl.h * h;
        ctx.moveTo(x, groundY + 2);
        ctx.lineTo(x + Math.sin(tf * 1.1 + bl.p) * 4, groundY + 2 - bh);
      }
      ctx.stroke();

      const approach = smooth(0.9, 3.1, tf);
      const lift = smooth(3.0, 4.7, tf);
      const sx = w * (0.72 - 0.11 * approach) + Math.sin(tf * 0.9) * w * 0.005;
      const sHeight = Math.min(h * 0.52, w * 0.6, 420) * (0.96 + 0.04 * lift);
      const pSize = sHeight * 0.72;
      const groundPx = w * 0.4;
      const groundPy = groundY - pSize * 0.46;
      const carryPx = sx - pSize * 0.62;
      const carryPy = groundY - sHeight * 0.44;
      const px = lerp(groundPx, carryPx, lift) + Math.sin(tf * 2.2) * w * 0.004 * lift;
      const py = lerp(groundPy, carryPy, lift) + Math.sin(tf * 2.8) * 3 * lift;
      // head toward the stranger's chest once lifted
      const prot = Math.PI / 2 + Math.sin(tf * 0.9) * 0.045;
      const shoulderY = groundY - sHeight * 0.58;

      // warm lantern light
      const lx = sx + sHeight * 0.17;
      const ly = groundY - sHeight * 0.24;
      const lg = ctx.createRadialGradient(lx, ly, 2, lx, ly, sHeight * 0.85);
      lg.addColorStop(0, "rgba(255,196,112,0.4)");
      lg.addColorStop(0.35, "rgba(255,160,80,0.12)");
      lg.addColorStop(1, "rgba(255,150,70,0)");
      ctx.fillStyle = lg;
      ctx.fillRect(0, 0, w, h);

      const drawActors = (ox: number, alpha: number) => {
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(ox, 0);
        drawHooded(sx, groundY, sHeight, false, tf, 1);
        // lantern arm and lantern
        ctx.lineCap = "round";
        ctx.strokeStyle = "#171e19";
        ctx.lineWidth = Math.max(5, sHeight * 0.032);
        ctx.beginPath();
        ctx.moveTo(sx + sHeight * 0.035, shoulderY + sHeight * 0.03);
        ctx.quadraticCurveTo(sx + sHeight * 0.14, shoulderY + sHeight * 0.06, lx, ly - sHeight * 0.04);
        ctx.stroke();
        ctx.fillStyle = "#1d140b";
        ctx.fillRect(lx - sHeight * 0.035, ly - sHeight * 0.03, sHeight * 0.07, sHeight * 0.11);
        ctx.fillStyle = "rgba(255,214,140,0.95)";
        ctx.fillRect(lx - sHeight * 0.02, ly - sHeight * 0.015, sHeight * 0.04, sHeight * 0.06);
        // supporting arm behind the body, dipping under the back
        if (lift > 0.05) {
          ctx.strokeStyle = "#232b25";
          ctx.lineWidth = Math.max(6, sHeight * 0.038);
          ctx.beginPath();
          ctx.moveTo(sx - sHeight * 0.03, shoulderY + sHeight * 0.06);
          ctx.quadraticCurveTo(px + pSize * 0.45, py + pSize * 0.6, px + pSize * 0.22, py + pSize * 0.24);
          ctx.stroke();
        }
        // the Warden, lying, then cradled
        const spr = getSprite("player");
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(prot);
        if (spr) ctx.drawImage(spr, -pSize / 2, -pSize / 2, pSize, pSize);
        else {
          ctx.fillStyle = "#d8c398";
          ctx.fillRect(-pSize * 0.18, -pSize * 0.18, pSize * 0.36, pSize * 0.36);
        }
        ctx.restore();
        // arm in front, holding the body under the knees
        if (lift > 0.05) {
          ctx.strokeStyle = "#334036";
          ctx.lineWidth = Math.max(6, sHeight * 0.042);
          ctx.beginPath();
          ctx.moveTo(sx - sHeight * 0.02, shoulderY + sHeight * 0.03);
          ctx.quadraticCurveTo(px + pSize * 0.1, py + pSize * 0.34, px - pSize * 0.24, py + pSize * 0.3);
          ctx.stroke();
          ctx.fillStyle = "#7a5a35";
          ctx.beginPath();
          ctx.arc(px - pSize * 0.24, py + pSize * 0.3, Math.max(4, sHeight * 0.036), 0, TAU);
          ctx.fill();
          ctx.fillStyle = "rgba(255,214,160,0.5)";
          ctx.beginPath();
          ctx.arc(px - pSize * 0.25, py + pSize * 0.29, Math.max(2, sHeight * 0.014), 0, TAU);
          ctx.fill();
        }
        ctx.restore();
      };

      const ghost = 1 - smooth(0.5, 3.6, tf);
      if (ghost > 0.02) drawActors(12 * ghost, 0.3 * ghost);
      drawActors(0, 1);

      // dust drifting through the dawn
      ctx.fillStyle = "rgba(255,226,180,0.5)";
      for (const d of dust) {
        const x = ((d.x + Math.sin(tf * 0.3 + d.p) * 0.01) % 1) * w;
        const y = ((d.y - tf * d.v * 0.25 + 1) % 1) * h;
        ctx.globalAlpha = 0.25 + 0.3 * Math.sin(tf + d.p);
        ctx.beginPath();
        ctx.arc(x, y, d.r, 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    };

    const drawCabin = (tf: number) => {
      const floorY = h * 0.65;
      const plankW = Math.max(42, w / 14);

      ctx.fillStyle = "#0c0806";
      ctx.fillRect(0, 0, w, h);

      // plank wall
      for (let i = 0; i * plankW < w; i++) {
        const v = 17 + Math.round(9 * (0.5 + 0.5 * Math.sin(i * 5.7 + 0.8)));
        ctx.fillStyle = `rgb(${v + 16},${v + 8},${v + 1})`;
        ctx.fillRect(i * plankW, 0, plankW - 1, floorY);
        ctx.fillStyle = "rgba(0,0,0,0.45)";
        ctx.fillRect(i * plankW + plankW - 2, 0, 2, floorY);
      }
      // knots
      for (const k of knots) {
        ctx.fillStyle = "rgba(10,6,3,0.55)";
        ctx.beginPath();
        ctx.ellipse(k.x * w, k.y * floorY, k.r * 2.1, k.r, 0.4, 0, TAU);
        ctx.fill();
      }

      // beams
      ctx.fillStyle = "#080503";
      ctx.fillRect(0, 0, w, h * 0.075);
      ctx.fillStyle = "#1b120b";
      ctx.fillRect(0, h * 0.075, w, h * 0.04);
      ctx.fillStyle = "#0e0906";
      ctx.fillRect(w * 0.47, 0, w * 0.035, floorY);

      // floor
      ctx.fillStyle = "#0a0704";
      ctx.fillRect(0, floorY, w, h - floorY);
      for (let i = 1; i < 6; i++) {
        const y = floorY + (h - floorY) * (i / 6) * 1.1;
        ctx.strokeStyle = "rgba(64,42,24,0.35)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }

      // window with dawn outside
      const winW = Math.min(w * 0.13, 150);
      const winH = winW * 1.28;
      const winX = w * 0.13;
      const winY = h * 0.15;
      ctx.fillStyle = "#060403";
      ctx.fillRect(winX - 10, winY - 10, winW + 20, winH + 20);
      const sky = ctx.createLinearGradient(0, winY, 0, winY + winH);
      sky.addColorStop(0, "#3a5874");
      sky.addColorStop(0.55, "#d99a6a");
      sky.addColorStop(1, "#ffd9a4");
      ctx.fillStyle = sky;
      ctx.fillRect(winX, winY, winW, winH);
      const sun = ctx.createRadialGradient(winX + winW * 0.62, winY + winH * 0.58, 2, winX + winW * 0.62, winY + winH * 0.58, winW * 0.55);
      sun.addColorStop(0, "rgba(255,244,214,0.95)");
      sun.addColorStop(0.3, "rgba(255,214,150,0.55)");
      sun.addColorStop(1, "rgba(255,190,120,0)");
      ctx.fillStyle = sun;
      ctx.fillRect(winX, winY, winW, winH);
      ctx.fillStyle = "#120c08";
      ctx.fillRect(winX + winW / 2 - 3, winY, 6, winH);
      ctx.fillRect(winX, winY + winH / 2 - 3, winW, 6);
      ctx.strokeStyle = "#120c08";
      ctx.lineWidth = 7;
      ctx.strokeRect(winX, winY, winW, winH);

      // light shaft into the room
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const shaft = ctx.createLinearGradient(winX, winY, w * 0.42, floorY);
      shaft.addColorStop(0, "rgba(255,206,146,0.16)");
      shaft.addColorStop(0.55, "rgba(255,196,130,0.06)");
      shaft.addColorStop(1, "rgba(255,190,120,0)");
      ctx.fillStyle = shaft;
      ctx.beginPath();
      ctx.moveTo(winX, winY);
      ctx.lineTo(winX + winW, winY);
      ctx.lineTo(winX + winW + w * 0.24, floorY);
      ctx.lineTo(winX - w * 0.06, floorY);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      // motes in the light
      ctx.fillStyle = "rgba(255,226,180,0.55)";
      for (const m of motes) {
        const x = (m.x * 0.55 + 0.1) * w + Math.sin(tf * 0.35 + m.p) * w * 0.01;
        const y = (m.y * 0.62 + 0.12) * h - (tf * m.v * h) % (h * 0.1);
        ctx.globalAlpha = 0.18 + 0.28 * (0.5 + 0.5 * Math.sin(tf * 0.9 + m.p));
        ctx.beginPath();
        ctx.arc(x, y, m.r, 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // the Warden, bound to the wall
      const pSize = Math.min(Math.max(w * 0.28, 140), h * 0.25, 250);
      const pX = w * 0.29;
      const pY = floorY - pSize * 0.04;
      const spr = getSprite("player");
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.beginPath();
      ctx.ellipse(pX, floorY + 3, pSize * 0.34, pSize * 0.065, 0, 0, TAU);
      ctx.fill();
      ctx.save();
      ctx.translate(pX, pY - pSize * 0.49);
      ctx.rotate(-0.05 + Math.sin(tf * 0.7) * 0.006);
      if (spr) ctx.drawImage(spr, -pSize / 2, -pSize / 2, pSize, pSize);
      else {
        ctx.fillStyle = "#d8c398";
        ctx.fillRect(-pSize * 0.16, -pSize * 0.34, pSize * 0.32, pSize * 0.62);
        ctx.beginPath();
        ctx.arc(0, -pSize * 0.44, pSize * 0.14, 0, TAU);
        ctx.fill();
      }
      ctx.restore();

      // ropes: pegs behind, bands across the chest and waist, wrists lashed back
      const bx = pX;
      const chestY = pY - pSize * 0.66;
      const waistY = pY - pSize * 0.47;
      const pegY = pY - pSize * 0.72;
      const pegL = bx - pSize * 0.62;
      const pegR = bx + pSize * 0.62;
      ctx.fillStyle = "#3a2710";
      ctx.fillRect(pegL - 4, pegY - 4, 8, 8);
      ctx.fillRect(pegR - 4, pegY - 4, 8, 8);
      ctx.lineCap = "round";
      for (const side of [-1, 1]) {
        const peg = side < 0 ? pegL : pegR;
        ctx.strokeStyle = "#8a6539";
        ctx.lineWidth = Math.max(2.5, pSize * 0.028);
        for (const y of [chestY, waistY]) {
          ctx.beginPath();
          ctx.moveTo(bx + side * pSize * 0.25, y);
          ctx.lineTo(peg, pegY);
          ctx.stroke();
        }
      }
      ctx.strokeStyle = "#c39a5e";
      ctx.lineWidth = Math.max(3.5, pSize * 0.05);
      for (const y of [chestY, waistY]) {
        ctx.beginPath();
        ctx.moveTo(bx - pSize * 0.26, y + pSize * 0.02);
        ctx.quadraticCurveTo(bx, y - pSize * 0.05, bx + pSize * 0.26, y + pSize * 0.02);
        ctx.stroke();
      }
      for (const side of [-1, 1]) {
        const wy = pY - pSize * 0.43;
        const wx = bx + side * pSize * 0.27;
        ctx.strokeStyle = "#b08857";
        ctx.lineWidth = Math.max(2.5, pSize * 0.032);
        ctx.beginPath();
        ctx.arc(wx, wy, pSize * 0.055, 0, TAU);
        ctx.stroke();
        ctx.strokeStyle = "#8a6539";
        ctx.beginPath();
        ctx.moveTo(wx + side * pSize * 0.04, wy);
        ctx.lineTo(wx + side * pSize * 0.17, wy - pSize * 0.09);
        ctx.stroke();
      }

      // the stranger by the door
      const sH = Math.min(w * 0.42, h * 0.5, 400);
      const sX = w * 0.72;
      const sY = floorY;
      ctx.fillStyle = "rgba(0,0,0,0.3)";
      ctx.beginPath();
      ctx.ellipse(sX, floorY + 3, sH * 0.27, sH * 0.04, 0, 0, TAU);
      ctx.fill();
      drawHooded(sX, sY, sH, false, tf, 1);

      const shoulderY = sY - sH * 0.58;
      const lx = sX + sH * 0.2;
      const ly = sY - sH * 0.3;
      const kx = sX - sH * 0.22;
      const ky = sY - sH * 0.32;
      // knife arm
      ctx.strokeStyle = "#101713";
      ctx.lineWidth = Math.max(6, sH * 0.05);
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(sX - sH * 0.04, shoulderY);
      ctx.quadraticCurveTo(sX - sH * 0.18, shoulderY + sH * 0.08, kx, ky);
      ctx.stroke();
      // lantern arm
      ctx.beginPath();
      ctx.moveTo(sX + sH * 0.04, shoulderY);
      ctx.quadraticCurveTo(sX + sH * 0.16, shoulderY + sH * 0.04, lx, ly - sH * 0.04);
      ctx.stroke();
      // hands
      ctx.fillStyle = "#4a3722";
      ctx.beginPath();
      ctx.arc(kx, ky, Math.max(3, sH * 0.028), 0, TAU);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(lx, ly - sH * 0.04, Math.max(3, sH * 0.026), 0, TAU);
      ctx.fill();

      // lantern light
      const lg = ctx.createRadialGradient(lx, ly, 2, lx, ly, sH * 0.8);
      lg.addColorStop(0, "rgba(255,196,112,0.62)");
      lg.addColorStop(0.32, "rgba(255,166,84,0.2)");
      lg.addColorStop(1, "rgba(255,150,70,0)");
      ctx.fillStyle = lg;
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = "#2a1c0e";
      ctx.lineWidth = Math.max(2, sH * 0.008);
      ctx.beginPath();
      ctx.moveTo(lx, ly - sH * 0.045);
      ctx.lineTo(lx, ly - sH * 0.09);
      ctx.stroke();
      const flick = 0.85 + 0.15 * Math.sin(tf * 11.3) + 0.05 * Math.sin(tf * 23.7);
      ctx.fillStyle = `rgba(255,211,135,${0.9 * flick})`;
      ctx.fillRect(lx - sH * 0.018, ly - sH * 0.03, sH * 0.036, sH * 0.06);
      ctx.strokeStyle = "#3a2612";
      ctx.strokeRect(lx - sH * 0.022, ly - sH * 0.034, sH * 0.044, sH * 0.068);
      // a knife in the other hand catches the window light
      ctx.strokeStyle = "rgba(214,235,255,0.8)";
      ctx.lineWidth = Math.max(2, sH * 0.008);
      ctx.beginPath();
      ctx.moveTo(kx, ky - sH * 0.01);
      ctx.lineTo(kx - sH * 0.05, ky - sH * 0.13);
      ctx.stroke();
    };

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const st = stageRef.current;
      const tf = Math.max(0, (now - st.at) / 1000);
      ctx.clearRect(0, 0, w, h);

      if (st.name === "fall") drawFall(tf, dt);
      else if (st.name === "black") drawBlack(tf);
      else if (st.name === "wake") drawWake(tf);
      else drawCabin(tf);

      if (st.name === "wake") {
        const focus = smooth(0.15, 4.6, tf);
        canvas.style.filter = `blur(${((1 - focus) * 12).toFixed(2)}px)`;
        canvas.style.transform = `scale(${(1.025 - 0.025 * focus).toFixed(4)})`;
      } else {
        canvas.style.filter = "";
        canvas.style.transform = "";
      }

      let fade = 0;
      if (st.name === "fall") {
        fade = Math.max(1 - tf / 0.8, 0) + smooth(4.4, 5.0, tf);
      } else if (st.name === "black") {
        fade = 1;
      } else if (st.name === "wake") {
        fade = Math.max(1 - tf / 0.9, 0) + smooth(5.9, 6.7, tf);
      } else {
        fade = Math.max(1 - tf / 0.9, 0);
      }
      if (fadeRef.current) fadeRef.current.style.opacity = String(clamp01(fade));

      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[240] select-none overflow-hidden bg-black text-white">
      <canvas
        ref={canvasRef}
        aria-hidden
        className="absolute inset-0 h-full w-full"
        style={{ transformOrigin: "50% 58%" }}
      />
      <div ref={fadeRef} className="pointer-events-none absolute inset-0 bg-black" style={{ opacity: 1 }} />
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: "radial-gradient(ellipse at 50% 48%, rgba(0,0,0,0) 38%, rgba(2,4,8,0.72) 100%)" }}
      />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[62%] bg-gradient-to-t from-black/95 via-black/55 to-transparent" />

      <div className="pointer-events-none relative z-10 flex h-full min-h-[100dvh] w-full flex-col items-center justify-between px-5 py-7 sm:px-10 sm:py-9">
        <div className="text-center text-[10px] uppercase tracking-[0.5em] text-white/40 sm:text-xs">{t("aft_label")}</div>

        <div className="w-full max-w-2xl pb-16 text-center sm:pb-8">
          {stage === "fall" && (
            <p key="fall" className="anim-fade text-xl font-semibold leading-relaxed text-amber-50/95 drop-shadow-[0_2px_12px_rgba(0,0,0,0.9)] sm:text-3xl">
              {t("aft_fall")}
            </p>
          )}
          {stage === "black" && (
            <p key="black" className="anim-fade text-xl font-semibold leading-relaxed text-white/85 sm:text-3xl">
              {t("aft_black")}
            </p>
          )}
          {stage === "wake" && (
            <p key="wake" className="anim-fade mx-auto max-w-xl text-lg font-medium leading-relaxed text-white/90 drop-shadow-[0_2px_12px_rgba(0,0,0,0.9)] sm:text-2xl">
              {t("aft_wake")}
            </p>
          )}
          {stage === "cabin" && (
            <div key="cabin" className="anim-fade">
              <p className="mx-auto max-w-2xl text-base leading-relaxed text-white/90 drop-shadow-[0_2px_12px_rgba(0,0,0,0.95)] sm:text-xl">
                {t("aft_cabin")}
              </p>
              {canFinish && (
                <div className="anim-rise mt-4 sm:mt-6">
                  <p className="mx-auto max-w-xl text-sm italic leading-relaxed text-amber-100/90 sm:text-lg">
                    “{t("aft_stranger")}”
                  </p>
                  <p className="mt-1 text-[10px] uppercase tracking-[0.35em] text-amber-200/50 sm:text-xs">
                    {t("aft_stranger_name")}
                  </p>
                  <button
                    onClick={finish}
                    className="pointer-events-auto mt-5 rounded-xl bg-gradient-to-r from-amber-300 via-orange-400 to-amber-500 px-8 py-3.5 text-base font-black text-[#1a1205] shadow-[0_0_30px_rgba(255,170,70,0.5)] transition-transform hover:scale-105 active:scale-95 sm:mt-6"
                  >
                    {t("aft_stand")} ▸
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {stage !== "cabin" && (
        <button
          onClick={skip}
          className="absolute bottom-6 right-6 z-20 rounded-lg border border-white/15 bg-black/40 px-4 py-2 text-xs text-white/50 backdrop-blur transition-colors hover:bg-white/10 hover:text-white/80"
        >
          {t("skip")} ▸
        </button>
      )}

      <div
        className={`pointer-events-none absolute inset-0 z-[250] bg-black transition-opacity duration-700 ${leaving ? "opacity-100" : "opacity-0"}`}
      />
    </div>
  );
}
