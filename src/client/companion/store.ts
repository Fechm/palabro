import { create } from "zustand";
import { ANIMATIONS, type AnimName } from "./animations.js";
import { FRESH_MEMORY, lineText, react, type CompanionEvent, type Line, type Memory, type Rng } from "./lines.js";

interface CompanionState {
  anim: AnimName;
  playId: number;
  line: Line | null;
  lineId: number;
  emit: (event: CompanionEvent) => void;
  dismiss: () => void;
}

export const bubbleMs = (line: Line): number =>
  Math.min(9000, Math.max(2500, 2500 + 45 * lineText(line).length));

let memory: Memory = FRESH_MEMORY;
let rng: Rng = Math.random;
let onceTimer: ReturnType<typeof setTimeout> | undefined;
let lineTimer: ReturnType<typeof setTimeout> | undefined;

export const useCompanion = create<CompanionState>((set, get) => {
  const rest = (): AnimName => (get().line ? "talk" : "idle");

  const play = (anim: AnimName) => {
    clearTimeout(onceTimer);
    onceTimer = undefined;
    set((s) => ({ anim, playId: s.playId + 1 }));
    const a = ANIMATIONS[anim];
    if (!a.loop) {
      onceTimer = setTimeout(() => {
        onceTimer = undefined;
        set((s) => ({ anim: rest(), playId: s.playId + 1 }));
      }, a.durationMs);
    }
  };

  const closeLine = () => {
    clearTimeout(lineTimer);
    lineTimer = undefined;
    set({ line: null });
    if (onceTimer === undefined && get().anim === "talk") play("idle");
  };

  return {
    anim: "idle",
    playId: 0,
    line: null,
    lineId: 0,
    emit: (event) => {
      if (event.type === "session_start") closeLine();
      const r = react(event, memory, rng);
      memory = r.memory;
      if (r.line) {
        clearTimeout(lineTimer);
        lineTimer = undefined;
        const line = r.line;
        set((s) => ({ line, lineId: s.lineId + 1 }));
        if (!r.sticky) lineTimer = setTimeout(closeLine, bubbleMs(line));
      }
      if (r.anim) play(r.anim === "idle" ? rest() : r.anim);
    },
    dismiss: closeLine,
  };
});

export const emitCompanion = (event: CompanionEvent): void => useCompanion.getState().emit(event);

export function resetCompanion(nextRng: Rng = Math.random): void {
  clearTimeout(onceTimer);
  clearTimeout(lineTimer);
  onceTimer = lineTimer = undefined;
  memory = FRESH_MEMORY;
  rng = nextRng;
  useCompanion.setState({ anim: "idle", playId: 0, line: null, lineId: 0 });
}
