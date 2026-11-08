import { describe, expect, it } from 'vitest'
import { ARROW } from './arrow'
import type { Gray } from './image'
import { bandHeight, buildModel, MODEL_PITCH, readLabels, textMask, type LabelModels } from './label-reader'
import type { BoxRect, GridGeometry } from './types'

const BG = 20
const ICON = 44
const TEXT = 200

/** "Letras" de um rótulo, em px canônicos (célula de 64): retângulos com furos, sorteados pela semente. */
function glyphs(seed: number, w: number): [number, number, number, number][] {
  let s = seed
  const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
  const out: [number, number, number, number][] = []
  const lines = w === 1 ? 3 : 2
  for (let line = 0; line < lines; line++) {
    let x = 4
    const y = 5 + line * 16
    while (x < w * MODEL_PITCH - 12) {
      const gw = 3 + Math.floor(rnd() * 5)
      out.push([x, y, 2, 10]) // haste
      if (rnd() > 0.4) out.push([x, y + (rnd() > 0.5 ? 0 : 8), gw, 2]) // barra de cima ou de baixo
      if (rnd() > 0.5) out.push([x + gw - 2, y, 2, 10])
      x += gw + 3
      if (rnd() > 0.85) x += 6 // espaço entre palavras
    }
  }
  return out
}

/** Grid com uma caixa em (0,0) de w x h células, rótulo `seed` (ou nenhum) e o ícone no centro, na célula `pitch`. */
function draw(pitch: number, box: BoxRect, seed: number | null): { gray: Gray; geom: GridGeometry } {
  const cols = 4
  const rows = 3
  const W = cols * pitch + 10
  const H = rows * pitch + 10
  const data = new Uint8Array(W * H).fill(BG)
  const geom: GridGeometry = { x0: 5, y0: 5, pitch, cols, rows }
  const fill = (x: number, y: number, w: number, h: number, v: number) => {
    for (let yy = Math.round(y); yy < Math.round(y + h); yy++) for (let xx = Math.round(x); xx < Math.round(x + w); xx++) if (xx >= 0 && yy >= 0 && xx < W && yy < H) data[yy * W + xx] = v
  }
  const ox = geom.x0 + box.col * pitch
  const oy = geom.y0 + box.row * pitch
  const k = pitch / MODEL_PITCH
  fill(ox + (box.w * pitch) / 2 - 15 * k, oy + (box.h * pitch) / 2 - 12 * k, 30 * k, 24 * k, ICON)
  if (seed !== null) for (const [x, y, w, h] of glyphs(seed, box.w)) fill(ox + x * k, oy + y * k, w * k, h * k, TEXT)
  return { gray: { w: W, h: H, data }, geom }
}

const BOX: BoxRect = { col: 0, row: 0, w: 2, h: 2, clipped: false }
const TEXT_LEVEL = 110

function models(): LabelModels {
  const m = (label: string, seed: number) => {
    const { gray, geom } = draw(MODEL_PITCH, BOX, seed)
    return buildModel(label, 2, [textMask(gray, geom, BOX, TEXT_LEVEL)])
  }
  return { version: 1, textLevel: TEXT_LEVEL, minScore: 0.6, margin: 0.1, models: [m('Energy Items', 1), m('Tools', 2)] }
}

