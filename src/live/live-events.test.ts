import { describe, expect, it } from 'vitest'
import { LiveEvents, pickupEvent } from './live-events'

const pickup = { kind: 'pickup' as const, t: 1000.4, soundId: 7, score: 0.93, hits: [] }

describe('pickupEvent', () => {
  it('records the assigned box on the epoch clock', () => {
    const box = { col: 2, row: 0, w: 2, h: 2, label: 'Mystery Cargo' }
    expect(pickupEvent({ kind: 'assigned', uid: 5, event: pickup }, 'Item_Up', box, 1793744800000)).toEqual({
      type: 'pickup',
      t: 1793744801000.4,
      sound: 'Item_Up',
      score: 0.93,
      outcome: 'assigned',
      reason: null,
      box: { col: 2, row: 0, w: 2, h: 2, label: 'Mystery Cargo' },
    })
  })

  it('records why a pickup was not assigned', () => {
    const e = pickupEvent({ kind: 'unassigned', reason: 'no-cursor', event: pickup }, 'Item_Up', null, 0)
    expect(e).toMatchObject({ outcome: 'unassigned', reason: 'no-cursor', box: null })
  })
})

describe('LiveEvents', () => {
  it('sends events to every listener until it unsubscribes', () => {
    const ev = new LiveEvents()
    const a: string[] = []
    const off = ev.on((e) => a.push(e.type))
    ev.emit({ type: 'near-miss', t: 1, sound: 'x', score: 0.7 })
    off()
    ev.emit({ type: 'near-miss', t: 2, sound: 'x', score: 0.7 })
    expect(a).toEqual(['near-miss'])
  })

  it('sends health and problems only when they change', () => {
    const ev = new LiveEvents()
    const seen: unknown[] = []
    ev.on((e) => seen.push(e))
    const h = { audio: { level: 'green', reason: 'a' }, screen: { level: 'green', reason: 'b' } }
    ev.state(10, h, [])
    ev.state(20, h, [])
    ev.state(30, { ...h, audio: { level: 'yellow', reason: 'audio.low' } }, [])
    ev.state(40, { ...h, audio: { level: 'yellow', reason: 'audio.low' } }, ['problem.noAudio'])
    expect(seen.map((e) => (e as { type: string; t: number }).type + (e as { t: number }).t)).toEqual([
      'health10',
      'problems10',
      'health30',
      'problems40',
    ])
  })

  it('gives a new listener the current health and problems', () => {
    const ev = new LiveEvents()
    ev.state(10, { audio: { level: 'gray', reason: 'screen.off' } }, ['problem.load'])
    const seen: string[] = []
    ev.on((e) => seen.push(e.type))
    expect(seen).toEqual(['health', 'problems'])
  })
})
