/** Imagem em tons de cinza, linha a linha (data[y * w + x]). */
export type Gray = { w: number; h: number; data: Uint8Array }

/** RGBA (ImageData/VideoFrame) para cinza com os pesos e o arredondamento de cv2.COLOR_BGR2GRAY. */
export function rgbaToGray(rgba: Uint8ClampedArray, w: number, h: number): Gray {
  const n = w * h
  const data = new Uint8Array(n)
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    data[i] = (rgba[j] * 4899 + rgba[j + 1] * 9617 + rgba[j + 2] * 1868 + 8192) >> 14
  }
  return { w, h, data }
}

export function meanGray(g: Gray): number {
  const d = g.data
  let sum = 0
  for (let i = 0; i < d.length; i++) sum += d[i]
  return d.length ? sum / d.length : 0
}

/** Recorte (x, y, w, h) copiado para uma imagem nova, com o fatiamento do numpy (limites presos à imagem). */
export function crop(g: Gray, x: number, y: number, w: number, h: number): Gray {
  const xa = Math.max(0, Math.min(g.w, x))
  const xb = Math.max(xa, Math.min(g.w, x + w))
  const ya = Math.max(0, Math.min(g.h, y))
  const yb = Math.max(ya, Math.min(g.h, y + h))
  const cw = xb - xa
  const data = new Uint8Array(cw * (yb - ya))
  for (let r = ya; r < yb; r++) data.set(g.data.subarray(r * g.w + xa, r * g.w + xb), (r - ya) * cw)
  return { w: cw, h: yb - ya, data }
}
