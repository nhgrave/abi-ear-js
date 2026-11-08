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
- [x] Gabarito sem o app desktop: `labels-truth.json` na pasta da gravação, com as caixas de alguns quadros
  conferidas a olho (nome da categoria em inglês). O construtor de modelos lê de lá (v0.2.4, gravação 114326).
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
  - [x] Caixa lida maior sob um tooltip que passa por cima de células vazias (gravação 114326: 2x2 na beira direita lida
    como 3x2): numa leitura com células incertas ou tooltip, vira suspeita como a caixa levantada (v0.2.4).
  - [x] Caixas fantasma em células vazias (gravação 160851): o painel do vendedor é transparente e o personagem, por
    trás, deixa textura nas células vazias, lidas como caixas a descobrir. A varredura agora exige rótulo claro no alto
    da caixa (`hasLabelText`); seis quadros de referência do Python tinham caixas assim, todas em áreas vazias (v0.2.4).
  - [x] A caixa crescida sobre células vazias também fica suspeita numa leitura limpa quando há texto claro abaixo do
    rótulo (`lit`: o tooltip não achado por cima). Caixas reveladas também acendem, mas só contam se crescerem (v0.2.4).
  - [x] Caixa que passa da beira da tela some quando a parte visível fica vazia (gravação 192442: depois da compra, o
    vendedor levou a caixa de baixo para o lugar da comprada e a antiga ficava no grid) (v0.2.4).
  - [x] Clique na metade cortada da caixa na beira de baixo (ou de cima) da grade: a linha cortada conta como da caixa
    cortada naquela coluna (gravação 2026-11-07-214528, Arsenal: 6 pegadas seguidas ficavam sem caixa) (v0.2.4).
  - [x] Dica "R Girar" do arrasto: texto claro fora da primeira linha do rótulo deixa as células incertas, em vez de
    virar caixa ou de sumir com as caixas de baixo (v0.2.4).
  - [ ] Caixa fantasma quando o canto do quadro da dica "R Girar" cai no alto de uma célula vermelha do arrasto
    (gravação 192442, 19:26:38: virou uma 1x1 sem categoria que ficou no grid). Estreitar a busca do rótulo para o
    começo da linha resolve, mas derruba caixas de rótulo cortado no topo em dois quadros de referência.
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
  - [x] Rótulos em português (v0.2.4): `public/data/labels/pt.json`, 21 modelos das gravações 2026-11-07-114326 e
    160851 (Vale) e 192442 (Aeroporto), jogo em português: Carga Misteriosa (larguras 1, 2 e 3), Carga Misteriosa
    Incomum (1, 2 e 3), Itens Domésticos, Materiais de Construção, Inflamáveis, Ferramentas, Papel, Itens de Energia (1
    e 3), Colecionáveis (1 e 2), Instrumentos, Suprimentos Médicos, Peças de Computador, Itens Militares (1), Itens
    Militares Incomuns e Colecionáveis Raros (este ainda sem modelo em inglês). A página lê com os dois idiomas juntos;
    a margem de confiança vale contra a melhor das outras categorias.
  - [ ] Português, Fazenda/Vale/Arsenal: falta Rare Mystery Cargo (1, 2 e 3), mais comum no Proibido e na Infecção
    Severa.
  - [ ] Português, Northridge/TV Station/Aeroporto: faltam Electronics, Uncommon Collectibles, Military Items de 2 de
    largura, Rare Mystery Cargo e Rare Medical Supplies (também sem modelo em inglês). Itens Militares de 2 pode ser
    lido como Itens Militares Incomuns enquanto não tiver modelo: conferir na próxima gravação.
  - [ ] Caixas reveladas ("Reveladas para você: 4 cargas misteriosas de qualidade Roxa"): o vendedor mostra a imagem do
    item dentro da caixa. Dá para ler o item direto e usar como gabarito de itens.
  - A gravação 114326 tem tooltips com o preço ("24.000" e o antigo "30.000" riscado): material para a leitura de preço.
  - O preço da caixa diz de qual pool ela saiu: em 50 das 110 combinações de perfil e categoria há mais de um preço,
    com raridades bem diferentes (Mystery Cargo: 0% de vermelho a 40.000, 0,1% a 70.000, 4% a 250.000). Hoje a página
    mistura os pools pelo peso. O motor já filtra por preço (`rank(..., price, ...)`, e ignora um preço sem pool); falta
    ler os dígitos no tooltip que `findOverlays` já acha.
  - Gravações para isso: mouse parado sobre cada caixa antes de pegar, caixas da mesma categoria com preços
    diferentes.

- [x] Base 1.0.0.151.17 (27/10) do abi-tracker, que substitui o abibuilder.com como fonte (`scripts/sync-tracker.mjs`).
  A extração reproduz a base antiga campo a campo; o que mudou é do jogo: pesos dos itens em 42 dos 82 grupos (158
  dos 242 pools), o Double-Neck Lute fora de um pool da Mystery Cargo de 70.000, e os perfis sem mapa 6 e 9 (com 68
  pools) fora da base. Itens, tamanhos, sons, categorias, preços das caixas e imagens não mudaram.

## 6. Como trabalhar

- Delegar a outros agentes (Codex, Antigravity) só funciona numa sessão aberta pelo Houston: confira
  `echo $HOUSTON_SESSION`. A sessão de 02–03/11 rodava como job em segundo plano do Claude Code, sem isso.
- Cada merge na `master` publica o site. Publicar cedo e calibrar em versões seguintes, com os riscos no README.
- Referências locais: gravações em `C:\Users\<usuário>\abi-ear-spike\2026-11-02-1433\`; o log do app desktop das
  gravações até 03/11 fica em `C:\Users\<usuário>\AppData\Roaming\abi-ear\abi-ear.log`. Os fixtures de teste
  (`tests/fixtures/`) foram exportados uma vez de `abi-ear/tools/export_golden.py` e não mudam mais.
