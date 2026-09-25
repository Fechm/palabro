import { useEffect, useState } from "react";
import { ANIMATIONS, FRAME_WIDTH, type AnimName } from "./animations.js";

const BODY_WIDTH = 60;
import { SpeechBubble } from "./SpeechBubble.js";
import { Sprite } from "./Sprite.js";
import { useCompanion } from "./store.js";
import { selectCurrent, useSession } from "../store/session.js";
import { speak } from "../lib/audio.js";

const WIDE = "(min-width: 640px)";

function useScale(): number {
  const [wide, setWide] = useState(() => window.matchMedia(WIDE).matches);
  useEffect(() => {
    const m = window.matchMedia(WIDE);
    const onChange = () => setWide(m.matches);
    m.addEventListener("change", onChange);
    return () => m.removeEventListener("change", onChange);
  }, []);
  return wide ? 2 : 1.5;
}

function useMissing(): ReadonlySet<AnimName> {
  const [missing, setMissing] = useState<ReadonlySet<AnimName>>(() => new Set());
  useEffect(() => {
    for (const a of Object.values(ANIMATIONS)) {
      const img = new Image();
      img.onerror = () => setMissing((m) => new Set(m).add(a.name));
      img.src = a.src;
    }
  }, []);
  return missing;
}

export function Companion() {
  const { anim, playId, line, lineId, dismiss, emit } = useCompanion();
  const current = useSession(selectCurrent);
  const scale = useScale();
  const missing = useMissing();
  if (missing.has("idle")) return null;

  const poke = () => {
    emit({ type: "poke", card: current ?? null });
    if (current) speak(current.lexeme.lemma, current.lexeme.audio_url);
  };

  return (
    <div
      data-testid="companion"
      className="pointer-events-none fixed inset-x-0 z-20"
      style={{ bottom: "calc(3.5rem + env(safe-area-inset-bottom))" }}
    >
      <div className="mx-auto flex max-w-lg items-end gap-1 px-3 pb-1">
        <div role="status" aria-live="polite" className="flex min-w-0 flex-1 justify-end pb-3">
          {line && <SpeechBubble key={lineId} line={line} onDismiss={dismiss} />}
        </div>
        <button
          type="button"
          onClick={poke}
          aria-label={current ? `Palabro: escuchar «${current.lexeme.lemma}»` : "Palabro"}
          className="pointer-events-auto flex shrink-0 justify-center rounded-2xl focus-visible:outline-2 focus-visible:outline-indigo-500"
          style={{ width: BODY_WIDTH * scale }}
        >
          <span style={{ marginInline: (-(FRAME_WIDTH - BODY_WIDTH) / 2) * scale }}>
            <Sprite key={playId} anim={missing.has(anim) ? "idle" : anim} scale={scale} />
          </span>
        </button>
      </div>
    </div>
  );
}
