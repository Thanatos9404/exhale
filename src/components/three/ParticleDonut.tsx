import { useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { useReducedMotion } from 'motion/react';
import * as THREE from 'three';
import { useInView } from '@/hooks/useThemeColors';

/**
 * A donut chart made of particles, for a chart about particles. Each pollutant's arc is
 * proportional to how far it exceeds its WHO guideline. Hovering an arc (or focusing its legend
 * entry) pushes its particles outward.
 */

export interface DonutSegment {
  key: string;
  value: number;
  color: string;
}

const N = 4200;
const MAX_SEG = 4;

const vertex = /* glsl */ `
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

const fragment = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;
    gl_FragColor = vec4(vColor, smoothstep(0.5, 0.1, d) * vAlpha);
  }
`;

function Ring({ segments, hover, animate }: { segments: DonutSegment[]; hover: number; animate: boolean }) {
  const mat = useRef<THREE.ShaderMaterial>(null);
  const group = useRef<THREE.Group>(null);
  const geometry = useMemo(() => {
    const pos = new Float32Array(N * 3);
    const seed = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) seed.set([i / N, Math.random(), Math.random()], i * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 3));
    return g;
  }, []);

  const starts = useMemo(() => {
    const total = segments.reduce((s, x) => s + Math.max(0, x.value), 0) || 1;
    const out = [0];
    let acc = 0;
    for (let i = 0; i < MAX_SEG; i++) {
      acc += Math.max(0, segments[i]?.value ?? 0) / total;
      out.push(Math.min(1, acc));
    }
    out[MAX_SEG] = 1.0001;
    return out;
  }, [segments]);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uHover: { value: -1 },
      uPixel: { value: Math.min(2, window.devicePixelRatio || 1) },
      uStarts: { value: starts },
      uColors: { value: Array.from({ length: MAX_SEG }, (_, i) => new THREE.Color(segments[i]?.color ?? '#888')) },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useFrame((_, delta) => {
    const u = mat.current?.uniforms;
    if (!u) return;
    if (animate) {
      u.uTime!.value += delta;
      if (group.current) group.current.rotation.z += delta * 0.04;
    }
    u.uHover!.value = hover;
    u.uStarts!.value = starts;
    (u.uColors!.value as THREE.Color[]).forEach((c, i) => c.set(segments[i]?.color ?? '#888'));
  });

  return (
    <group ref={group}>
      <points geometry={geometry} frustumCulled={false}>
        <shaderMaterial ref={mat} vertexShader={vertex} fragmentShader={fragment} uniforms={uniforms} transparent depthWrite={false} />
      </points>
    </group>
  );
}

export default function ParticleDonut({ segments, hover }: { segments: DonutSegment[]; hover: number }) {
  const wrap = useRef<HTMLDivElement>(null);
  const inView = useInView(wrap);
  const reduced = useReducedMotion();
  const animate = inView && !reduced;
  return (
    <div ref={wrap} className="absolute inset-0">
      <Canvas dpr={[1, 1.75]} frameloop={animate ? 'always' : 'demand'} camera={{ position: [0, 0, 3.4], fov: 45 }} gl={{ alpha: true, antialias: true, powerPreference: 'low-power' }}>
        <Ring segments={segments} hover={hover} animate={animate} />
      </Canvas>
    </div>
  );
}
