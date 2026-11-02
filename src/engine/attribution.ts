/** Atribuição da pegada à caixa sob o cursor (seção 8.3): só atribui com cursor confiável e parado numa caixa. */
import { MIN_ARROW_SCORE } from './vision/arrow'
import type { CursorSample } from './vision/cursor'

/** Amostras entre tSound − 400 e tSound − 150 ms (revisado em 02/11 com quatro gravações). */
export const WINDOW_MS: [number, number] = [150, 400]
const KEEP_MS = 3000

export type Missing = { t: number; missing: true }
export type HistorySample = CursorSample | Missing

export type Attribution =
  | { kind: 'box'; uid: number }
  | { kind: 'none'; reason: 'no-frame' | 'no-cursor' | 'no-box' | 'moving' }

export class CursorHistory {
  private items: HistorySample[] = []

  add(s: HistorySample): void {
    this.items.push(s)
    const cut = s.t - KEEP_MS
    let n = 0
    while (n < this.items.length && this.items[n].t < cut) n++
    if (n > 0) this.items.splice(0, n)
  }

  between(t0: number, t1: number): HistorySample[] {
    return this.items.filter((s) => s.t >= t0 && s.t <= t1)
  }
}

export function attribute(
  history: CursorHistory,
  tSound: number,
  boxAt: (x: number, y: number) => { uid: number } | null,
): Attribution {
  const samples = history.between(tSound - WINDOW_MS[1], tSound - WINDOW_MS[0])
  if (samples.length === 0) return { kind: 'none', reason: 'no-frame' }
  const uids = new Set<number>()
  let noBox = false
  for (const s of samples) {
    if ('missing' in s || s.score < MIN_ARROW_SCORE) return { kind: 'none', reason: 'no-cursor' }
    const box = boxAt(s.x, s.y)
    if (box) uids.add(box.uid)
    else noBox = true
  }
  if (noBox) return { kind: 'none', reason: 'no-box' }
  if (uids.size > 1) return { kind: 'none', reason: 'moving' }
  return { kind: 'box', uid: [...uids][0] }
}
