/** Leitura do log do app desktop (abi-ear.log, em latin1), a referência do replay e dos modelos de rótulo. */

/** Uma pegada do app: instante do som (ms da época), ponto na tela, caixa (chave de conteúdo "c,r"), tamanho e a
 * categoria que o app tinha para a caixa (null: "None" no log, ou a linha "pega:" não apareceu). */
export type AppPick = { t: number; x: number; y: number; key: string; size: string; label: string | null }

const PICK = /^(\d{4}-\d\d-\d\d) (\d\d:\d\d:\d\d),(\d{3}) INFO abi_ear\.controller: pegada às (\d\d:\d\d:\d\d\.\d{3}) em \((-?\d+), (-?\d+)\): caixa \((-?\d+), (-?\d+)\) (\S+)/
const PICKED = /^\S+ \S+ INFO abi_ear\.controller: caixa \((-?\d+), (-?\d+)\) (.+?) (\d+x\d+|\?) pega:/

/** Linhas "pegada às" do log (hora local), como parse_app_picks de tools/spike_eval.py, cada uma com a categoria da
 * linha "caixa (C, R) <Categoria> WxH pega:" seguinte com a mesma caixa. */
export function parseAppPicks(text: string): AppPick[] {
  const seen = new Set<string>()
  const out: AppPick[] = []
  const pending = new Map<string, AppPick[]>() // chave da caixa -> pegadas ainda sem a linha "pega:"
  for (const line of text.split(/\r?\n/)) {
    const m = PICK.exec(line)
    if (m) {
      const logged = new Date(`${m[1]}T${m[2]}.${m[3]}`).getTime()
      let at = new Date(`${m[1]}T${m[4]}`).getTime()
      if (at > logged + 3600_000) at -= 86_400_000 // som antes da meia-noite, linha escrita depois
      const p: AppPick = { t: at, x: Number(m[5]), y: Number(m[6]), key: `${m[7]},${m[8]}`, size: m[9], label: null }
      const id = `${p.t}|${p.x}|${p.y}`
      if (seen.has(id)) continue
      seen.add(id)
      out.push(p)
      pending.set(p.key, [...(pending.get(p.key) ?? []), p])
      continue
    }
    const k = PICKED.exec(line)
    if (!k) continue
    const queue = pending.get(`${k[1]},${k[2]}`)
    const p = queue?.shift()
    if (p) p.label = k[3] === 'None' ? null : k[3]
  }
  return out
}
