/** Base do Merchant, somente leitura (abi_ear/data/database.py: Dataset). */

export type Item = {
  id: number
  name: string
  size: [number, number] // (largura, altura) em células
  soundId: number
  rarity: number
  category: string
  contactPrice: number
  iconUrl: string | null
}

export type PoolEntry = { itemId: number; weight: number }

export type Pool = {
  id: number
  profile: number
  typeId: number
  price: number
  weight: number
  weightTotal: number
  entries: PoolEntry[]
}

export type Profile = {
  id: number
  label: string
  groupWeightTotal: number
  maps: { mapName: string; mode: string }[]
}

export type Sound = { id: number; pickup: string; drop: string }

/* eslint-disable @typescript-eslint/no-explicit-any */
export class Dataset {
  version: string
  syncedAt: string | null
  items = new Map<number, Item>()
  pools: Pool[]
  sounds = new Map<number, Sound>()
  typeIds = new Map<string, number>()
  typeNames = new Map<number, string>()
  profiles = new Map<number, Profile>()

  constructor(input: unknown) {
    const raw = input as any
    this.version = raw.version ?? '?'
    this.syncedAt = raw.syncedAt ?? null
    for (const it of raw.items) {
      this.items.set(it.id, {
        id: it.id,
        name: it.name,
        size: [it.size[0], it.size[1]],
        soundId: it.soundId,
        rarity: it.rarity,
        category: it.categoryName,
        contactPrice: it.contactPrice ?? 0,
        iconUrl: (it.iconAvailable ?? true) ? (it.iconUrl ?? null) : null,
      })
    }
    this.pools = raw.pools.map((p: any) => ({
      id: p.id,
      profile: p.profile,
      typeId: p.typeId,
      price: p.price,
      weight: p.weight,
      weightTotal: p.weightTotal,
      entries: p.items.map((e: any) => ({ itemId: e.id, weight: e.weight })),
    }))
    for (const s of raw.sounds) this.sounds.set(s.id, { id: s.id, pickup: s.pickup, drop: s.drop })
    for (const t of raw.types) {
      this.typeIds.set(t.name, t.id)
      this.typeNames.set(t.id, t.name)
    }
    for (const p of raw.profiles) {
      this.profiles.set(p.id, {
        id: p.id,
        label: p.label,
        groupWeightTotal: p.groupWeightTotal,
        maps: (p.maps ?? []).map((m: any) => ({ mapName: m.mapName, mode: m.mode })),
      })
    }
  }

  poolsFor(profileId: number, typeId: number | null = null, price: number | null = null): Pool[] {
    return this.pools.filter(
      (p) => p.profile === profileId && (typeId === null || p.typeId === typeId) && (price === null || p.price === price),
    )
  }
}
