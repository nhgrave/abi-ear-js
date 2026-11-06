import { expect, it } from 'vitest'
import { meanGray, rgbaToGray, rgbaToGrayInto } from './image'

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

it('meanGray from a column on is the mean of that part only', () => {
  // a página só lê a metade direita da tela: a esquerda fica zerada e não entra na média
  expect(meanGray({ w: 4, h: 1, data: new Uint8Array([0, 0, 40, 60]) }, 2)).toBe(50)
})

it('rgbaToGrayInto writes a crop at its place in a full-size gray image', () => {
  const out = { w: 4, h: 2, data: new Uint8Array(8) }
  const crop = new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 201, 140, 37, 255]) // 2x2
  rgbaToGrayInto(crop, 2, 2, out, 2)
  expect([...out.data]).toEqual([0, 0, 76, 150, 0, 0, 29, 146])
})
