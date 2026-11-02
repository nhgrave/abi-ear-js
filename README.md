# abi-ear

**Site:** https://nhgrave.github.io/abi-ear-js/

Descubra o que há dentro das caixas "Mysterious Supplies" do vendedor do Merchant Raid, em *Arena Breakout:
Infinite*, pelo som de pegar a caixa e pela tela. Você abre o link, compartilha a tela com o áudio do sistema,
escolhe o mapa e o modo e pega as caixas no vendedor. A página mostra, num grid espelhado, os itens prováveis de
cada caixa, com a porcentagem de cada um.

*English:* find out what's inside the Merchant Raid vendor boxes from the pickup sound and the screen. Open the
link, share your entire screen with system audio, pick the map and mode, and drag the boxes at the vendor.

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
- **Itens:** o tamanho da caixa e o som filtram a base do Merchant, ponderada pelos pools do mapa e do modo escolhidos.

## Requisitos

- Chrome ou Edge no Windows. Só eles capturam o áudio do sistema.
- Compartilhar a **tela inteira**, com "Compartilhar áudio do sistema" marcado.
- Jogo em janela ou em tela cheia sem borda. Tela cheia exclusiva chega preta.
- Cursor padrão do Windows, com escala de 100%.
- Só 1920×1080 foi testado.

## Limitações da v0.1

- Sem leitura de texto (OCR): o mapa e o modo são escolhidos à mão, e o rótulo e o preço da caixa não entram na conta.
- Pegar e devolver caixas muito rápido ainda pode atribuir a pegada à caixa vizinha. Em visitas normais, 96% das
  pegadas com som saíram certas na gravação de teste.
- O vendedor é procurado na metade direita da tela.

## Desenvolvimento

```bash
npm ci
npm run dev                    # http://127.0.0.1:5173/ (o gravador do protótipo fica em /spike/recorder/)
npm test && npm run typecheck && npm run build
node scripts/sync-assets.mjs   # atualiza public/data/ (base, sons e ícones) quando o jogo muda
```

Os testes de paridade usam o gabarito exportado do app desktop (`abi-ear/tools/export_golden.py`) para
`tests/fixtures/`, que fica fora do git. Sem ele, esses testes são pulados. O replay de uma gravação real do
protótipo é o teste de aceitação do motor:

```bash
ABI_REPLAY=<pasta da gravação> ABI_APP_LOG=<abi-ear.log> ABI_REPLAY_OUT=replay.txt npx vitest run src/engine/replay.test.ts
```

Cada push na `master` publica o site no GitHub Pages (`.github/workflows/pages.yml`).

## Créditos

Dados, sons e imagens: [abibuilder.com](https://abibuilder.com/merchant), que credita o
[abi-tracker](https://abi-tracker.azurewebsites.net), e [hexaov91/abi-assets](https://github.com/hexaov91/abi-assets).
Os sons e as imagens são do jogo.
