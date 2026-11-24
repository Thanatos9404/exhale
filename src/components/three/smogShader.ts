/**
 * Shader and uniforms for the air column: particles held under a lid at the mixing height,
 * drifting with the wind, with as many drawn as the PM2.5 level calls for. The GLSL and the typed
 * access to its uniforms sit in one file so they cannot drift apart.
 */
import * as THREE from 'three';
import { hasNumberUniforms, isColor, type OpenUniforms } from './uniforms';

/** Size of the particle pool; the shader hides the share that PM2.5 does not call for. */
export const MAX_PARTICLES = 9000;
/** Radius of the city disc, in scene units. */
export const RADIUS = 5;

/** Maps mixing height (m) to scene units, compressing the top so a 15 m lid and a 1.5 km one both read. */
export function lidY(blh: number): number {
  const t = Math.min(1, Math.max(0, blh) / 1500);
  return 0.35 + Math.pow(t, 0.6) * 3.9;
}

/** Share of the particle pool drawn for a PM2.5 level (µg/m³); 220 and above fills the column. */
export function visibleFraction(pm25: number): number {
  return Math.min(1, Math.max(0.04, pm25 / 220));
}

/** Places each particle under the lid, drifts it with the wind and hides the unused pool. */
export const smogVertex = /* glsl */ `
  uniform float uTime;
  uniform float uLid;
  uniform float uWind;
  uniform float uDensity;
  uniform float uPixel;
  attribute vec4 aSeed;
  varying float vAlpha;
  void main() {
    float rank = aSeed.w;
    float escaped = step(0.9, aSeed.z);
    float ceiling = mix(uLid, 5.6, escaped);
    vec3 p = position;
    p.y = 0.04 + aSeed.y * ceiling * 0.97;
    float drift = uTime * (0.03 + uWind * 0.012) * (0.6 + aSeed.x * 0.8);
    p.x = mod(p.x + drift + ${RADIUS.toFixed(1)}, ${(RADIUS * 2).toFixed(1)}) - ${RADIUS.toFixed(1)};
    p.y += sin(uTime * 0.6 + aSeed.x * 31.0) * 0.05 * min(ceiling, 1.0);
    p.z += cos(uTime * 0.4 + aSeed.y * 17.0) * 0.06;
    float inside = step(length(p.xz), ${RADIUS.toFixed(1)});
    float on = step(rank, uDensity) * inside;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = on * uPixel * (1.6 + aSeed.x * 2.0) * (19.0 / -mv.z);
    vAlpha = on * mix(0.85, 0.25, escaped);
  }
`;

/** Draws each particle as a soft round point in the AQI colour. */
export const smogFragment = /* glsl */ `
  uniform vec3 uColor;
  varying float vAlpha;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    if (d > 0.5) discard;
    float soft = smoothstep(0.5, 0.0, d);
    gl_FragColor = vec4(uColor, soft * vAlpha);
  }
`;

/** The live readings the smog shader follows. */
export interface SmogInputs {
  pm25: number;
  blh: number;
  wind: number;
  color: string;
}

/** Shader uniforms start at the live values; later changes are eased in per frame. */
export function createSmogUniforms({ pm25, blh, wind, color }: SmogInputs) {
  return {
    uTime: { value: 0 },
    uLid: { value: lidY(blh) },
    uWind: { value: wind },
    uDensity: { value: visibleFraction(pm25) },
    uPixel: { value: Math.min(2, window.devicePixelRatio || 1) },
    uColor: { value: new THREE.Color(color) },
  };
}

/** The uniforms of a smog material, with their value types. */
export type SmogUniforms = ReturnType<typeof createSmogUniforms>;

const NUMBER_UNIFORMS = ['uTime', 'uLid', 'uWind', 'uDensity', 'uPixel'] as const;

function isSmogUniforms(uniforms: OpenUniforms): uniforms is SmogUniforms {
  return hasNumberUniforms(uniforms, NUMBER_UNIFORMS) && isColor(uniforms.uColor?.value);
}

/** The typed uniforms of a material built by `createSmogUniforms`, or null for any other one. */
export function smogUniformsOf(material: THREE.ShaderMaterial): SmogUniforms | null {
  const { uniforms } = material;
  return isSmogUniforms(uniforms) ? uniforms : null;
}
