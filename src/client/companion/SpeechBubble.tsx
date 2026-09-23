import type { Line } from "./lines.js";

export function SpeechBubble({ line, onDismiss }: { line: Line; onDismiss: () => void }) {
  return (
    <button
      type="button"
      onClick={onDismiss}
      className="companion-bubble pointer-events-auto relative max-w-[min(18rem,calc(100vw-2rem))] rounded-2xl border border-black/10 bg-white px-4 py-3 text-left text-sm leading-snug text-ink shadow-lg dark:border-white/10 dark:bg-slate-800 dark:text-paper"
    >
      {line.map((s, i) => (typeof s === "string" ? <span key={i}>{s}</span> : <em key={i}>{s.em}</em>))}
      <span
        aria-hidden="true"
        className="absolute -bottom-1.5 right-8 h-3 w-3 rotate-45 border-b border-r border-black/10 bg-white dark:border-white/10 dark:bg-slate-800"
      />
    </button>
  );
}
