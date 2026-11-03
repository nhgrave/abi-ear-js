import { expect, it } from 'vitest'
// @ts-expect-error script em JS puro, sem tipos
import { RECORDER_MARKERS, findLeaks } from './check-dist.mjs'

it('flags each recorder marker in file contents', () => {
  for (const m of RECORDER_MARKERS) expect(findLeaks([{ path: 'assets/app.js', text: `x${m}y` }])).toEqual([`assets/app.js: ${m}`])
})

it('flags recorder or spike in a path', () => {
  expect(findLeaks([{ path: 'assets/recorder-abc.js', text: '' }])).toEqual(['assets/recorder-abc.js: recorder'])
  expect(findLeaks([{ path: 'spike/recorder/index.html', text: '' }]).length).toBeGreaterThan(0)
})

it('ignores recorder in game data paths (the game has a "Portable Recorder" item)', () => {
  expect(findLeaks([{ path: 'data/icons/portable-recorder.png', text: '' }])).toEqual([])
  expect(findLeaks([{ path: 'data/merchant.json', text: 'showDirectoryPicker' }])).toEqual(['data/merchant.json: showDirectoryPicker'])
})

it('passes clean files',() => expect(findLeaks([{ path: 'assets/app-1.js', text: 'vendor grid' }])).toEqual([]))
