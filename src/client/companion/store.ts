import { create } from "zustand";
import { ANIMATIONS, IDLE_VARIANTS, type AnimName } from "./animations.js";
import { FRESH_MEMORY, lineText, react, type CompanionEvent, type Line, type Memory, type Rng } from "./lines.js";

interface CompanionState {
  anim: AnimName;
  playId: number;
  line: Line | null;
  lineId: number;
  emit: (event: CompanionEvent) => void;
  dismiss: () => void;
}

export const STUCK_MS = 30_000;
export const talkMs = (line: Line): number =>
  Math.min(9000, Math.max(2500, 2500 + 45 * lineText(line).length));
export const idleVariantDelay = (rng: Rng): number => 15_000 + Math.floor(rng() * 10_000);

const STUCK_ENDERS: ReadonlySet<CompanionEvent["type"]> = new Set([
  "revealed", "answer", "produce_pending", "stuck", "session_start", "session_done",
]);

let memory: Memory = FRESH_MEMORY;
let rng: Rng = Math.random;
let onceTimer: ReturnType<typeof setTimeout> | undefined;
let idleTimer: ReturnType<typeof setTimeout> | undefined;
let stuckTimer: ReturnType<typeof setTimeout> | undefined;
let talkTimer: ReturnType<typeof setTimeout> | undefined;
let talkUntil = 0;

export const useCompanion = create<CompanionState>((set, get) => {
  const rest = (): AnimName => (get().line && Date.now() < talkUntil ? "talk" : "idle");

  const startTalking = (line: Line) => {
    clearTimeout(talkTimer);
    const ms = talkMs(line);
    talkUntil = Date.now() + ms;
    talkTimer = setTimeout(() => {
      talkTimer = undefined;
      if (get().anim === "talk") play("idle");
    }, ms);
  };

  const scheduleIdleVariant = () => {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      idleTimer = undefined;
      if (get().anim === "idle") play(IDLE_VARIANTS[Math.floor(rng() * IDLE_VARIANTS.length)]!);
    }, idleVariantDelay(rng));
  };

  const play = (anim: AnimName) => {
    clearTimeout(onceTimer);
    clearTimeout(idleTimer);
    onceTimer = idleTimer = undefined;
    set((s) => ({ anim, playId: s.playId + 1 }));
    const a = ANIMATIONS[anim];
    if (!a.loop) {
      onceTimer = setTimeout(() => {
        onceTimer = undefined;
        play(rest());
      }, a.durationMs);
    } else if (anim === "idle") {
      scheduleIdleVariant();
    }
  };

  const startStuck = (event: Extract<CompanionEvent, { type: "card_shown" }>) => {
    clearTimeout(stuckTimer);
    const { card, kind } = event;
    stuckTimer = setTimeout(() => {
      stuckTimer = undefined;
      get().emit({ type: "stuck", card, kind });
    }, STUCK_MS);
  };

  return {
    anim: "idle",
    playId: 0,
    line: null,
    lineId: 0,
    emit: (event) => {
      if (STUCK_ENDERS.has(event.type)) {
        clearTimeout(stuckTimer);
        stuckTimer = undefined;
      }
      if (event.type === "card_shown") startStuck(event);
      if (event.type === "session_start") set({ line: null });
      const r = react(event, memory, rng);
      memory = r.memory;
      if (r.line) {
        const line = r.line;
        set((s) => ({ line, lineId: s.lineId + 1 }));
        startTalking(line);
      }
      if (r.anim) play(r.anim === "idle" ? rest() : r.anim);
    },
    dismiss: () => {
      clearTimeout(talkTimer);
      talkTimer = undefined;
      talkUntil = 0;
      set({ line: null });
      if (onceTimer === undefined && get().anim === "talk") play("idle");
    },
  };
});

export const emitCompanion = (event: CompanionEvent): void => useCompanion.getState().emit(event);

export function resetCompanion(nextRng: Rng = Math.random): void {
  clearTimeout(onceTimer);
  clearTimeout(idleTimer);
  clearTimeout(stuckTimer);
  clearTimeout(talkTimer);
  onceTimer = idleTimer = stuckTimer = talkTimer = undefined;
  talkUntil = 0;
  memory = FRESH_MEMORY;
  rng = nextRng;
  useCompanion.setState({ anim: "idle", playId: 0, line: null, lineId: 0 });
}
