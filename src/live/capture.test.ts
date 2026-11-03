import { expect, it } from 'vitest'
import { DISPLAY_MEDIA_OPTIONS, streamProblemKeys, audioTimeMs, outputTimestamp } from './capture'

it('lists the problems of a shared stream', () => {
  expect(streamProblemKeys({ audioTracks: 1, displaySurface: 'monitor' })).toEqual([])
  expect(streamProblemKeys({ audioTracks: 0, displaySurface: 'monitor' })).toEqual(['problem.noAudio'])
  expect(streamProblemKeys({ audioTracks: 1 })).toEqual([])
})

it('accepts the game window when it comes with its own audio', () => {
  expect(streamProblemKeys({ audioTracks: 1, displaySurface: 'window' })).toEqual([])
  expect(streamProblemKeys({ audioTracks: 0, displaySurface: 'window' })).toEqual(['problem.noWindowAudio'])
})

it('rejects a browser tab', () => {
  expect(streamProblemKeys({ audioTracks: 1, displaySurface: 'browser' })).toEqual(['problem.notMonitor'])
})

it('asks the browser for the window audio only', () => {
  expect(DISPLAY_MEDIA_OPTIONS.windowAudio).toBe('window')
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
