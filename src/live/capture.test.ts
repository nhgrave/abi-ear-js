import { expect, it } from 'vitest'
import { streamProblemKeys, audioTimeMs, outputTimestamp } from './capture'

it('lists the problems of a shared stream', () => {
  expect(streamProblemKeys({ audioTracks: 1, displaySurface: 'monitor' })).toEqual([])
  expect(streamProblemKeys({ audioTracks: 0, displaySurface: 'window' })).toEqual(['problem.notMonitor', 'problem.noAudio'])
  expect(streamProblemKeys({ audioTracks: 1 })).toEqual([])
})

it('converts an audio frame to performance time like the recorder', () => {
  // amostra 48000 = 1 s de contexto; o contexto marcava 0,5 s em performance.now() = 10000 ms
  expect(audioTimeMs(48000, { contextTime: 0.5, performanceTime: 10000 })).toBeCloseTo(10500, 6)
})

it('treats a zero output timestamp as missing', () => {
  const ctx = { getOutputTimestamp: () => ({ contextTime: 0, performanceTime: 0 }), currentTime: 2 } as unknown as AudioContext
  const ts = outputTimestamp(ctx)
  expect(ts.contextTime).toBe(2)
  expect(ts.performanceTime).toBeGreaterThan(0)
})
