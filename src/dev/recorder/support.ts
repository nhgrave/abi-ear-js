/** O que falta para gravar, ou null. A gravação só é aceita no Google Chrome: o Brave se identifica como Chrome no
 * user agent, mas vem com o File System Access desligado, e os outros navegadores não foram testados. */
export function supportProblem(env: { chrome: boolean; secure: boolean; picker: boolean; processor: boolean }): string | null {
  if (!env.chrome) return 'A gravação só funciona no Google Chrome: abra http://localhost:5173/ no Chrome para gravar.'
  // o File System Access só existe em contexto seguro (localhost ou https): pelo IP da rede, nem o Chrome tem o seletor
  if (!env.secure)
    return 'A página não está num endereço seguro: abra por http://localhost:5173/ (não pelo IP da rede) para poder gravar.'
  if (!env.picker) return 'Este Chrome não tem File System Access (seletor de pasta): atualize o Chrome.'
  if (!env.processor) return 'Este Chrome não tem MediaStreamTrackProcessor: atualize o Chrome.'
  return null
}

/** Se as marcas do `navigator.userAgentData` são do Google Chrome. Pelo user agent não dá: o Brave manda o mesmo do
 * Chrome. Sem `userAgentData` (Firefox, Safari), não é o Chrome. */
export function isChrome(brands: readonly { brand: string }[] | undefined): boolean {
  return !!brands?.some((b) => b.brand === 'Google Chrome')
}
