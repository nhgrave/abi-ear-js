/** Ícones dos itens para identificar as caixas reveladas: baixados sob demanda de data/icons/<id>.png (os mesmos da
 * interface), decodificados no navegador e guardados já na escala da comparação. */
import type { IconLookup } from '../engine/controller'
import { iconImage, SIG_CELL, type BoxImage, type IconSource } from '../engine/vision/revealed'

export type IconLoader = (itemId: number) => Promise<IconSource | null>

/** Baixa e decodifica o PNG do ícone (null se falhar). */
export const fetchIcon: IconLoader = async (itemId) => {
  try {
    const resp = await fetch(`data/icons/${Math.trunc(itemId)}.png`)
    if (!resp.ok) return null
    const bmp = await createImageBitmap(await resp.blob())
    const canvas = new OffscreenCanvas(bmp.width, bmp.height)
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(bmp, 0, 0)
    const { data } = ctx.getImageData(0, 0, bmp.width, bmp.height)
    return { w: bmp.width, h: bmp.height, data }
  } catch {
    return null
  }
}

/** Devolve o ícone pronto ou null enquanto ele carrega (o controlador tenta de novo no próximo quadro). Um ícone que
 * não carrega vira uma imagem vazia: não bate com nada, e os outros candidatos ainda decidem. */
export function createIconLookup(load: IconLoader = fetchIcon): IconLookup {
  const sources = new Map<number, IconSource | null | 'loading'>()
  const images = new Map<string, BoxImage>()
  return (itemId, w, h) => {
    const key = `${itemId}:${w}x${h}`
    const ready = images.get(key)
    if (ready) return ready
    const src = sources.get(itemId)
    if (src === undefined) {
      sources.set(itemId, 'loading')
      void load(itemId).then((s) => sources.set(itemId, s))
      return null
    }
    if (src === 'loading') return null
    const img = src ? iconImage(src, w, h) : { w: w * SIG_CELL, h: h * SIG_CELL, rgba: new Uint8ClampedArray(w * h * SIG_CELL * SIG_CELL * 4) }
    images.set(key, img)
    return img
  }
}
