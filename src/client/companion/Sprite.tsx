import type { CSSProperties } from "react";
import { ANIMATIONS, FRAME_SIZE, type AnimName } from "./animations.js";

export function Sprite({ anim, scale }: { anim: AnimName; scale: number }) {
  const a = ANIMATIONS[anim];
  const size = Math.round(FRAME_SIZE * scale);
  const style = {
    width: size,
    height: size,
    backgroundImage: `url(${a.src})`,
    backgroundSize: `${a.frames * size}px ${size}px`,
    "--companion-end": `${-(a.frames - 1) * size}px`,
    animation: a.frames > 1
      ? `companion-play ${a.durationMs}ms steps(${a.frames}, jump-none) ${a.loop ? "infinite" : "1 forwards"}`
      : "none",
  } as CSSProperties;
  return <div className="companion-sprite" style={style} aria-hidden="true" data-anim={anim} />;
}
