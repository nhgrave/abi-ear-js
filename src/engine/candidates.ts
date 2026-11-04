/** Lista de itens possíveis para uma caixa, ordenada por probabilidade (abi_ear/engine/candidates.py).
 * Sem calibração na v0.1: o reforço por observações (OBSERVATION_BOOST) não é portado. */
import type { Dataset, Item } from './data/dataset'

export type SoundHit = { soundId: number; score: number }
export type Candidate = { item: Item; pct: number } // pct 0..100
export type Ranking = { candidates: Candidate[]; sizeRelaxed: boolean } // sizeRelaxed: o filtro de tamanho zerou a lista e foi ignorado

/** O vendedor mostra cada item como está na base, sem girar (o app desktop aceita girado). */
export function fits(itemSize: [number, number], boxSize: [number, number]): boolean {
  return itemSize[0] === boxSize[0] && itemSize[1] === boxSize[1]
}

/** P(item) = média nos perfis de Σ pools (peso do pool / total do perfil) × (peso do item / total do pool). */
export function priors(ds: Dataset, profileIds: number[], typeId: number | null, price: number | null): Map<number, number> {
  const out = new Map<number, number>()
  for (const profileId of profileIds) {
    for (const [itemId, p] of profilePriors(ds, profileId, typeId, price)) {
      out.set(itemId, (out.get(itemId) ?? 0) + p / profileIds.length)
    }
  }
  return out
}

function profilePriors(ds: Dataset, profileId: number, typeId: number | null, price: number | null): Map<number, number> {
  let pools = ds.poolsFor(profileId, typeId, price)
  if (pools.length === 0 && price !== null) pools = ds.poolsFor(profileId, typeId, null) // preço lido errado: ignora o preço
  const profile = ds.profiles.get(profileId)
  const groupTotal = profile && profile.groupWeightTotal > 0 ? profile.groupWeightTotal : 1
  const out = new Map<number, number>()
  for (const pool of pools) {
    if (pool.weightTotal <= 0) continue // pool vazio/corrompido na base
    const poolP = pool.weight / groupTotal
    for (const entry of pool.entries) {
      if (ds.items.has(entry.itemId)) {
        out.set(entry.itemId, (out.get(entry.itemId) ?? 0) + (poolP * entry.weight) / pool.weightTotal)
      }
    }
  }
  return out
}

export function rank(
  ds: Dataset,
  profileIds: number[],
  typeId: number | null,
  price: number | null,
  hits: SoundHit[],
  size: [number, number] | null,
): Ranking {
  const prior = priors(ds, profileIds, typeId, price)
  const audio = new Map(hits.map((h) => [h.soundId, h.score]))

  const scores = (useSize: boolean): Map<number, number> => {
    const out = new Map<number, number>()
    for (const [itemId, p] of prior) {
      const item = ds.items.get(itemId)!
      if (audio.size > 0 && !audio.has(item.soundId)) continue
      if (useSize && size !== null && !fits(item.size, size)) continue
      out.set(itemId, p * (audio.get(item.soundId) ?? 1.0))
    }
    return out
  }

  let result = scores(true)
  let relaxed = false
  if (result.size === 0 && size !== null) {
    result = scores(false)
    relaxed = result.size > 0
  }
  const total = [...result.values()].reduce((a, b) => a + b, 0)
  if (total <= 0) return { candidates: [], sizeRelaxed: false }
  const ordered = [...result.entries()].sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1]
    const na = ds.items.get(a[0])!.name
    const nb = ds.items.get(b[0])!.name
    return na < nb ? -1 : na > nb ? 1 : 0 // desempate como o Python: ordem de código, não de localidade
  })
  return {
    candidates: ordered.map(([id, s]) => ({ item: ds.items.get(id)!, pct: (100 * s) / total })),
    sizeRelaxed: relaxed,
  }
}
