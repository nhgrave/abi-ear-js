/** Ferramenta: constrói os modelos de rótulo (forma B) a partir de gravações. A categoria certa vem do gabarito
 * `labels-truth.json` da pasta da gravação (caixas conferidas a olho em alguns quadros) ou, nas gravações até 03/11,
 * do log do app desktop (ABI_APP_LOG).
 *
 * ABI_LABEL_BUILD=<pastas de gravação, separadas por vírgula> [ABI_APP_LOG=<abi-ear.log>] ABI_LABEL_OUT=<arquivo.json> \
 *   npx vitest run src/engine/label-models.build.test.ts
 * Opcional: ABI_LABEL_MIN_SCORE e ABI_LABEL_MARGIN (limiares gravados no arquivo; padrão 0,5 e 0,15, da medição de 02/11).
 *
 * Medidas na gravação 160053 (quadro 1793646113337): texto do rótulo com cinza ~195, ícone da caixa até ~44, fundo
 * ~17. TEXT_LEVEL fica perto do ponto médio, um pouco abaixo por causa da borda suavizada das letras. Recortes de 1x1,
 * 1x2 e 2x2 conferidos: o 1x1 usa as 4 linhas da célula, e as de 2 de largura usam 2 linhas (metade da célula).
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { decode } from 'jpeg-js'
import { describe, expect, it } from 'vitest'
import { scanVendor } from './pipeline'
import { ARROW, MIN_ARROW_SCORE } from './vision/arrow'
import { matchArrow } from './vision/cursor'
import { rgbaToGray, type Gray } from './vision/image'
import { buildModel, textMask, type LabelModels } from './vision/label-reader'
import { cellAt, cellOrigin, type BoxRect } from './vision/types'
import { parseAppPicks } from '../test-utils/app-log'

const DIRS = process.env.ABI_LABEL_BUILD
const LOG = process.env.ABI_APP_LOG
const OUT = process.env.ABI_LABEL_OUT
const TEXT_LEVEL = 110
const LOOK_BACK_MS = 3000

function gray(path: string): Gray {
  const img = decode(readFileSync(path), { useTArray: true, formatAsRGBA: true })
  return rgbaToGray(img.data as unknown as Uint8ClampedArray, img.width, img.height)
}

type Truth = { frames: { frame: string; boxes: { col: number; row: number; w: number; h: number; label: string }[] }[] }

describe.skipIf(!DIRS || !OUT)('label models', () => {
  it('builds the models from the recordings', () => {
    const picks = LOG ? parseAppPicks(readFileSync(LOG, 'latin1')).filter((p) => p.label !== null && /^\d+x\d+$/.test(p.size)) : []
    const samples = new Map<string, { label: string; w: number; masks: Float32Array[] }>()
    const missed: string[] = []
    const add = (label: string, w: number, mask: Float32Array) => {
      const key = `${label}|${w}`
      const s = samples.get(key) ?? { label, w, masks: [] }
      s.masks.push(mask)
      samples.set(key, s)
    }
    for (const dir of DIRS!.split(',')) {
      const truthPath = join(dir, 'labels-truth.json')
      if (existsSync(truthPath)) {
        // gabarito conferido a olho: cada caixa listada no quadro é uma amostra
        for (const f of (JSON.parse(readFileSync(truthPath, 'utf8')) as Truth).frames) {
          const g = gray(join(dir, 'frames', `${f.frame}.jpg`))
          const scan = scanVendor(g, null)
          for (const t of f.boxes) {
            const box = scan?.boxes.find((b) => !b.clipped && b.col === t.col && b.row === t.row && b.w === t.w && b.h === t.h)
            if (!scan || !box) {
              missed.push(`${f.frame} ${t.label} ${t.w}x${t.h} em ${t.col},${t.row} (caixa não achada)`)
              continue
            }
            add(t.label, t.w, textMask(g, scan.geometry, box, TEXT_LEVEL))
          }
        }
        continue
      }
      const frames = readdirSync(join(dir, 'frames'))
        .filter((f) => f.endsWith('.jpg'))
        .map((f) => ({ t: Number(f.slice(0, -4)), path: join(dir, 'frames', f) }))
        .sort((a, b) => a.t - b.t)
      for (const p of picks.filter((q) => q.t >= frames[0].t && q.t <= frames[frames.length - 1].t)) {
        const [w, h] = p.size.split('x').map(Number)
        let mask: Float32Array | null = null
        let last = frames.length - 1
        while (last >= 0 && frames[last].t > p.t) last--
        for (let i = last; i >= 0 && frames[i].t >= p.t - LOOK_BACK_MS && !mask; i--) {
          const g = gray(frames[i].path)
          const scan = scanVendor(g, null)
          if (!scan) continue
          const cell = cellAt(scan.geometry, p.x, p.y)
          if (!cell) continue
          const box: BoxRect | undefined = scan.boxes.find(
            (b) => !b.clipped && b.w === w && b.h === h && b.col <= cell[0] && cell[0] < b.col + b.w && b.row <= cell[1] && cell[1] < b.row + b.h,
          )
          if (!box) continue
          const [ox, oy] = cellOrigin(scan.geometry, box.col, box.row)
          const pitch = scan.geometry.pitch
          const arrow = matchArrow(g, [ox - ARROW.w, oy - ARROW.h, box.w * pitch + ARROW.w, box.h * pitch + ARROW.h])
          if (arrow.score >= MIN_ARROW_SCORE) continue // o cursor está sobre a caixa: tenta um quadro anterior
          mask = textMask(g, scan.geometry, box, TEXT_LEVEL)
        }
        if (!mask) {
          missed.push(`${new Date(p.t).toISOString()} ${p.label} ${p.size}`)
          continue
        }
        add(p.label!, w, mask)
      }
    }
    const models: LabelModels = {
      version: 1,
      textLevel: TEXT_LEVEL,
      minScore: Number(process.env.ABI_LABEL_MIN_SCORE ?? 0.5),
      margin: Number(process.env.ABI_LABEL_MARGIN ?? 0.15),
      models: [...samples.values()].sort((a, b) => a.w - b.w || (a.label < b.label ? -1 : 1)).map((s) => buildModel(s.label, s.w, s.masks)),
    }
    const json = JSON.stringify(models)
    writeFileSync(OUT!, json)
    const summary = [
      `${OUT}: ${models.models.length} modelos, ${(json.length / 1024).toFixed(0)} KB`,
      ...[...samples.values()].map((s) => `  ${s.label} largura ${s.w}: ${s.masks.length} amostras`),
      `sem amostra (cursor sobre a caixa ou caixa não achada): ${missed.length}`,
      ...missed.map((m) => `  ${m}`),
    ].join('\n')
    writeFileSync(`${OUT}.txt`, summary)
    console.log(summary)
    expect(models.models.length).toBeGreaterThan(0)
  }, 30 * 60_000)
})
