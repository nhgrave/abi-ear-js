/** Ferramenta: olha os quadros de uma gravação com a mesma visão da página, sem o áudio nem a sessão (a sessão é o
 * replay). Rodada à mão, pulada sem ABI_PROBE_DIR.
 *
 * ABI_PROBE_DIR=<pasta da gravação> ABI_PROBE_MODE=<modo> ABI_PROBE_OUT=<arquivo> npx vitest run src/engine/frames.probe.test.ts
 *
 * Modos:
 * - timeline: um quadro a cada ABI_PROBE_STEP ms (padrão 2000) entre ABI_PROBE_FROM e ABI_PROBE_TO: vendedor na tela,
 *   caixas, células incertas e caixas com texto sem categoria. Para achar quando o vendedor está aberto.
 * - boxes: os quadros de ABI_PROBE_FRAMES (nomes sem .jpg, separados por vírgula): cada caixa com a categoria lida, as
 *   duas melhores notas e as marcas (cortada, lit). Para montar o labels-truth.json e conferir leituras.
 * - truth: as caixas do labels-truth.json da gravação: nota da categoria certa e a melhor das outras. Para ver se
 *   as categorias parecidas ficam longe da nota mínima.
 * Modelos: ABI_PROBE_MODELS (arquivos separados por vírgula; padrão en.json e pt.json juntos, como a página).
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { decode } from 'jpeg-js'
import { describe, it } from 'vitest'
import { mergeLabelModels } from '../live/label-data'
import { scanVendor } from './pipeline'
import { rgbaToGray, type Gray } from './vision/image'
import { labelScores, readLabels, type LabelModels } from './vision/label-reader'
import type { BoxRect } from './vision/types'

const DIR = process.env.ABI_PROBE_DIR
const MODE = process.env.ABI_PROBE_MODE ?? 'timeline'
const OUT = process.env.ABI_PROBE_OUT

type Truth = { frames: { frame: string; boxes: (Omit<BoxRect, 'clipped'> & { label: string })[] }[] }

function gray(name: string): Gray {
  const img = decode(readFileSync(join(DIR!, 'frames', `${name}.jpg`)), { useTArray: true, formatAsRGBA: true })
  return rgbaToGray(img.data as unknown as Uint8ClampedArray, img.width, img.height)
}

const top2 = (scores: Map<string, number>) => [...scores].sort((a, b) => b[1] - a[1]).slice(0, 2)
const fmt = ([l, s]: [string, number]) => `${l} ${s.toFixed(2)}`

describe.skipIf(!DIR || !OUT)('frames probe', () => {
  it('writes what the vision sees in the frames', () => {
    const files = (process.env.ABI_PROBE_MODELS ?? 'public/data/labels/en.json,public/data/labels/pt.json').split(',')
    const models = mergeLabelModels(files.map((f) => JSON.parse(readFileSync(f, 'utf8')) as LabelModels))!
    const out: string[] = []

    if (MODE === 'timeline') {
      const names = readdirSync(join(DIR!, 'frames')).filter((f) => f.endsWith('.jpg')).map((f) => Number(f.slice(0, -4))).sort((a, b) => a - b)
      const step = Number(process.env.ABI_PROBE_STEP ?? 2000)
      const to = Number(process.env.ABI_PROBE_TO ?? names[names.length - 1])
      let next = Number(process.env.ABI_PROBE_FROM ?? names[0])
      for (const t of names) {
        if (t < next || t > to) continue
        next = t + step
        const g = gray(String(t))
        const scan = scanVendor(g, null)
        if (!scan) {
          out.push(`${t} ${new Date(t).toISOString()} sem vendedor`)
          continue
        }
        const reads = readLabels(g, scan.geometry, scan.boxes, models)
        const unread = reads.filter((r) => r.hasText && r.label === null).length
        out.push(`${t} ${new Date(t).toISOString()} caixas=${scan.boxes.length} incertas=${scan.uncertain.size} sem_categoria=${unread}`)
      }
    } else if (MODE === 'boxes') {
      for (const f of (process.env.ABI_PROBE_FRAMES ?? '').split(',').filter(Boolean)) {
        const g = gray(f)
        const scan = scanVendor(g, null)
        if (!scan) {
          out.push(`== ${f} sem vendedor`)
          continue
        }
        out.push(`== ${f} ${new Date(Number(f)).toISOString()} grid ${JSON.stringify(scan.geometry)} incertas=[${[...scan.uncertain].join(' ')}]`)
        const reads = readLabels(g, scan.geometry, scan.boxes, models)
        for (const b of scan.boxes) {
          const r = reads.find((x) => x.col === b.col && x.row === b.row)
          const label = b.clipped ? '(cortada)' : (r?.label ?? (r?.hasText ? '?' : '-'))
          const notes = b.clipped ? '' : top2(labelScores(g, scan.geometry, b, models)).map(fmt).join(' | ')
          out.push(`  b(${b.col},${b.row},${b.w},${b.h}) ${label}${b.lit ? ' lit' : ''}   ${notes}`)
        }
      }
    } else if (MODE === 'truth') {
      const path = join(DIR!, 'labels-truth.json')
      if (!existsSync(path)) throw new Error(`sem labels-truth.json em ${DIR}`)
      for (const f of (JSON.parse(readFileSync(path, 'utf8')) as Truth).frames) {
        const g = gray(f.frame)
        const scan = scanVendor(g, null)
        for (const t of f.boxes) {
          if (!scan) continue
          const sc = labelScores(g, scan.geometry, { ...t, clipped: false }, models)
          const rival = [...sc].filter(([l]) => l !== t.label).sort((a, b) => b[1] - a[1])[0]
          out.push(`${t.label} w${t.w}: própria ${(sc.get(t.label) ?? NaN).toFixed(2)} | melhor outra ${rival ? fmt(rival) : '-'}`)
        }
      }
    } else {
      throw new Error(`modo desconhecido: ${MODE} (timeline, boxes ou truth)`)
    }
    writeFileSync(OUT!, out.join('\n') + '\n')
  }, 30 * 60_000)
})
