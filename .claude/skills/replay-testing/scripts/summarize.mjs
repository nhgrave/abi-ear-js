#!/usr/bin/env node
// Resume uma rodada de replay (os .txt de replay.sh) e compara com outra, se dada.
// Uso: node summarize.mjs <pasta da rodada> [pasta da rodada anterior]
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { basename, join } from 'node:path'

function parse(dir) {
  const out = new Map()
  for (const f of readdirSync(dir).filter((x) => /^\d{4}-\d{2}-\d{2}-\d+\.txt$/.test(x)).sort()) {
    const text = readFileSync(join(dir, f), 'utf8')
    const json = (re) => {
      const m = text.match(re)
      return m ? JSON.parse(m[1]) : null
    }
    const log = join(dir, f.replace(/\.txt$/, '.log'))
    out.set(f.slice(0, -4), {
      attribution: json(/^\d+ pegadas do app.*\n(\{.*\})$/m),
      categories: json(/^categorias \(\d+ pegadas do log com categoria\): (\{.*\})$/m),
      live: json(/^ao vivo \(\d+ pegadas no events\.jsonl\): (\{.*\})$/m),
      revealed: (text.match(/^caixas reveladas identificadas: (\d+)\n((?:  .*\n?)*)/m) ?? [])
        .slice(1),
      failed: existsSync(log) && /FAIL|Error:/.test(readFileSync(log, 'utf8')),
    })
  }
  return out
}

const fmt = (o, keys) => (o ? keys.filter((k) => o[k] !== undefined).map((k) => `${k} ${o[k]}`).join(', ') : '-')
const delta = (now, then, keys) => {
  if (!now || !then) return ''
  const d = keys.map((k) => [k, (now[k] ?? 0) - (then[k] ?? 0)]).filter(([, v]) => v !== 0)
  return d.length ? `  [${d.map(([k, v]) => `${k} ${v > 0 ? '+' : ''}${v}`).join(', ')}]` : '  [igual]'
}

const [dir, baseDir] = process.argv.slice(2)
if (!dir) {
  console.error('uso: node summarize.mjs <pasta> [pasta anterior]')
  process.exit(2)
}
const now = parse(dir)
const base = baseDir ? parse(baseDir) : new Map()
const A = ['concorda', 'errada', '? (no-box)', '? (moving)', '? (no-cursor)', '? (no-frame)', 'sem som']
const C = ['coberta', 'errada', 'sem categoria', 'sem caixa']
const L = ['igual', 'diferente', 'categoria diferente', 'só ao vivo', 'só no replay']
const total = { attribution: {}, categories: {} }
console.log(`rodada ${basename(dir)}${baseDir ? ` comparada com ${basename(baseDir)}` : ''}`)
for (const [name, r] of now) {
  const b = base.get(name)
  console.log(`\n${name}${r.failed ? '  ** FALHOU: veja o .log **' : ''}`)
  if (r.attribution) console.log(`  atribuição (contra o app desktop): ${fmt(r.attribution, A)}${delta(r.attribution, b?.attribution, A)}`)
  if (r.categories && Object.values(r.categories).some((v) => v > 0)) console.log(`  categorias (contra o app desktop): ${fmt(r.categories, C)}${delta(r.categories, b?.categories, C)}`)
  if (r.live) console.log(`  contra o ao vivo: ${fmt(r.live, L)}${delta(r.live, b?.live, L)}`)
  if (r.revealed.length && Number(r.revealed[0]) > 0) {
    const items = r.revealed[1].trim().split('\n').map((l) => l.replace(/^.*: /, ''))
    const count = new Map(); for (const it of items) count.set(it, (count.get(it) ?? 0) + 1)
    console.log(`  caixas reveladas identificadas: ${r.revealed[0]} (${[...count].map(([k, v]) => `${k} x${v}`).join(', ')})`)
  }
  for (const [k, keys] of [['attribution', A], ['categories', C]]) for (const key of keys) if (r[k]?.[key] !== undefined) total[k][key] = (total[k][key] ?? 0) + r[k][key]
}
if (Object.keys(total.attribution).length) {
  console.log(`\ntotal das gravações com log do app: atribuição ${fmt(total.attribution, A)}; categorias ${fmt(total.categories, C)}`)
}
