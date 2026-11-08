/** Leitura do rótulo das caixas do vendedor por modelos de imagem (forma B da spec v0.2).
 *
 * O jogo escreve o rótulo sempre com a mesma fonte, no topo da caixa, quebrando as linhas conforme a largura
 * ("Uncommo / n / Mystery / Cargo" num 1x1). Cada par (categoria, largura) tem um modelo: a média das máscaras de texto
 * de caixas cuja categoria o log do app desktop confirma. A leitura compara a máscara da caixa com os modelos da mesma
 * largura e só aceita com folga sobre o segundo melhor. */
import type { LabelReading } from '../pipeline'
import type { Gray } from './image'
import { cellOrigin, type BoxRect, type GridGeometry } from './types'

export const MODEL_PITCH = 64 // escala canônica: a célula de 1080p
const MARGIN = 2 // px canônicos fora das linhas do grid
const SHIFT = 2 // px canônicos de folga na posição (grid achado com 1–2 px de erro)
const TEXT_MIN_FRACTION = 0.01 // fração da faixa acima do nível de texto para dizer que há texto

// mask: base64 de Uint8Array (0..255); minScore: nota mínima própria (a do arquivo do idioma, quando difere da geral)
export type LabelModel = { label: string; w: number; mask: string; minScore?: number }
export type LabelModels = { version: 1; textLevel: number; minScore: number; margin: number; models: LabelModel[] }

/** Altura da faixa do rótulo em px canônicos: o 1x1 vai até 4 linhas (a célula inteira); de 2 de largura em
 * diante, até 2 linhas. */
export function bandHeight(w: number): number {
  return w === 1 ? MODEL_PITCH : Math.round(0.6 * MODEL_PITCH)
}

function maskSize(w: number): [number, number] {
  return [w * MODEL_PITCH - 2 * MARGIN, bandHeight(w) - MARGIN]
}

/** Faixa do rótulo na escala canônica: 1 onde o cinza (interpolado) passa de `textLevel`, senão 0. */
export function textMask(gray: Gray, geom: GridGeometry, box: BoxRect, textLevel: number): Float32Array {
  const [W, H] = maskSize(box.w)
  const [ox, oy] = cellOrigin(geom, box.col, box.row)
  const k = geom.pitch / MODEL_PITCH
  const out = new Float32Array(W * H)
  const d = gray.data
  for (let v = 0; v < H; v++) {
    const sy = oy + (v + MARGIN + 0.5) * k - 0.5
    const y0 = Math.floor(sy)
    const fy = sy - y0
    if (y0 < 0 || y0 + 1 >= gray.h) continue
    for (let u = 0; u < W; u++) {
      const sx = ox + (u + MARGIN + 0.5) * k - 0.5
      const x0 = Math.floor(sx)
      const fx = sx - x0
      if (x0 < 0 || x0 + 1 >= gray.w) continue
      const i = y0 * gray.w + x0
      const top = d[i] * (1 - fx) + d[i + 1] * fx
      const bottom = d[i + gray.w] * (1 - fx) + d[i + gray.w + 1] * fx
      if (top * (1 - fy) + bottom * fy >= textLevel) out[v * W + u] = 1
    }
  }
  return out
}

