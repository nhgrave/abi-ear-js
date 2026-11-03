import { describe, expect, it } from 'vitest'
import { fakeDir } from '../../test-utils/fake-fs'
import { listRecordings, summarize } from './history'

describe('recording history', () => {
  it('a finished session is complete with its summary', () =>
    expect(
      summarize(
        '2026-11-04-213012',
        {
          startedAt: '2026-11-04T00:30:12.000Z',
          endedAt: '2026-11-04T00:31:12.000Z',
          frames: 590,
          audioSamples: 2_880_000,
          source: 'abi-ear-js',
          video: { width: 2560, height: 1440 },
        },
        null,
        null,
      ),
    ).toEqual({
      name: '2026-11-04-213012',
      status: 'complete',
      startedAt: '2026-11-04T00:30:12.000Z',
      durationS: 60,
      frames: 590,
      audioS: 60,
      resolution: [2560, 1440],
      error: null,
    }))

  it('a session that ended on an error is failed and keeps the error', () =>
    expect(
      summarize('n', { startedAt: '2026-11-04T00:30:12.000Z', endedAt: '2026-11-04T00:31:12.000Z', audioSamples: null, frames: 50, error: 'áudio: disk full', source: 'abi-ear-js' }, null, 0),
    ).toMatchObject({ status: 'failed', error: 'áudio: disk full', durationS: 60, frames: 50, audioS: null }))

  it('a started session without end is incomplete', () =>
    expect(summarize('n', { startedAt: '2026-11-04T00:30:12.000Z', source: 'abi-ear-js' }, 12, null)).toMatchObject({ status: 'incomplete', frames: 12, durationS: null }))

  it('a broken session.json is incomplete', () => {
    expect(summarize('n', null, 5, 1000).status).toBe('incomplete')
    expect(summarize('n', { video: {} }, 5, 1000).status).toBe('incomplete') // sem startedAt
    expect(summarize('n', 'oops', 5, 1000).status).toBe('incomplete')
  })

  it('a prototype session uses the wav size and frame count', () =>
    expect(summarize('n', { startedAt: '2026-11-02T21:54:59.000Z', audioStartEpochMs: 1, video: {} }, 600, 44 + 4 * 96000)).toMatchObject({
      status: 'prototype',
      frames: 600,
      audioS: 2,
      resolution: null,
    }))

  it('ignores entries that are not recordings', async () => {
    const root = fakeDir({
      'notes.txt': 'x',
      other: {},
      '2026-11-02-185459': { 'session.json': '{"startedAt":"a","audioStartEpochMs":1}', frames: { '1.jpg': '', '2.jpg': '' } },
      '2026-11-04-213012': { 'session.json': '{oops' },
      '2026-11-03-000000': {}, // pasta criada e nada escrito
    })
    expect((await listRecordings(root)).map((r) => [r.name, r.status, r.frames])).toEqual([
      ['2026-11-04-213012', 'incomplete', 0],
      ['2026-11-03-000000', 'incomplete', 0],
      ['2026-11-02-185459', 'prototype', 2],
    ])
  })

  it('reads a finished recording without counting its frames', async () => {
    const session = { startedAt: '2026-11-04T00:30:12.000Z', endedAt: '2026-11-04T00:30:22.000Z', frames: 99, audioSamples: 480_000, source: 'abi-ear-js', video: {} }
    const root = fakeDir({ '2026-11-04-213012': { 'session.json': JSON.stringify(session), 'audio.wav': new Uint8Array(44), frames: { '1.jpg': '' } } })
    expect(await listRecordings(root)).toEqual([
      { name: '2026-11-04-213012', status: 'complete', startedAt: session.startedAt, durationS: 10, frames: 99, audioS: 10, resolution: null, error: null },
    ])
  })
})
