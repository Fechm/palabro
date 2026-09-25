import type { CSSProperties } from "react";
import { ANIMATIONS, FRAME_HEIGHT, FRAME_WIDTH, type AnimName } from "./animations.js";

export function Sprite({ anim, scale }: { anim: AnimName; scale: number }) {
  const a = ANIMATIONS[anim];
  const width = Math.round(FRAME_WIDTH * scale);
  const height = Math.round(FRAME_HEIGHT * scale);
  const style = {
    width,
    height,
    backgroundImage: `url(${a.src})`,
    backgroundSize: `${a.frames * width}px ${height}px`,
    "--companion-end": `${-(a.frames - 1) * width}px`,
    animation: a.frames > 1
      ? `companion-play ${a.durationMs}ms steps(${a.frames}, jump-none) ${a.loop ? "infinite" : "1 forwards"}`
      : "none",
  } as CSSProperties;
  return <div className="companion-sprite" style={style} aria-hidden="true" data-anim={anim} />;
}
