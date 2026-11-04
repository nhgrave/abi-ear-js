# abi-ear-js: próximos passos

Atualizado em 03/11/2026, depois da publicação da v0.2.1 (`master` em `c3c4dd2`, site
https://nhgrave.github.io/abi-ear-js/). Lista viva: risque o que for feito e acrescente o que surgir.

## 1. Testes de campo do autor (v0.2 publicada)

- [ ] Abrir o site e conferir: seletor com "Automático (pelos rótulos)" como padrão, linha "Categoria" no painel da
  caixa, nenhum erro ao carregar. (Não deu para abrir a página no navegador a partir do WSL.)
- [ ] Uma visita completa ao vendedor com o jogo em inglês, comparando com o app desktop: categoria de cada caixa,
  mapa escolhido sozinho, itens.
- [ ] Compartilhando só a janela do jogo: o som do Discord fica de fora? Os indicadores Vendedor e Cursor ficam verdes?
- [ ] Trocar o mapa à mão, recarregar e ver a escolha mantida.

## 2. Gravação num vendedor de Northridge / TV Station / Airport

Para validar os modelos que saíram de uma só gravação (2026-11-02-185459) e criar os que faltam.

- Saíram de uma só gravação: Computer Parts, Electronics, Instruments, Military Items, Collectibles, Uncommon
  Collectibles, Rare Mystery Cargo, Uncommon Mystery Cargo de largura 1.
- Sem modelo nenhum: Medical Supplies, Rare Medical Supplies, Rare Collectibles, Uncommon Military Items.
- Larguras sem modelo: Uncommon Mystery Cargo de 3 de largura, e outras que aparecerem (Collectibles de 2, Rare Mystery
  Cargo de 1 e de 3...).
- Como: gravar com o app desktop aberto (o log dele é o gabarito), pegar caixas de várias categorias, depois
  reconstruir os modelos com todas as gravações e rodar o replay deixando cada gravação de fora (comandos no README,
  seção Desenvolvimento, e no adendo da spec `specs/2026-11-02-v0.2-labels-design.md`). Critério: zero categorias
  erradas.
- Atualizar o README ("Limitações da v0.2") com a lista real de categorias sem modelo.

## 3. v0.2.1 (publicada em 03/11)

Gravação na página só em modo local (Chrome), com `events.jsonl` do que a página fez ao vivo; grid só com a aba
Purchase ativa; caixa lida errada no arrasto ou sob tooltip volta com a categoria; itens do vendedor não giram.

## 4. Pendências pequenas da revisão da v0.2

- [x] Se `data/labels/en.json` não carregar, a página inteira falha ("problem.load"); deveria seguir como a v0.1
  (sem leitura). Conferir também o `version` do arquivo. (`src/live/label-data.ts`: arquivo ausente, inválido ou de
  outra versão vira "sem modelos", com aviso no console.)
- [ ] Contestação de categoria: leituras contrárias isoladas e distantes no tempo ainda somam para trocar a caixa
  (`controller.ts`, `vote`); deveriam ser seguidas de verdade.
- [ ] Uma caixa trocada por engano (`session.replaceBox`) não volta, e o painel aberto dela fecha.
- [ ] `src/engine/labels.ts` (`normalizeLabel`, `sequenceRatio`) não é usado em produção: serve se um dia vier o OCR
  (forma A). Decidir se fica.
- [ ] O replay estrito com modelos (`ABI_REPLAY_STRICT` + `ABI_LABEL_MODELS`) exige zero categorias erradas e o
  critério de atribuição da v0.1; só a 160053 é gravação de visita normal.
- [ ] Um `Int32Array` novo por caixa a cada varredura no leitor (lixo para o coletor, dentro do orçamento).
- [x] Se a aba Sell do vendedor aparecer na mesma posição do grid do vendedor, ela é aceita como vendedor (como na
  v0.1). (v0.2.1: `vision/vendor-tab.ts`, só a aba Purchase ativa vale.)

## 5. Calibração e backlog

- Compra entre caixas do mesmo tamanho (gravação 220143, 83,9 s: uma 1x1 comprada e as 1x1 andam uma casa): a
  reorganização não sabe qual saiu e as 1x1 recomeçam sem as pegadas. Usar os rótulos lidos naquele quadro no
  alinhamento (`session.realign`, `reflow.align`), que hoje recebe a sessão sem rótulos.
- Arrasto no vendedor: o lugar da caixa levantada fica vazio com uma célula vermelha, lida como caixa 1x1 por um
  instante. Desde a v0.2.1 a caixa volta com a categoria, mas a caixa falsa aparece no grid; reconhecer a célula
  vermelha evitaria isso (e serve de confirmação da atribuição, item abaixo).
- Tooltip na borda direita esconde a linha entre duas caixas da coluna 7, lidas como uma só enquanto o mouse fica
  parado (220143, 51 s). Desde a v0.2.1 elas voltam ao normal; marcar a área do tooltip como incerta evitaria a caixa
  juntada.

- Atribuição no pega e devolve rápido: na gravação 185459 ainda saem 6 caixas erradas (critério da v0.1).
- Caixas que a página monta com outro tamanho que o app desktop: são a maior parte das pegadas "sem categoria" e "sem
  caixa" da medição.
- Área vermelha da caixa levantada (quando o jogador pega) como confirmação da atribuição.
- Botão de diagnóstico local.
- `getImageData` de cerca de 8 MB por quadro no worker de visão.
- v0.3: preço do tooltip e rótulos em português (o autor troca o idioma do jogo para os testes locais).
- Levar ao app desktop (abi-ear) as correções feitas na web: caixas cortadas com largura impossível (v0.1.1),
  rolagem ambígua não decidida pelo menor deslocamento (`estimateRowShift`, v0.2), aba Purchase, categoria guardada
  da caixa que some e itens sem girar (`fits`, v0.2.1).
- Zip portátil do app desktop para compartilhar (despriorizado: a web vem primeiro).

## 6. Como trabalhar

- Delegar a outros agentes (Codex, Antigravity) só funciona numa sessão aberta pelo Houston: confira
  `echo $HOUSTON_SESSION`. A sessão de 02–03/11 rodava como job em segundo plano do Claude Code, sem isso.
- Cada merge na `master` publica o site. Publicar cedo e calibrar em versões seguintes, com os riscos no README.
- Referências locais: gravações em `C:\Users\<usuário>\abi-ear-spike\2026-11-02-1433\` e log do app desktop em
  `C:\Users\<usuário>\AppData\Roaming\abi-ear\abi-ear.log`. Os fixtures de teste (`tests/fixtures/`) saem de
  `abi-ear/tools/export_golden.py`.
