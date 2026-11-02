import { test, expect } from 'vitest'
import { encodeWav, frameName, epochOfFrame, streamProblems } from './format'

test('encodeWav writes a float32 mono header', () => {
  const buf = encodeWav(new Float32Array([0, 0.5, -1]), 48000)
  const v = new DataView(buf)
  expect(String.fromCharCode(...new Uint8Array(buf, 0, 4))).toBe('RIFF')
  expect(v.getUint16(20, true)).toBe(3)        // IEEE float
  expect(v.getUint16(22, true)).toBe(1)        // mono
  expect(v.getUint32(24, true)).toBe(48000)
  expect(v.getUint16(34, true)).toBe(32)
  expect(v.getUint32(40, true)).toBe(12)       // 3 amostras * 4 bytes
  expect(v.getFloat32(48, true)).toBe(0.5)
  expect(buf.byteLength).toBe(44 + 12)
})

test('frameName uses the integer epoch', () => expect(frameName(1793600000123.7)).toBe('frames/1793600000123.jpg'))

test('epochOfFrame maps context time to epoch', () =>
  expect(epochOfFrame(96000, 48000, { contextTime: 1.5, performanceTime: 2000 }, 1_000_000)).toBe(1_002_500))

test('a stream without audio cannot be recorded', () => {
  expect(streamProblems({ audioTracks: 0, displaySurface: 'window' }).length).toBeGreaterThan(0)
  expect(streamProblems({ audioTracks: 1, displaySurface: 'browser' }).length).toBeGreaterThan(0)
  expect(streamProblems({ audioTracks: 1, displaySurface: 'monitor' })).toEqual([])
})
