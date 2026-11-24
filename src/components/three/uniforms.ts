/**
 * Type guards for shader uniforms. three.js types them as an open record and this project allows
 * no type assertions, so the shader modules narrow uniform values with these checks instead.
 */
import * as THREE from 'three';

/** three.js types a material's uniforms as an open record; these checks narrow it safely. */
export type OpenUniforms = THREE.ShaderMaterial['uniforms'];

/** True when every named uniform exists and holds a number. */
export function hasNumberUniforms(uniforms: OpenUniforms, keys: readonly string[]): boolean {
  return keys.every((key) => typeof uniforms[key]?.value === 'number');
}

/** True when the value is a three.js colour. */
export function isColor(value: unknown): value is THREE.Color {
  return value instanceof THREE.Color;
}

/** True when the value is an array of three.js colours. */
export function isColorArray(value: unknown): value is THREE.Color[] {
  return Array.isArray(value) && value.every(isColor);
}

/** True when the value is an array of numbers. */
export function isNumberArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((v) => typeof v === 'number');
}
