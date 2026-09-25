import manifest from "./manifest.json";

export type AnimName =
  | "idle" | "talk" | "happy" | "oops" | "thinking" | "celebrate" | "wow" | "wave"
  | "yawn" | "scratch" | "point" | "idea";

const TIMING: Record<AnimName, { fps: number; loop: boolean }> = {
  idle: { fps: 6, loop: true },
  talk: { fps: 8, loop: true },
  happy: { fps: 8, loop: false },
  oops: { fps: 6, loop: false },
  thinking: { fps: 4, loop: true },
  celebrate: { fps: 8, loop: false },
  wow: { fps: 6, loop: false },
  wave: { fps: 7, loop: false },
  yawn: { fps: 4, loop: false },
  scratch: { fps: 7, loop: false },
  point: { fps: 5, loop: false },
  idea: { fps: 5, loop: false },
};

export const IDLE_VARIANTS: readonly AnimName[] = ["yawn", "scratch"];

export interface Animation {
  name: AnimName;
  frames: number;
  fps: number;
  loop: boolean;
  durationMs: number;
  src: string;
}

export const FRAME_WIDTH: number = manifest.frameWidth;
export const FRAME_HEIGHT: number = manifest.frameHeight;

export const ANIMATIONS = Object.fromEntries(
  (Object.keys(TIMING) as AnimName[]).map((name) => {
    const frames = manifest.animations[name].frames;
    const { fps, loop } = TIMING[name];
    return [name, { name, frames, fps, loop, durationMs: Math.round((frames / fps) * 1000), src: `/companion/${name}.png?v=${manifest.version}` }];
  }),
) as Record<AnimName, Animation>;
