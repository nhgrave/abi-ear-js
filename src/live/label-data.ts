/** Carrega os modelos de rótulo, um arquivo por idioma do jogo (data/labels/en.json e pt.json), e lê com os dois
 * juntos: o jogador não precisa dizer o idioma. São opcionais: sem eles a página segue como a v0.1, sem ler os
 * rótulos (o automático vale todos os mapas). */
import type { LabelModel, LabelModels } from '../engine/vision/label-reader'

export const LABEL_MODELS_URLS = ['data/labels/en.json', 'data/labels/pt.json']

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

/** Junta os arquivos de modelos: os limiares do primeiro e os modelos de todos, cada um com a nota mínima e a folga do
 * seu arquivo. Um arquivo feito com outro nível de texto fica de fora (as máscaras não seriam comparáveis). */
export function mergeLabelModels(files: LabelModels[]): LabelModels | null {
  if (files.length === 0) return null
  const [first] = files
  const same = files.filter((f) => f.textLevel === first.textLevel)
  if (same.length < files.length) console.warn('abi-ear: modelos de rótulo com outro nível de texto ficaram de fora')
  // cada arquivo leva a sua nota mínima e a sua folga nos seus modelos: os nomes em português começam iguais
  // ("Colecionáveis" e "Colecionáveis Incomuns" pedem nota alta; "Carga Misteriosa" e "Carga Misteriosa Rara" diferem
  // só por uma palavra curta, e a folga entre as duas fica em ~0,12)
  const own = (f: LabelModels, m: LabelModel): LabelModel => ({
    ...m,
    ...(f.minScore !== first.minScore && { minScore: m.minScore ?? f.minScore }),
    ...(f.margin !== first.margin && { margin: m.margin ?? f.margin }),
  })
  return { ...first, models: same.flatMap((f) => f.models.map((m) => own(f, m))) }
}

async function loadOne(url: string, fetchFn: typeof fetch): Promise<LabelModels | null> {
  try {
    const resp = await fetchFn(url)
    if (!resp.ok) return null
    const json: unknown = await resp.json()
    return isLabelModels(json) ? json : null
  } catch {
    return null
  }
}

/** Os modelos dos arquivos que carregaram e são da versão que o leitor conhece, ou null se nenhum. */
export async function loadLabelModels(fetchFn: typeof fetch = fetch): Promise<LabelModels | null> {
  const files = await Promise.all(LABEL_MODELS_URLS.map((url) => loadOne(url, fetchFn)))
  return mergeLabelModels(files.filter((f): f is LabelModels => f !== null))
}
