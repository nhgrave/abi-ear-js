/** Seta do cursor no quadro (abi_ear/vision/cursor.py): TM_CCOEFF_NORMED do OpenCV com somas integrais. */
import { ARROW, ARROW_POINT, MIN_ARROW_SCORE } from './arrow'
import type { Gray } from './image'
import type { GridGeometry } from './types'

export type CursorSample = { t: number; x: number; y: number; score: number }

const MIN_STD = 1 // janela mais lisa que isso não chega a 0.8
const LOCAL_CELLS = 2 // meia-largura da busca local, em células

// Modelo com a média subtraída e sua energia, calculados uma vez.
const T_N = ARROW.w * ARROW.h
const T_MEAN = ARROW.data.reduce((a, v) => a + v, 0) / T_N
const T_ZERO = Float64Array.from(ARROW.data, (v) => v - T_MEAN)
const T_ENERGY = T_ZERO.reduce((a, v) => a + v * v, 0)

// Pixels do modelo com maior |T'|: o núcleo branco e a borda escura da seta.
const SPARSE_N = 48
const TOP_K = 24
const SPARSE = Array.from(T_ZERO, (t, k) => ({ t, dx: k % ARROW.w, dy: Math.floor(k / ARROW.w) }))
  .sort((p, q) => Math.abs(q.t) - Math.abs(p.t))
  .slice(0, SPARSE_N)

/** Melhor posição do modelo com o canto dentro de `region` ([x, y, w, h], a janela inteira onde o modelo cabe).
 * Devolve o canto do modelo e a nota, como cv2.matchTemplate + minMaxLoc. */
export function matchArrow(gray: Gray, region: [number, number, number, number]): { score: number; x: number; y: number } {
  const tw = ARROW.w
  const th = ARROW.h
  const rx0 = Math.max(0, Math.floor(region[0]))
  const ry0 = Math.max(0, Math.floor(region[1]))
  const rx1 = Math.min(gray.w, Math.floor(region[0] + region[2]))
  const ry1 = Math.min(gray.h, Math.floor(region[1] + region[3]))
  const rw = rx1 - rx0
  const rh = ry1 - ry0
  const best = { score: 0, x: rx0, y: ry0 }
  if (rw < tw || rh < th) return best

  // Somas integrais (tamanho (rw+1)×(rh+1)) de I e I² da região.
  const iw = rw + 1
  const sum = new Float64Array(iw * (rh + 1))
  const sq = new Float64Array(iw * (rh + 1))
  const data = gray.data
  for (let y = 0; y < rh; y++) {
    let rs = 0
    let rq = 0
    const src = (ry0 + y) * gray.w + rx0
    for (let x = 0; x < rw; x++) {
      const v = data[src + x]
      rs += v
      rq += v * v
      sum[(y + 1) * iw + x + 1] = sum[y * iw + x + 1] + rs
      sq[(y + 1) * iw + x + 1] = sq[y * iw + x + 1] + rq
    }
  }

  const minVar = MIN_STD * MIN_STD * T_N
  const nx = rw - tw + 1
  const ny = rh - th + 1

  // Estágio 1: nota aproximada só com os pixels mais informativos do modelo (SPARSE), para ranquear.
  // Estágio 2: nota exata (TM_CCOEFF_NORMED) só nas TOP_K melhores posições. Sem isso a busca no grid
  // inteiro custa 238 multiplicações por posição e passa de 150 ms.
  const offs = new Int32Array(SPARSE.length)
  for (let n = 0; n < SPARSE.length; n++) offs[n] = SPARSE[n].dy * gray.w + SPARSE[n].dx
  const topScore = new Float64Array(TOP_K).fill(-Infinity)
  const topPos = new Int32Array(TOP_K) // y * nx + x
  let minIdx = 0
  for (let y = 0; y < ny; y++) {
    for (let x = 0; x < nx; x++) {
      const a = y * iw + x
      const b = (y + th) * iw + x
      const s = sum[b + tw] - sum[b] - sum[a + tw] + sum[a]
      const s2 = sq[b + tw] - sq[b] - sq[a + tw] + sq[a]
      const v = s2 - (s * s) / T_N // N × variância da janela
      if (v < minVar) continue
      const base = (ry0 + y) * gray.w + rx0 + x
      const mean = s / T_N
      let est = 0
      for (let n = 0; n < offs.length; n++) est += SPARSE[n].t * (data[base + offs[n]] - mean)
      est /= Math.sqrt(v)
      if (est > topScore[minIdx]) {
        topScore[minIdx] = est
        topPos[minIdx] = y * nx + x
        minIdx = 0
        for (let n = 1; n < TOP_K; n++) if (topScore[n] < topScore[minIdx]) minIdx = n
      }
    }
  }

  // Varre as candidatas na ordem de varredura, para o desempate ser o mesmo do minMaxLoc (primeira máxima).
  const cand = Array.from(topPos).filter((_, n) => topScore[n] > -Infinity).sort((p, q) => p - q)
  for (const pos of cand) {
    const x = pos % nx
    const y = (pos - x) / nx
    const a = y * iw + x
    const b = (y + th) * iw + x
    const s = sum[b + tw] - sum[b] - sum[a + tw] + sum[a]
    const s2 = sq[b + tw] - sq[b] - sq[a + tw] + sq[a]
    const v = s2 - (s * s) / T_N
    // Σ T'·I (T' tem média zero, então não precisa subtrair a média da janela).
    let num = 0
    for (let j = 0; j < th; j++) {
      let p = (ry0 + y + j) * gray.w + rx0 + x
      let k = j * tw
      for (let i = 0; i < tw; i++) num += T_ZERO[k++] * data[p++]
    }
    const score = num / Math.sqrt(T_ENERGY * v)
    if (score > best.score) {
      best.score = score
      best.x = rx0 + x
      best.y = ry0 + y
    }
  }
  return best
}

/** Segue a seta quadro a quadro: busca perto da última posição e, se falhar, no retângulo do grid. */
export class CursorTracker {
  private last: { x: number; y: number } | null = null // canto do modelo

  find(gray: Gray, t: number, grid: GridGeometry | null): CursorSample | null {
    if (!grid) return null
    let m: { score: number; x: number; y: number } | null = null
    if (this.last) {
      const r = LOCAL_CELLS * grid.pitch
      m = matchArrow(gray, [this.last.x - r, this.last.y - r, 2 * r + ARROW.w, 2 * r + ARROW.h])
    }
    if (!m || m.score < MIN_ARROW_SCORE) {
      const p = grid.pitch
      m = matchArrow(gray, [grid.x0 - p, grid.y0 - p, (grid.cols + 2) * p, (grid.rows + 2) * p])
    }
    if (m.score < MIN_ARROW_SCORE) {
      this.last = null
      return null
    }
    this.last = { x: m.x, y: m.y }
    return { t, x: m.x + ARROW_POINT[0], y: m.y + ARROW_POINT[1], score: m.score }
  }
}
