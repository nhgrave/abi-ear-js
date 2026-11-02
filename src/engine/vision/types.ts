/** Tipos do grid compartilhados entre visão, cursor e sessão (equivalentes aos de abi_ear/vision/grid.py). */

export type GridGeometry = {
  x0: number // canto superior esquerdo da célula (0, 0) na tela
  y0: number
  pitch: number // lado da célula em px
  cols: number
  rows: number // linhas inteiras visíveis
}

export type BoxRect = {
  col: number
  row: number
  w: number
  h: number
  clipped: boolean // cortada na borda superior/inferior da área visível
}

export type Rect = [xa: number, ya: number, xb: number, yb: number]

export type GridScan = {
  geometry: GridGeometry
  boxes: BoxRect[]
  uncertain: Set<string> // chaves "c,r" das células cobertas (tooltip, caixa sendo arrastada)
  overlays: Rect[] // tooltips na tela
}

export function cellKey(col: number, row: number): string {
  return `${col},${row}`
}

export function parseCellKey(key: string): [number, number] {
  const [c, r] = key.split(',').map(Number)
  return [c, r]
}

export function cellAt(g: GridGeometry, x: number, y: number): [number, number] | null {
  const col = Math.floor((x - g.x0) / g.pitch)
  const row = Math.floor((y - g.y0) / g.pitch)
  return col >= 0 && col < g.cols && row >= 0 && row < g.rows ? [col, row] : null
}

export function cellOrigin(g: GridGeometry, col: number, row: number): [number, number] {
  return [pyRound(g.x0 + col * g.pitch), pyRound(g.y0 + row * g.pitch)]
}

export function boxCells(b: { col: number; row: number; w: number; h: number }): [number, number][] {
  const out: [number, number][] = []
  for (let i = 0; i < b.w; i++) for (let j = 0; j < b.h; j++) out.push([b.col + i, b.row + j])
  return out
}

/** round() do Python: metade vai para o par (2.5 -> 2), ao contrário de Math.round. */
export function pyRound(x: number): number {
  const r = Math.round(x)
  return Math.abs(x % 1) === 0.5 && r % 2 !== 0 ? r - 1 : r
}
