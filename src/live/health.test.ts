import { describe, expect, it } from 'vitest'
import { audioHealth, cursorHealth, screenHealth, vendorHealth } from './health'

describe('indicator health', () => {
  const now = 100_000
  it('audio indicator turns yellow on low scores or near misses', () => {
    const base = { sharing: true, hasTrack: true, lastChunkMs: now - 100, now, scores: [0.95, 0.9, 0.92], nearMisses: [] }
    expect(audioHealth(base).level).toBe('green')
    expect(audioHealth({ ...base, scores: [0.95, 0.75, 0.74, 0.72, 0.9, 0.73] })).toEqual({ level: 'yellow', reason: 'audio.low' })
    expect(audioHealth({ ...base, nearMisses: [now - 1000, now - 20_000, now - 59_000] }).level).toBe('yellow')
    expect(audioHealth({ ...base, nearMisses: [now - 1000, now - 20_000, now - 61_000] }).level).toBe('green')
    expect(audioHealth({ ...base, hasTrack: false }).level).toBe('red')
    expect(audioHealth({ ...base, lastChunkMs: now - 2500 }).level).toBe('red')
  })

  it('black frames turn screen indicator yellow', () => {
    const base = { sharing: true, lastFrameMs: now - 50, now, means: [[now - 1500, 40], [now - 100, 35]] as [number, number][] }
    expect(screenHealth(base).level).toBe('green')
    expect(screenHealth({ ...base, means: [[now - 1900, 2], [now - 900, 3], [now - 100, 1]] })).toEqual({ level: 'yellow', reason: 'screen.black' })
    expect(screenHealth({ ...base, sharing: false }).level).toBe('gray')
  })

  it('cursor indicator turns yellow when arrow missing', () => {
    expect(cursorHealth({ vendorVisible: true, lastArrowMs: now - 500, now, lastNoCursorMs: null }).level).toBe('green')
    // a seta sumiu e uma pegada recente não achou o cursor: aí sim o aviso
    expect(cursorHealth({ vendorVisible: true, lastArrowMs: now - 6000, now, lastNoCursorMs: now - 2000 })).toEqual({ level: 'yellow', reason: 'cursor.missing' })
    expect(cursorHealth({ vendorVisible: true, lastArrowMs: null, now, lastNoCursorMs: now - 2000 }).level).toBe('yellow')
    expect(cursorHealth({ vendorVisible: false, lastArrowMs: now - 500, now, lastNoCursorMs: null }).level).toBe('gray')
  })

  it('cursor elsewhere on screen without pickups is not a warning', () => {
    expect(cursorHealth({ vendorVisible: true, lastArrowMs: now - 60_000, now, lastNoCursorMs: null }).level).toBe('gray')
    expect(cursorHealth({ vendorVisible: true, lastArrowMs: now - 60_000, now, lastNoCursorMs: now - 40_000 }).level).toBe('gray')
  })

  it('audio indicator is gray when not sharing', () => {
    expect(audioHealth({ sharing: false, hasTrack: false, lastChunkMs: null, now, scores: [], nearMisses: [] }).level).toBe('gray')
  })

  it('vendor indicator suggests the wrong screen after 30 s', () => {
    expect(vendorHealth({ lastSeen: now - 1000, now, sharingSinceMs: now - 60_000 }).level).toBe('green')
    expect(vendorHealth({ lastSeen: null, now, sharingSinceMs: now - 31_000 })).toEqual({ level: 'yellow', reason: 'vendor.wrongScreen' })
    expect(vendorHealth({ lastSeen: null, now, sharingSinceMs: now - 5000 }).level).toBe('gray')
    expect(vendorHealth({ lastSeen: now - 5000, now, sharingSinceMs: now - 60_000 }).level).toBe('gray')
  })
})
