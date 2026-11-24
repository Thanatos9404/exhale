/**
 * Shader and uniforms for the pollutant-mix donut: a ring of particles sorted into coloured arcs,
 * with the hovered arc pushed outward. The GLSL and the typed access to its uniforms sit in one
 * file so they cannot drift apart.
 */
import * as THREE from 'three';
import { hasNumberUniforms, isColorArray, isNumberArray, type OpenUniforms } from './uniforms';

/** One arc of the donut: its share of the ring and its colour. */
export interface DonutSegment {
  key: string;
  value: number;
  color: string;
}

/** Number of particles in the ring. */
export const RING_PARTICLES = 4200;
const MAX_SEG = 4;
const FALLBACK_COLOR = '#888';

/** Sorts each particle into its segment's arc and pushes the hovered arc outward. */
export const ringVertex = /* glsl */ `
  uniform float uTime;
  uniform float uHover;
  uniform float uPixel;
  uniform float uStarts[${MAX_SEG + 1}];
  uniform vec3 uColors[${MAX_SEG}];
  attribute vec3 aSeed;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float t = aSeed.x;
    float seg = 0.0;
    for (int i = 1; i < ${MAX_SEG}; i++) { if (t >= uStarts[i]) seg = float(i); }
    float gap = 0.006;
    float s0 = uStarts[int(seg)];
    float s1 = uStarts[int(seg) + 1];
    float local = mix(s0 + gap, s1 - gap, fract(t * 97.13 + aSeed.y));
    float ang = local * 6.28318 + 1.5708;
    float hovered = 1.0 - step(0.5, abs(seg - uHover));
    float r = 1.0 + (aSeed.y - 0.5) * 0.36 + hovered * 0.12 + sin(uTime * 1.3 + aSeed.z * 20.0) * 0.012;
    vec3 p = vec3(cos(ang) * r, sin(ang) * r, (aSeed.z - 0.5) * 0.22);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = uPixel * (1.6 + aSeed.z * 1.8 + hovered * 1.0) * (3.2 / -mv.z);
    vColor = uColors[int(seg)];
    float dim = uHover < 0.0 ? 1.0 : mix(0.35, 1.0, hovered);
    vAlpha = dim * (0.55 + aSeed.z * 0.45);
  }
`;

/** Draws each particle as a soft round point in its segment colour. */
export const ringFragment = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;
    gl_FragColor = vec4(vColor, smoothstep(0.5, 0.1, d) * vAlpha);
  }
`;

/** Cumulative arc starts (0..1) for up to MAX_SEG segments, closed slightly past 1 for the shader. */
export function segmentStarts(segments: DonutSegment[]): number[] {
  const total = segments.reduce((s, x) => s + Math.max(0, x.value), 0) || 1;
  const out = [0];
  let acc = 0;
  for (let i = 0; i < MAX_SEG; i++) {
    acc += Math.max(0, segments[i]?.value ?? 0) / total;
    out.push(Math.min(1, acc));
  }
  out[MAX_SEG] = 1.0001;
  return out;
}

/** The colour of a segment, or a neutral grey when the donut has fewer segments. */
export function segmentColor(segments: DonutSegment[], i: number): string {
  return segments[i]?.color ?? FALLBACK_COLOR;
}

/** Shader uniforms start at the live segments; the frame loop keeps them current. */
export function createRingUniforms(segments: DonutSegment[]) {
  return {
    uTime: { value: 0 },
    uHover: { value: -1 },
    uPixel: { value: Math.min(2, window.devicePixelRatio || 1) },
    uStarts: { value: segmentStarts(segments) },
    uColors: {
      value: Array.from({ length: MAX_SEG }, (_, i) => new THREE.Color(segmentColor(segments, i))),
    },
  };
}

/** The uniforms of a ring material, with their value types. */
export type RingUniforms = ReturnType<typeof createRingUniforms>;

const NUMBER_UNIFORMS = ['uTime', 'uHover', 'uPixel'] as const;

function isRingUniforms(uniforms: OpenUniforms): uniforms is RingUniforms {
  return (
    hasNumberUniforms(uniforms, NUMBER_UNIFORMS) &&
    isNumberArray(uniforms.uStarts?.value) &&
    isColorArray(uniforms.uColors?.value)
  );
}

/** The typed uniforms of a material built by `createRingUniforms`, or null for any other one. */
export function ringUniformsOf(material: THREE.ShaderMaterial): RingUniforms | null {
  const { uniforms } = material;
  return isRingUniforms(uniforms) ? uniforms : null;
}
