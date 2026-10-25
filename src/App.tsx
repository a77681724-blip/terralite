import { memo, useCallback, useEffect, useRef, useState } from "react";
import { Engine, type EngineState } from "./engine";
import { AIR, GRASS, DIRT, STONE, WOOD, LEAVES, SAND, COPPER, IRON, GOLD, DIAMOND, COAL, PLANK, TORCH, GLASS, BEDROCK, WORKBENCH, FURNACE, PORTAL, WATER, ITEMS, RECIPES, type Station } from "./world";
import { audio } from "./audio";
import bg from "./assets/sandbox-bg.jpg";
import Landing from "./Landing";
import MobileGate, { goFullscreen } from "./MobileGate";
import CheatMenu from "./CheatMenu";
import EndingSequence from "./EndingSequence";
import LanguagePicker from "./LanguagePicker";
import { useT, t, tItem, tItemDesc, tQuest, getLang, setLang, hasChosenLang, LANGS } from "./i18n";

type Screen = "landing" | "title" | "story" | "howto" | "playing";

const ls = {
  get: (k: string, d: string) => {
    try {
      return localStorage.getItem(k) ?? d;
    } catch {
      return d;
    }
  },
  set: (k: string, v: string) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* ignore */
    }
  },
};

function stationLabel(s: Station): string {
  return s === "none" ? t("st_none") : s === "workbench" ? t("st_workbench") : t("st_furnace");
}

function itemIcon(id: string) {
  return ITEMS[id]?.icon ?? "❓";
}
function itemName(id: string) {
  return tItem(id);
}
/** Tint behind tool icons so each material is visually distinct. */
function itemTint(id: string): string | undefined {
  const it = ITEMS[id];
  if (it?.kind !== "tool") return undefined;
  return it.color; // wood brown, stone gray, copper orange, iron steel, gold
}
/** Renders an item icon, tinted by material for tools. */
function ItemGlyph({ id, className = "text-xl" }: { id: string; className?: string }) {
  const tint = itemTint(id);
  if (tint) {
    return (
      <span
        className={`inline-flex items-center justify-center rounded-md ${className}`}
        style={{ background: tint + "33", boxShadow: `inset 0 0 0 1px ${tint}66` }}
      >
        {itemIcon(id)}
      </span>
    );
  }
  return <span className={className}>{itemIcon(id)}</span>;
}

function Btn({
  children,
  onClick,
  variant = "ghost",
  className = "",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: "primary" | "ghost" | "danger" | "gold";
  className?: string;
}) {
  const base = "font-semibold tracking-wide uppercase rounded-xl px-6 py-3 text-sm transition-all duration-150 active:scale-95 select-none";
  const styles: Record<string, string> = {
    primary: "text-[#1a1205] bg-gradient-to-r from-[#ffe08a] via-[#ffcf6b] to-[#ffb24d] shadow-[0_0_24px_rgba(255,190,90,0.45)] hover:-translate-y-0.5",
    gold: "text-[#1a1205] bg-gradient-to-r from-[#fff2c4] to-[#ffcf66] shadow-[0_0_20px_rgba(255,200,100,0.4)] hover:-translate-y-0.5",
    ghost: "text-emerald-50 border border-emerald-200/30 bg-black/40 hover:bg-emerald-300/10 hover:border-emerald-200/60",
    danger: "text-rose-100 border border-rose-300/30 bg-rose-500/10 hover:bg-rose-500/20",
  };
  return (
    <button onClick={onClick} className={`${base} ${styles[variant]} ${className}`}>
      {children}
    </button>
  );
}

// ---------------- Minimap ----------------
function tileMinimapColor(id: number): string {
  switch (id) {
    case AIR: return "#111111";
    case GRASS: return "#4a8a2a";
    case DIRT: return "#8a5a32";
    case STONE: return "#8a8f9c";
    case WOOD: return "#5a3219";
    case LEAVES: return "#3f8f2f";
    case SAND: return "#e0c878";
    case COPPER: return "#c87a3a";
    case IRON: return "#c9a98f";
    case GOLD: return "#e7c84a";
    case DIAMOND: return "#6fe6e0";
    case COAL: return "#3a3d42";
    case PLANK: return "#b07a43";
    case TORCH: return "#ffcf6b";
    case GLASS: return "#bfe6ef";
    case BEDROCK: return "#2a2733";
    case WORKBENCH: return "#9a6a3a";
    case FURNACE: return "#5a5560";
    case PORTAL: return "#9933ff";
    case WATER: return "#3366cc";
    default: return "#000000";
  }
}

function Minimap({ engineRef, state }: { engineRef: React.MutableRefObject<Engine | null>; state: EngineState }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const render = () => {
      const eng = engineRef.current;
      if (!eng) { rafRef.current = requestAnimationFrame(render); return; }
      const world = eng.getWorldForMinimap();
      if (!world) { rafRef.current = requestAnimationFrame(render); return; }

      const scale = 4;
      const mw = Math.min(Math.floor(world.w / scale), 120);
      const mh = Math.min(Math.floor(world.h / scale), 120);
      const yOff = Math.max(0, Math.floor((120 - mh) / 2));

      ctx.fillStyle = "#111";
      ctx.fillRect(0, 0, 120, 120);

      for (let my = 0; my < mh; my++) {
        for (let mx = 0; mx < mw; mx++) {
          const tx = mx * scale;
          const ty = my * scale;
          if (tx >= world.w || ty >= world.h) continue;
          const tileId = world.tiles[ty * world.w + tx];
          ctx.fillStyle = tileMinimapColor(tileId);
          ctx.fillRect(mx, yOff + my, 1, 1);
        }
      }

      const ptx = Math.floor(state.playerTX / scale);
      const pty = Math.floor(state.playerTY / scale);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(ptx - 1, yOff + pty - 1, 3, 3);

      rafRef.current = requestAnimationFrame(render);
    };
    rafRef.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(rafRef.current);
  }, [engineRef, state]);

  return (
    <canvas
      ref={canvasRef}
      width={120}
      height={120}
      className="pointer-events-none"
      style={{ imageRendering: "pixelated" }}
    />
  );
}

