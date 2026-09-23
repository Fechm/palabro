import manifest from "./manifest.json";

export type AnimName = "idle" | "talk" | "happy" | "oops" | "thinking" | "celebrate" | "wow" | "wave";

const TIMING: Record<AnimName, { fps: number; loop: boolean }> = {
  idle: { fps: 6, loop: true },
  talk: { fps: 8, loop: true },
  happy: { fps: 8, loop: false },
  oops: { fps: 6, loop: false },
  thinking: { fps: 4, loop: true },
  celebrate: { fps: 8, loop: false },
  wow: { fps: 6, loop: false },
  wave: { fps: 7, loop: false },
};

export interface Animation {
  name: AnimName;
  frames: number;
  fps: number;
  loop: boolean;
  durationMs: number;
  src: string;
}

export const FRAME_SIZE: number = manifest.frameSize;

export const ANIMATIONS = Object.fromEntries(
  (Object.keys(TIMING) as AnimName[]).map((name) => {
    const frames = manifest.animations[name].frames;
    const { fps, loop } = TIMING[name];
    return [name, { name, frames, fps, loop, durationMs: Math.round((frames / fps) * 1000), src: `/companion/${name}.png` }];
  }),
) as Record<AnimName, Animation>;
