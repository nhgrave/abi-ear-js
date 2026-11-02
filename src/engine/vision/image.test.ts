import { expect, it } from 'vitest'
import { meanGray, rgbaToGray } from './image'

it('rgbaToGray matches opencv', () => {
  // vermelho, verde, azul e (R201, G140, B37); valores de cv2.cvtColor(..., cv2.COLOR_BGR2GRAY)
  const rgba = new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 201, 140, 37, 255])
  const g = rgbaToGray(rgba, 2, 2)
  expect([g.w, g.h]).toEqual([2, 2])
  expect([...g.data]).toEqual([76, 150, 29, 146])
})

it('meanGray is the mean of the pixels', () => {
  expect(meanGray({ w: 2, h: 2, data: new Uint8Array([76, 150, 29, 146]) })).toBe(100.25)
})
