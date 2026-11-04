import { describe, expect, it, vi } from 'vitest'
import { FrameRecorder } from './frame-recorder'

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('FrameRecorder', () => {
  it('takes one frame per interval', async () => {
    const writes: string[] = []
    const recorder = new FrameRecorder<string>({
      intervalMs: 100,
      maxInFlight: 1,
      encode: async (f) => new Blob([f]),
      write: async (name) => {
        writes.push(name)
      },
    })

    const r1 = recorder.offer('f1', 0)
    await tick()
    const r2 = recorder.offer('f2', 40)
    await tick()
    const r3 = recorder.offer('f3', 100)
    await tick()
    const r4 = recorder.offer('f4', 150)
    await tick()
    const r5 = recorder.offer('f5', 205)

    expect(r1).toBe('taken')
    expect(r2).toBe('early')
    expect(r3).toBe('taken')
    expect(r4).toBe('early')
    expect(r5).toBe('taken')

    const drainResult = await recorder.drain()
    expect(drainResult).toEqual({ frames: 3, skipped: 0, error: null })
    expect(writes).toEqual(['0.jpg', '100.jpg', '205.jpg'])
  })

  it('names frames by the integer epoch', async () => {
    let savedName = ''
    let savedBlob: Blob | undefined
    const recorder = new FrameRecorder<string>({
      intervalMs: 100,
      maxInFlight: 1,
      encode: async (f) => new Blob([f]),
      write: async (name, data) => {
        savedName = name
        savedBlob = data
      },
    })

    const status = recorder.offer('frame-bytes', 1793600000123.7)
    expect(status).toBe('taken')

    await recorder.drain()
    expect(savedName).toBe('1793600000123.jpg')
    expect(await savedBlob!.text()).toBe('frame-bytes')
  })

  it('skips a due frame while the previous write is pending', async () => {
    let resolveFirstWrite!: () => void
    const firstWritePromise = new Promise<void>((resolve) => {
      resolveFirstWrite = resolve
    })
    let writeCount = 0
    const write = vi.fn(async () => {
      writeCount++
      if (writeCount === 1) {
        await firstWritePromise
      }
    })

    const recorder = new FrameRecorder<string>({
      intervalMs: 100,
      maxInFlight: 1,
      encode: async (f) => new Blob([f]),
      write,
    })

    expect(recorder.offer('f1', 0)).toBe('taken')
    await Promise.resolve()
    expect(recorder.offer('f2', 100)).toBe('skipped')
    expect(recorder.offer('f3', 150)).toBe('early')

    resolveFirstWrite()
    await tick()

    expect(recorder.offer('f4', 200)).toBe('taken')

    const result = await recorder.drain()
    expect(result).toEqual({ frames: 2, skipped: 1, error: null })
  })

  it('stops after a write error and reports it', async () => {
    let rejectWrite!: (err: unknown) => void
    const pending = new Promise<void>((_, reject) => {
      rejectWrite = reject
    })
    const write = vi.fn(async () => pending)

    const recorder = new FrameRecorder<string>({
      intervalMs: 100,
      maxInFlight: 1,
      encode: async (f) => new Blob([f]),
      write,
    })

    expect(recorder.offer('f1', 0)).toBe('taken')
    await Promise.resolve()

    rejectWrite(new Error('disk full'))
    await tick()

    expect(recorder.offer('f2', 100)).toBe('stopped')

    const result = await recorder.drain()
    expect(result.error).toContain('disk full')
    expect(result.frames).toBe(0)
  })

  it('keeps up to maxInFlight frames encoding or writing at once', async () => {
    const release: (() => void)[] = []
    const writes: string[] = []
    const recorder = new FrameRecorder<string>({
      intervalMs: 100,
      maxInFlight: 3,
      encode: async (f) => new Blob([f]),
      write: (name) =>
        new Promise<void>((r) => {
          writes.push(name)
          release.push(r)
        }),
    })

    expect(recorder.offer('f1', 0)).toBe('taken')
    expect(recorder.offer('f2', 100)).toBe('taken')
    expect(recorder.offer('f3', 200)).toBe('taken')
    expect(recorder.offer('f4', 300)).toBe('skipped') // três em andamento
    await tick()
    release.shift()!() // o primeiro termina: abre uma vaga
    await tick()
    expect(recorder.offer('f5', 400)).toBe('taken')

    release.forEach((r) => r())
    await tick()
    release.forEach((r) => r()) // o do f5, que entrou depois
    expect(await recorder.drain()).toEqual({ frames: 4, skipped: 1, error: null })
    expect(writes).toEqual(['0.jpg', '100.jpg', '200.jpg', '400.jpg'])
  })

  it('drain waits for every frame in flight', async () => {
    const release: (() => void)[] = []
    const recorder = new FrameRecorder<string>({
      intervalMs: 100,
      maxInFlight: 3,
      encode: async (f) => new Blob([f]),
      write: () => new Promise<void>((r) => release.push(r)),
    })
    recorder.offer('f1', 0)
    recorder.offer('f2', 100)
    await tick()
    let drained = false
    const d = recorder.drain().then((r) => ((drained = true), r))
    release[1]() // o segundo termina antes do primeiro
    await tick()
    expect(drained).toBe(false)
    release[0]()
    expect(await d).toEqual({ frames: 2, skipped: 0, error: null })
  })
})
