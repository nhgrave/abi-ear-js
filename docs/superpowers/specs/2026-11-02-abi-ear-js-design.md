# abi-ear-js: design

Versão web do abi-ear. Um site estático que qualquer jogador de Arena Breakout: Infinite abre pelo
link, compartilha a tela e vê, ao lado do jogo, o que provavelmente há dentro de cada caixa
"Mysterious Supplies" do vendedor do Merchant Raid. Toda a análise roda no navegador do jogador.
O servidor só entrega arquivos.

Projeto de referência: `~/Projects/my-apps/abi-ear` (Python/PySide6, branch `feat/abi-ear-v1`,
commit `2249765`). O motor dele é o ponto de partida e o gabarito deste.

## 1. Intenção

O app desktop funciona, mas só para quem roda Python no Windows. O objetivo é que qualquer jogador
use o mesmo identificador sem instalar nada: abrir o link, compartilhar a tela, ir ao vendedor.

**Sucesso** é acertar o item de cada caixa. O site falhou, mesmo funcionando, se identificar errado.
Um "?" honesto vale mais que um item errado mostrado como certo.

## 2. Público

Qualquer jogador que encontrar o link, sem contato com o autor. A página precisa se explicar
sozinha, incluindo o passo a passo do compartilhamento de tela com áudio. O jogo pode estar em
vários idiomas, principalmente inglês e português.

## 3. Objetivos, não-objetivos e anti-objetivos

**Objetivos da primeira versão**
- Identificar os itens com pelo menos a mesma precisão do app desktop nos mesmos dados (seção 9).
- Funcionar com o jogo em inglês e em português.
- Página em português e em inglês.
- Nenhum arquivo vindo de terceiros em tempo de uso: base, sons, imagens, modelos de OCR e
  bibliotecas saem do nosso próprio site.

**Não-objetivos da primeira versão**
- Calibração manual (amostras de som gravadas pelo usuário, região do grid desenhada à mão).
- Contas de usuário, histórico salvo no servidor, analytics.
- Servidor de processamento.
- Uso pelo celular e overlay sobre o jogo.
- Nomes de itens traduzidos. Ficam em inglês, como na base.

**Anti-objetivos (o que tornaria o projeto um fracasso)**
- Mostrar um item com confiança alta quando o dado não sustenta.
- Enviar qualquer quadro da tela ou trecho de áudio para fora do navegador.
- Qualquer interação com o processo do jogo. A restrição do projeto original continua valendo:
  "sem injeção de memória, apenas monitoramento externo seguro". Aqui o único canal de entrada é o
  compartilhamento de tela do navegador.
- Falhar em silêncio. Se o áudio está fraco ou o vendedor não foi achado, a página precisa dizer.

## 4. Restrições

- **Navegador:** Chrome ou Edge no Windows. Só eles capturam o áudio do sistema por `getDisplayMedia`, e só ao compartilhar a **tela inteira** com "compartilhar áudio do sistema" marcado. Nos outros navegadores, ou se a página não receber faixa de áudio, ela explica o motivo e não segue.
- **Jogo:** em janela ou em tela cheia sem borda. É o modo em que a captura funciona hoje.
- **Isolamento:** dois usuários ao mesmo tempo não compartilham nada. Como tudo roda no navegador de cada um, isso vale por construção.
- **Hospedagem:** qualquer serviço de site estático (Cloudflare Pages, GitHub Pages, servidor próprio). O build gera uma pasta pronta para publicar.
- **Atribuição:** a base, os sons e as imagens vêm do jogo, via abibuilder.com e
  hexaov91/abi-assets, e são redistribuídos. O site cita as fontes no rodapé.
- **Desempenho:** a análise não pode travar a página nem o jogo. Todo o processamento pesado roda em Web Workers.

## 5. Decisões do usuário

1. **Público aberto:** qualquer jogador com o link.
2. **Idiomas:** o jogo em vários idiomas, principalmente inglês e português.
3. **Tela principal: espelho do grid**, como o app de hoje (opção A dos modelos), e não uma lista.
4. **Imagem no grid:** quando o item de uma caixa chega a 100%, o grid mostra a imagem do item.
5. **Assets próprios:** imagens, sons e base são baixados e publicados pelo próprio site, sem depender de terceiros em tempo de uso.
6. **Frontend em Vue.**
7. **Atualização manual:** quando o jogo mudar, o autor roda o script de assets e publica uma nova versão.
8. **Tabela de rótulos em português:** o autor faz uma captura do vendedor com o jogo em português.

## 6. Decisões técnicas (minhas; podem ser revistas)