describe('label reader', () => {
  const M = models()

  it('band height covers four lines in a 1-wide box and two lines in wider ones', () => {
    expect(bandHeight(1)).toBe(MODEL_PITCH)
    expect(bandHeight(2)).toBe(Math.round(0.6 * MODEL_PITCH))
  })

  it('reads_the_label_it_was_built_from', () => {
    const { gray, geom } = draw(64, BOX, 2)
    expect(readLabels(gray, geom, [BOX], M)).toEqual([{ col: 0, row: 0, w: 2, h: 2, label: 'Tools', hasText: true }])
  })

  it('two models of the same category (one per game language) do not cancel each other', () => {
    // o modelo em português e o em inglês de uma categoria pontuam perto um do outro numa leitura parecida: a margem
    // vale contra a melhor das outras categorias, não contra o outro modelo da mesma
    const { gray, geom } = draw(MODEL_PITCH, BOX, 2)
    const twin = buildModel('Tools', 2, [textMask(gray, geom, BOX, TEXT_LEVEL)])
    const both: LabelModels = { ...M, models: [...M.models, twin] }
    expect(readLabels(gray, geom, [BOX], both)[0]).toMatchObject({ label: 'Tools' })
  })

  it('a model can require a higher score than its file (Portuguese names share the start of the name)', () => {
    // "Colecionáveis" e "Colecionáveis Incomuns" começam igual: o modelo em português só vale com nota alta
    const { gray, geom } = draw(64, BOX, 2)
    const strict: LabelModels = { ...M, models: M.models.map((m) => ({ ...m, minScore: 1.01 })) }
    expect(readLabels(gray, geom, [BOX], strict)[0]).toMatchObject({ label: null, hasText: true })
  })

  it('a model can ask a smaller margin than its file ("Carga Misteriosa" is the start of "Carga Misteriosa Rara")', () => {
    const { gray, geom } = draw(64, BOX, 1)
    const close = (margin: number | undefined): LabelModels => ({ ...M, margin: 1.5, models: M.models.map((m) => ({ ...m, ...(margin !== undefined && { margin }) })) })
    expect(readLabels(gray, geom, [BOX], close(undefined))[0].label).toBeNull()
    expect(readLabels(gray, geom, [BOX], close(0.08))[0].label).toBe('Energy Items')
  })

  it('unknown_text_has_text_but_no_label', () => {
    const { gray, geom } = draw(64, BOX, 99)
    expect(readLabels(gray, geom, [BOX], M)[0]).toMatchObject({ label: null, hasText: true })
  })

  it('empty_band_has_no_text', () => {
    const { gray, geom } = draw(64, BOX, null)
    expect(readLabels(gray, geom, [BOX], M)[0]).toMatchObject({ label: null, hasText: false })
  })

  it('reads_the_same_label_at_another_pitch', () => {
    for (const pitch of [43, 85]) {
      const { gray, geom } = draw(pitch, BOX, 1)
      expect(readLabels(gray, geom, [BOX], M)[0].label).toBe('Energy Items')
    }
  })

  it('reads despite the grid found one or two pixels off', () => {
    for (const dx of [-2, -1, 1, 2]) {
      const { gray, geom } = draw(64, BOX, 1)
      expect(readLabels(gray, { ...geom, x0: geom.x0 + dx, y0: geom.y0 - dx }, [BOX], M)[0].label).toBe('Energy Items')
    }
  })

  it('a model built from samples one pixel apart reads as well as from one sample (2026-11-08-155416, Rare Mystery Cargo)', () => {
    const { gray, geom } = draw(64, BOX, 1)
    const sample = (dx: number, dy: number) => textMask(gray, { ...geom, x0: geom.x0 + dx, y0: geom.y0 + dy }, BOX, TEXT_LEVEL)
    const two: LabelModels = { ...M, models: [buildModel('Energy Items', 2, [sample(0, 0), sample(1, 1)]), M.models[1]] }
    const shot = draw(64, BOX, 1)
    expect(readLabels(shot.gray, shot.geom, [BOX], { ...two, minScore: 0.95 })[0].label).toBe('Energy Items')
  })

  it('arrow_over_the_label_reads_right_or_nothing', () => {
    for (const [ax, ay] of [[8, 6], [30, 10], [60, 20], [90, 5], [110, 25]]) {
      const { gray, geom } = draw(64, BOX, 1)
      for (let y = 0; y < ARROW.h; y++) for (let x = 0; x < ARROW.w; x++) {
        const v = ARROW.data[y * ARROW.w + x]
        if (v > 150) gray.data[(geom.y0 + ay + y) * gray.w + geom.x0 + ax + x] = v
      }
      expect([null, 'Energy Items']).toContain(readLabels(gray, geom, [BOX], M)[0].label)
    }
  })

  it('skips_clipped_boxes', () => {
    const { gray, geom } = draw(64, BOX, 1)
    const clipped: BoxRect = { col: 2, row: 0, w: 1, h: 1, clipped: true }
    const other: BoxRect = { col: 2, row: 1, w: 1, h: 1, clipped: false }
    const out = readLabels(gray, geom, [BOX, clipped, other], M)
    expect(out.map((r) => `${r.col},${r.row}`)).toEqual(['0,0', '2,1'])
  })

  it('a width with no models reads text but no label', () => {
    const one: BoxRect = { col: 0, row: 0, w: 1, h: 1, clipped: false }
    const { gray, geom } = draw(64, one, 1)
    expect(readLabels(gray, geom, [one], M)[0]).toMatchObject({ label: null, hasText: true })
  })
})