// ---------------- Stage ----------------
const Stage = memo(function Stage({
  runId,
  mode,
  worldId,
  engineRef,
  onState,
  onGameOver,
  onVictory,
}: {
  runId: number;
  mode: "new" | "auto";
  worldId?: number | null;
  engineRef: React.MutableRefObject<Engine | null>;
  onState: (s: EngineState) => void;
  onGameOver: () => void;
  onVictory: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const cb = useRef({ onState, onGameOver, onVictory });
  cb.current = { onState, onGameOver, onVictory };
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const worldIdRef = useRef(worldId);
  worldIdRef.current = worldId;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const eng = new Engine(canvas, {
      onState: (s) => cb.current.onState(s),
      onGameOver: () => cb.current.onGameOver(),
      onVictory: () => cb.current.onVictory(),
    });
    engineRef.current = eng;
    if (worldIdRef.current !== null && worldIdRef.current !== undefined) {
      eng.startWithWorld(worldIdRef.current);
    } else {
      eng.start(modeRef.current);
    }
    return () => {
      eng.destroy();
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId]);

  return <canvas ref={canvasRef} className="block h-full w-full touch-none" />;
});

// ---------------- HUD ----------------
function Hearts({ hp, maxHp }: { hp: number; maxHp: number }) {
  const hearts = Math.ceil(maxHp / 20);
  return (
    <div className="flex flex-wrap gap-0.5">
      {Array.from({ length: hearts }).map((_, i) => {
        const full = hp >= (i + 1) * 20;
        const half = !full && hp > i * 20;
        return (
          <span key={i} className="text-xs leading-none drop-shadow sm:text-base" style={{ filter: full || half ? "drop-shadow(0 0 4px rgba(255,80,110,0.6))" : "none" }}>
            {full ? "❤️" : half ? "❤" : "🤍"}
          </span>
        );
      })}
    </div>
  );
}

