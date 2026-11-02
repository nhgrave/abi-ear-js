import { describe, expect, it } from 'vitest'
import { bandpass } from './filter'

// Gerado uma vez por sosfilt(SOS, impulso)[:8] no Python (scipy, Float64).
const IMPULSE_RESPONSE = [
  0.015411424043869791, 0.08024768393761161, 0.16904046113146082, 0.16397897361463623,
  0.005931949660668068, -0.19828369915651728, -0.2944154065548809, -0.23680818482267818,
]

describe('bandpass', () => {
  it('bandpass matches scipy on an impulse', () => {
    const x = new Float32Array(16)
    x[0] = 1
    const y = bandpass(x)
    // a saída é Float32 (como no Python, que faz astype(float32)): compara com o valor arredondado igual
    IMPULSE_RESPONSE.forEach((v, i) => expect(Math.abs(y[i]! - Math.fround(v))).toBeLessThan(1e-9))
  })
})
