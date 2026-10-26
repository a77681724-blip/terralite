import { useCallback, useEffect, useMemo, useState } from "react";
import { audio } from "./audio";
import { t } from "./i18n";
import { FINAL_CHOICES, SCENES, SECRET_TRUST, SPEAKERS } from "./story";

export default function StoryOverlay({
  storyId,
  heirFed,
  onAdvance,
  onChoose,
}: {
  storyId: string;
  heirFed: number;
  onAdvance: () => void;
  onChoose: (id: string) => void;
}) {
  const scene = SCENES[storyId];
  const trusted = heirFed >= SECRET_TRUST;
  const lines = useMemo(
    () => (scene ? scene.lines.filter((l) => !l.when || (l.when === "dawn" ? trusted : !trusted)) : []),
    [scene, trusted]
  );
  const [idx, setIdx] = useState(0);
  const [choicesOpen, setChoicesOpen] = useState(false);

  useEffect(() => {
    setIdx(0);
    setChoicesOpen(false);
  }, [storyId]);

  const last = idx >= lines.length - 1;

  const next = useCallback(() => {
    audio.playSfx("click");
    if (!last) {
      setIdx((i) => i + 1);
      return;
    }
    if (scene?.final) {
      setChoicesOpen(true);
      return;
    }
    onAdvance();
  }, [last, scene, onAdvance]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.code === "Space" || e.code === "Enter" || e.code === "ArrowRight") {
        e.preventDefault();
        if (!choicesOpen) next();
      } else if (e.code === "Escape" && !scene?.final) {
        e.preventDefault();
        onAdvance();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [next, choicesOpen, scene, onAdvance]);

  if (!scene) return null;

  const line = lines[Math.min(idx, lines.length - 1)];
  const sp = line ? SPEAKERS[line.who] : null;
  const isNarrator = line?.who === "narrator";

  return (
    <div
      className="fixed inset-0 z-[150] flex flex-col justify-end bg-gradient-to-b from-black/20 via-black/40 to-black/85"
      onClick={() => {
        if (!choicesOpen) next();
      }}
    >
      {/* act header */}
      <div className="pointer-events-none absolute left-1/2 top-6 -translate-x-1/2 rounded-full border border-white/15 bg-black/50 px-5 py-1.5 text-[10px] uppercase tracking-[0.35em] text-white/70 backdrop-blur-sm sm:text-xs">
        {t(scene.act)}
      </div>

      {!choicesOpen && line && sp && (
        <div className="mx-auto w-full max-w-3xl px-4 pb-8 sm:pb-12">
          <div key={`${storyId}-${idx}`} className="anim-rise rounded-2xl border border-white/15 bg-[#070a12]/90 p-5 shadow-2xl backdrop-blur-md sm:p-7">
            <div className="flex items-start gap-4">
              {!isNarrator && (
                <div
                  className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-2 text-2xl sm:h-16 sm:w-16 sm:text-3xl"
                  style={{ borderColor: sp.color, boxShadow: `0 0 22px ${sp.color}55`, background: `${sp.color}1a` }}
                >
                  {sp.icon}
                </div>
              )}
              <div className="min-w-0 flex-1">
                {!isNarrator && (
                  <div className="mb-1.5 text-xs font-bold uppercase tracking-[0.25em]" style={{ color: sp.color }}>
                    {t(sp.nameKey)}
                  </div>
                )}
                <p
                  className={
                    isNarrator
                      ? "text-center text-base italic leading-relaxed text-white/75 sm:text-lg"
                      : "text-base leading-relaxed text-white/90 sm:text-lg"
                  }
                >
                  {t(line.key)}
                </p>
              </div>
            </div>
            <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-3">
              <div className="flex gap-1.5">
                {lines.map((_, i) => (
                  <span
                    key={i}
                    className={`h-1.5 rounded-full transition-all ${i <= idx ? "w-5" : "w-1.5 bg-white/15"}`}
                    style={{ background: i <= idx ? sp.color : undefined }}
                  />
                ))}
              </div>
              <div className="flex items-center gap-3 text-[11px] uppercase tracking-widest text-white/40">
                {t("c2_tap")} <span className="text-lg leading-none text-white/70">▸</span>
              </div>
            </div>
          </div>
          {scene.final && last && (
            <div className="mt-3 text-center text-[10px] uppercase tracking-[0.3em] text-amber-200/50">{t("c2_choice_hint")} ▸</div>
          )}
        </div>
      )}

      {choicesOpen && (
        <div className="mx-auto w-full max-w-4xl px-4 pb-10">
          <div className="anim-rise">
            <div className="mb-5 text-center text-xs uppercase tracking-[0.4em] text-white/50">{t("c2_choice_hint")}</div>
            <div className="grid gap-3 sm:grid-cols-3">
              {FINAL_CHOICES.map((c) => {
                const locked = c.secret && !trusted;
                const enabled = !locked;
                return (
                  <button
                    key={c.id}
                    disabled={locked}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!enabled) return;
                      audio.playSfx("victory");
                      onChoose(c.id);
                    }}
                    className={`group relative flex flex-col items-start gap-2 rounded-2xl border p-4 text-left transition-all sm:p-5 ${
                      locked
                        ? "cursor-not-allowed border-white/10 bg-black/40 opacity-50"
                        : "cursor-pointer border-white/20 bg-[#0c1018]/90 hover:-translate-y-1 hover:bg-white/10"
                    }`}
                    style={enabled ? { boxShadow: `0 0 0 1px ${c.accent}22, 0 12px 30px -12px ${c.accent}66` } : undefined}
                  >
                    <div className="text-3xl" style={{ color: c.accent }}>
                      {locked ? "🔒" : c.icon}
                    </div>
                    <div className="text-base font-black text-white" style={enabled ? { color: c.accent } : undefined}>
                      {locked ? "??? ???" : t(c.titleKey)}
                    </div>
                    <div className="text-xs leading-relaxed text-white/55">
                      {locked ? `${t("c2_feed")} · ${heirFed}/${SECRET_TRUST}` : t(c.descKey)}
                    </div>
                    {!locked && (
                      <div className="mt-1 text-[10px] uppercase tracking-[0.25em] text-white/30 group-hover:text-white/60">{t("continue")} ▸</div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
