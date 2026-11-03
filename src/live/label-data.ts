/** Carrega os modelos de rótulo (data/labels/en.json). São opcionais: sem eles a página segue como a v0.1, sem ler
 * os rótulos (o automático vale todos os mapas). */
import type { LabelModel, LabelModels } from '../engine/vision/label-reader'

export const LABEL_MODELS_URL = 'data/labels/en.json'

const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

function isModel(v: unknown): v is LabelModel {
  const m = v as Partial<LabelModel> | null
  return typeof m === 'object' && m !== null && typeof m.label === 'string' && isNumber(m.w) && typeof m.mask === 'string'
}

function isLabelModels(v: unknown): v is LabelModels {
  const m = v as Partial<LabelModels> | null
  return (
    typeof m === 'object' &&
    m !== null &&
    m.version === 1 &&
    isNumber(m.textLevel) &&
    isNumber(m.minScore) &&
    isNumber(m.margin) &&
    Array.isArray(m.models) &&
    m.models.every(isModel)
  )
}

/** Os modelos, ou null se o arquivo não carregar ou não for da versão que o leitor conhece. */
export async function loadLabelModels(fetchFn: typeof fetch = fetch): Promise<LabelModels | null> {
  try {
    const resp = await fetchFn(LABEL_MODELS_URL)
    if (!resp.ok) return null
    const json: unknown = await resp.json()
    return isLabelModels(json) ? json : null
  } catch {
    return null
  }
}