- **Stack:** Vue 3, TypeScript, Vite, testes com Vitest. Página com i18n em pt-BR e en (vue-i18n ou equivalente).
- **Motor:** porte em TypeScript do motor Python, módulo por módulo (seção 7), preservando constantes e comportamento. Diferenças só onde a plataforma obriga, e documentadas.
- **OCR:** Tesseract.js, com o worker, o core WASM e os modelos `eng` e `por` servidos pelo nosso site. O OCR do Windows não existe no navegador. Se a precisão em rótulos ficar abaixo do app (seção 9), o plano B é comparar os rótulos com imagens de referência, já que o jogo usa uma fonte fixa e são só 19 tipos por idioma.
- **Caixa pega sem cursor:** o navegador não informa a posição do mouse. A caixa pega passa a ser deduzida da imagem (seção 8.3). É o principal risco técnico e vai primeiro para o protótipo.
- **Aviso de áudio fraco:** o indicador de Áudio fica amarelo, com a dica de aumentar o volume de efeitos do jogo, quando os sons de pegar chegam com nota baixa (ver 8.2). Motivo: em 24/10, às 21:04, o volume do jogo caiu e o app desktop passou a descartar a maioria das pegadas sem avisar ninguém.
- **Idioma do jogo:** detectado sozinho, pelo idioma da tabela de rótulos que melhor explica os textos lidos. Pode ser trocado na página.
- **Rodapé:** data e versão da base, mais os créditos das fontes.
- **Local:** repositório git separado em `~/Projects/my-apps/abi-ear-js`.
- **Sem calibração:** o reforço por observações do Python (`OBSERVATION_BOOST`, vindo da calibração) fica com zero observações.
- **Sessão em memória:** recarregar a página começa uma sessão nova. Nada é salvo no navegador, além de preferências como o idioma.
- **Vários monitores:** o passo a passo pede para compartilhar a tela onde o jogo está. Se nenhum vendedor nem grid aparecer depois de um tempo com o jogo aberto, a página sugere que talvez a tela errada esteja compartilhada.

## 7. Arquitetura

```
getDisplayMedia (tela + áudio do sistema)
 ├─ vídeo ─► frames (VideoFrame / ImageBitmap) ─► Worker de visão
 │                                                 grid → caixas → OCR de rótulos e tooltip
 └─ áudio ─► AudioWorklet (mono 48 kHz) ─► Worker de áudio
                                            escuta contínua → "pegou" (instante, som, nota)
                     ▼                                      ▼
                  Engine (thread principal ou worker próprio)
                  sessão do vendedor, rolagem, reorganização,
                  atribuição da pegada à caixa, ranking de candidatos
                     ▼
                  UI Vue: indicadores, grid espelhado, detalhes da caixa
```

Correspondência com o projeto Python (todos os caminhos em `abi_ear/`):

| Python | abi-ear-js | Observação |
|---|---|---|
| `vision/grid.py` | `engine/vision/grid.ts` | Detecção do grid, caixas, células incertas, overlays (tooltips) e busca guiada pelo grid conhecido. O `cv2.erode` vira uma corrida por linha/coluna em TS puro. |
| `vision/pipeline.py` | `engine/vision/pipeline.ts` | Um quadro vira um `ScanResult`. Sem cursor, o tooltip é achado só pela visão (`overlays`). |
| `vision/ocr.py` | `engine/vision/labels.ts` | Rótulos por caixa, parsing do tooltip, comparação aproximada (cutoff 0,75) contra a tabela do idioma. |
| `vision/ocr_windows.py` | `engine/vision/ocr.ts` | Tesseract.js. |
| `audio/matcher.py` | `engine/audio/matcher.ts` | Passa-altas, referência cortada e NCC por FFT. Uma FFT do trecho serve para todas as referências. |
| `audio/trigger.py` | `engine/audio/listener.ts` | Janela de 0,5 s a cada 0,1 s, limite 0,7, período refratário de 0,4 s, log de quase-acertos. |
| `engine/session.py`, `engine/reflow.py` | `engine/session.ts`, `engine/reflow.ts` | Sessão do vendedor, rolagem, reabertura, reorganização do estoque, caixas sumidas e restauradas. |
| `engine/candidates.py`, `engine/identify.py` | `engine/candidates.ts`, `engine/identify.ts` | Prior pelos pools (perfil, tipo, preço), filtro por som e tamanho, perfil automático pelos rótulos. |
| `controller.py` | `engine/controller.ts` | Junta tudo. Proteção do tooltip: rótulo diferente do da caixa é ignorado; preço fora da base não troca um preço já lido. |
| `data/sync.py` | `scripts/sync-assets.ts` | Rodado pelo autor, não no navegador. |
| `ui/*` | `src/components/*` | Só o necessário da tela principal. |

