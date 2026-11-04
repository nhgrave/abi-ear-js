import { describe, expect, it } from 'vitest'
import { EventLog } from './event-log'

function sink() {
  const chunks: string[] = []
  let closed = false
  return {
    chunks,
    closed: () => closed,
    write: async (data: string) => void chunks.push(data),
    close: async () => void (closed = true),
  }
}

describe('EventLog', () => {
  it('writes one JSON line per event, in order, and closes', async () => {
    const s = sink()
    const log = new EventLog(s)
    log.append({ type: 'a', t: 1 })
    log.append({ type: 'b', t: 2 })
    expect(await log.finish()).toBe(2)
    expect(s.chunks.join('')).toBe('{"type":"a","t":1}\n{"type":"b","t":2}\n')
    expect(s.closed()).toBe(true)
  })

  it('keeps the first write error, stops writing and rejects on finish', async () => {
    const chunks: string[] = []
    let n = 0
    const log = new EventLog({
      write: async (d: string) => {
        if (++n === 1) throw new Error('disk full')
        chunks.push(d)
      },
      close: async () => {},
    })
    log.append({ type: 'a' })
    log.append({ type: 'b' })
    await expect(log.finish()).rejects.toThrow('disk full')
    expect(chunks).toEqual([])
    expect(log.error).toBeInstanceOf(Error)
  })

  it('ignores events after finish', async () => {
    const s = sink()
    const log = new EventLog(s)
    await log.finish()
    log.append({ type: 'late' })
    expect(s.chunks).toEqual([])
  })
})
