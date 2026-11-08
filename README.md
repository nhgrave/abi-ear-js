# abi-ear

**Site:** https://nhgrave.github.io/abi-ear-js/

Descubra o que há dentro das caixas "Mysterious Supplies" do vendedor do Merchant Raid, em *Arena Breakout:
Infinite*, pelo som de pegar a caixa e pela tela. Você abre o link, compartilha a tela com o áudio do sistema,
pega as caixas no vendedor. A página lê a categoria escrita em cada caixa, descobre a família de mapas sozinha e
mostra, num grid espelhado, os itens prováveis de cada caixa, com a porcentagem de cada um.

*English:* find out what's inside the Merchant Raid vendor boxes from the pickup sound and the screen. Open the
link, share your entire screen with system audio, and drag the boxes at the vendor. The page reads each box's
category (game in English or Portuguese) and picks the map family by itself.

Para ver como fica sem abrir o jogo, clique em **Ver exemplo** na página, ou abra
https://nhgrave.github.io/abi-ear-js/?preview. O exemplo é um vendedor de verdade com pegadas de mentira.

## Como funciona

- **Passivo:** a única entrada é o compartilhamento de tela do navegador. Nada lê a memória do jogo, injeta comandos
  ou desenha sobre o jogo. Mesmo assim, ferramentas externas podem contrariar os termos de uso do jogo, e usar é
  decisão sua.
- **Nada sai do navegador:** a análise roda no seu computador, em Web Workers. Nenhum quadro de tela ou trecho de
  áudio é enviado a lugar nenhum. O site só entrega arquivos.
- **Som:** cada caixa toca um som de pegar, e a página o compara com os 38 sons de referência (correlação normalizada
  na faixa de 1,2 a 8 kHz).
- **Qual caixa:** a página acha a seta do cursor do Windows no vídeo, entre 150 e 400 ms antes do som. Se a seta
  não estiver parada sobre uma caixa nesse intervalo, a pegada fica como "caixa não identificada" e a página não
  chuta.
- **Categoria:** a página lê o rótulo escrito no topo de cada caixa ("Energy Items", "Carga Misteriosa"...),
  comparando com modelos de imagem de cada categoria, em inglês e em português (não é preciso escolher o idioma). A categoria só vale depois de duas leituras iguais, e na dúvida a caixa
  fica sem categoria.
- **Mapa:** no "Automático (pelos rótulos)", as categorias vistas no vendedor dizem a família de mapas. O seletor
  continua lá para escolher o mapa e o modo à mão.
- **Itens:** o tamanho da caixa, a categoria e o som filtram a base do Merchant, ponderada pelos pools dos mapas.

## Requisitos

- Chrome ou Edge no Windows. Só eles capturam o áudio do sistema.
- Compartilhar a **tela inteira**, com "Compartilhar áudio do sistema" marcado. Se o Chrome oferecer o áudio da
  janela, dá para compartilhar só a **janela do jogo**: aí o som do Discord e de outros programas fica de fora.
- Jogo em janela ou em tela cheia sem borda. Tela cheia exclusiva chega preta.
- Cursor padrão do Windows, com escala de 100%.
- Só 1920×1080 foi testado.

## Limitações

- Lê o jogo em **inglês** e em **português**. Em português ainda faltam Eletrônicos, Colecionáveis Incomuns, Itens
  Militares de 2 de largura, Carga Misteriosa Rara e Suprimentos Médicos Raros (ficam sem categoria). Em outro idioma, a página funciona sem categoria, e o mapa e o
  modo são escolhidos à mão (ou "Todos os mapas").
- Os modelos de algumas categorias saíram de poucas amostras: Medical Supplies, Military Items e Uncommon Mystery
  Cargo de 1 e de 3 de largura, Uncommon Military Items, Rare Mystery Cargo e Paper. Ainda sem modelo (ficam sem
  categoria): Rare Medical Supplies, Rare Collectibles e as larguras que não apareceram nas gravações.