O motor não depende de Vue nem do DOM, para poder ser testado em Node com os mesmos fixtures.

## 8. Comportamento

### 8.1 Captura
- Vídeo: `getDisplayMedia` com tela inteira. O processamento de áudio do navegador fica desligado: `echoCancellation`, `noiseSuppression` e `autoGainControl` em false, e `suppressLocalAudioPlayback` em false.
- Quadros: a visão roda a cerca de 3 Hz como hoje (0,35 s). A detecção de caixa sumida (8.3) pode exigir algo como 8 a 10 Hz, em versão leve, só checando as células das caixas já conhecidas. O protótipo decide o valor.
- Se o jogador parar de compartilhar, a página volta ao estado inicial e mantém a sessão do vendedor na memória até ser recarregada.

### 8.2 Áudio
- Mesmos sons de referência (38 `_Up`), mesmo pré-processamento e mesma NCC do Python.
- A nota das pegadas aceitas e dos quase-acertos (0,5 a 0,7) alimenta o indicador. Mediana das últimas pegadas abaixo de cerca de 0,8, ou quase-acertos frequentes, deixa o indicador amarelo com a dica de volume. O limite exato fica com quem constrói e é calibrado no protótipo.

### 8.3 Qual caixa foi pega (sem cursor)
Fato observado em 24/10 (capturas `diag/04_*`): ao pegar uma caixa, no quadro seguinte o lugar dela
fica vazio ou incerto, com a dica "R Rotate" perto, e ela volta ao soltar. Proposta:
1. Quando o som de pegar é ouvido no instante t, procurar nos quadros de t − 0,3 s a t + 0,6 s a caixa que estava inteira antes e sumiu, ou ficou incerta, logo depois.
2. Sinal auxiliar: a caixa sob o cursor fica mais clara no jogo (destaque de hover), o que dá a caixa apontada no quadro anterior ao som.
3. Uma única caixa candidata: recebe a pegada. Nenhuma ou mais de uma: a pegada não é atribuída. A página mostra "som ouvido, caixa não identificada" e não chuta.

Critério do protótipo: a atribuição pela imagem concorda com a do app desktop, que usa o cursor,
em pelo menos 95% das pegadas de uma visita real com os dois rodando juntos, sem nenhuma atribuição
errada mostrada como certa.

### 8.4 Tooltip
Sem cursor, o tooltip é achado só pela visão: um retângulo sobre o grid (os `overlays` do Python). Ele
abre logo abaixo e à direita do ponto do cursor (a cerca de 6 px e 8 px nas capturas de 24/10) e vira
para o outro lado perto das bordas. A caixa do tooltip é a que está sob esse ponto. Continua valendo a
proteção de hoje: rótulo diferente do rótulo da caixa é ignorado. Nas capturas, esses casos eram o
tooltip da caixa anterior ainda na tela.

### 8.5 Idiomas
- `public/data/labels/<idioma>.json`: texto do rótulo no jogo → `typeId` da base, para os 19 tipos.
  O `en` sai direto da base. O `pt` é montado à mão a partir da captura do autor (seção 11). Os
  tipos dependem da família de mapas: Farm/Valley têm Paper, Tools…; Northridge/Airport têm Computer
  Parts, Medical Supplies…. Para cobrir os 19, a captura precisa de visitas nas duas famílias. Tipos
  que faltarem caem na comparação com o inglês e são completados depois.
- Idioma do jogo detectado sozinho, pelo idioma com mais rótulos casados, e trocável na página.
- Preço: só dígitos e separadores, aceitando `.` e `,` como separador de milhar.

### 8.6 Tela
Base: o app atual (`ui/main_window.py`, `ui/grid_view.py`) e o modelo A de 02/11.
- **Topo:** indicadores Áudio, Tela e Vendedor (verde, amarelo, vermelho, cinza), cada um com o motivo ao passar o mouse. Seleção de mapa: automático pelos rótulos, como hoje, ou manual. Botão Limpar.
- **Centro:** grid do vendedor em escala, com cada caixa no tamanho e na posição reais e as linhas já vistas guardadas acima e abaixo da faixa visível. A faixa visível fica destacada e a página acompanha a rolagem.
- **Cada caixa:** mostra o tipo. Depois de pega, mostra o item mais provável e a porcentagem. Cor: verde quando quase certo, amarelo em dúvida, cinza quando ainda não pega.
- **Caixa com 100%** (um único candidato, ou o primeiro arredondado para 100%): mostra a imagem do item no lugar do texto. Com 99%, como o Gold Cube, continua mostrando nome e porcentagem.
- **Ao clicar numa caixa:** painel com todos os candidatos e barras de porcentagem, o tipo, o tamanho e o preço lido.
- **Rodapé:** última pegada (som e nota), data e versão da base, créditos.
- **Primeira visita:** passo a passo do compartilhamento (tela inteira e áudio do sistema), com o que fazer se o áudio não vier.

