/** Como cada caixa aparece no grid espelhado (spec 8.6). */
import type { BoxView } from '../engine/view'

/** Cores de raridade do jogo, as mesmas do app desktop. A base do Merchant não tem itens de raridade 2 (verde). */
export const RARITY_COLORS: Record<number, string> = { 1: '#9e9e9e', 3: '#2196f3', 4: '#9c27b0', 5: '#ffb300', 6: '#e53935' }
const UNKNOWN_RARITY = '#5a5a5a'

export type BoxDisplay = {
  text: string
  pct: number | null
  count: number // candidatos: mais de um vira o selo "⧉ N"
  color: string | null // raridade do item mais provável; null antes de pegar
  icon: string | null // item certo: a imagem no lugar do texto
  hint: boolean // ainda não pega: o texto é a categoria lida (apagado), não um item
}

const FULL_PCT = 99.5 // arredonda para 100%: mostra a imagem do item

export function boxDisplay(b: BoxView): BoxDisplay {
  // o tamanho já está no desenho do grid; antes de pegar, a categoria lida é o que diz mais
  if (b.picks === 0) return { text: b.label ?? '', pct: null, count: 0, color: null, icon: null, hint: true }
  const top = b.candidates[0]
  if (!top) return { text: '?', pct: null, count: 0, color: null, icon: null, hint: false }
  const certain = b.candidates.length === 1 || top.pct >= FULL_PCT
  return {
    text: top.name,
    pct: Math.round(top.pct),
    count: b.candidates.length,
    color: RARITY_COLORS[top.rarity] ?? UNKNOWN_RARITY,
    icon: certain ? top.icon : null,
    hint: false,
  }
}
