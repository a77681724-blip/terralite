import { useEffect, useMemo, useState } from "react";
import { audio } from "./audio";
import { t } from "./i18n";
import { ENDINGS, type EndingId } from "./story";

const sparks = Array.from({ length: 22 }, () => ({
  left: Math.random() * 100,
  size: 3 + Math.random() * 9,
  dur: 7 + Math.random() * 9,
  delay: Math.random() * 10,
}));

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
  const [shown, setShown] = useState(1);

  useEffect(() => {
    audio.setTrack(ending === "dawn" ? "day" : "menu");
  }, [ending]);

  useEffect(() => {
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
  }, [def.lines.length, ending]);

  const complete = shown >= def.lines.length;
  const revealed = useMemo(() => def.lines.slice(0, shown), [def.lines, shown]);

  return (
    <div className="fixed inset-0 z-[200] overflow-y-auto bg-[#04060c] text-white" onClick={() => !complete && setShown(def.lines.length)}>
      <div className="absolute inset-0" style={{ background: def.background }} />
      <div className="end-beam pointer-events-none absolute -top-1/3 left-1/2 h-[150vh] w-[60vw] -translate-x-1/2 rotate-12 blur-2xl" style={{ background: `linear-gradient(to bottom, ${def.glow}, transparent)` }} />
      {sparks.map((s, i) => (
        <span
          key={i}
          className="end-spark"
          style={{ left: `${s.left}%`, width: s.size, height: s.size, animationDuration: `${s.dur}s`, animationDelay: `${s.delay}s`, background: def.accent }}
        />
      ))}

      <div className="relative z-10 mx-auto flex min-h-[100dvh] w-full max-w-2xl flex-col items-center justify-center px-6 py-12 text-center">
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

        {!complete ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShown(def.lines.length);
            }}
            className="mt-10 text-xs uppercase tracking-[0.3em] text-white/40 transition-colors hover:text-white/70"
          >
            {t("skip")} ▸
          </button>
        ) : (
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
    </div>
  );
}