## 9. Testes e paridade com o Python

- Copiar os fixtures de `abi-ear/tests/fixtures`: os quadros `live_*`, `scroll_*` e `reflow_*`, o `video_audio.wav` e o `merchant.html`. Copiar também as capturas de diagnóstico de 24/10 em `C:\Users\<usuário>\abi-ear-runtime\diag` (quadros com a posição do cursor no nome e o `rec1.npy` com 45 s de áudio real). As sequências usadas nas medições antigas estavam numa pasta temporária que já foi apagada.
- **Gravações novas (minha decisão):** o protótipo (seção 10) tem um modo de gravação que salva localmente, no PC do jogador e nunca enviados a lugar nenhum, os quadros e o áudio de uma visita ao vendedor, junto com o log do app desktop rodando ao mesmo tempo. Essas visitas viram os fixtures de sequência do projeto.
- **Gabarito:** um script no repositório Python exporta, para cada fixture, o que o motor Python produz: grid, caixas, células incertas, overlays, notas de cada som e rankings. O motor TS precisa reproduzir isso, dentro de tolerâncias definidas por teste (por exemplo, x0 e y0 a ±1 px, notas de som a ±0,01, mesmas caixas). A saída do OCR não entra na paridade exata, porque os motores são diferentes. Para ele, o critério é o número de caixas com rótulo válido nos mesmos quadros, que não pode ser menor que o do app. A referência do app é medida pelo script de gabarito no Windows, porque o OCR dele é o do Windows.
- **Script de gabarito (minha decisão):** fica no repositório Python, em `tools/export_golden.py`, e roda com o Python portátil do Windows (`C:\Users\<usuário>\abi-ear-runtime`).
- Testes de unidade portados de `abi-ear/tests` para session, reflow, candidates, matcher, trigger e grid.

## 10. Ordem de construção

1. **Protótipo de risco (descartável).** Uma página mínima que captura tela e áudio pelo Chrome com o jogo rodando e verifica duas coisas:
   - a nota dos sons de pegar fica próxima da do app desktop;
   - a atribuição pela imagem (8.3) atinge o critério de 95%.

   Se uma delas falhar, a decisão volta ao autor antes de seguir.
2. **Motor em TS** com o gabarito da seção 9.
3. **Interface Vue** (8.6), com i18n.
4. **Script de assets** e tabela de rótulos em português.
5. **Build estático** pronto para publicar.

## 11. Assets

O `scripts/sync-assets.ts` é rodado pelo autor e gera `public/data/`:
- `merchant.json`: a base extraída do payload da página `https://abibuilder.com/merchant`, como em `abi-ear/abi_ear/data/sync.py`, com `syncedAt` e `meta.dataVersion`.
- `sounds/<nome>.ogg`: de `https://abibuilder.com/audio/merchant/<nome>.ogg`.
- `icons/<id>.png`: do `iconUrl` de cada item (hoje `hexaov91.github.io/abi-assets`).
- `labels/en.json`: gerado a partir dos `types` da base. `labels/pt.json` é mantido à mão e o script não o sobrescreve.
- Modelos do Tesseract (`eng`, `por`) e o core WASM: copiados para a pasta pública na instalação ou no build.

## 12. Riscos conhecidos

- **Atribuição sem cursor (8.3):** é o maior risco e por isso vem primeiro.
- **Áudio do sistema:** depende de o jogador marcar a opção, e só existe no Chrome e no Edge no Windows.
- **Tela cheia exclusiva:** alguns jogos dão tela preta na captura. Hoje o jogo roda sem borda, mas outros jogadores podem usar outro modo. A página precisa detectar quadro preto e explicar.
- **Custo do OCR:** o Tesseract em WASM é mais lento que o OCR do Windows. Por isso, ler só rótulos novos e só o retângulo do tooltip, como o app já faz.
- **Redistribuição:** base, sons e imagens são do jogo e do abibuilder. O site cita as fontes. Se houver reclamação, o site pode precisar mudar de modelo.

## 13. Deixado para quem constrói

- Taxa de quadros da detecção de caixa sumida e da varredura completa.
- Thresholds do indicador de áudio.
- Biblioteca de i18n e organização interna dos componentes.
- Transferência de quadros para o worker: `MediaStreamTrackProcessor` ou `ImageCapture`/canvas.
- Tolerâncias exatas da paridade, desde que nenhuma resposta de identificação mude.
