import gb from "./assets/flags/gb.png";
import ru from "./assets/flags/ru.png";
import md from "./assets/flags/md.png";
import type { Lang } from "./i18n";

export const FLAGS: Record<Lang, string> = { en: gb, ru, ro: md };

export function Flag({ code, className = "h-6 w-9" }: { code: Lang; className?: string }) {
  return (
    <img
      src={FLAGS[code]}
      alt=""
      draggable={false}
      className={`shrink-0 rounded-[3px] object-cover ring-1 ring-white/25 ${className}`}
    />
  );
}
