import { useEffect, useState } from "react";
import { ANIMATIONS, type AnimName } from "./animations.js";
import { SpeechBubble } from "./SpeechBubble.js";
import { Sprite } from "./Sprite.js";
import { useCompanion } from "./store.js";

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
  const { anim, playId, line, lineId, dismiss } = useCompanion();
  const scale = useScale();
  const missing = useMissing();
  if (missing.has("idle")) return null;

  return (
    <div
      data-testid="companion"
      className="pointer-events-none fixed right-3 z-20 flex flex-col items-end gap-2"
      style={{ bottom: "calc(4.5rem + env(safe-area-inset-bottom))" }}
    >
      <div role="status" aria-live="polite" className="flex justify-end">
        {line && <SpeechBubble key={lineId} line={line} onDismiss={dismiss} />}
      </div>
      <Sprite key={playId} anim={missing.has(anim) ? "idle" : anim} scale={scale} />
    </div>
  );
}
