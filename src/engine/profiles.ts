/** Opções do seletor de mapa e modo (v0.1: escolhido pelo jogador, sem modo automático). */
import type { Dataset } from './data/dataset'

export type ProfileOption = { profileId: number; label: string }

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
