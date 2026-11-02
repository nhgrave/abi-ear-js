#!/usr/bin/env node
// Baixa a base do Merchant do abibuilder.com, os sons de pegar e os ícones dos itens para public/data/.
// Rodado pelo autor quando o jogo muda (porte de abi_ear/data/sync.py). A página nunca baixa nada de terceiros.
import { mkdir, rename, stat, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SITE_URL = 'https://abibuilder.com/merchant'
const AUDIO_URL = (name) => `https://abibuilder.com/audio/merchant/${name}.ogg`
const USER_AGENT = 'Mozilla/5.0 (abi-ear-js)'
const REQUIRED_KEYS = ['items', 'pools', 'sounds', 'types', 'profiles']
const SOUND_NAME = /^[A-Za-z0-9_-]+$/ // vira nome de arquivo: nada de "../"
// Next.js App Router envia os dados da página como strings JS em self.__next_f.push([1, "..."])
const PUSH = /self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/g

/** Fim do objeto JSON que começa em `start` (equivalente ao raw_decode do Python), ou -1. */
function objectEnd(text, start) {
  let depth = 0
  let inString = false
  for (let i = start; i < text.length; i++) {
    const ch = text[i]
    if (inString) {
      if (ch === '\\') i++
      else if (ch === '"') inString = false
    } else if (ch === '"') inString = true
    else if (ch === '{' || ch === '[') depth++
    else if (ch === '}' || ch === ']') {
      depth--
      if (depth === 0) return i + 1
    }
  }
  return -1
}

/** Extrai o objeto {version, meta, profiles, items, pools, sounds, types} do HTML da página. */
export function parseDataset(html) {
  const chunks = [...html.matchAll(PUSH)].map((m) => m[1])
  if (chunks.length === 0) throw new Error('payload do Next.js não encontrado na página')
  const rsc = chunks.map((c) => JSON.parse(`"${c}"`)).join('')
  for (const m of rsc.matchAll(/\{"version":/g)) {
    const end = objectEnd(rsc, m.index)
    if (end < 0) continue
    let obj
    try {
      obj = JSON.parse(rsc.slice(m.index, end))
    } catch {
      continue
    }
    if (obj && typeof obj === 'object' && REQUIRED_KEYS.every((k) => k in obj)) return obj
  }
  throw new Error('base do Merchant não encontrada no payload (o site mudou?)')
}

/** Garante que a base nova é utilizável antes de substituir a publicada. */
export function validate(dataset) {
  for (const k of REQUIRED_KEYS) {
    if (!Array.isArray(dataset[k])) throw new Error(`base sem a lista "${k}" (o site mudou?)`)
  }
  for (const s of dataset.sounds) {
    if (!SOUND_NAME.test(s.pickup)) throw new Error(`nome de som inválido na base: ${JSON.stringify(s.pickup)}`)
  }
}

async function exists(path) {
  try {
    return (await stat(path)).size > 0
  } catch {
    return false
  }
}

async function download(url) {
  const resp = await fetch(url, { headers: { 'User-Agent': USER_AGENT } })
  if (!resp.ok) throw new Error(`falha ao baixar ${url}: HTTP ${resp.status}`)
  return Buffer.from(await resp.arrayBuffer())
}

async function writeAtomic(path, data) {
  await writeFile(`${path}.part`, data)
  await rename(`${path}.part`, path)
}

export async function sync(dest) {
  const page = await download(SITE_URL)
  const dataset = parseDataset(page.toString('utf8'))
  validate(dataset)

  await mkdir(join(dest, 'sounds'), { recursive: true })
  for (const name of [...new Set(dataset.sounds.map((s) => s.pickup))].sort()) {
    const target = join(dest, 'sounds', `${name}.ogg`)
    if (!(await exists(target))) await writeAtomic(target, await download(AUDIO_URL(name)))
  }

  // ícones só enfeitam a tela: falha vira aviso
  await mkdir(join(dest, 'icons'), { recursive: true })
  let missing = 0
  for (const item of dataset.items) {
    const url = item.iconAvailable === false ? null : item.iconUrl
    const target = join(dest, 'icons', `${Math.trunc(item.id)}.png`)
    if (!url || !url.startsWith('https://') || (await exists(target))) continue
    try {
      await writeAtomic(target, await download(url))
    } catch (err) {
      console.warn(`ícone não baixado (${url}): ${err.message}`)
      missing++
    }
  }

  dataset.syncedAt = new Date().toISOString().replace(/\.\d{3}Z$/, '+00:00')
  await writeAtomic(join(dest, 'merchant.json'), JSON.stringify(dataset)) // por último: falha antes não estraga a base
  return { dataset, missing }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dest = resolve(fileURLToPath(new URL('../public/data', import.meta.url)))
  const { dataset, missing } = await sync(dest)
  console.log(`base ${dataset.version} em ${dest}: ${dataset.items.length} itens, ${new Set(dataset.sounds.map((s) => s.pickup)).size} sons, ${missing} ícones faltando`)
}
