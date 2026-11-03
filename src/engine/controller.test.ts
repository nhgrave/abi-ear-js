import { beforeEach, describe, expect, it } from 'vitest'
import { Controller } from './controller'
import { Dataset } from './data/dataset'
import type { FrameResult, LabelReading } from './pipeline'
import type { BoxRect, GridGeometry, GridScan } from './vision/types'
import type { SoundHit } from './candidates'
import { fixturePath, hasFixtures, readJson } from '../test-utils/fixtures'

const GEOM: GridGeometry = { x0: 0, y0: 0, pitch: 64, cols: 9, rows: 6 }
const rect = (col: number, row: number, w: number, h: number, clipped = false): BoxRect => ({ col, row, w, h, clipped })
const grid = (boxes: BoxRect[], geometry = GEOM): GridScan => ({ geometry, boxes, uncertain: new Set(), overlays: [] })
const SCAN = grid([rect(7, 1, 1, 2), rect(0, 0, 2, 2)])
const ON_7_1: [number, number] = [7 * 64 + 10, 64 + 10]

function frame(t: number, scan?: GridScan | null, cursor?: [number, number] | null, labels: LabelReading[] = []): FrameResult {
  return { t, scan, mean: 40, cursor: cursor ? { t, x: cursor[0], y: cursor[1], score: 0.95 } : null, labels }
}
/** Leitura do rótulo de uma caixa em células da tela; `null` com texto: algo escrito que não é rótulo. */
const read = (r: BoxRect, label: string | null, hasText = true): LabelReading => ({ col: r.col, row: r.row, w: r.w, h: r.h, label, hasText })

