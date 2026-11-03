/** Deslocamento vertical (em linhas) entre dois scans, casando o layout das caixas.
 * Correlação de fase sofre aliasing de uma célula inteira porque o grid é periódico;
 * o padrão de caixas (posição + tamanho) não é. */
import type { BoxRect } from './types'

export const MAX_SHIFT = 12
export const MIN_MATCH_FRACTION = 0.4

const boxKey = (col: number, row: number, w: number, h: number) => `${col},${row},${w},${h}`

/** k tal que a caixa na linha r de `prev` está na linha r + k em `curr`. null se incerto. */
export function estimateRowShift(prev: readonly BoxRect[], curr: readonly BoxRect[], maxShift = MAX_SHIFT): number | null {
  const a = new Map(prev.filter((b) => !b.clipped).map((b) => [boxKey(b.col, b.row, b.w, b.h), b]))
  const c = new Set(curr.filter((b) => !b.clipped).map((b) => boxKey(b.col, b.row, b.w, b.h)))
  if (a.size === 0 || c.size === 0) return null
  const ks: number[] = []
  for (let k = -maxShift; k <= maxShift; k++) ks.push(k)
  let bestK: number | null = null
  let bestN = 0
  let tied = false
  for (const k of ks) {
    let n = 0
    for (const b of a.values()) if (c.has(boxKey(b.col, b.row + k, b.w, b.h))) n++
    if (n > bestN) {
      bestK = k
      bestN = n
      tied = false
    } else if (n === bestN && n > 0) tied = true
  }
  // dois deslocamentos explicando o mesmo tanto (leituras parciais, como no arrasto) não decidem a rolagem: quem
  // chama compara com o layout guardado inteiro (o Python fica com o menor deslocamento)
  if (tied || bestN < 2 || bestN < MIN_MATCH_FRACTION * Math.min(a.size, c.size)) return null
  return bestK
}
