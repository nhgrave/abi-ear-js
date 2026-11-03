/** Opções do seletor de mapa e modo, e os perfis que os rótulos das caixas indicam. */
import type { Dataset } from './data/dataset'

export type ProfileOption = { profileId: number; label: string }

/** Escolha do seletor: pelos rótulos das caixas, todos os mapas ou um perfil. */
export type ProfileChoice = 'auto' | 'all' | number

/** Uma opção por par mapa/modo dos perfis da base, rotulada "<mapName> <mode>", em ordem alfabética.
 * Perfis sem mapas ("Unknown Profile N") ficam só em "Todos os mapas". */
export function profileOptions(ds: Dataset): ProfileOption[] {
  const seen = new Map<string, number>()
  for (const profile of [...ds.profiles.values()].sort((a, b) => a.id - b.id)) {
    for (const m of profile.maps) {
      const label = `${m.mapName} ${m.mode}`
      if (!seen.has(label)) seen.set(label, profile.id)
    }
  }
  return [...seen.entries()]
    .map(([label, profileId]) => ({ profileId, label }))
    .sort((a, b) => (a.label < b.label ? -1 : a.label > b.label ? 1 : 0))
}

/** Todos os perfis, para "Todos os mapas" (como profiles_for_labels sem rótulos no Python). */
export function allProfileIds(ds: Dataset): number[] {
  return [...ds.profiles.keys()].sort((a, b) => a - b)
}

/** Perfis compatíveis com os rótulos vistos no vendedor (profiles_for_labels). Fica quem explica mais rótulos (um
 * rótulo lido errado não zera a lista); sem rótulos, ou sem casamento nenhum, todos. Nunca vazia. */
export function profilesForLabels(ds: Dataset, labels: Iterable<string>): number[] {
  const seen = new Set(labels)
  const ids = allProfileIds(ds)
  if (seen.size === 0) return ids
  const explained = new Map<number, number>()
  for (const pid of ids) {
    const names = new Set(ds.pools.filter((p) => p.profile === pid).map((p) => ds.typeNames.get(p.typeId)))
    explained.set(pid, [...seen].filter((l) => names.has(l)).length)
  }
  const best = Math.max(...explained.values())
  return ids.filter((pid) => explained.get(pid) === best)
}
