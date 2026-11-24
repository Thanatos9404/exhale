/**
 * The air column: a city block under its smog. Particle count follows PM2.5, the translucent
 * lid sits at the forecast boundary-layer height and particles drift with the wind.
 * When the lid drops at night the same particles are squeezed into a few metres of air,
 * which is exactly why winter smog gets so dense.
 */
import { useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { usePrefersReducedMotion } from '@/hooks/useMediaQuery';
import { useCssVars, useInView } from '@/hooks/useThemeColors';
import type { AqiLevel } from '@/lib/air/aqi';
import { City, Lid, Smog } from './AirColumnScene';

export { lidY, visibleFraction } from './smogShader';

export interface AirColumnProps {
  pm25: number;
  blh: number;
  wind: number;
  level: AqiLevel;
}

/** The Overview hero: a 3D city block whose smog density and lid height follow the live forecast. */
export default function AirColumn(props: AirColumnProps) {
  const wrap = useRef<HTMLDivElement>(null);
  const inView = useInView(wrap);
  const reduced = usePrefersReducedMotion();
  const v = useCssVars(['subtle', 'line', 'amber', `aqi-${props.level}`] as const);
  const animate = inView && !reduced;
  return (
    <div ref={wrap} className="absolute inset-0" aria-hidden="true">
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
        <Smog
          pm25={props.pm25}
          blh={props.blh}
          wind={props.wind}
          color={v[`aqi-${props.level}`]}
          animate={animate}
        />
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