- O preço do tooltip ainda não entra na conta.
- Pegar e devolver caixas muito rápido ainda pode atribuir a pegada à caixa vizinha. Em visitas normais, 96% das
  pegadas com som saíram certas na gravação de teste.
- O vendedor é procurado na metade direita da tela.

## Desenvolvimento

```bash
npm ci
npm run dev                    # http://127.0.0.1:5173/ (gravação: seção no fim da página, só neste modo)
                               # http://127.0.0.1:5173/?preview abre o exemplo (o mesmo do botão "Ver exemplo")
npm test && npm run typecheck && npm run build
node scripts/sync-tracker.mjs  # atualiza public/data/ (base, sons e ícones) do abi-tracker quando o jogo muda
```

A sincronização abre a página do Merchant do abi-tracker num Chromium sem tela e pede os dados ao carregador da própria
página (o site os entrega codificados). Ela usa o Chromium do Playwright (`npx playwright-core install chromium`) ou
outro em `CHROMIUM_PATH`. No WSL, o Chromium precisa da `libnss3` (`sudo apt install libnss3`).

**Gravar uma sessão** (só com `npm run dev` e só no Google Chrome, porque o Brave vem sem o seletor de pasta; o build publicado não tem gravação, e `npm run build` falha se algo
dela vazar para o `dist/`): na seção "Gravação (modo local)", no fim da página, escolha uma pasta do PC uma vez (ela
fica lembrada), escolha os quadros por segundo (10, 15 ou 30), inicie o compartilhamento e clique em Gravar. Cada
gravação vira uma subpasta `AAAA-MM-DD-HHMMSS` com `session.json`, `audio.wav`, `frames/*.jpg` e `events.jsonl` (o que
a análise ao vivo fez: pegadas, indicadores e avisos, mais os erros do console). O histórico lista as gravações da
pasta, com os quadros salvos por segundo, e copia o nome de cada uma. As gravações ficam só no PC.

O app desktop (abi-ear) não recebe mais manutenção: só esta versão web segue. Os testes de paridade usam o gabarito
exportado dele uma vez (`abi-ear/tools/export_golden.py`) para `tests/fixtures/`, que fica fora do git. Sem ele, esses testes são pulados. O replay de uma gravação real é o teste
de aceitação do motor. Ele compara com o `events.jsonl` da gravação, quando ela tem um, e com o log do app desktop
só se `ABI_APP_LOG` for passado (o critério estrito vale só com o log do app):

```bash
ABI_REPLAY=<pasta da gravação> [ABI_APP_LOG=<abi-ear.log>] ABI_LABEL_MODELS=public/data/labels/en.json,public/data/labels/pt.json \
  ABI_REPLAY_OUT=replay.txt npx vitest run src/engine/replay.test.ts
```

Os modelos de rótulo saem das gravações, um arquivo por idioma do jogo (`public/data/labels/en.json` e `pt.json`),
e a página lê com os dois juntos. A categoria certa de cada amostra vem do `labels-truth.json` da pasta da gravação:
caixas de alguns quadros conferidas a olho, com o nome da categoria em inglês. As gravações até 03/11 usam a categoria
que o log do app desktop registrou em cada pegada (`ABI_APP_LOG`):

```bash
ABI_LABEL_BUILD=<pastas de gravação, separadas por vírgula> [ABI_APP_LOG=<abi-ear.log>] \
  ABI_LABEL_OUT=public/data/labels/pt.json ABI_LABEL_MIN_SCORE=0.5 ABI_LABEL_MARGIN=0.15 \
  npx vitest run src/engine/label-models.build.test.ts
```

Cada push na `master` publica o site no GitHub Pages (`.github/workflows/pages.yml`).

## Créditos

Dados, sons e imagens: [abi-tracker](https://abi-tracker.azurewebsites.net/GameInfo/Merchant) e
[hexaov91/abi-assets](https://github.com/hexaov91/abi-assets), onde o abi-tracker publica as imagens.
Os sons e as imagens são do jogo.
