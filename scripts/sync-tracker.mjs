#!/usr/bin/env node
// Baixa a base do Merchant do abi-tracker, os sons de pegar e os ícones dos itens para public/data/.
// Rodado pelo autor quando o jogo muda. A página publicada nunca baixa nada de terceiros.
//
// O abi-tracker entrega os dados codificados e os decodifica no navegador. O script abre a página num Chromium sem
// tela e pede os arquivos ao carregador da própria página (`window.StaticGameData.loadJson`), sem decodificar nada
// por conta própria. Os nomes vêm da tradução em inglês do site, e a tabela mapa/modo -> perfil vem do script da página.
//
// Uso: node scripts/sync-tracker.mjs [pasta de destino, padrão public/data]
// Chromium: o do Playwright (`npx playwright-core install chromium`) ou outro em CHROMIUM_PATH.
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const PAGE_URL = 'https://abi-tracker.azurewebsites.net/GameInfo/Merchant'
const ICON_URL = (iconId) => `https://hexaov91.github.io/abi-assets/image/Normal/${iconId}.png`
const REQUIRED_KEYS = ['items', 'pools', 'sounds', 'types', 'profiles']
const SOUND_NAME = /^[A-Za-z0-9_-]+$/ // vira nome de arquivo: nada de "../"
// anúncios e métricas da página não fazem falta para os dados; os sons são baixados depois, só os de pegar
const BLOCKED = /googlesyndication|doubleclick|googletagmanager|google-analytics|adtrafficquality|recaptcha|\.ogg(\?|$)/

/** A tabela [mapa, modo, perfil] do script da página do Merchant: `[[1102,"Normal",3],[1102,"Lockdown",1],...]`. */
export function parseMapTable(js) {
  const m = js.match(/\[\[\d+,"[A-Za-z]+",\d+\](?:,\[\d+,"[A-Za-z]+",\d+\])*\]/)
  if (!m) throw new Error('tabela de mapas não encontrada no script do Merchant (o site mudou?)')
  return JSON.parse(m[0])
}

/** Um texto da tradução do site (`tabela.campo[chave]`); sem ele, a base não é montada. */
function text(loc, table, field, key) {
  const value = loc[table]?.[field]?.[String(key)]
  if (typeof value !== 'string' || value === '') throw new Error(`tradução sem ${table}.${field}[${key}] (o site mudou?)`)
  return value
}

/** Os arquivos do abi-tracker -> a base no formato que a página lê (`public/data/merchant.json`). */
export function buildDataset({ catalog, index, localization: loc, mapTable }, extractedAt = null) {
  const sounds = catalog.sounds.map((s) => ({ id: s.id, pickup: s.pickup, drop: s.drop }))
  const soundById = new Map(sounds.map((s) => [s.id, s]))
  const groups = new Map(catalog.itemGroups.map((g) => [g.id, g]))

  const items = catalog.items.map((it) => {
    const info = index.items[String(it.id)]
    if (!info) throw new Error(`item ${it.id} fora do índice de itens (o site mudou?)`)
    const sound = soundById.get(it.soundId)
    if (!sound) throw new Error(`item ${it.id} com som ${it.soundId} que não está na base`)
    return {
      iconId: info.iconId,
      rarity: info.rarity,
      referencePrice: info.referencePrice,
      iconAvailable: info.iconAvailable,
      kind: info.kind,
      contactPrice: info.contactPrice,
      size: info.size,
      category: it.category,
      soundId: it.soundId,
      id: it.id,
      iconUrl: ICON_URL(info.iconId),
      name: text(loc, 'UACommonItemTable', 'Name', it.id),
      describe: loc.UACommonItemTable?.Describe?.[String(it.id)] ?? '',
      categoryName: text(loc, 'UAAuctionMinorTable', 'name', it.category),
      pickupSound: sound.pickup,
      dropSound: sound.drop,
    }
  })

  const types = catalog.types.map((t) => ({ id: t.id, name: text(loc, 'UAMysteryBoxGroupConfigTable', 'MysteryBoxName', t.id) }))

  const profiles = catalog.profiles.map((p) => {
    const maps = mapTable
      .filter(([, , profile]) => profile === p.id)
      .map(([map, mode]) => ({ map: String(map), mode, mapName: text(loc, 'UABattleMapTable', 'Name', map) }))
    const label = maps.length ? maps.map((m) => `${m.mapName} ${m.mode}`).join(', ') : `Unknown Profile ${p.id}`
    return { groupWeightTotal: p.groupWeightTotal, id: p.id, maps, label }
  })

  const pools = catalog.pools.map((p) => {
    const group = groups.get(p.itemGroup)
    if (!group) throw new Error(`pool do perfil ${p.profile} com grupo de itens ${p.itemGroup} que não existe`)
    const id = p.profile * 100000 + p.itemGroup // o id que a base do abibuilder usava
    return {
      id,
      profile: p.profile,
      itemGroup: p.itemGroup,
      weight: p.weight,
      typeId: p.typeId,
      price: p.price,
      nameKey: id,
      weightTotal: group.weightTotal,
      items: group.items.map((e) => ({ id: e.id, weight: e.weight })),
    }
  })

  return {
    version: catalog.version,
    meta: {
      source: PAGE_URL,
      extractedAt,
      dataVersion: catalog.version,
      counts: { items: items.length, pools: pools.length, profiles: profiles.length, types: types.length, sounds: sounds.length },
    },
    profiles,
    items,
    pools,
    sounds,
    types,
  }
}

