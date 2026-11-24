/**
 * The indoor-air room simulation: a particle pool that tracks the modelled PM2.5, drifts with
 * the window draft and the purifier, and paints itself onto a canvas one frame at a time.
 */

/** What the room visual needs to know about the modelled indoor air. */
export interface RoomParticlesProps {
  /** Modelled indoor PM2.5 in µg/m³. */
  indoor: number;
  windowsOpen: boolean;
  purifierOn: boolean;
  sourceOn: boolean;
}

/** One drawn particle: position and velocity in CSS pixels. */
export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

/** The drawn size of the room, in CSS pixels. */
export interface Room {
  w: number;
  h: number;
}

/** The theme colours the room is painted with, resolved from CSS once per theme. */
export interface RoomColors {
  wall: string;
  openWindow: string;
  purifier: string;
  particle: string;
}

/** About 2.4 drawn particles per µg/m³, clamped so clean air still shows a few and smog stays cheap. */
const PARTICLES_PER_UG = 2.4;
const MIN_PARTICLES = 12;
const MAX_PARTICLES = 900;
/** Purifier intake, measured from the bottom-right corner of the room. */
const INTAKE = { dx: 17, dy: 26, radius: 14 };

/** Resolves the room's colours from the canvas's CSS variables. Call on mount and theme change. */
export function readRoomColors(canvas: HTMLCanvasElement): RoomColors {
  const css = getComputedStyle(canvas);
  return {
    wall: css.getPropertyValue('--line-strong'),
    openWindow: css.getPropertyValue('--amber'),
    purifier: css.getPropertyValue('--blue'),
    particle: css.getPropertyValue('--fg'),
  };
}

function particleAt(x: number, y: number): Particle {
  return { x, y, vx: (Math.random() - 0.5) * 0.4, vy: (Math.random() - 0.5) * 0.4 };
}

/** New particles enter through the open window, rise from an indoor source, or appear anywhere. */
function spawnParticle(s: RoomParticlesProps, { w, h }: Room): Particle {
  if (s.windowsOpen && Math.random() < 0.6) return particleAt(6, h * (0.25 + Math.random() * 0.4));
  if (s.sourceOn && Math.random() < 0.5) {
    return particleAt(w * 0.5 + (Math.random() - 0.5) * 30, h - 14);
  }
  return particleAt(Math.random() * w, Math.random() * h);
}

/** Grows or trims the pool toward the target count, trimming gently so the room drains visibly. */
function balancePool(ps: Particle[], s: RoomParticlesProps, room: Room): void {
  const target = Math.round(
    Math.min(MAX_PARTICLES, Math.max(MIN_PARTICLES, s.indoor * PARTICLES_PER_UG)),
  );
  while (ps.length < target) ps.push(spawnParticle(s, room));
  if (ps.length > target) ps.splice(0, Math.min(ps.length - target, 12));
}

function drawRoom(
  ctx: CanvasRenderingContext2D,
  colors: RoomColors,
  s: RoomParticlesProps,
  { w, h }: Room,
) {
  ctx.clearRect(0, 0, w, h);
  ctx.strokeStyle = colors.wall;
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, w - 1, h - 1);
  // Window on the left wall.
  ctx.fillStyle = s.windowsOpen ? colors.openWindow : colors.wall;
  ctx.globalAlpha = s.windowsOpen ? 0.5 : 0.9;
  ctx.fillRect(0, h * 0.25, 4, h * 0.4);
  // Purifier in the bottom-right corner.
  ctx.globalAlpha = 1;
  ctx.fillStyle = s.purifierOn ? colors.purifier : colors.wall;
  ctx.fillRect(w - 26, h - 46, 18, 40);
}

/** Brownian drift, plus a draft from the open window and suction toward the purifier intake. */
function moveParticle(p: Particle, s: RoomParticlesProps, { w, h }: Room): void {
  p.vx += (Math.random() - 0.5) * 0.08;
  p.vy += (Math.random() - 0.5) * 0.08;
  if (s.windowsOpen && p.x < w * 0.4) p.vx += 0.02;
  if (s.purifierOn) {
    const dx = w - INTAKE.dx - p.x;
    const dy = h - INTAKE.dy - p.y;
    const d = Math.hypot(dx, dy) || 1;
    p.vx += (dx / d) * 0.012;
    p.vy += (dy / d) * 0.012;
  }
  p.vx *= 0.96;
  p.vy *= 0.96;
  p.x = Math.min(w - 2, Math.max(2, p.x + p.vx));
  p.y = Math.min(h - 2, Math.max(2, p.y + p.vy));
}

/** Removes particles that reached the purifier intake, compacting the pool in place. */
function absorbAtIntake(ps: Particle[], { w, h }: Room): void {
  let kept = 0;
  for (const p of ps) {
    if (Math.hypot(w - INTAKE.dx - p.x, h - INTAKE.dy - p.y) >= INTAKE.radius) ps[kept++] = p;
  }
  ps.length = kept;
}

/** Matches the canvas backing store to its CSS size and records that size in `room`. */
export function fitCanvas(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, room: Room) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  room.w = canvas.clientWidth;
  room.h = canvas.clientHeight;
  canvas.width = room.w * dpr;
  canvas.height = room.h * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

/** Everything one frame of the simulation reads and updates. */
export interface RoomScene {
  ctx: CanvasRenderingContext2D;
  room: Room;
  particles: Particle[];
  /** Replaced when the theme flips; never read from CSS during a frame. */
  colors: RoomColors;
}

/** Advances the simulation by one frame and paints it. */
export function stepRoom({ ctx, room, particles, colors }: RoomScene, s: RoomParticlesProps) {
  balancePool(particles, s, room);
  drawRoom(ctx, colors, s, room);
  ctx.fillStyle = colors.particle;
  ctx.globalAlpha = 0.55;
  for (const p of particles) {
    moveParticle(p, s, room);
    ctx.fillRect(p.x, p.y, 1.6, 1.6);
  }
  if (s.purifierOn) absorbAtIntake(particles, room);
  ctx.globalAlpha = 1;
}
