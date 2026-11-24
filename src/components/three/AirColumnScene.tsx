/** The meshes inside the air column: the smog particle field, the inversion lid and the city. */
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { seededRandom } from './random';
import {
  MAX_PARTICLES,
  RADIUS,
  createSmogUniforms,
  lidY,
  smogFragment,
  smogUniformsOf,
  smogVertex,
  visibleFraction,
  type SmogInputs,
} from './smogShader';

/** The smog itself: a particle pool whose density, ceiling, drift and colour follow the air. */
export function Smog({ pm25, blh, wind, color, animate }: SmogInputs & { animate: boolean }) {
  const material = useRef<THREE.ShaderMaterial>(null);
  const geometry = useMemo(() => {
    const rand = seededRandom(7);
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

  // Parsed when the colour changes, so the frame loop eases toward it without allocating.
  const targetColor = useMemo(() => new THREE.Color(color), [color]);

  // Built once; the frame loop eases them toward the live targets through the material ref.
  const [initialUniforms] = useState(() => createSmogUniforms({ pm25, blh, wind, color }));

  useFrame((_, delta) => {
    if (!material.current) return;
    // three.js types uniforms as an open record; the accessor checks this is the smog material.
    const u = smogUniformsOf(material.current);
    if (!u) return;
    const k = animate ? Math.min(1, delta * 3) : 1;
    if (animate) u.uTime.value += delta;
    u.uLid.value += (lidY(blh) - u.uLid.value) * k;
    u.uDensity.value += (visibleFraction(pm25) - u.uDensity.value) * k;
    u.uWind.value += (wind - u.uWind.value) * k;
    u.uColor.value.lerp(targetColor, k);
  });

  return (
    <points geometry={geometry} frustumCulled={false}>
      <shaderMaterial
        ref={material}
        vertexShader={smogVertex}
        fragmentShader={smogFragment}
        uniforms={initialUniforms}
        transparent
        depthWrite={false}
        blending={THREE.NormalBlending}
      />
    </points>
  );
}

/** The translucent inversion lid, eased to the forecast boundary-layer height. */
export function Lid({ blh, color }: { blh: number; color: string }) {
  const group = useRef<THREE.Group>(null);
  useFrame((_, delta) => {
    if (!group.current) return;
    group.current.position.y += (lidY(blh) - group.current.position.y) * Math.min(1, delta * 3);
  });
  return (
    <group ref={group} position={[0, lidY(blh), 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[RADIUS + 0.15, 96]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.1}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[RADIUS + 0.1, RADIUS + 0.16, 128]} />
        <meshBasicMaterial color={color} transparent opacity={0.75} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

interface Block {
  x: number;
  z: number;
  h: number;
  w: number;
}

/** A deterministic city grid: taller towards the centre, with a few empty plots. */
function cityBlocks(): Block[] {
  const rand = seededRandom(42);
  const out: Block[] = [];
  for (let gx = -6; gx <= 6; gx++) {
    for (let gz = -6; gz <= 6; gz++) {
      const x = gx * 0.72 + (rand() - 0.5) * 0.1;
      const z = gz * 0.72 + (rand() - 0.5) * 0.1;
      const d = Math.hypot(x, z);
      if (d > RADIUS - 0.4 || rand() < 0.18) continue;
      const centre = 1 - d / RADIUS;
      out.push({
        x,
        z,
        w: 0.38 + rand() * 0.18,
        h: 0.15 + rand() * 0.55 + centre * centre * 1.1 * rand(),
      });
    }
  }
  return out;
}

/** The ground disc and the instanced city blocks standing on it. */
export function City({ color, ground }: { color: string; ground: string }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const blocks = useMemo(() => cityBlocks(), []);

  useLayoutEffect(() => {
    const instanced = mesh.current;
    if (!instanced) return;
    const m = new THREE.Matrix4();
    blocks.forEach((b, i) => {
      m.compose(
        new THREE.Vector3(b.x, b.h / 2, b.z),
        new THREE.Quaternion(),
        new THREE.Vector3(b.w, b.h, b.w),
      );
      instanced.setMatrixAt(i, m);
    });
    instanced.instanceMatrix.needsUpdate = true;
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
