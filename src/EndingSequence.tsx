import { useEffect, useState } from "react";
import { audio } from "./audio";
import sandboxBg from "./assets/sandbox-bg.jpg";
import { t } from "./i18n";

const sparks = Array.from({ length: 26 }, () => ({
  left: Math.random() * 100,
  size: 4 + Math.random() * 10,
  dur: 6 + Math.random() * 8,
  delay: Math.random() * 9,
}));

type Stage = "scene1" | "scene2" | "scene3" | "credits";

export default function EndingSequence({
  onContinueWorld,
  onNewWorld,
  onMenu,
}: {
  onContinueWorld: () => void;
  onNewWorld: () => void;
  onMenu: () => void;
}) {
  const [stage, setStage] = useState<Stage>("scene1");

  useEffect(() => {
    audio.setTrack("menu");
    const t1 = setTimeout(() => setStage("scene2"), 5200);
    const t2 = setTimeout(() => setStage("scene3"), 10500);
    const t3 = setTimeout(() => setStage("credits"), 15000);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, []);

  const skip = () => setStage("credits");

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center overflow-hidden bg-[#04060c] text-white">
      {/* backdrop */}
      <img src={sandboxBg} alt="" className="absolute inset-0 h-full w-full object-cover opacity-25" />
      <div className="absolute inset-0 bg-gradient-to-b from-[#04060c]/80 via-[#04060c]/70 to-[#04060c]" />

      {/* light beams from top */}
      <div className="end-beam pointer-events-none absolute -top-1/3 left-1/2 h-[150vh] w-[60vw] -translate-x-1/2 rotate-12 bg-gradient-to-b from-amber-200/30 to-transparent blur-2xl" />
      <div className="end-beam pointer-events-none absolute -top-1/3 left-1/3 h-[150vh] w-[30vw] -translate-x-1/2 -rotate-6 bg-gradient-to-b from-yellow-100/20 to-transparent blur-2xl" />

      {/* rising sparks */}
      {sparks.map((s, i) => (
        <span
          key={i}
          className="end-spark"
          style={{ left: `${s.left}%`, width: s.size, height: s.size, animationDuration: `${s.dur}s`, animationDelay: `${s.delay}s` }}
        />
      ))}

      {/* stage content */}
      <div className="relative z-10 w-full max-w-2xl px-8 text-center">
        {stage === "scene1" && (
          <div key="s1" className="end-in">
            <div className="mb-5 text-6xl">👑</div>
            <h1 className="end-title title-gradient font-display text-4xl font-black sm:text-6xl">{t("end_victory")}</h1>
            <p className="mt-6 text-lg leading-relaxed text-amber-50/80 sm:text-2xl">{t("end_king")}</p>
            <p className="mt-3 text-base text-white/60 sm:text-lg">{t("end_dust")}</p>
          </div>
        )}

        {stage === "scene2" && (
          <div key="s2" className="end-in">
            <div className="mb-5 text-5xl">🌅</div>
            <p className="text-xl leading-relaxed text-amber-50/90 sm:text-3xl">{t("end_light")}</p>
            <p className="mt-6 text-lg font-semibold text-emerald-200/90 sm:text-2xl">{t("end_warden")}</p>
          </div>
        )}

        {stage === "scene3" && (
          <div key="s3" className="end-in">
            <p className="text-2xl tracking-[0.3em] text-amber-100/90 sm:text-4xl">{t("end_tbc")}</p>
            <p className="mt-8 text-sm uppercase tracking-[0.4em] text-white/40">{t("end_chapter2")}</p>
          </div>
        )}

        {stage === "credits" && (
          <div key="s4" className="end-in">
            <div className="mb-4 text-5xl">⛏️</div>
            <p className="mb-2 text-xs uppercase tracking-[0.5em] text-white/40">{t("terralite_subtitle")}</p>
            <h1 className="end-title title-gradient font-display text-3xl font-black sm:text-5xl">{t("made_by")}</h1>
            <h2 className="end-title title-gradient font-display mt-2 text-4xl font-black sm:text-6xl">Maximgrg Dev Team</h2>
            <div className="mx-auto mt-8 h-px w-24 bg-gradient-to-r from-transparent via-amber-300/60 to-transparent" />
            <p className="mt-4 text-sm text-white/50">{t("thanks")}</p>

            <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <button
                onClick={onContinueWorld}
                className="rounded-xl bg-gradient-to-r from-amber-300 via-orange-400 to-amber-500 px-7 py-3.5 text-base font-bold text-[#1a1205] shadow-[0_0_30px_rgba(255,170,70,0.5)] transition-transform hover:scale-105"
              >
                ▶ {t("continue_world")}
              </button>
              <button
                onClick={onNewWorld}
                className="rounded-xl border border-white/25 bg-white/5 px-7 py-3.5 text-base font-semibold text-white/90 backdrop-blur transition-colors hover:bg-white/15"
              >
                🌍 {t("new_world")}
              </button>
              <button onClick={onMenu} className="text-sm text-white/45 transition-colors hover:text-white/70">
                {t("main_menu")}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* skip button */}
      {stage !== "credits" && (
        <button
          onClick={skip}
          className="absolute bottom-6 right-6 rounded-lg border border-white/15 bg-black/40 px-4 py-2 text-xs text-white/50 backdrop-blur transition-colors hover:bg-white/10 hover:text-white/80"
        >
          {t("skip")} ▸
        </button>
      )}
    </div>
  );
}
