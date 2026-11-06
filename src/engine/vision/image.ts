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

/** RGBA de um recorte de `w` × `h` que começa na coluna `x0` de `out`, convertido para cinza no lugar dele (sem
 * alocar: o worker reaproveita a mesma imagem a cada quadro). */
export function rgbaToGrayInto(rgba: Uint8ClampedArray, w: number, h: number, out: Gray, x0: number): void {
  const d = out.data
  for (let y = 0, j = 0; y < h; y++) {
    for (let x = 0, i = y * out.w + x0; x < w; x++, i++, j += 4) {
      d[i] = (rgba[j] * 4899 + rgba[j + 1] * 9617 + rgba[j + 2] * 1868 + 8192) >> 14
    }
  }
}

/** Média de cinza das colunas a partir de `x0` (a página só lê a metade direita da tela). */
export function meanGray(g: Gray, x0 = 0): number {
  const d = g.data
  const from = Math.max(0, Math.min(g.w, x0))
  const n = (g.w - from) * g.h
  let sum = 0
  for (let y = 0; y < g.h; y++) for (let i = y * g.w + from, end = (y + 1) * g.w; i < end; i++) sum += d[i]
  return n ? sum / n : 0
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
