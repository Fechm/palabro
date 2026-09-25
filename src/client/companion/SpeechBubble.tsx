import type { Line } from "./lines.js";

export function SpeechBubble({ line, onDismiss }: { line: Line; onDismiss: () => void }) {
  return (
    <div
      onClick={onDismiss}
      className="companion-bubble pointer-events-auto relative w-full cursor-pointer rounded-2xl border border-black/10 bg-white py-3 pr-8 pl-4 text-left text-sm leading-snug text-ink shadow-lg dark:border-white/10 dark:bg-slate-800 dark:text-paper"
    >
      {line.map((s, i) => (typeof s === "string" ? <span key={i}>{s}</span> : <em key={i}>{s.em}</em>))}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onDismiss(); }}
        aria-label="Cerrar mensaje"
        className="absolute top-1.5 right-1.5 flex h-6 w-6 items-center justify-center rounded-full text-base leading-none opacity-40 hover:opacity-80"
      >
        ×
      </button>
      <span
        aria-hidden="true"
        className="absolute -right-1.5 bottom-4 h-3 w-3 rotate-45 border-t border-r border-black/10 bg-white dark:border-white/10 dark:bg-slate-800"
      />
    </div>
  );
}
