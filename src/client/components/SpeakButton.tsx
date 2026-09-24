import { canSpeak, speak } from "../lib/audio.js";

export function SpeakButton({ text, audioUrl, label }: { text: string; audioUrl?: string | null; label: string }) {
  if (!canSpeak(audioUrl)) return null;
  return (
    <button
      type="button"
      onClick={() => speak(text, audioUrl)}
      aria-label={label}
      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-500/10 text-indigo-500 transition hover:bg-indigo-500/20"
    >
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"
        strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M11 5 6 9H3v6h3l5 4V5Z" />
        <path d="M15.5 8.5a5 5 0 0 1 0 7" />
        <path d="M18.5 5.5a9 9 0 0 1 0 13" />
      </svg>
    </button>
  );
}
