import { useLayoutEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { useReducedMotion } from 'motion/react';
import * as THREE from 'three';
import { useCssVars, useInView } from '@/hooks/useThemeColors';
import type { AqiLevel } from '@/lib/air/aqi';

/**
 * The air column: a city block under its smog. Particle count follows PM2.5, the translucent
 * lid sits at the forecast boundary-layer height and particles drift with the wind.
 * When the lid drops at night the same particles are squeezed into a few metres of air,
 * which is exactly why winter smog gets so dense.
 */

export interface AirColumnProps {
  pm25: number;
  blh: number;
  wind: number;
  level: AqiLevel;
}

const MAX_PARTICLES = 9000;
const RADIUS = 5;

/** Maps mixing height (m) to scene units, compressing the top so a 15 m lid and a 1.5 km one both read. */
export function lidY(blh: number): number {
  const t = Math.min(1, Math.max(0, blh) / 1500);
  return 0.35 + Math.pow(t, 0.6) * 3.9;
}

export function visibleFraction(pm25: number): number {
  return Math.min(1, Math.max(0.04, pm25 / 220));
}

function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

const vertex = /* glsl */ `
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

const fragment = /* glsl */ `
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

function Smog({ pm25, blh, wind, color, animate }: Omit<AirColumnProps, 'level'> & { color: string; animate: boolean }) {
  const material = useRef<THREE.ShaderMaterial>(null);
  const geometry = useMemo(() => {
    const rand = seeded(7);
    const pos = new Float32Array(MAX_PARTICLES * 3);
    const seed = new Float32Array(MAX_PARTICLES * 4);
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const r = Math.sqrt(rand()) * RADIUS;
      const a = rand() * Math.PI * 2;
      pos.set([Math.cos(a) * r, 0, Math.sin(a) * r], i * 3);
      seed.set([rand(), rand(), rand(), rand()], i * 4);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
    return g;
  }, []);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uLid: { value: lidY(blh) },
      uWind: { value: wind },
      uDensity: { value: visibleFraction(pm25) },
      uPixel: { value: Math.min(2, window.devicePixelRatio || 1) },
      uColor: { value: new THREE.Color(color) },
    }),
    // Created once; targets are eased in useFrame.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useFrame((_, delta) => {
    const u = material.current?.uniforms;
    if (!u) return;
    const k = animate ? Math.min(1, delta * 3) : 1;
    if (animate) u.uTime!.value += delta;
    u.uLid!.value += (lidY(blh) - u.uLid!.value) * k;
    u.uDensity!.value += (visibleFraction(pm25) - u.uDensity!.value) * k;
    u.uWind!.value += (wind - u.uWind!.value) * k;
    (u.uColor!.value as THREE.Color).lerp(new THREE.Color(color), k);
  });

  return (
    <points geometry={geometry} frustumCulled={false}>
      <shaderMaterial
        ref={material}
        vertexShader={vertex}
        fragmentShader={fragment}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.NormalBlending}
      />
    </points>
  );
}

function Lid({ blh, color }: { blh: number; color: string }) {
  const group = useRef<THREE.Group>(null);
  useFrame((_, delta) => {
    if (!group.current) return;
    group.current.position.y += (lidY(blh) - group.current.position.y) * Math.min(1, delta * 3);
  });
  return (
    <group ref={group} position={[0, lidY(blh), 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[RADIUS + 0.15, 96]} />
        <meshBasicMaterial color={color} transparent opacity={0.1} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[RADIUS + 0.1, RADIUS + 0.16, 128]} />
        <meshBasicMaterial color={color} transparent opacity={0.75} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

function City({ color, ground }: { color: string; ground: string }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const blocks = useMemo(() => {
    const rand = seeded(42);
    const out: { x: number; z: number; h: number; w: number }[] = [];
    for (let gx = -6; gx <= 6; gx++) {
      for (let gz = -6; gz <= 6; gz++) {
        const x = gx * 0.72 + (rand() - 0.5) * 0.1;
        const z = gz * 0.72 + (rand() - 0.5) * 0.1;
        const d = Math.hypot(x, z);
        if (d > RADIUS - 0.4 || rand() < 0.18) continue;
        const centre = 1 - d / RADIUS;
        out.push({ x, z, w: 0.38 + rand() * 0.18, h: 0.15 + rand() * 0.55 + centre * centre * 1.1 * rand() });
      }
    }
    return out;
  }, []);

  useLayoutEffect(() => {
    if (!mesh.current) return;
    const m = new THREE.Matrix4();
    blocks.forEach((b, i) => {
      m.compose(new THREE.Vector3(b.x, b.h / 2, b.z), new THREE.Quaternion(), new THREE.Vector3(b.w, b.h, b.w));
      mesh.current!.setMatrixAt(i, m);
    });
    mesh.current.instanceMatrix.needsUpdate = true;
  }, [blocks]);

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.001, 0]}>
        <circleGeometry args={[RADIUS + 0.6, 96]} />
        <meshStandardMaterial color={ground} roughness={1} />
      </mesh>
      <instancedMesh ref={mesh} args={[undefined, undefined, blocks.length]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color={color} roughness={0.85} metalness={0.05} />
      </instancedMesh>
    </group>
  );
}

export default function AirColumn(props: AirColumnProps) {
  const wrap = useRef<HTMLDivElement>(null);
  const inView = useInView(wrap);
  const reduced = useReducedMotion();
  const v = useCssVars(['subtle', 'line', 'amber', `aqi-${props.level}`] as const);
  const animate = inView && !reduced;
  return (
    <div ref={wrap} className="absolute inset-0">
      <Canvas
        dpr={[1, 1.75]}
        frameloop={animate ? 'always' : 'demand'}
        camera={{ position: [10.5, 5.6, 10.5], fov: 30, near: 0.1, far: 80 }}
        gl={{ antialias: true, alpha: true, powerPreference: 'low-power' }}
        onCreated={({ camera }) => camera.lookAt(0, 1.2, 0)}
      >
        <ambientLight intensity={0.45} />
        <directionalLight position={[5, 8, 3]} intensity={0.9} />
        <City color={v.subtle} ground={v.line} />
        <Smog pm25={props.pm25} blh={props.blh} wind={props.wind} color={v[`aqi-${props.level}`]} animate={animate} />
        <Lid blh={props.blh} color={v.amber} />
        <OrbitControls
          target={[0, 1.2, 0]}
          enableZoom={false}
          enablePan={false}
          autoRotate={animate}
          autoRotateSpeed={0.35}
          minPolarAngle={Math.PI / 5}
          maxPolarAngle={Math.PI / 2.15}
        />
      </Canvas>
    </div>
  );
}
