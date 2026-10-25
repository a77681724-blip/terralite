import { useEffect, useState } from "react";

function detectMobile(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  const touch = navigator.maxTouchPoints > 1;
  const small = typeof window !== "undefined" && Math.min(window.innerWidth, window.innerHeight) < 900;
  return ua || (touch && small);
}

// Capture Android's "install app" prompt for later use
let deferredPrompt: any = null;
window.addEventListener("beforeinstallprompt", (e: any) => {
  e.preventDefault();
  deferredPrompt = e;
});

export function goFullscreen() {
  const el = document.documentElement as any;
  const req = el.requestFullscreen || el.webkitRequestFullscreen || el.webkitEnterFullscreen;
  if (req) {
    try {
      const r = req.call(el);
      if (r && r.catch) r.catch(() => {});
    } catch {
      /* ignore */
    }
  }
}

export default function MobileGate({ onPlay }: { onPlay: () => void }) {
  const [show, setShow] = useState(false);
  const [platform, setPlatform] = useState<"android" | "ios" | "other">("other");
  const [canInstall, setCanInstall] = useState(false);

  useEffect(() => {
    if (!detectMobile()) return;
    if (localStorage.getItem("terralite_mobile_skip") === "1") return;
    const isStandalone =
      window.matchMedia?.("(display-mode: standalone)")?.matches ||
      (window.navigator as any).standalone === true;
    if (isStandalone) return; // already running as fullscreen app
    setPlatform(/iPhone|iPad|iPod/i.test(navigator.userAgent) ? "ios" : "android");
    setShow(true);
    const t = setInterval(() => setCanInstall(!!deferredPrompt), 500);
    return () => clearInterval(t);
  }, []);

  if (!show) return null;

  const install = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      try {
        await deferredPrompt.userChoice;
      } catch {
        /* ignore */
      }
      deferredPrompt = null;
      setCanInstall(false);
    } else {
      goFullscreen();
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#05060d] p-6 text-white">
      <div className="absolute inset-0 opacity-30" style={{ background: "radial-gradient(circle at 50% 30%, rgba(120,80,200,0.5), transparent 60%)" }} />
      <div className="relative z-10 w-full max-w-md text-center">
        <div className="mb-4 inline-flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-300 to-orange-500 text-4xl shadow-[0_0_30px_rgba(255,170,70,0.5)]">
          ⛏️
        </div>
        <h1 className="title-gradient text-4xl font-black">TERRALITE</h1>
        <p className="mt-1 text-sm tracking-[0.3em] text-emerald-100/80">REALMS UNBOUND</p>

        <div className="mt-6 rounded-2xl border border-white/10 bg-black/40 p-5 backdrop-blur">
          <div className="text-base font-semibold text-amber-100">📱 Сыграй по-настоящему!</div>
          <p className="mt-2 text-sm leading-relaxed text-white/70">
            В браузере мешает адресная строка. Установи игру как приложение — она запустится на весь экран, как настоящая игра, без верхней панели браузера.
          </p>

          {/* primary action */}
          {platform === "ios" ? (
            <div className="mt-4 space-y-2 text-left text-xs text-white/75">
              <p className="flex items-center gap-2">
                1. Нажми кнопку «Поделиться» <span className="text-lg">⬆️</span> внизу Safari
              </p>
              <p className="flex items-center gap-2">
                2. Выбери <span className="font-semibold text-amber-200">«На экран „Домой"»</span> <span className="text-lg">➕</span>
              </p>
              <p>3. Открой с иконки на рабочем столе — игра пойдёт на весь экран!</p>
            </div>
          ) : (
            <></>
          )}

          <div className="mt-5 flex flex-col gap-2.5">
            <button
              onClick={install}
              className="w-full rounded-xl bg-gradient-to-r from-amber-300 to-orange-400 px-5 py-3.5 text-base font-bold text-[#1a1205] shadow-[0_0_24px_rgba(255,170,70,0.5)] transition-transform active:scale-95"
            >
              {canInstall ? "⬇ Установить игру" : "📺 Играть на весь экран"}
            </button>

            {platform !== "ios" && (
              <p className="text-[11px] text-white/45">
                Совет (Android): меню <span className="text-amber-200">⋮</span> → «Установить приложение»
              </p>
            )}

            <button
              onClick={() => {
                localStorage.setItem("terralite_mobile_skip", "1");
                setShow(false);
                onPlay();
              }}
              className="w-full rounded-xl border border-white/15 bg-white/5 px-5 py-3 text-sm font-medium text-white/70 transition-colors hover:bg-white/10"
            >
              Продолжить в браузере
            </button>
          </div>
        </div>
        <p className="mt-4 text-[11px] text-white/35">Бесплатно · работает офлайн после установки</p>
      </div>
    </div>
  );
}
