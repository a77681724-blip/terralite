import { useCallback, useEffect, useState } from "react";
import { audio } from "./audio";
import { t } from "./i18n";
import { SCENES, SPEAKERS } from "./story";

export default function StoryOverlay({
  storyId,
  onAdvance,
}: {
  storyId: string;
  onAdvance: () => void;
}) {
  const scene = SCENES[storyId];
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    setIdx(0);
  }, [storyId]);

  const lines = scene?.lines ?? [];
  const last = idx >= lines.length - 1;

  const next = useCallback(() => {
    audio.playSfx("click");
    if (!last) {
      setIdx((i) => i + 1);
      return;
    }
    onAdvance();
  }, [last, onAdvance]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.code === "Space" || e.code === "Enter" || e.code === "ArrowRight") {
        e.preventDefault();
        next();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [next]);

  if (!scene) return null;

  const line = lines[Math.min(idx, lines.length - 1)];
  const sp = line ? SPEAKERS[line.who] : null;
  const isNarrator = line?.who === "narrator";

  return (
    <div
      className="fixed inset-0 z-[150] flex cursor-pointer flex-col justify-end overflow-y-auto bg-gradient-to-b from-black/20 via-black/40 to-black/85"
      onClick={next}
    >
      <div className="pointer-events-none absolute left-1/2 top-6 -translate-x-1/2 rounded-full border border-white/15 bg-black/50 px-5 py-1.5 text-[10px] uppercase tracking-[0.35em] text-white/70 backdrop-blur-sm sm:text-xs">
        {t(scene.act)}
      </div>

      {line && sp && (
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
        </div>
      )}
    </div>
  );
}
