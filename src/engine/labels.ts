/** Rótulos das caixas do vendedor: texto lido -> nome do tipo na base (abi_ear/vision/ocr.py e abi_ear/labels). */
import type { Dataset } from './data/dataset'

export const LABEL_CUTOFF = 0.75

/** Texto exibido no jogo -> nome do tipo na base. */
export type LabelTable = ReadonlyMap<string, string>

/** Tabela em inglês: cada nome de tipo da base é o próprio texto do jogo (igual a abi_ear/labels/en.json). */
export function labelTable(ds: Dataset): LabelTable {
  return new Map([...ds.typeIds.keys()].map((name) => [name, name]))
}

const squash = (text: string): string => text.toLowerCase().replace(/[^a-z]/g, '')

/** Texto lido (com quebras como "Uncommo n Mystery") -> nome do tipo na base, ou null. */
export function normalizeLabel(text: string, labels: LabelTable): string | null {
  const squashed = squash(text)
  if (!squashed) return null
  const bySquash = new Map<string, string>()
  for (const [shown, typeName] of labels) bySquash.set(squash(shown), typeName)
  const exact = bySquash.get(squashed)
  if (exact !== undefined) return exact
  // difflib.get_close_matches(n=1): maior razão >= corte; no empate, a maior string (nlargest de (score, x))
  let best: { score: number; key: string } | null = null
  for (const key of bySquash.keys()) {
    const score = sequenceRatio(key, squashed)
    if (score < LABEL_CUTOFF) continue
    if (best === null || score > best.score || (score === best.score && key > best.key)) best = { score, key }
  }
  return best ? bySquash.get(best.key)! : null
}

/** difflib.SequenceMatcher(None, a, b).ratio(): 2*M/T, sem junk (o autojunk só age a partir de 200 caracteres). */
export function sequenceRatio(a: string, b: string): number {
  const total = a.length + b.length
  if (total === 0) return 1
  const b2j = new Map<string, number[]>()
  for (let j = 0; j < b.length; j++) {
    const list = b2j.get(b[j])
    if (list) list.push(j)
    else b2j.set(b[j], [j])
  }
  let matches = 0
  const queue: [number, number, number, number][] = [[0, a.length, 0, b.length]]
  while (queue.length > 0) {
    const [alo, ahi, blo, bhi] = queue.pop()!
    const [i, j, k] = longestMatch(a, b2j, alo, ahi, blo, bhi)
    if (k === 0) continue
    matches += k
    if (alo < i && blo < j) queue.push([alo, i, blo, j])
    if (i + k < ahi && j + k < bhi) queue.push([i + k, ahi, j + k, bhi])
  }
  return (2 * matches) / total
}

/** find_longest_match: o bloco mais longo; no empate, o de menor i e depois o de menor j. */
function longestMatch(a: string, b2j: Map<string, number[]>, alo: number, ahi: number, blo: number, bhi: number): [number, number, number] {
  let besti = alo
  let bestj = blo
  let bestsize = 0
  let j2len = new Map<number, number>()
  for (let i = alo; i < ahi; i++) {
    const next = new Map<number, number>()
    for (const j of b2j.get(a[i]) ?? []) {
      if (j < blo) continue
      if (j >= bhi) break
      const k = (j2len.get(j - 1) ?? 0) + 1
      next.set(j, k)
      if (k > bestsize) {
        besti = i - k + 1
        bestj = j - k + 1
        bestsize = k
      }
    }
    j2len = next
  }
  return [besti, bestj, bestsize]
}
