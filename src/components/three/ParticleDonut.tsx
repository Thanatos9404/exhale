/**
 * A donut chart made of particles, for a chart about particles. Each pollutant's arc is
 * proportional to how far it exceeds its WHO guideline. Hovering an arc (or focusing its legend
 * entry) pushes its particles outward.
 */
import { useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { usePrefersReducedMotion } from '@/hooks/useMediaQuery';
import { useInView } from '@/hooks/useThemeColors';
import { seededRandom } from './random';
import {
  RING_PARTICLES as N,
  createRingUniforms,
  ringFragment,
  ringUniformsOf,
  ringVertex,
  segmentColor,
  segmentStarts,
  type DonutSegment,
} from './ringShader';

export { segmentStarts, type DonutSegment } from './ringShader';

interface DonutProps {
  segments: DonutSegment[];
  /** Index of the highlighted segment, or -1 for none. */
  hover: number;
}

function Ring({ segments, hover, animate }: DonutProps & { animate: boolean }) {
  const group = useRef<THREE.Group>(null);
  const material = useRef<THREE.ShaderMaterial>(null);
  const geometry = useMemo(() => {
    const rand = seededRandom(11);
    const pos = new Float32Array(N * 3);
    const seed = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) seed.set([i / N, rand(), rand()], i * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 3));
    return g;
  }, []);

  const starts = useMemo(() => segmentStarts(segments), [segments]);
  // The colour strings last parsed into the uniforms, so a frame only parses one that changed.
  const applied = useRef<string[]>([]);
  // Built once; the frame loop updates them through the material ref.
  const [initialUniforms] = useState(() => createRingUniforms(segments));

  useFrame((_, delta) => {
    if (!material.current) return;
    // three.js types uniforms as an open record; the accessor checks this is the ring material.
    const u = ringUniformsOf(material.current);
    if (!u) return;
    if (animate) {
      u.uTime.value += delta;
      if (group.current) group.current.rotation.z += delta * 0.04;
    }
    u.uHover.value = hover;
    u.uStarts.value = starts;
    u.uColors.value.forEach((c, i) => {
      const next = segmentColor(segments, i);
      if (applied.current[i] === next) return;
      c.set(next);
      applied.current[i] = next;
    });
  });

  return (
    <group ref={group}>
      <points geometry={geometry} frustumCulled={false}>
        <shaderMaterial
          ref={material}
          vertexShader={ringVertex}
          fragmentShader={ringFragment}
          uniforms={initialUniforms}
          transparent
          depthWrite={false}
        />
      </points>
    </group>
  );
}

/** Pollutant mix donut drawn with GPU particles; pauses offscreen and for reduced motion. */
export default function ParticleDonut({ segments, hover }: DonutProps) {
  const wrap = useRef<HTMLDivElement>(null);
  const inView = useInView(wrap);
  const reduced = usePrefersReducedMotion();
  const animate = inView && !reduced;
  return (
    <div ref={wrap} className="absolute inset-0" aria-hidden="true">
      <Canvas
        dpr={[1, 1.75]}
        frameloop={animate ? 'always' : 'demand'}
        camera={{ position: [0, 0, 3.4], fov: 45 }}
        gl={{ alpha: true, antialias: true, powerPreference: 'low-power' }}
      >
        <Ring segments={segments} hover={hover} animate={animate} />
      </Canvas>
    </div>
  );
}
