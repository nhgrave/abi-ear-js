/** Retrato simples da sessão para a interface (o Controller produz, os componentes só leem). */
import type { GridGeometry } from './vision/types'

export type CandidateView = { itemId: number; name: string; pct: number; rarity: number; icon: string | null }

export type BoxView = {
  uid: number
  col: number
  row: number // linha de conteúdo
  w: number
  h: number
  clipped: boolean
  picks: number
  candidates: CandidateView[]
  sizeRelaxed: boolean
}

export type SessionView = {
  geometry: GridGeometry | null
  rowOffset: number
  extent: [number, number] // linhas de conteúdo [primeira, última + 1] já vistas
  boxes: BoxView[]
}
