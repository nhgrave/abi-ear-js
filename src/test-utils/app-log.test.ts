import { describe, expect, it } from 'vitest'
import { parseAppPicks } from './app-log'

const LOG = [
  '2026-11-02 16:01:04,186 INFO abi_ear.controller: pegada às 16:01:03.795 em (1718, 668): caixa (6, 6) 3x2',
  '2026-11-02 16:01:04,200 INFO abi_ear.controller: pegada às 16:01:03.900 em (1477, 691): caixa (2, 6) 2x3',
  "2026-11-02 16:01:04,576 INFO abi_ear.controller: caixa (2, 6) None 2x3 pega: sons=[('Item_Misc_Med_Metal_Crisp_Up', 0.91)] candidatos=[]",
  "2026-11-02 16:01:04,600 INFO abi_ear.controller: caixa (6, 6) Uncommon Mystery Cargo 3x2 pega: sons=[] candidatos=[('Car Battery', 100)]",
  '2026-11-02 16:01:04,805 INFO abi_ear.controller: pegada às 16:01:04.478 em (1720, 653): caixa (6, 6) 3x2',
].join('\r\n')

describe('parseAppPicks', () => {
  it('links each pick to the next "pega:" line of the same box', () => {
    const picks = parseAppPicks(LOG)
    expect(picks.map((p) => [p.key, p.size, p.label])).toEqual([
      ['6,6', '3x2', 'Uncommon Mystery Cargo'],
      ['2,6', '2x3', null],
      ['6,6', '3x2', null], // a linha "pega:" desta não chegou
    ])
    expect(picks[0]).toMatchObject({ x: 1718, y: 668, t: new Date('2026-11-02T16:01:03.795').getTime() })
  })
})
