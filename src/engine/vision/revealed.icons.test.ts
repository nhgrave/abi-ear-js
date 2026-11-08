import { readFileSync } from 'node:fs'
import { PNG } from 'pngjs'
import { describe, expect, it } from 'vitest'
import { identify, iconImage, iconScore, type BoxImage } from './revealed'

// os ícones publicados (public/data/icons): cada item revelado tem de ser achado entre todos os do mesmo tamanho,
// sem a ajuda da categoria (o pior caso)
const ds = JSON.parse(readFileSync('public/data/merchant.json', 'utf8')) as { items: { id: number; name: string; size: [number, number] }[] }
const icon = (id: number) => {
  const png = PNG.sync.read(readFileSync(`public/data/icons/${Math.trunc(id)}.png`))
  return { w: png.width, h: png.height, data: png.data }
}
/** A caixa revelada como a tela a mostra: o ícone sobre o fundo da raridade (roxo), com ruído de compressão. */
function onScreen(img: BoxImage, seed: number): BoxImage {
  let s = seed
  const noise = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff - 0.5) * 12
  const rgba = new Uint8ClampedArray(img.rgba.length)
  for (let i = 0; i < rgba.length; i += 4) {
    const a = img.rgba[i + 3] / 255
    const bg = [29, 21, 42]
    for (let c = 0; c < 3; c++) rgba[i + c] = img.rgba[i + c] * a + bg[c] * (1 - a) + noise()
    rgba[i + 3] = 255
  }
  return { ...img, rgba }
}

describe('revealed items among all the item icons', () => {
  it('tells every item apart from the others of its size', () => {
    const bySize = new Map<string, typeof ds.items>()
    for (const it of ds.items) bySize.set(it.size.join('x'), [...(bySize.get(it.size.join('x')) ?? []), it])
    const misses: string[] = []
    let worstMargin = Infinity
    for (const [size, items] of bySize) {
      const [w, h] = size.split('x').map(Number)
      const icons = items.map((it) => ({ itemId: it.id, image: iconImage(icon(it.id), w, h) }))
      for (const it of items) {
        const box = onScreen(icons.find((x) => x.itemId === it.id)!.image, it.id)
        const hit = identify(box, icons)
        if (hit?.itemId !== it.id) {
          const scores = icons.map((x) => [items.find((y) => y.id === x.itemId)!.name, iconScore(box, x.image)] as const).sort((a, b) => b[1] - a[1])
          misses.push(`${it.name} ${size}: ${scores.slice(0, 2).map(([n, sc]) => `${n} ${sc.toFixed(2)}`).join(' | ')}`)
        } else {
          const second = Math.max(...icons.filter((x) => x.itemId !== it.id).map((x) => iconScore(box, x.image)))
          worstMargin = Math.min(worstMargin, hit.score - second)
        }
      }
    }
    expect(misses).toEqual([])
    expect(worstMargin).toBeGreaterThan(0.15)
  }, 120_000)
})
