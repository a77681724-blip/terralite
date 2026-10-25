import { useState } from "react";
import { LANGS, setLang, getLang, type Lang } from "./i18n";
import sandboxBg from "./assets/sandbox-bg.jpg";

/** First-visit language picker modal. */
export default function LanguagePicker({ onDone }: { onDone: (l: Lang) => void }) {
  const [picked, setPicked] = useState<Lang>(getLang());
  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center overflow-hidden bg-[#05060d] text-white">
      <img src={sandboxBg} alt="" className="absolute inset-0 h-full w-full object-cover opacity-25" />
      <div className="absolute inset-0 bg-gradient-to-b from-[#05060d]/80 to-[#05060d]" />
      <div className="relative z-10 w-full max-w-md px-6 text-center">
        <div className="mb-5 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-300 to-orange-500 text-3xl shadow-[0_0_30px_rgba(255,170,70,0.5)]">
          ⛏️
        </div>
        <h1 className="title-gradient text-4xl font-black">TERRALITE</h1>
        <h2 className="mt-6 text-xl font-bold text-amber-100">Choose your language / Выберите язык / Alege limba</h2>
        <p className="mt-1 text-sm text-white/50">Select the language for the site and the game</p>

        <div className="mt-7 flex flex-col gap-2.5">
          {LANGS.map((l) => (
            <button
              key={l.code}
              onClick={() => setPicked(l.code)}
              className={`flex items-center gap-4 rounded-xl border px-6 py-4 text-left transition-all ${
                picked === l.code
                  ? "border-amber-300 bg-amber-400/20 ring-2 ring-amber-300/60"
                  : "border-white/15 bg-white/5 hover:bg-white/10"
              }`}
            >
              <span className="text-3xl">{l.flag}</span>
              <span className="text-lg font-semibold">{l.label}</span>
              {picked === l.code && <span className="ml-auto text-amber-300">✓</span>}
            </button>
          ))}
        </div>

        <button
          onClick={() => { setLang(picked); onDone(picked); }}
          className="mt-7 w-full rounded-xl bg-gradient-to-r from-amber-300 via-orange-400 to-amber-500 px-6 py-4 text-lg font-bold text-[#1a1205] shadow-[0_0_30px_rgba(255,170,70,0.5)] transition-transform hover:scale-[1.02] active:scale-95"
        >
          ▶
        </button>
      </div>
    </div>
  );
}