/** Modelo de um par (categoria, largura): a média das máscaras das amostras. */
export function buildModel(label: string, w: number, masks: Float32Array[]): LabelModel {
  const n = masks[0].length
  const bytes = new Uint8Array(n)
  for (let i = 0; i < n; i++) {
    let sum = 0
    for (const m of masks) sum += m[i]
    bytes[i] = Math.round((sum / masks.length) * 255)
  }
  let bin = ''
  for (let i = 0; i < n; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return { label, w, mask: btoa(bin) }
}

type Template = { label: string; t: Float32Array; sum: number; varT: number }
const decoded = new WeakMap<LabelModel, Template>()

function template(m: LabelModel): Template {
  let tpl = decoded.get(m)
  if (!tpl) {
    const bin = atob(m.mask)
    const t = new Float32Array(bin.length)
    let sum = 0
    let sq = 0
    for (let i = 0; i < bin.length; i++) {
      t[i] = bin.charCodeAt(i) / 255
      sum += t[i]
      sq += t[i] * t[i]
    }
    tpl = { label: m.label, t, sum, varT: sq - (sum * sum) / t.length }
    decoded.set(m, tpl)
  }
  return tpl
}

/** Correlação normalizada (média zero) entre a máscara e o modelo, na melhor posição dentro de ±SHIFT px. A máscara
 * é binária: as somas percorrem só os pixels de texto. */
function score(ones: Int32Array, nOnes: number, W: number, H: number, tpl: Template): number {
  const N = W * H
  if (tpl.varT <= 0 || nOnes === 0) return 0
  let best = -1
  for (let dy = -SHIFT; dy <= SHIFT; dy++) {
    for (let dx = -SHIFT; dx <= SHIFT; dx++) {
      let sm = 0
      let smt = 0
      for (let j = 0; j < nOnes; j++) {
        const x = ones[2 * j] - dx
        const y = ones[2 * j + 1] - dy
        if (x < 0 || y < 0 || x >= W || y >= H) continue
        sm++
        smt += tpl.t[y * W + x]
      }
      const varM = sm - (sm * sm) / N
      if (varM <= 0) continue
      const s = (smt - (sm * tpl.sum) / N) / Math.sqrt(varM * tpl.varT)
      if (s > best) best = s
    }
  }
  return best
}

type LabelScore = { s: number; min: number } // melhor nota da categoria e a nota mínima do modelo que a deu

function scoresOf(ones: Int32Array, n: number, W: number, H: number, w: number, models: LabelModels): Map<string, LabelScore> {
  const byLabel = new Map<string, LabelScore>()
  for (const m of models.models) {
    if (m.w !== w) continue
    const s = score(ones, n, W, H, template(m))
    if (s > (byLabel.get(m.label)?.s ?? -Infinity)) byLabel.set(m.label, { s, min: m.minScore ?? models.minScore })
  }
  return byLabel
}

/** Nota de cada categoria para o rótulo de uma caixa (diagnóstico e ajuste dos limiares). */
export function labelScores(gray: Gray, geom: GridGeometry, box: BoxRect, models: LabelModels): Map<string, number> {
  const [W, H] = maskSize(box.w)
  const mask = textMask(gray, geom, box, models.textLevel)
  const ones = new Int32Array(2 * mask.length)
  let n = 0
  for (let i = 0; i < mask.length; i++) {
    if (mask[i] === 0) continue
    ones[2 * n] = i % W
    ones[2 * n + 1] = Math.floor(i / W)
    n++
  }
  return new Map([...scoresOf(ones, n, W, H, box.w, models)].map(([l, x]) => [l, x.s]))
}

/** Rótulo de cada caixa inteira. Todas são lidas em toda varredura, também as que já têm categoria: só a leitura
 * percebe que outra caixa do mesmo tamanho tomou o lugar de uma pega (o estoque do vendedor muda). */
export function readLabels(
  gray: Gray,
  geom: GridGeometry,
  boxes: readonly BoxRect[],
  models: LabelModels,
): LabelReading[] {
  const out: LabelReading[] = []
  for (const box of boxes) {
    if (box.clipped) continue
    const [W, H] = maskSize(box.w)
    const mask = textMask(gray, geom, box, models.textLevel)
    const ones = new Int32Array(2 * mask.length)
    let n = 0
    for (let i = 0; i < mask.length; i++) {
      if (mask[i] === 0) continue
      ones[2 * n] = i % W
      ones[2 * n + 1] = Math.floor(i / W)
      n++
    }
    const hasText = n / mask.length >= TEXT_MIN_FRACTION
    let label: string | null = null
    if (hasText) {
      // melhor nota de cada categoria: com modelos de dois idiomas, a margem vale contra a melhor das outras
      // categorias, e não contra o outro modelo da mesma
      const byLabel = scoresOf(ones, n, W, H, box.w, models)
      let best = { label: '', s: -Infinity, min: models.minScore }
      let second = -Infinity
      for (const [l, { s, min }] of byLabel) {
        if (s > best.s) {
          second = Math.max(second, best.s)
          best = { label: l, s, min }
        } else if (s > second) second = s
      }
      if (best.s >= best.min && best.s - Math.max(second, 0) >= models.margin) label = best.label
    }
    out.push({ col: box.col, row: box.row, w: box.w, h: box.h, label, hasText })
  }
  return out
}
