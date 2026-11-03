import { describe, expect, it } from 'vitest'
import { finishSession, isRecordingName, recordingName, startSession } from './format'

const base = {
  startedAt: new Date('2026-11-04T00:30:12Z'),
  userAgent: 'ua',
  video: { width: 2560, displaySurface: 'window' } as MediaTrackSettings,
  audio: {},
  appVersion: '0.2.1',
  frameIntervalMs: 100,
}

describe('recording format', () => {
  it('names a recording by local start time', () => expect(recordingName(new Date(2026, 10, 4, 21, 30, 12))).toBe('2026-11-04-213012'))

  it('recognizes recording folder names', () => {
    expect(isRecordingName('2026-11-02-185459')).toBe(true)
    for (const n of ['frames', '2026-11-02', 'notes.txt', '2026-11-02-1854', 'x2026-11-02-185459']) expect(isRecordingName(n)).toBe(false)
  })

  it('a started session keeps the prototype fields and has no end', () => {
    const s = startSession(base)
    expect(s).toMatchObject({
      startedAt: '2026-11-04T00:30:12.000Z',
      userAgent: 'ua',
      video: base.video,
      audio: {},
      sampleRate: 48000,
      frameIntervalMs: 100,
      audioStartEpochMs: null,
      source: 'abi-ear-js',
      appVersion: '0.2.1',
      displaySurface: 'window',
    })
    expect(s.endedAt).toBeUndefined()
  })

  it('a session without displaySurface records null', () => expect(startSession({ ...base, video: {} }).displaySurface).toBeNull())

  it('finishing fills the summary and falls back for a missing audio start', () => {
    const f = finishSession(startSession(base), {
      endedAt: new Date('2026-11-04T00:31:12Z'),
      frames: 590,
      framesSkipped: 3,
      audioSamples: 2_880_000,
      audioStartEpochMs: null,
      fallbackEpochMs: 1_793_000_000_000,
      error: null,
    })
    expect(f).toMatchObject({ endedAt: '2026-11-04T00:31:12.000Z', frames: 590, framesSkipped: 3, audioSamples: 2_880_000, audioStartEpochMs: 1_793_000_000_000 })
    expect(f.error).toBeUndefined()
  })

  it('finishing after a failure records the error and unknown audio', () => {
    const f = finishSession(startSession(base), {
      endedAt: new Date('2026-11-04T00:31:12Z'),
      frames: 10,
      framesSkipped: 0,
      audioSamples: null,
      audioStartEpochMs: 1,
      fallbackEpochMs: 1,
      error: 'áudio: disk full',
    })
    expect(f).toMatchObject({ error: 'áudio: disk full', audioSamples: null, endedAt: '2026-11-04T00:31:12.000Z' })
  })

  it('finishing keeps a known audio start', () => {
    const f = finishSession(startSession(base), {
      endedAt: new Date('2026-11-04T00:31:12Z'),
      frames: 1,
      framesSkipped: 0,
      audioSamples: 1,
      audioStartEpochMs: 1_793_000_000_500.25,
      fallbackEpochMs: 1,
      error: null,
    })
    expect(f.audioStartEpochMs).toBe(1_793_000_000_500.25)
  })
})
