import { Engine } from "./engine";
import { ITEMS } from "./world";
import { t, tItem } from "./i18n";

const GIVE_ITEMS: { id: string; n: number; label: string }[] = [
  { id: "wood", n: 50, label: "🪵 Дерево ×50" },
  { id: "stone", n: 50, label: "🪨 Камень ×50" },
  { id: "coal", n: 30, label: "⚫ Уголь ×30" },
  { id: "copper_ore", n: 30, label: "🟠 Медь ×30" },
  { id: "iron_ore", n: 30, label: "🔩 Железо ×30" },
  { id: "gold_ore", n: 30, label: "🟡 Золото ×30" },
  { id: "diamond", n: 20, label: "💎 Алмаз ×20" },
  { id: "wood_pickaxe", n: 1, label: "⛏️ Дер. кирка" },
  { id: "stone_pickaxe", n: 1, label: "⛏️ Кам. кирка" },
  { id: "iron_pickaxe", n: 1, label: "⛏️ Жел. кирка" },
  { id: "wood_sword", n: 1, label: "🗡️ Дер. меч" },
  { id: "iron_sword", n: 1, label: "⚔️ Жел. меч" },
  { id: "gold_sword", n: 1, label: "⚔️ Зол. меч" },
  { id: "torch", n: 30, label: "🔥 Факелы ×30" },
  { id: "crown", n: 1, label: "👑 Корона" },
];

function Row({ children, onClick, active }: { children: React.ReactNode; onClick: () => void; active?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg border px-3 py-2 text-left text-xs font-medium transition-colors ${
        active ? "border-amber-300 bg-amber-400/30 text-amber-100" : "border-white/15 bg-white/5 text-white/80 hover:bg-white/10"
      }`}
    >
      {children}
    </button>
  );
}

export default function CheatMenu({ engineRef, onClose }: { engineRef: React.MutableRefObject<Engine | null>; onClose: () => void }) {
  const e = engineRef.current;
  const fly = e?.getFly() ?? false;
  const god = e?.getGod() ?? false;
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 p-4 backdrop-blur-md">
      <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-amber-300/30 bg-[#0c0f1a]/95 shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-3">
          <div className="flex items-center gap-2">
            <span className="text-xl">🛸</span>
            <h2 className="text-lg font-black text-amber-200">{t("god_menu")}</h2>
            <span className="rounded bg-amber-400/20 px-2 py-0.5 text-[10px] uppercase tracking-widest text-amber-200/80">{t("cheat")}</span>
          </div>
          <button onClick={onClose} className="rounded-md bg-white/10 px-3 py-1 text-white hover:bg-white/20">
            ✕
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto p-5">
          <div className="mb-2 text-xs uppercase tracking-widest text-white/40">⚙️</div>
          <div className="mb-4 grid grid-cols-2 gap-2">
            <Row onClick={() => engineRef.current?.toggleFly()} active={fly}>
              ✈️ {t("ab_fly")} {fly ? t("on") : t("off")}
            </Row>
            <Row onClick={() => engineRef.current?.toggleGod()} active={god}>
              🛡️ {t("ab_god")} {god ? t("on") : t("off")}
            </Row>
            <Row onClick={() => engineRef.current?.healFull()}>❤️ {t("ab_heal")}</Row>
            <Row onClick={() => engineRef.current?.setDay()}>☀️ {t("ab_day")}</Row>
            <Row onClick={() => engineRef.current?.setNight()}>🌙 {t("ab_night")}</Row>
            <Row onClick={() => engineRef.current?.nextOreTier()}>📦 {t("ab_all")}</Row>
          </div>
          <div className="mb-2 text-xs uppercase tracking-widest text-white/40">{t("give_items")}</div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {GIVE_ITEMS.map((g) => (
              <Row key={g.id} onClick={() => engineRef.current?.giveItem(g.id, g.n)}>
                {ITEMS[g.id]?.icon ?? "❓"} {tItem(g.id)} ×{g.n}
              </Row>
            ))}
          </div>
          <p className="mt-4 text-[10px] text-white/30">{t("fly_hint")}</p>
        </div>
      </div>
    </div>
  );
}