/** Garante que a base nova é utilizável antes de substituir a publicada. */
export function validate(dataset) {
  for (const k of REQUIRED_KEYS) {
    if (!Array.isArray(dataset[k]) || dataset[k].length === 0) throw new Error(`base sem a lista "${k}" (o site mudou?)`)
  }
  for (const s of dataset.sounds) {
    if (!SOUND_NAME.test(s.pickup)) throw new Error(`nome de som inválido na base: ${JSON.stringify(s.pickup)}`)
  }
}

/** Abre a página do Merchant e pede os arquivos ao carregador dela. Devolve os arquivos crus e onde estão os sons. */
export async function fetchTracker() {
  const { chromium } = await import('playwright-core')
  let browser
  try {
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined })
  } catch (err) {
    throw new Error(`Chromium não abriu (rode "npx playwright-core install chromium" ou defina CHROMIUM_PATH): ${err.message}`)
  }
  try {
    const page = await browser.newPage()
    await page.route(BLOCKED, (route) => route.abort())
    await page.goto(`${PAGE_URL}?lang=en`, { waitUntil: 'networkidle', timeout: 60_000 })
    await page.waitForFunction(() => typeof window.StaticGameData?.loadJson === 'function', null, { timeout: 30_000 })
    return await page.evaluate(async () => {
      const cfg = JSON.parse(document.getElementById('abi-config-merchant').textContent)
      const loaded = performance.getEntriesByType('resource').map((e) => e.name)
      const find = (re, what) => {
        const url = loaded.find((u) => re.test(u))
        if (!url) throw new Error(`a página não carregou ${what} (o site mudou?)`)
        return url
      }
      const load = (url) => window.StaticGameData.loadJson(url)
      const getJson = async (url) => (await fetch(url)).json()
      const getText = async (url) => (await fetch(url)).text()
      const merchantJs = [...document.scripts].map((s) => s.src).find((src) => /\/js\/GameInfo\/merchant\.js/.test(src))
      if (!merchantJs) throw new Error('script do Merchant não encontrado na página (o site mudou?)')
      return {
        dataVersion: cfg.dataVersion,
        cdnBase: cfg.cdnBase,
        catalog: await load(cfg.dataUrl),
        index: await load(find(/\/data\/items\/index\.json/, 'o índice de itens')),
        audio: await load(find(/\/data\/merchant\/audio\.json/, 'a lista de sons')),
        localization: await getJson(find(/\/localization\/game\/en\.json/, 'a tradução em inglês')),
        merchantJs: await getText(merchantJs),
      }
    })
  } finally {
    await browser.close()
  }
}

async function download(url) {
  const resp = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (abi-ear-js)' } })
  if (!resp.ok) throw new Error(`falha ao baixar ${url}: HTTP ${resp.status}`)
  return Buffer.from(await resp.arrayBuffer())
}

/** Grava só se o conteúdo mudou; devolve true quando gravou. */
async function writeIfChanged(path, data) {
  try {
    if (Buffer.compare(await readFile(path), data) === 0) return false
  } catch {
    /* arquivo novo */
  }
  await writeFile(`${path}.part`, data)
  await rename(`${path}.part`, path)
  return true
}

export async function sync(dest) {
  const raw = await fetchTracker()
  const dataset = buildDataset({ ...raw, mapTable: parseMapTable(raw.merchantJs) }, new Date().toISOString().replace(/\.\d{3}Z$/, '+00:00'))
  validate(dataset)

  // sons de pegar: o abi-tracker os serve com nome embaralhado; audio.json diz qual arquivo é cada som
  const audioFile = new Map(raw.audio.map(([name, files]) => [name, files[0]]))
  await mkdir(join(dest, 'sounds'), { recursive: true })
  let soundsChanged = 0
  for (const name of [...new Set(dataset.sounds.map((s) => s.pickup))].sort()) {
    const file = audioFile.get(name)
    if (!file) throw new Error(`som ${name} sem arquivo no abi-tracker`)
    if (await writeIfChanged(join(dest, 'sounds', `${name}.ogg`), await download(`${raw.cdnBase}/data/merchant/${file}`))) soundsChanged++
  }

  // ícones só enfeitam a tela: falha vira aviso
  await mkdir(join(dest, 'icons'), { recursive: true })
  let iconsChanged = 0
  let missing = 0
  for (const item of dataset.items) {
    if (item.iconAvailable === false) continue
    try {
      if (await writeIfChanged(join(dest, 'icons', `${Math.trunc(item.id)}.png`), await download(item.iconUrl))) iconsChanged++
    } catch (err) {
      console.warn(`ícone não baixado (${item.iconUrl}): ${err.message}`)
      missing++
    }
  }

  dataset.syncedAt = dataset.meta.extractedAt
  const path = join(dest, 'merchant.json')
  await writeFile(`${path}.part`, JSON.stringify(dataset)) // por último: falha antes não estraga a base
  await rename(`${path}.part`, path)
  return { dataset, soundsChanged, iconsChanged, missing }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dest = resolve(process.argv[2] ?? fileURLToPath(new URL('../public/data', import.meta.url)))
  const { dataset, soundsChanged, iconsChanged, missing } = await sync(dest)
  const c = dataset.meta.counts
  console.log(
    `base ${dataset.version} em ${dest}: ${c.items} itens, ${c.pools} pools, ${c.profiles} perfis, ${c.sounds} sons; ` +
      `${soundsChanged} sons e ${iconsChanged} ícones novos ou mudados, ${missing} ícones faltando`,
  )
}
