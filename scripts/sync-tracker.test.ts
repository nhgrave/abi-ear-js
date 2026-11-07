import { describe, expect, it } from 'vitest'
// @ts-expect-error script em JS puro, sem tipos
import { buildDataset, parseMapTable, validate } from './sync-tracker.mjs'

// um pedaço do abi-tracker no formato que a página dele recebe: catálogo, índice de itens e tradução
const raw = () => ({
  catalog: {
    version: '1.0.0.151.17',
    items: [{ category: 40801, soundId: 1, id: 408010005 }],
    sounds: [{ pickup: 'Item_Misc_Med_Comp_Up', drop: 'Item_Misc_Med_Comp_Down', id: 1 }],
    profiles: [{ groupWeightTotal: 10000, id: 1 }, { groupWeightTotal: 10000, id: 6 }],
    pools: [{ profile: 1, price: 20000, weight: 633, typeId: 100001, itemGroup: 2 }],
    types: [{ id: 100001 }],
    itemGroups: [{ weightTotal: 6400, id: 2, items: [{ weight: 200, id: 408010005 }] }],
  },
  index: {
    items: {
      '408010005': { iconId: 408010005, rarity: 4, referencePrice: 15223, iconAvailable: true, kind: 'item', contactPrice: 6089, size: [1, 2] },
    },
  },
  localization: {
    UACommonItemTable: { Name: { '408010005': 'Oil' }, Describe: { '408010005': 'Generally used as a lubricant' } },
    UAAuctionMinorTable: { name: { '40801': 'Flammables' } },
    UAMysteryBoxGroupConfigTable: { MysteryBoxName: { '100001': 'Flammables' } },
    UABattleMapTable: { Name: { '1102': 'Farm', '703': 'Distorted Valley' } },
  },
  mapTable: [[1102, 'Lockdown', 1], [703, 'Anomaly', 1]],
})

describe('buildDataset', () => {
  it('joins the catalog item with the item index, the sound and the English names', () => {
    expect(buildDataset(raw()).items[0]).toEqual({
      iconId: 408010005, rarity: 4, referencePrice: 15223, iconAvailable: true, kind: 'item', contactPrice: 6089,
      size: [1, 2], category: 40801, soundId: 1, id: 408010005,
      iconUrl: 'https://hexaov91.github.io/abi-assets/image/Normal/408010005.png',
      name: 'Oil', describe: 'Generally used as a lubricant', categoryName: 'Flammables',
      pickupSound: 'Item_Misc_Med_Comp_Up', dropSound: 'Item_Misc_Med_Comp_Down',
    })
  })
  it('expands each pool with its item group, keeping the pool id the page already knew', () => {
    expect(buildDataset(raw()).pools[0]).toEqual({
      id: 100002, profile: 1, itemGroup: 2, weight: 633, typeId: 100001, price: 20000, nameKey: 100002,
      weightTotal: 6400, items: [{ id: 408010005, weight: 200 }],
    })
  })
  it('names the maps of each profile from the map table, in its order', () => {
    const [p1, p6] = buildDataset(raw()).profiles
    expect(p1).toEqual({
      groupWeightTotal: 10000, id: 1, label: 'Farm Lockdown, Distorted Valley Anomaly',
      maps: [{ map: '1102', mode: 'Lockdown', mapName: 'Farm' }, { map: '703', mode: 'Anomaly', mapName: 'Distorted Valley' }],
    })
    expect(p6).toMatchObject({ id: 6, maps: [], label: 'Unknown Profile 6' })
  })
  it('names the box types and records version and counts', () => {
    const ds = buildDataset(raw(), '2026-11-06T22:00:00+00:00')
    expect(ds.types).toEqual([{ id: 100001, name: 'Flammables' }])
    expect(ds.version).toBe('1.0.0.151.17')
    expect(ds.meta).toMatchObject({ dataVersion: '1.0.0.151.17', extractedAt: '2026-11-06T22:00:00+00:00' })
    expect(ds.meta.counts).toEqual({ items: 1, pools: 1, profiles: 2, types: 1, sounds: 1 })
  })
  it('refuses to build when the site stops sending a name, instead of publishing an item without one', () => {
    const r = raw()
    delete r.localization.UACommonItemTable.Name['408010005']
    expect(() => buildDataset(r)).toThrow(/UACommonItemTable\.Name\[408010005\]/)
  })
  it('refuses an item missing from the item index', () => {
    const r = raw()
    r.index.items = {}
    expect(() => buildDataset(r)).toThrow(/índice de itens/)
  })
})

describe('parseMapTable', () => {
  it('reads the map/mode/profile table out of the merchant script', () => {
    const js = 'use strict";const y=[[1102,"Normal",3],[1102,"Lockdown",1],[703,"DeepAnomaly",2]];function L(t,e){}'
    expect(parseMapTable(js)).toEqual([[1102, 'Normal', 3], [1102, 'Lockdown', 1], [703, 'DeepAnomaly', 2]])
  })
  it('fails loudly when the script no longer has the table', () => {
    expect(() => parseMapTable('const y=[]')).toThrow(/tabela de mapas/)
  })
})

describe('validate', () => {
  it('rejects a sound name with a path', () => {
    const ds = buildDataset(raw())
    ds.sounds[0].pickup = '../x'
    expect(() => validate(ds)).toThrow()
  })
  it('rejects an empty list', () => {
    expect(() => validate({ ...buildDataset(raw()), pools: [] })).toThrow(/pools/)
  })
})
