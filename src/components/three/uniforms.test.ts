import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  hasNumberUniforms,
  isColor,
  isColorArray,
  isNumberArray,
  type OpenUniforms,
} from './uniforms';

describe('hasNumberUniforms', () => {
  const uniforms: OpenUniforms = {
    uTime: { value: 0 },
    uDensity: { value: 0.75 },
    uColor: { value: new THREE.Color('#ff0000') },
    uLabel: { value: 'smog' },
    uEmpty: { value: null },
  };

  it('accepts uniforms that all hold numbers, zero included', () => {
    expect(hasNumberUniforms(uniforms, ['uTime', 'uDensity'])).toBe(true);
  });

  it('rejects a missing uniform', () => {
    expect(hasNumberUniforms(uniforms, ['uTime', 'uMissing'])).toBe(false);
    expect(hasNumberUniforms({}, ['uTime'])).toBe(false);
  });

  it('rejects a uniform that holds something other than a number', () => {
    expect(hasNumberUniforms(uniforms, ['uColor'])).toBe(false);
    expect(hasNumberUniforms(uniforms, ['uLabel'])).toBe(false);
    expect(hasNumberUniforms(uniforms, ['uEmpty'])).toBe(false);
    expect(hasNumberUniforms({ uTime: { value: '1' } }, ['uTime'])).toBe(false);
  });

  it('has nothing to object to when no uniform is named', () => {
    expect(hasNumberUniforms({}, [])).toBe(true);
  });

  it('checks the uniforms of a real shader material', () => {
    const material = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 1.5 }, uColor: { value: new THREE.Color(0x336699) } },
    });
    expect(hasNumberUniforms(material.uniforms, ['uTime'])).toBe(true);
    expect(hasNumberUniforms(material.uniforms, ['uTime', 'uColor'])).toBe(false);
    expect(isColor(material.uniforms.uColor?.value)).toBe(true);
  });
});

describe('isColor', () => {
  it('accepts three.js colours', () => {
    expect(isColor(new THREE.Color())).toBe(true);
    expect(isColor(new THREE.Color('#0af'))).toBe(true);
  });

  it('rejects colour-like values that are not Color instances', () => {
    for (const value of ['#ff0000', 0xff0000, { r: 1, g: 0, b: 0 }, [1, 0, 0], null, undefined]) {
      expect(isColor(value)).toBe(false);
    }
    expect(isColor(new THREE.Vector3(1, 0, 0))).toBe(false);
  });
});

describe('isColorArray', () => {
  it('accepts an array whose every entry is a colour', () => {
    expect(isColorArray([new THREE.Color(), new THREE.Color('#fff')])).toBe(true);
  });

  it('accepts an empty array', () => {
    expect(isColorArray([])).toBe(true);
  });

  it('rejects an array with one entry that is not a colour', () => {
    expect(isColorArray([new THREE.Color(), '#fff'])).toBe(false);
    expect(isColorArray([new THREE.Color(), null])).toBe(false);
  });

  it('rejects anything that is not an array', () => {
    expect(isColorArray(new THREE.Color())).toBe(false);
    expect(isColorArray({ 0: new THREE.Color(), length: 1 })).toBe(false);
    expect(isColorArray(undefined)).toBe(false);
  });
});

describe('isNumberArray', () => {
  it('accepts arrays of numbers, empty ones included', () => {
    expect(isNumberArray([0, 0.25, 0.5, 1])).toBe(true);
    expect(isNumberArray([])).toBe(true);
  });

  it('rejects an array with a non-number in it', () => {
    expect(isNumberArray([0, '1', 2])).toBe(false);
    expect(isNumberArray([0, null])).toBe(false);
    expect(isNumberArray([[0]])).toBe(false);
  });

  it('rejects anything that is not a plain array', () => {
    expect(isNumberArray(new Float32Array([0, 1]))).toBe(false);
    expect(isNumberArray(3)).toBe(false);
    expect(isNumberArray(null)).toBe(false);
  });
});