function Clock({ dayFrac, isNight, dayCount }: { dayFrac: number; isNight: boolean; dayCount: number }) {
  const total = dayFrac * 24;
  const h = Math.floor(total);
  const m = Math.floor((total - h) * 60);
  const time = `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
  return (
    <div className="flex items-center gap-1 rounded-lg border border-white/15 bg-black/50 px-2 py-0.5 text-xs sm:gap-1.5 sm:px-3 sm:py-1 sm:text-sm">
      <span>{isNight ? "🌙" : "☀️"}</span>
      <span className="tabular-nums text-white/90">{time}</span>
      <span className="text-white/40">·</span>
      <span className="text-white/60">{t("day")} {dayCount}</span>
    </div>
  );
}

function Hud({
  s,
  onSelectSlot,
  onToggleInv,
  onPause,
}: {
  s: EngineState;
  onSelectSlot: (i: number) => void;
  onToggleInv: () => void;
  onPause: () => void;
}) {
  return (
    <div className="pointer-events-none absolute inset-0 select-none">
      {/* top-left vitals */}
      <div className="absolute left-2 top-2 space-y-0.5 sm:left-3 sm:top-3 sm:space-y-1">
        <Hearts hp={s.hp} maxHp={s.maxHp} />
        <div className="text-[10px] text-rose-100/80 sm:text-xs">
          {s.hp}/{s.maxHp}{s.defense > 0 ? ` ·🛡${s.defense}` : ""}
        </div>
      </div>

      {/* top-center clock */}
      <div className="absolute left-1/2 top-2 -translate-x-1/2 sm:top-3">
        <Clock dayFrac={s.dayFrac} isNight={s.isNight} dayCount={s.dayCount} />
      </div>

      {/* top-right quest + buttons */}
      <div className="absolute right-2 top-2 flex flex-col items-end gap-1.5 sm:right-3 sm:top-3 sm:gap-2">
        <div className="flex gap-1.5 sm:gap-2">
          <button onClick={onToggleInv} className="pointer-events-auto rounded-lg border border-white/15 bg-black/50 px-2.5 py-1.5 text-sm text-white/85 hover:bg-white/10 sm:px-3">
            🎒<span className="ml-1 hidden sm:inline">{t("inventory")}</span>
          </button>
          <button onClick={onPause} className="pointer-events-auto rounded-lg border border-white/15 bg-black/50 px-2.5 py-1.5 text-sm text-white/85 hover:bg-white/10 sm:px-3">
            ❚❚
          </button>
        </div>
        <div className="pointer-events-none w-40 rounded-lg border border-emerald-300/20 bg-black/55 p-1.5 backdrop-blur-sm sm:w-56 sm:rounded-xl sm:p-2.5">
          <div className="text-[9px] uppercase tracking-[0.15em] text-emerald-300/80 sm:text-[10px] sm:tracking-[0.2em]">{s.questDone ? t("all_complete") : t("quest")}</div>
          <div className="truncate text-xs font-semibold text-white/90 sm:text-sm">{tQuest(s.questIndex).title}</div>
          <div className="text-[11px] text-white/60 sm:text-xs leading-tight">{tQuest(s.questIndex).text}</div>
        </div>
      </div>

      {/* boss bar */}
      {s.boss && (
        <div className="absolute bottom-44 left-1/2 w-[80%] max-w-xl -translate-x-1/2 sm:bottom-24">
          <div className="mb-1 text-center text-xs font-semibold text-emerald-200 sm:text-sm">{t("slime_king")}</div>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-black/70 ring-1 ring-emerald-400/30 sm:h-3">
            <div className="h-full rounded-full bg-gradient-to-r from-emerald-600 to-lime-400 transition-[width] duration-150" style={{ width: `${(s.boss.hp / s.boss.maxHp) * 100}%` }} />
          </div>
        </div>
      )}

      {/* banner */}
      {s.banner && (
        <div key={s.banner.key} className="anim-banner absolute inset-x-0 top-[30%] flex flex-col items-center text-center">
          <div className="text-2xl font-black text-amber-200 drop-shadow-[0_2px_10px_rgba(0,0,0,0.8)] sm:text-3xl">{s.banner.title}</div>
          <div className="mt-1 text-sm uppercase tracking-[0.3em] text-white/80 sm:text-base">{s.banner.sub}</div>
        </div>
      )}

      {/* hotbar — sits ABOVE the touch controls on mobile */}
      <div className="absolute bottom-24 left-1/2 w-[94%] max-w-md -translate-x-1/2 sm:bottom-3">
        <div className="flex gap-0.5 rounded-2xl border border-white/10 bg-black/50 p-1 backdrop-blur-sm sm:gap-1 sm:p-1.5">
            {s.inventory.slice(0, 10).map((slot, i) => {
              const tip = slot ? (() => {
                const it = ITEMS[slot.id];
                let parts = [tItem(slot.id)];
                if (it?.dmg) parts.push(`⚔${it.dmg}`);
                if (it?.power) parts.push(`⛏${it.power}`);
                if (it?.tier !== undefined) parts.push(`T${it.tier}`);
                const desc = tItemDesc(slot.id);
                if (desc) parts.push(`— ${desc}`);
                return parts.join(" ");
              })() : "";
              return (
              <button
                key={i}
                title={tip}
                onClick={() => onSelectSlot(i)}
                className={`pointer-events-auto relative flex h-9 w-[10%] items-center justify-center rounded-lg border text-base transition-all sm:h-14 sm:text-2xl ${
                  s.selected === i ? "border-amber-300 bg-amber-300/20 ring-2 ring-amber-300/50" : "border-white/10 bg-white/5 hover:bg-white/10"
                }`}
              >
                <span className="absolute left-0.5 top-0 text-[7px] text-white/40 sm:text-[9px]">{(i + 1) % 10}</span>
                {slot && <ItemGlyph id={slot.id} className="text-base sm:text-2xl" />}
                {slot && slot.count > 1 && <span className="absolute bottom-0 right-0.5 text-[9px] font-bold text-white sm:text-[10px]">{slot.count}</span>}
              </button>);
            })}
        </div>
      </div>
    </div>
  );
}

// ---------------- Touch controls (mobile) ----------------
// Native low-latency touch button: attaches real touchstart/touchend listeners
// (bypassing React's synthetic event layer) for the minimum possible delay.
function TouchBtn({
  onDown,
  onUp,
  className,
  children,
  title,
}: {
  onDown: () => void;
  onUp: () => void;
  className: string;
  children: React.ReactNode;
  title?: string;
}) {
  const ref = useRef<HTMLButtonElement | null>(null);
  const downRef = useRef(onDown);
  const upRef = useRef(onUp);
  downRef.current = onDown;
  upRef.current = onUp;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // PURE touch handling, tracked per-finger (touchIdentifier). No pointer or
    // mouse events: mobile browsers synthesize mouse events ~300ms after touch,
    // which were racing with touchend and resetting movement. preventDefault on
    // a non-passive listener also suppresses that synthesis and the 300ms delay.
    let myTouch: number | null = null;
    const td = (e: TouchEvent) => {
      e.preventDefault();
      if (myTouch !== null) return; // already pressed by another finger
      myTouch = e.changedTouches[0].identifier;
      downRef.current();
    };
    const release = () => {
      if (myTouch === null) return;
      myTouch = null;
      upRef.current();
    };
    const tu = (e: TouchEvent) => {
      // only release when OUR finger lifts
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === myTouch) {
          e.preventDefault();
          release();
          return;
        }
      }
    };
    el.addEventListener("touchstart", td, { passive: false });
    el.addEventListener("touchend", tu, { passive: false });
    el.addEventListener("touchcancel", tu, { passive: false });
    return () => {
      el.removeEventListener("touchstart", td);
      el.removeEventListener("touchend", tu);
      el.removeEventListener("touchcancel", tu);
    };
  }, []);
  return (
    <button
      ref={ref}
      title={title}
      className={`touch-btn ${className}`}
      onContextMenu={(e) => e.preventDefault()}
    >
      {children}
    </button>
  );
}

function TouchControls({
  engineRef,
}: {
  engineRef: React.MutableRefObject<Engine | null>;
}) {
  const btn =
    "pointer-events-auto select-none flex items-center justify-center rounded-full border border-white/25 bg-black/40 backdrop-blur-sm active:bg-white/30";
  const noop = () => {};
  const [placeMode, setPlaceMode] = useState(false);
  const togglePlace = () => {
    const v = engineRef.current?.togglePlaceMode() ?? false;
    setPlaceMode(v);
  };
  return (
    <div className="pointer-events-none absolute inset-0 z-30 select-none">
      {/* movement — bottom left, pulled INWARD clear of Android's back-gesture zone */}
      <div
        className="absolute flex items-end gap-2"
        style={{
          left: "calc(26px + env(safe-area-inset-left))",
          bottom: "calc(18px + env(safe-area-inset-bottom))",
        }}
      >
        <TouchBtn onDown={() => engineRef.current?.setMoveLeft(true)} onUp={() => engineRef.current?.setMoveLeft(false)} className={`${btn} h-16 w-16 text-3xl text-white`}>
          ◀
        </TouchBtn>
        <TouchBtn onDown={() => engineRef.current?.setMoveRight(true)} onUp={() => engineRef.current?.setMoveRight(false)} className={`${btn} h-16 w-16 text-3xl text-white`}>
          ▶
        </TouchBtn>
      </div>

      {/* actions — bottom right, also clear of the right-edge gesture zone */}
      <div
        className="absolute flex items-end gap-2"
        style={{
          right: "calc(26px + env(safe-area-inset-right))",
          bottom: "calc(18px + env(safe-area-inset-bottom))",
        }}
      >
        <TouchBtn onDown={togglePlace} onUp={noop} className={`${btn} h-14 w-14 text-xl ${placeMode ? "border-amber-300 bg-amber-400/40" : "text-white/70"}`} title="Режим строительства">
          🧱
        </TouchBtn>
        <TouchBtn onDown={() => engineRef.current?.jumpNow()} onUp={noop} className={`${btn} h-[4.5rem] w-[4.5rem] text-3xl text-white`}>
          ⤴
        </TouchBtn>
      </div>
      {placeMode && (
        <div className="pointer-events-none absolute bottom-28 right-6 rounded-full bg-amber-400/20 px-3 py-1 text-[10px] text-amber-100">
          Режим строительства: тапни, куда поставить блок
        </div>
      )}
    </div>
  );
}

// ---------------- Inventory + Crafting ----------------
function InventoryPanel({
  s,
  onClose,
  onCraft,
  onConsume,
  onSummon,
  onSwap,
  onSelectSlot,
}: {
  s: EngineState;
  onClose: () => void;
  onCraft: (id: string) => void;
  onConsume: (id: string) => void;
  onSummon: () => void;
  onSwap: (a: number, b: number) => void;
  onSelectSlot: (i: number) => void;
}) {
  const sel = s.inventory[s.selected];
  const [tapSel, setTapSel] = useState<number | null>(null); // tap-to-move (desktop + mobile)
  return (
    <div className="anim-fade absolute inset-0 z-20 flex items-center justify-center bg-black/70 p-4 backdrop-blur-md">
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0c0f1a]/95 shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-3">
            <h2 className="text-lg font-bold text-amber-100">{t("inv_craft")}</h2>
            <div className="flex items-center gap-3 text-xs text-white/60">
              <span className={s.stations.workbench ? "text-emerald-300" : "text-white/30"}>🛠️ {t("workbench")} {s.stations.workbench ? "✓" : "✗"}</span>
              <span className={s.stations.furnace ? "text-emerald-300" : "text-white/30"}>🏭 {t("furnace")} {s.stations.furnace ? "✓" : "✗"}</span>
            <button onClick={onClose} className="rounded-md bg-white/10 px-3 py-1 text-white hover:bg-white/20">
              Close ✕
            </button>
          </div>
        </div>

        <div className="grid gap-4 overflow-y-auto p-5 md:grid-cols-2">
          {/* inventory grid */}
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-widest text-white/40">
              <span>{t("items")}</span>
              <span className="normal-case tracking-normal text-white/25">· {t("items_hint")}</span>
            </div>
            <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-8">
              {s.inventory.map((slot, i) => {
                const selectedSrc = tapSel === i;
                const isHotbarTarget = tapSel !== null && tapSel !== i;
                return (
                  <button
                    key={i}
                    onClick={() => {
                      audio.playSfx("click");
                      if (tapSel === null) {
                        // first tap: pick up this slot
                        setTapSel(i);
                        if (i < 10) onSelectSlot(i);
                      } else if (tapSel === i) {
                        // tap same slot again: cancel
                        setTapSel(null);
                      } else {
                        // tap another slot: move/swap/merge
                        onSwap(tapSel, i);
                        setTapSel(null);
                      }
                    }}
                    title={slot ? `${itemName(slot.id)} ×${slot.count}` : ""}
                    className={`relative flex aspect-square cursor-pointer items-center justify-center rounded-lg border text-xl transition-all ${
                      selectedSrc
                        ? "border-sky-300 bg-sky-400/30 ring-2 ring-sky-300 scale-105"
                        : isHotbarTarget
                        ? "border-emerald-300/60 bg-emerald-300/10 hover:bg-emerald-300/20"
                        : i === s.selected
                        ? "border-amber-300 bg-amber-300/20"
                        : i < 10
                        ? "border-white/15 bg-white/5 hover:bg-white/10"
                        : "border-white/5 bg-black/30 hover:bg-white/5"
                    }`}
                  >
                    {slot && <ItemGlyph id={slot.id} className="pointer-events-none select-none text-xl" />}
                    {slot && slot.count > 1 && (
                      <span className="pointer-events-none absolute bottom-0 right-0.5 text-[10px] font-bold text-white">{slot.count}</span>
                    )}
                    {i < 10 && <span className="pointer-events-none absolute left-0.5 top-0 text-[8px] text-white/30">{(i + 1) % 10}</span>}
                  </button>
                );
              })}
            </div>
            {/* selected item actions */}
            <div className="mt-3 rounded-lg border border-white/10 bg-black/30 p-3">
              {sel ? (
                <div>
                  <div className="text-sm font-semibold text-white">
                    {itemIcon(sel.id)} {itemName(sel.id)} <span className="text-white/40">×{sel.count}</span>
                  </div>
                  {tItemDesc(sel.id) && <div className="text-xs text-white/50">{tItemDesc(sel.id)}</div>}
                  <div className="mt-2 flex gap-2">
                    {sel.id === "apple" && (
                      <Btn variant="gold" className="px-4 py-1.5 text-xs" onClick={() => onConsume("apple")}>
                        🍎 {t("eat_hp")}
                      </Btn>
                    )}
                    {sel.id === "crown" && (
                      <Btn variant="primary" className="px-4 py-1.5 text-xs" onClick={onSummon}>
                        👑 {t("summon_king")} {s.isNight ? t("night_ok") : t("needs_night")}
                      </Btn>
                    )}
                  </div>
                </div>
              ) : (
                <div className="text-xs text-white/40">Hotbar slot {s.selected + 1} is empty.</div>
              )}
            </div>
          </div>

          {/* crafting */}
          <div>
            <div className="mb-2 text-xs uppercase tracking-widest text-white/40">Crafting</div>
            <div className="space-y-1.5">
              {RECIPES.map((r) => {
                const can = s.craftable.includes(r.id);
                const out = ITEMS[r.out];
                return (
                  <div key={r.id} className={`flex items-center gap-2 rounded-lg border p-2 ${can ? "border-emerald-400/30 bg-emerald-400/5" : "border-white/5 bg-black/20 opacity-60"}`}>
                    <span className="text-xl">{out.icon}</span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-semibold text-white/90">
                        {tItem(r.out)} <span className="text-white/40">×{r.outCount}</span>
                      </div>
                      <div className="flex flex-wrap gap-x-2 text-[10px] text-white/50">
                        <span className={s.stations[r.station as "workbench" | "furnace"] || r.station === "none" ? "text-emerald-300/70" : "text-rose-300/60"}>{stationLabel(r.station)}</span>
                        {r.ing.map((ing) => (
                          <span key={ing.id}>
                            {itemIcon(ing.id)} {ing.n}
                          </span>
                        ))}
                      </div>
                    </div>
                    <button
                      disabled={!can}
                      onClick={() => onCraft(r.id)}
                      className={`rounded-md px-3 py-1 text-xs font-semibold ${can ? "bg-emerald-400 text-emerald-950 hover:bg-emerald-300" : "bg-white/5 text-white/30"}`}
                    >
                      {t("craft")}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------- Title / Story / HowTo ----------------
const motes = Array.from({ length: 22 }, () => ({ left: Math.random() * 100, top: Math.random() * 100, size: 2 + Math.random() * 4, delay: Math.random() * 6, dur: 4 + Math.random() * 6, op: 0.2 + Math.random() * 0.4 }));

function TitleScreen({
  onPlay,
  onHowTo,
  bestDay,
  musicOn,
  sfxOn,
  toggleMusic,
  toggleSfx,
}: {
  onPlay: () => void;
  onHowTo: () => void;
  bestDay: number;
  musicOn: boolean;
  sfxOn: boolean;
  toggleMusic: () => void;
  toggleSfx: () => void;
}) {
  return (
    <div className="anim-fade relative h-full w-full overflow-hidden">
      <img src={bg} alt="" className="absolute inset-0 h-full w-full object-cover opacity-80" />
      <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/50 to-[#070a12]" />
      {motes.map((m, i) => (
        <span key={i} className="anim-float absolute rounded-full bg-amber-200" style={{ left: `${m.left}%`, top: `${m.top}%`, width: m.size, height: m.size, opacity: m.op, animationDelay: `${m.delay}s`, animationDuration: `${m.dur}s`, boxShadow: "0 0 8px #ffd277" }} />
      ))}
      <div className="relative z-10 flex h-full flex-col items-center justify-center px-6 text-center">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-amber-300/30 bg-black/40 px-4 py-1 text-[10px] uppercase tracking-[0.4em] text-amber-200/90 sm:text-xs">⛏ {t("tagline")}</div>
        <h1 className="title-gradient text-6xl font-black leading-none drop-shadow-2xl sm:text-8xl md:text-9xl">TERRALITE</h1>
        <p className="mt-2 text-base tracking-[0.4em] text-emerald-100/90 drop-shadow sm:text-xl">REALMS UNBOUND</p>
        <p className="mt-5 max-w-md text-sm text-white/70 sm:text-base">{t("hero_p")}</p>
        <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row">
          <Btn variant="primary" className="px-12 py-4 text-lg" onClick={onPlay}>
            ▶ {t("play")}
          </Btn>
          <Btn variant="ghost" onClick={onHowTo}>
            {t("how_to_play")}
          </Btn>
        </div>
        <div className="mt-6 flex gap-2">
          <button onClick={toggleMusic} className="flex items-center gap-2 rounded-lg border border-white/15 bg-black/30 px-3 py-1.5 text-xs uppercase tracking-wider text-white/80 hover:bg-white/10">
            {musicOn ? "🔊" : "🔇"} {t("music")}
          </button>
          <button onClick={toggleSfx} className="flex items-center gap-2 rounded-lg border border-white/15 bg-black/30 px-3 py-1.5 text-xs uppercase tracking-wider text-white/80 hover:bg-white/10">
            {sfxOn ? "🔊" : "🔇"} {t("sound")}
          </button>
        </div>
        <div className="absolute bottom-4 flex flex-col items-center gap-1 text-[11px] text-white/40">
          <div>
            {t("deepest_run")} · {t("day")} <span className="text-amber-200/80">{bestDay}</span>
          </div>
          <div>{t("free_play")}</div>
        </div>
      </div>
    </div>
  );
}

function StoryScreen({ onBegin, onBack }: { onBegin: () => void; onBack: () => void }) {
  const [page, setPage] = useState(0);
  const PAGES = 4;
  const last = page === PAGES - 1;
  return (
    <div className="anim-fade relative flex h-full w-full items-center justify-center bg-[#070a12] px-6">
      <div className="pointer-events-none absolute inset-0 opacity-30" style={{ background: "radial-gradient(circle at 50% 30%, rgba(80,160,90,0.4), transparent 60%)" }} />
      <div className="relative z-10 max-w-2xl text-center">
        <div className="mb-8 text-xs uppercase tracking-[0.5em] text-emerald-300/70">{t("story_begin")}</div>
        <p key={page} className="anim-rise text-xl leading-relaxed text-white/90 sm:text-2xl" style={{ minHeight: "8em" }}>
          {t(`s${page + 1}`)}
        </p>
        <div className="mt-10 flex items-center justify-center gap-2">
          {Array.from({ length: PAGES }).map((_, i) => (
            <span key={i} className={`h-1.5 rounded-full transition-all ${i === page ? "w-8 bg-amber-300" : "w-3 bg-white/20"}`} />
          ))}
        </div>
        <div className="mt-8 flex items-center justify-center gap-3">
          {page > 0 ? (
            <Btn variant="ghost" onClick={() => setPage((p) => p - 1)}>
              ←
            </Btn>
          ) : (
            <Btn variant="ghost" onClick={onBack}>
              {t("main_menu")}
            </Btn>
          )}
          {last ? (
            <Btn variant="primary" onClick={onBegin}>
              {t("begin_journey")} ▶
            </Btn>
          ) : (
            <Btn variant="gold" onClick={() => setPage((p) => p + 1)}>
              {t("continue")} →
            </Btn>
          )}
        </div>
      </div>
    </div>
  );
}

function HowToScreen({ onBack }: { onBack: () => void }) {
  const HOWTO = [
    { h: t("h1t"), d: t("h1d") },
    { h: t("h2t"), d: t("h2d") },
    { h: t("h3t"), d: t("h3d") },
    { h: t("h4t"), d: t("h4d") },
    { h: t("h5t"), d: t("h5d") },
    { h: t("h6t"), d: t("h6d") },
  ];
  return (
    <div className="anim-fade h-full w-full overflow-y-auto bg-[#070a12] px-6 py-10">
      <div className="mx-auto max-w-2xl">
        <h2 className="text-3xl font-bold text-amber-100 sm:text-4xl">{t("how_title")}</h2>
        <p className="mt-2 text-sm text-white/55">{t("how_sub")}</p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {HOWTO.map((c) => (
            <div key={c.h} className="rounded-2xl border border-emerald-300/20 bg-white/5 p-5">
              <div className="mb-1.5 text-lg font-semibold text-emerald-100">{c.h}</div>
              <div className="text-sm text-white/65">{c.d}</div>
            </div>
          ))}
        </div>
        <div className="mt-6 text-center">
          <Btn variant="ghost" onClick={onBack}>
            ← {t("main_menu")}
          </Btn>
        </div>
      </div>
    </div>
  );
}

// ---------------- App ----------------
export default function App() {
  useT(); // re-render on language change
  const [needLang, setNeedLang] = useState<boolean>(() => !hasChosenLang());
  const [screen, setScreen] = useState<Screen>("landing");
  const [runId, setRunId] = useState(0);
  const [startMode, setStartMode] = useState<"new" | "auto">("auto");
  const [playWorldId, setPlayWorldId] = useState<number | null>(null);
  const [state, setState] = useState<EngineState | null>(null);
  const [invOpen, setInvOpen] = useState(false);
  const [pauseOpen, setPauseOpen] = useState(false);
  const [cheatOpen, setCheatOpen] = useState(false);
  const [ended, setEnded] = useState<null | "over" | "win">(null);
  const [bestDay, setBestDay] = useState<number>(() => parseInt(ls.get("terralite_bestday", "0"), 10) || 0);
  const [musicOn, setMusicOn] = useState<boolean>(() => ls.get("terralite_music", "1") !== "0");
  const [sfxOn, setSfxOn] = useState<boolean>(() => ls.get("terralite_sfx", "1") !== "0");
  const engineRef = useRef<Engine | null>(null);
  const [shakeX, setShakeX] = useState(0);
  const [shakeY, setShakeY] = useState(0);
  const [howtoOpen, setHowtoOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const prevHpRef = useRef(0);
  const prevSaveRef = useRef(0);
  const shakeTimeoutRef = useRef(0);

  // unlock audio
  useEffect(() => {
    const unlock = () => {
      audio.ensure();
      if (musicOn) audio.setTrack("menu");
      window.removeEventListener("pointerdown", unlock);
    };
    window.addEventListener("pointerdown", unlock);
    return () => window.removeEventListener("pointerdown", unlock);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    audio.setMusic(musicOn);
    ls.set("terralite_music", musicOn ? "1" : "0");
  }, [musicOn]);
  useEffect(() => {
    audio.setSfx(sfxOn);
    ls.set("terralite_sfx", sfxOn ? "1" : "0");
  }, [sfxOn]);

  // sync engine UI/pause states
  useEffect(() => {
    engineRef.current?.setUiOpen(invOpen || cheatOpen);
    engineRef.current?.setPaused(pauseOpen);
  }, [invOpen, pauseOpen, cheatOpen]);

  const onState = useCallback((s: EngineState) => {
    if (prevHpRef.current > 0 && s.hp < prevHpRef.current) {
      const intensity = Math.min(8, (prevHpRef.current - s.hp) * 0.5);
      window.clearTimeout(shakeTimeoutRef.current);
      setShakeX((Math.random() - 0.5) * intensity * 2);
      setShakeY((Math.random() - 0.5) * intensity * 2);
      shakeTimeoutRef.current = window.setTimeout(() => {
        setShakeX(0);
        setShakeY(0);
      }, 150);
    }
    prevHpRef.current = s.hp;
    if (s.savedAt !== prevSaveRef.current) {
      prevSaveRef.current = s.savedAt;
      setSaving(true);
      setTimeout(() => setSaving(false), 1000);
    }
    setState(s);
  }, []);
  const onGameOver = useCallback(() => {
    setEnded("over");
    const day = state?.dayCount ?? 1;
    if (day > bestDay) {
      setBestDay(day);
      ls.set("terralite_bestday", String(day));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bestDay]);
  const onVictory = useCallback(() => {
    setEnded("win");
    const day = state?.dayCount ?? 1;
    if (day > bestDay) {
      setBestDay(day);
      ls.set("terralite_bestday", String(day));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bestDay]);

  const click = () => audio.playSfx("click");

  const beginGame = () => {
    click();
    setState(null);
    setEnded(null);
    setInvOpen(false);
    setPauseOpen(false);
    setStartMode("auto");
    setPlayWorldId(null);
    setRunId((r) => r + 1);
    setScreen("playing");
  };
  const selectWorld = (id: number) => {
    click();
    setState(null);
    setEnded(null);
    setInvOpen(false);
    setPauseOpen(false);
    setStartMode("auto");
    setPlayWorldId(id);
    setRunId((r) => r + 1);
    setScreen("playing");
  };
  const retry = () => {
    click();
    setState(null);
    setEnded(null);
    setInvOpen(false);
    setPauseOpen(false);
    setStartMode("new");
    setPlayWorldId(null);
    setRunId((r) => r + 1);
    setScreen("playing");
  };
  const continueInWorld = () => {
    click();
    engineRef.current?.resumeAfterVictory();
    setEnded(null);
    setScreen("playing");
  };
  const toMenu = () => {
    click();
    audio.setTrack("menu");
    window.scrollTo(0, 0);
    setScreen("landing");
    setEnded(null);
    setInvOpen(false);
    setPauseOpen(false);
    setPlayWorldId(null);
  };
  const selectSlot = (i: number) => {
    engineRef.current?.selectSlot(i);
  };

  // keyboard for UI toggles
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (screen !== "playing") return;
      if (e.code === "KeyE") {
        e.preventDefault();
        setInvOpen((v) => !v);
        audio.playSfx("click");
      } else if (e.code === "Escape") {
        e.preventDefault();
        if (invOpen) setInvOpen(false);
        else setPauseOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [screen, invOpen]);

  const playing = screen === "playing";
  const [isTouch, setIsTouch] = useState(false);
  useEffect(() => {
    setIsTouch(typeof window !== "undefined" && ("ontouchstart" in window || navigator.maxTouchPoints > 0));
  }, []);

  // SECRET GOD MENU: hold ALL of F1..F10 at once to open it.
  const fkeys = useRef<Set<string>>(new Set());
  useEffect(() => {
    const codes = Array.from({ length: 10 }, (_, i) => `F${i + 1}`);
    const kd = (e: KeyboardEvent) => {
      if (codes.includes(e.code)) {
        e.preventDefault();
        fkeys.current.add(e.code);
        if (fkeys.current.size >= 10) setCheatOpen(true);
      }
    };
    const ku = (e: KeyboardEvent) => {
      if (codes.includes(e.code)) {
        e.preventDefault();
        fkeys.current.delete(e.code);
      }
    };
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    return () => {
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
    };
  }, []);

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#070a12] text-white">
      {needLang && (
        <LanguagePicker
          onDone={() => setNeedLang(false)}
        />
      )}
      <MobileGate onPlay={beginGame} />
      {playing && (
        <div className="absolute inset-0">
          {/* Shake container — only the game viewport shakes */}
          <div
            className="absolute inset-0"
            style={{ transform: `translate(${shakeX.toFixed(1)}px, ${shakeY.toFixed(1)}px)` }}
          >
            <Stage runId={runId} mode={startMode} worldId={playWorldId} engineRef={engineRef} onState={onState} onGameOver={onGameOver} onVictory={onVictory} />
          </div>
          {state && !ended && <Hud s={state} onSelectSlot={selectSlot} onToggleInv={() => setInvOpen(true)} onPause={() => setPauseOpen(true)} />}
          {state && !ended && !invOpen && !pauseOpen && (
            <div className="absolute bottom-28 left-3 z-10 rounded-lg border border-white/10 bg-black/60 p-1 backdrop-blur-sm">
              <Minimap engineRef={engineRef} state={state} />
            </div>
          )}
          {isTouch && state && !ended && !invOpen && !pauseOpen && (
            <TouchControls
              engineRef={engineRef}
            />
          )}
          {state && !ended && state.nearPortal && !invOpen && !pauseOpen && (
            <div className="absolute left-1/2 top-[12%] z-10 -translate-x-1/2 animate-pulse rounded-xl border border-purple-400/40 bg-purple-900/60 px-5 py-2 text-sm font-semibold text-purple-100 shadow-lg backdrop-blur-sm">
              {t("near_portal")}
            </div>
          )}
          {saving && (
            <div className="absolute right-4 top-12 z-10 rounded-lg border border-white/10 bg-black/60 px-3 py-1.5 text-xs text-white/80 backdrop-blur-sm">
              💾 {t("saving")}
            </div>
          )}
          {state && invOpen && !ended && (
            <InventoryPanel
              s={state}
              onClose={() => setInvOpen(false)}
              onCraft={(id) => engineRef.current?.craft(id)}
              onConsume={(id) => engineRef.current?.consume(id)}
              onSummon={() => engineRef.current?.summonBoss()}
              onSwap={(a, b) => engineRef.current?.swapSlots(a, b)}
              onSelectSlot={(i) => engineRef.current?.selectSlot(i)}
            />
          )}
          {pauseOpen && !ended && (
            <div className="anim-fade absolute inset-0 z-20 flex items-center justify-center bg-black/70 backdrop-blur-md">
              <div className="w-full max-w-sm text-center">
                <div className="text-4xl font-bold text-white/90">{t("paused")}</div>
                <div className="mt-6 flex flex-col items-center gap-3">
                  <Btn variant="primary" onClick={() => setPauseOpen(false)}>
                    {t("resume")}
                  </Btn>
                  <Btn variant="ghost" onClick={() => { engineRef.current?.saveGameNow(); toMenu(); }}>
                    💾 {t("save_quit")}
                  </Btn>
                  <Btn variant="ghost" onClick={() => { setPauseOpen(false); setHowtoOpen(true); }}>
                    ❓ {t("controls_btn")}
                  </Btn>
                  <Btn variant="danger" onClick={retry}>
                    {t("restart_world")}
                  </Btn>
                  <Btn variant="ghost" onClick={toMenu}>
                    {t("quit_menu")}
                  </Btn>
                </div>
                <div className="mt-5 flex flex-wrap justify-center gap-2">
                  <button onClick={goFullscreen} className="rounded-lg border border-amber-300/30 bg-amber-400/10 px-3 py-1.5 text-xs text-amber-100 hover:bg-amber-400/20">
                    📺 {t("fullscreen")}
                  </button>
                  <button onClick={() => setMusicOn((v) => !v)} className="rounded-lg border border-white/15 bg-black/40 px-3 py-1.5 text-xs text-white/80 hover:bg-white/10">
                    {musicOn ? "🔊" : "🔇"} {t("music")}
                  </button>
                  <button onClick={() => setSfxOn((v) => !v)} className="rounded-lg border border-white/15 bg-black/40 px-3 py-1.5 text-xs text-white/80 hover:bg-white/10">
                    {sfxOn ? "🔊" : "🔇"} {t("sound")}
                  </button>
                </div>
                {/* language switcher */}
                <div className="mt-4 flex flex-wrap items-center justify-center gap-1.5">
                  {LANGS.map((l) => (
                    <button
                      key={l.code}
                      onClick={() => setLang(l.code)}
                      className={`rounded-lg border px-2.5 py-1 text-xs ${getLang() === l.code ? "border-amber-300 bg-amber-400/20 text-amber-100" : "border-white/15 bg-black/40 text-white/70 hover:bg-white/10"}`}
                    >
                      {l.flag} {l.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
          {howtoOpen && (
            <div className="anim-fade absolute inset-0 z-30 flex items-center justify-center bg-black/80 backdrop-blur-md">
              <div className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-white/10 bg-[#070a12] p-6 shadow-2xl">
                <HowToScreen onBack={() => setHowtoOpen(false)} />
              </div>
            </div>
          )}
          {ended === "win" && state && (
            <EndingSequence onContinueWorld={continueInWorld} onNewWorld={retry} onMenu={toMenu} />
          )}
          {ended === "over" && state && (
            <div className="anim-fade absolute inset-0 z-30 flex items-center justify-center px-6">
              <div className="absolute inset-0" style={{ background: "radial-gradient(circle at 50% 40%, rgba(150,40,60,0.28), rgba(7,10,18,0.96))" }} />
              <div className="relative z-10 w-full max-w-md text-center">
                <div className="text-5xl font-black sm:text-7xl text-rose-300">{t("you_died")}</div>
                <p className="mt-3 text-sm text-white/70 sm:text-base">{t("died_text")}</p>
                <div className="mx-auto mt-7 grid max-w-xs grid-cols-2 gap-3 text-left">
                  <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                    <div className="text-[10px] uppercase tracking-widest text-white/45">{t("day_reached")}</div>
                    <div className="text-xl font-bold text-amber-100">{state.dayCount}</div>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                    <div className="text-[10px] uppercase tracking-widest text-white/45">{t("quests")}</div>
                    <div className="text-xl font-bold text-amber-100">{state.questDone ? "ALL" : "—"}</div>
                  </div>
                </div>
                <div className="mt-8 flex justify-center gap-3">
                  <Btn variant="primary" onClick={retry}>
                    {t("new_world")}
                  </Btn>
                  <Btn variant="ghost" onClick={toMenu}>
                    {t("main_menu")}
                  </Btn>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {screen === "title" && (
        <TitleScreen
          onPlay={() => {
            click();
            setScreen("story");
          }}
          onHowTo={() => {
            click();
            setScreen("howto");
          }}
          bestDay={bestDay}
          musicOn={musicOn}
          sfxOn={sfxOn}
          toggleMusic={() => setMusicOn((v) => !v)}
          toggleSfx={() => setSfxOn((v) => !v)}
        />
      )}
      {screen === "landing" && (
        <Landing
          onPlay={() => {
            audio.ensure();
            click();
            beginGame();
          }}
          onSelectWorld={(id) => {
            audio.ensure();
            click();
            selectWorld(id);
          }}
        />
      )}
      {screen === "story" && <StoryScreen onBegin={beginGame} onBack={toMenu} />}
      {screen === "howto" && <HowToScreen onBack={() => { click(); setScreen("landing"); }} />}
      {cheatOpen && playing && <CheatMenu engineRef={engineRef} onClose={() => setCheatOpen(false)} />}
    </div>
  );
}
