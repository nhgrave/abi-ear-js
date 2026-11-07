# abi-ear-js: próximos passos

Atualizado em 06/11/2026, depois da publicação da v0.2.2 (`master` em `8c42da1`, site
https://nhgrave.github.io/abi-ear-js/). Lista viva: risque o que for feito e acrescente o que surgir.

Só a versão web segue: o app desktop (abi-ear) não recebe mais manutenção (decisão de 06/11), e as gravações são
feitas sem ele aberto.

## 1. Testes de campo do autor (v0.2 publicada)

- [ ] Abrir o site e conferir: seletor com "Automático (pelos rótulos)" como padrão, linha "Categoria" no painel da
  caixa, nenhum erro ao carregar. (Não deu para abrir a página no navegador a partir do WSL.)
- [ ] Uma visita completa ao vendedor com o jogo em inglês: categoria de cada caixa, mapa escolhido sozinho, itens.
- [ ] Compartilhando só a janela do jogo: o som do Discord fica de fora? Os indicadores Vendedor e Cursor ficam verdes?
- [ ] Trocar o mapa à mão, recarregar e ver a escolha mantida.

## 2. Gravação num vendedor de Northridge / TV Station / Airport

Para validar os modelos que saíram de uma só gravação (2026-11-02-185459) e criar os que faltam.

- Saíram de uma só gravação: Computer Parts, Electronics, Instruments, Military Items, Collectibles, Uncommon
  Collectibles, Rare Mystery Cargo, Uncommon Mystery Cargo de largura 1.
- Sem modelo nenhum: Medical Supplies, Rare Medical Supplies, Rare Collectibles, Uncommon Military Items.
- Larguras sem modelo: Uncommon Mystery Cargo de 3 de largura, e outras que aparecerem (Collectibles de 2, Rare Mystery
  Cargo de 1 e de 3...).
- Como: gravar só com a página (sem o app desktop), pegar caixas de várias categorias, depois reconstruir os modelos
  com todas as gravações e rodar o replay deixando cada gravação de fora (comandos no README, seção
  Desenvolvimento, e no adendo da spec `specs/2026-11-02-v0.2-labels-design.md`). Critério: zero categorias erradas.
- [ ] Gabarito sem o app desktop: até a v0.2.2, a categoria certa de cada pegada vinha do log do app
  (`ABI_APP_LOG`). Nas gravações novas, a categoria tem de sair dos próprios quadros: recortar o rótulo de cada caixa
  pega, conferir o texto na imagem e gravar o gabarito junto da gravação, para o construtor de modelos e o replay
  lerem de lá.
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

- v0.2.2 (publicada em 2026-11-06), medido no replay das 5 gravações com log do app (232 pegadas com
  categoria): pegadas na caixa do app 174 → 184, sem caixa 15 → 4, categoria certa 203 → 230, errada 1 → 0.
  - [x] Compra entre caixas do mesmo tamanho: o alinhamento usa os rótulos lidos no quadro (só como dica).
  - [x] Caixa levantada (célula vermelha lida como caixa menor dentro dela) e caixas juntadas sob o tooltip: viram
    células incertas e a caixa guardada fica (`session.withoutSuspects`); a forma que dura 8 s passa a valer.
  - [x] Modelos de rótulo refeitos com a 220143 (Medical Supplies, Uncommon Military Items, Military Items de 1 e
    Uncommon Mystery Cargo de 3 de largura), conferidos na 200938, que não entrou na construção.
  - [ ] O tooltip com a seta do cursor sobre a cantoneira de cima não é achado (`findOverlays`): o contorno da seta
    corta a cantoneira. Juntar as falhas da máscara inteira cria cantos falsos no texto; precisa de outra regra.
  - "Sem som" no replay (38 pegadas do app): nas gravações do protótipo (02/11) o relógio do áudio tem desvio de
    ~550 ms em relação ao log do app, e há pegadas registradas duas vezes; na 220143 (gravador novo) são 0. Não é
    falha do ouvido.
  - Janela da atribuição (`attribution.WINDOW_MS`, 150–400 ms antes do som) testada no replay com
    `ABI_REPLAY_WINDOW`: 50–300 ms concorda mais com o app nas gravações do protótipo (191 contra 184), mas piora na
    220143, a única com relógio confiável (35 contra 37, 1 errada). Fica a atual; reavaliar só com gravações novas.
  - Grid: varredura de 30,5 para 21,3 ms por quadro (mesmo resultado).
  - [x] Worker de visão lê só a metade direita da tela: cópia do quadro de 12 para 6,7 ms.
  - [x] Imagem do item só com um candidato; candidatos de raridades diferentes deixam a caixa cortada na diagonal
    (maior raridade em cima à esquerda, menor embaixo à direita).
  - [x] Exemplo em produção: botão "Ver exemplo" e link `?preview` (vendedor da 220143 com pegadas de mentira).
  - Itens raros com o mesmo som, tamanho e categoria de um comum só aparecem como chance pequena. O preço não
    separa esses: Gungnir, Metal Heart, EEG, Phaethon's Clock e Real Matrix estão todos no pool de 70.000 da Mystery
    Cargo.

- Atribuição no pega e devolve rápido: na gravação 185459 ainda saem 6 caixas erradas (critério da v0.1).
- Área vermelha da caixa levantada (quando o jogador pega) como confirmação da atribuição.
- Botão de diagnóstico local.
- `getImageData` de cerca de 4 MB por quadro no worker de visão (a metade direita, desde a v0.2.2).
- v0.3: preço do tooltip e rótulos em português (o autor troca o idioma do jogo para os testes locais).
  - O preço da caixa diz de qual pool ela saiu: em 50 das 110 combinações de perfil e categoria há mais de um preço,
    com raridades bem diferentes (Mystery Cargo: 0% de vermelho a 40.000, 0,1% a 70.000, 4% a 250.000). Hoje a página
    mistura os pools pelo peso. O motor já filtra por preço (`rank(..., price, ...)`, e ignora um preço sem pool); falta
    ler os dígitos no tooltip que `findOverlays` já acha.
  - Gravações para isso: mouse parado sobre cada caixa antes de pegar, caixas da mesma categoria com preços
    diferentes.

## 6. Como trabalhar

- Delegar a outros agentes (Codex, Antigravity) só funciona numa sessão aberta pelo Houston: confira
  `echo $HOUSTON_SESSION`. A sessão de 02–03/11 rodava como job em segundo plano do Claude Code, sem isso.
- Cada merge na `master` publica o site. Publicar cedo e calibrar em versões seguintes, com os riscos no README.
- Referências locais: gravações em `C:\Users\<usuário>\abi-ear-spike\2026-11-02-1433\`; o log do app desktop das
  gravações até 03/11 fica em `C:\Users\<usuário>\AppData\Roaming\abi-ear\abi-ear.log`. Os fixtures de teste
  (`tests/fixtures/`) foram exportados uma vez de `abi-ear/tools/export_golden.py` e não mudam mais.
