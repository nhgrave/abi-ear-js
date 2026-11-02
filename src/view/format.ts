/** Como cada caixa aparece no grid espelhado (spec 8.6). */
import type { BoxView } from '../engine/view'

export type BoxDisplay = { text: string; pct: number | null; tone: 'sure' | 'doubt' | 'idle'; icon: string | null }

const SURE_PCT = 80 // primeiro candidato a partir disto: verde
const FULL_PCT = 99.5 // arredonda para 100%: mostra a imagem do item

export function boxDisplay(b: BoxView): BoxDisplay {
  if (b.picks === 0) return { text: `${b.w}x${b.h}`, pct: null, tone: 'idle', icon: null }
  const top = b.candidates[0]
  if (!top) return { text: '?', pct: null, tone: 'doubt', icon: null }
  const tone = top.pct >= SURE_PCT ? 'sure' : 'doubt'
  const full = b.candidates.length === 1 || top.pct >= FULL_PCT
  return { text: top.name, pct: Math.round(top.pct), tone, icon: full ? top.icon : null }
}