describe.skipIf(!hasFixtures('merchant.json'))('controller', () => {
  let c: Controller
  /** Vê o vendedor e o cursor parado no ponto nos 400 ms antes do som; depois a pegada. */
  const pickAt = (tSound: number, point: [number, number], hits: SoundHit[] = [{ soundId: 31, score: 0.95 }]) => {
    for (const dt of [380, 280, 180]) c.onFrame(frame(tSound - dt, dt === 380 ? SCAN : undefined, point))
    return c.onPickup({ kind: 'pickup', t: tSound, soundId: hits[0]?.soundId ?? 0, score: hits[0]?.score ?? 0, hits })
  }
  beforeEach(() => {
    c = new Controller(new Dataset(readJson(fixturePath('merchant.json'))))
    c.setProfile(5)
  })

  it('scan then click identifies box', () => {
    const out = pickAt(99_000, ON_7_1)
    const box = c.session.boxAtScreen(...ON_7_1)!
    expect(out).toMatchObject({ kind: 'assigned', uid: box.uid })
    expect(box.picks).toBe(1)
    expect(box.ranking!.candidates.map((x) => x.item.name)).toContain('Desk Clock')
    expect(box.hits()).toEqual([{ soundId: 31, score: 0.95 }])
  })

  it('click outside boxes is ignored', () => {
    expect(pickAt(99_000, [5 * 64 + 5, 5 * 64 + 5])).toMatchObject({ kind: 'unassigned', reason: 'no-box' })
  })

  it('vendor closed and reopened keeps results', () => {
    pickAt(1_000, ON_7_1)
    for (const t of [5_000, 40_000]) c.onFrame(frame(t, null)) // saiu do vendedor por meio minuto
    expect(c.session.boxes.size).toBeGreaterThan(0)
    expect(c.vendorVisible).toBe(false)
    c.onFrame(frame(60_000, SCAN)) // mesmo vendedor, mesmo estoque
    expect(c.vendorVisible).toBe(true)
    expect(c.session.boxes.get('7,1')!.picks).toBe(1)
  })

  it('reopened vendor with another layout starts fresh', () => {
    pickAt(1_000, ON_7_1)
    c.onFrame(frame(5_000, null))
    c.onFrame(frame(60_000, grid([rect(0, 0, 1, 1), rect(1, 0, 1, 1), rect(3, 2, 2, 1)])))
    expect([...c.session.boxes.keys()].sort()).toEqual(['0,0', '1,0', '3,2'])
    expect([...c.session.boxes.values()].every((b) => b.picks === 0)).toBe(true)
  })

  it('profile change reranks', () => {
    pickAt(99_000, ON_7_1)
    const box = c.session.boxes.get('7,1')!
    const before = box.ranking
    c.setProfile(1)
    expect(c.profileChoice).toBe(1)
    expect(box.ranking).not.toBe(before)
  })

  it('all maps uses every profile', () => {
    c.setProfile('all')
    expect(c.profiles()).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    c.setProfile(4)
    expect(c.profiles()).toEqual([4])
  })

  it('click on box only seen clipped ignores size', () => {
    const clipped = grid([rect(7, 5, 1, 1, true)])
    for (const dt of [380, 280, 180]) c.onFrame(frame(99_000 - dt, dt === 380 ? clipped : undefined, [7 * 64 + 10, 5 * 64 + 10]))
    c.onPickup({ kind: 'pickup', t: 99_000, soundId: 31, score: 0.95, hits: [{ soundId: 31, score: 0.95 }] })
    const box = c.session.boxes.get('7,5')!
    expect(box.ranking!.candidates.map((x) => x.item.name)).toContain('Desk Clock')
    expect(box.ranking!.sizeRelaxed).toBe(false)
  })

  it('click long after last grid is ignored', () => {
    c.onFrame(frame(93_000, SCAN))
    c.onFrame(frame(94_000, null))
    for (const dt of [380, 280, 180]) c.onFrame(frame(99_500 - dt, undefined, ON_7_1))
    expect(c.onPickup({ kind: 'pickup', t: 99_500, soundId: 31, score: 0.95, hits: [] })).toMatchObject({ kind: 'unassigned', reason: 'no-vendor' })
    expect(c.session.boxes.get('7,1')!.picks).toBe(0)
  })

  it('implausible box size is uncertain and keeps results', () => {
    pickAt(99_000, [10, 10], [{ soundId: 12, score: 0.95 }])
    c.onFrame(frame(99_500, grid([rect(7, 1, 1, 2), rect(0, 0, 4, 3)]))) // dica "R Rotate" sobre o grid
    const box = c.session.boxes.get('0,0')!
    expect(box.size).toEqual([2, 2])
    expect(box.picks).toBe(1)
  })

  it('inventory grid after leaving the vendor keeps the session', () => {
    pickAt(98_500, ON_7_1)
    c.onFrame(frame(99_000, null))
    const loot = grid([rect(0, 2, 1, 2), rect(1, 2, 1, 1)], { x0: 600, y0: 80, pitch: 32, cols: 6, rows: 5 })
    c.onFrame(frame(112_000, loot))
    expect(c.vendorVisible).toBe(false)
    c.onFrame(frame(113_000, loot))
    expect(c.vendorVisible).toBe(false)
    expect(c.session.boxes.get('7,1')!.picks).toBe(1)
    c.onFrame(frame(120_000, SCAN)) // de volta ao vendedor
    expect(c.session.boxes.get('7,1')!.picks).toBe(1)
  })

  it('ignores a grid with another pitch and keeps the session', () => {
    pickAt(1_000, ON_7_1)
    c.onFrame(frame(1_500, grid([rect(0, 0, 1, 1), rect(2, 0, 1, 1)], { x0: 0, y0: 0, pitch: 40, cols: 9, rows: 6 })))
    expect(c.vendorVisible).toBe(false)
    expect(c.session.geometry!.pitch).toBe(64)
    expect(c.session.boxes.get('7,1')!.picks).toBe(1)
  })

  it('clipped box wider than any item is not a box', () => {
    // a última linha visível, cortada, juntava células vazias em caixas impossíveis (5x2, 9x2) no grid espelhado
    c.onFrame(frame(1_000, grid([rect(7, 1, 1, 2), rect(4, 5, 5, 1, true), rect(0, 5, 3, 1, true)])))
    expect([...c.session.boxes.keys()].sort()).toEqual(['0,5', '7,1'])
  })

  it('view lists boxes with candidates and icons', () => {
    pickAt(99_000, ON_7_1)
    const v = c.view()
    const b = v.boxes.find((x) => x.col === 7 && x.row === 1)!
    expect(b.picks).toBe(1)
    expect(b.candidates[0].icon).toMatch(/^data\/icons\/\d+\.png$/)
    expect(b.candidates[0].rarity).toBeGreaterThanOrEqual(1)
    expect(v.geometry).toEqual(GEOM)
  })

  describe('labels', () => {
    const A = rect(0, 0, 2, 2)
    const B = rect(7, 1, 1, 2)
    /** Duas varreduras com a mesma leitura: a categoria fica aceita. */
    const confirm = (t: number, r: BoxRect, label: string, scan = SCAN) => {
      c.onFrame(frame(t, scan, null, [read(r, label)]))
      c.onFrame(frame(t + 350, scan, null, [read(r, label)]))
    }
    beforeEach(() => c.setProfile('auto'))

    it('label_needs_two_equal_readings', () => {
      c.onFrame(frame(1_000, SCAN, null, [read(A, 'Energy Items')]))
      expect(c.session.boxes.get('0,0')!.label).toBeNull()
      c.onFrame(frame(1_350, SCAN, null, [read(A, 'Energy Items')]))
      expect(c.session.boxes.get('0,0')!.label).toBe('Energy Items')
      expect(c.labelsSeen).toBe(true)
    })

    it('disagreeing_readings_reset_the_count', () => {
      for (const [i, l] of ['Energy Items', 'Tools', 'Energy Items'].entries()) c.onFrame(frame(1_000 + 350 * i, SCAN, null, [read(A, l)]))
      expect(c.session.boxes.get('0,0')!.label).toBeNull()
      c.onFrame(frame(2_500, SCAN, null, [read(A, 'Energy Items')]))
      expect(c.session.boxes.get('0,0')!.label).toBe('Energy Items')
    })

    it('accepted_label_never_changes_on_the_same_box', () => {
      confirm(1_000, A, 'Energy Items')
      const box = c.session.boxes.get('0,0')!
      confirm(2_000, A, 'Tools') // vira outra caixa; a antiga continua Energy Items
      expect(box.label).toBe('Energy Items')
    })

    it('votes_do_not_carry_to_another_box_after_scroll', () => {
      // conteúdo: A (0,0) e B2 (0,2), as duas 2x2; a lista rola 2 linhas e B2 passa a ocupar o retângulo de A
      const content = [rect(0, 0, 2, 2), rect(0, 2, 2, 2), rect(3, 0, 1, 1), rect(3, 3, 1, 2), rect(5, 1, 2, 2), rect(5, 4, 1, 1), rect(2, 5, 1, 1)]
      const top = grid(content)
      const scrolled = grid([rect(0, 0, 2, 2), rect(3, 1, 1, 2), rect(5, 0, 2, 1, true), rect(5, 2, 1, 1), rect(2, 3, 1, 1)])
      c.onFrame(frame(1_000, top, null, [read(A, 'Energy Items')]))
      c.onFrame(frame(1_350, scrolled, null, [read(A, 'Energy Items')]))
      expect(c.session.rowOffset).toBe(2)
      expect(c.session.boxes.get('0,0')!.label).toBeNull()
      expect(c.session.boxes.get('0,2')!.label).toBeNull()
    })

    it('label_narrows_the_ranking', () => {
      const wide = rect(0, 0, 3, 2)
      const scan = grid([wide, B])
      const pick = (t: number) => {
        for (const dt of [380, 280, 180]) c.onFrame(frame(t - dt, dt === 380 ? scan : undefined, [10, 10]))
        c.onPickup({ kind: 'pickup', t, soundId: 6, score: 0.95, hits: [{ soundId: 6, score: 0.95 }] })
      }
      pick(5_000)
      const box = c.session.boxes.get('0,0')!
      expect(box.ranking!.candidates.map((x) => x.item.name)).toContain('Titanium Alloy Plate')
      confirm(6_000, wide, 'Energy Items', scan)
      const names = box.ranking!.candidates.map((x) => x.item.name)
      expect(names[0]).toBe('Car Battery')
      expect(names).not.toContain('Titanium Alloy Plate')
    })

    it('automatic_profile_follows_the_labels_and_reranks', () => {
      const only = grid([rect(0, 0, 1, 2)])
      const mystery = rect(0, 0, 1, 2)
      confirm(1_000, mystery, 'Mystery Cargo', only)
      expect(c.profiles()).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) // Mystery Cargo existe em todos os mapas
      for (const dt of [380, 280, 180]) c.onFrame(frame(3_000 - dt, dt === 380 ? only : undefined, [10, 10]))
      c.onPickup({ kind: 'pickup', t: 3_000, soundId: 31, score: 0.95, hits: [{ soundId: 31, score: 0.95 }] })
      const box = c.session.boxes.get('0,0')!
      const before = box.ranking!.candidates.map((x) => x.item.name)
      const more = grid([mystery, rect(1, 0, 2, 2)])
      confirm(4_000, rect(1, 0, 2, 2), 'Computer Parts', more)
      expect(c.profiles()).toEqual([4, 5, 6, 9, 10])
      const after = box.ranking!.candidates.map((x) => x.item.name)
      expect(after.length).toBeGreaterThan(0)
      expect(after.every((n) => before.includes(n))).toBe(true)
    })

    it('manual_choice_overrides_automatic', () => {
      confirm(1_000, A, 'Computer Parts')
      c.setProfile(5)
      expect(c.profiles()).toEqual([5])
      c.setProfile('all')
      expect(c.profiles()).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    })

    it('other_grid_without_vendor_labels_is_ignored', () => {
      confirm(1_000, A, 'Computer Parts')
      const other = grid([rect(0, 0, 1, 1), rect(1, 0, 1, 1), rect(2, 0, 1, 1)])
      c.onFrame(frame(2_000, other, null, other.boxes.map((r) => read(r, null))))
      expect(c.vendorVisible).toBe(false)
      expect(c.session.boxes.get('0,0')!.label).toBe('Computer Parts')
    })

    it('text_without_any_label_never_rejects_before_a_label_was_read', () => {
      // jogo em português: há texto nas caixas, nenhum rótulo em inglês
      for (let i = 0; i < 10; i++) c.onFrame(frame(1_000 + 350 * i, SCAN, null, SCAN.boxes.concat(rect(4, 4, 1, 1)).map((r) => read(r, null))))
      expect(c.vendorVisible).toBe(true)
      expect([...c.session.boxes.keys()].sort()).toEqual(['0,0', '7,1'])
      expect(c.labelsSeen).toBe(false)
    })

    it('inventory_grid_after_leaving_the_vendor_keeps_the_session', () => {
      confirm(97_000, A, 'Computer Parts')
      pickAt(98_500, ON_7_1)
      c.onFrame(frame(99_000, null))
      const loot = grid([rect(0, 2, 1, 2), rect(1, 2, 1, 1)], { x0: 600, y0: 80, pitch: 32, cols: 6, rows: 5 })
      c.onFrame(frame(112_000, loot, null, loot.boxes.map((r) => read(r, null))))
      expect(c.vendorVisible).toBe(false)
      c.onFrame(frame(113_000, loot))
      expect(c.vendorVisible).toBe(false)
      expect(c.session.boxes.get('7,1')!.picks).toBe(1)
      c.onFrame(frame(120_000, SCAN))
      expect(c.session.boxes.get('7,1')!.picks).toBe(1)
    })

    it('grid_with_text_after_the_vendor_expired_keeps_the_session', () => {
      // mesma célula, outro layout, com texto e sem rótulo, depois do vendedor sumir: não troca a sessão
      confirm(97_000, A, 'Computer Parts')
      pickAt(98_500, ON_7_1)
      c.onFrame(frame(99_000, null))
      const stash = grid([rect(0, 0, 1, 1), rect(2, 3, 1, 1)])
      c.onFrame(frame(112_000, stash, null, stash.boxes.map((r) => read(r, null))))
      expect(c.vendorVisible).toBe(false)
      expect(c.session.boxes.get('7,1')!.picks).toBe(1)
    })

    it('vision_tracks_the_vendor_grid_only_after_reading_a_box_label', () => {
      c.onFrame(frame(1_000, SCAN))
      expect(c.hint()).toEqual(GEOM) // antes do primeiro rótulo da página: como a v0.1
      confirm(1_500, A, 'Computer Parts')
      c.clear()
      c.onFrame(frame(3_000, SCAN))
      expect(c.hint()).toBeNull()
      confirm(3_500, A, 'Computer Parts')
      expect(c.hint()).toEqual(GEOM)
    })

    it('a_box_read_twice_as_another_category_is_a_new_box', () => {
      // o estoque mudou e uma caixa do mesmo tamanho ficou no lugar: a sessão achou que era a mesma
      const wide = rect(0, 0, 3, 2)
      const scan = grid([wide, B])
      for (const dt of [380, 280, 180]) c.onFrame(frame(5_000 - dt, dt === 380 ? scan : undefined, [10, 10]))
      c.onPickup({ kind: 'pickup', t: 5_000, soundId: 6, score: 0.95, hits: [{ soundId: 6, score: 0.95 }] })
      confirm(6_000, wide, 'Energy Items', scan)
      const old = c.session.boxes.get('0,0')!
      expect(old.picks).toBe(1)
      confirm(7_000, wide, 'Flammables', scan)
      const now = c.session.boxes.get('0,0')!
      expect(now.uid).not.toBe(old.uid)
      expect(now.label).toBe('Flammables')
      expect(now.picks).toBe(0)
    })

    it('one_contrary_reading_keeps_the_box', () => {
      confirm(1_000, A, 'Energy Items')
      const old = c.session.boxes.get('0,0')!
      c.onFrame(frame(2_000, SCAN, null, [read(A, 'Tools')]))
      c.onFrame(frame(2_350, SCAN, null, [read(A, 'Energy Items')]))
      c.onFrame(frame(2_700, SCAN, null, [read(A, 'Tools')]))
      expect(c.session.boxes.get('0,0')).toBe(old)
      expect(old.label).toBe('Energy Items')
    })

    it('boxes_without_a_model_do_not_reject_the_vendor', () => {
      // as caixas conhecidas são lidas com rótulo; as de categoria sem modelo vêm com texto e sem rótulo
      confirm(1_000, A, 'Energy Items')
      const many = grid([A, B, rect(3, 0, 1, 1), rect(4, 0, 1, 1), rect(5, 0, 1, 1)])
      c.onFrame(frame(2_000, many, null, [read(A, 'Energy Items'), ...many.boxes.slice(1).map((r) => read(r, null))]))
      expect(c.vendorVisible).toBe(true)
    })

    it('view_shows_the_label', () => {
      confirm(1_000, A, 'Computer Parts')
      expect(c.view().boxes.find((b) => b.col === 0 && b.row === 0)!.label).toBe('Computer Parts')
    })
  })
})
