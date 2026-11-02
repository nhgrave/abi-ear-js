# Protótipo de risco (fase 1): resultado

Plano: `docs/superpowers/plans/2026-11-02-risk-prototype.md` (Task 5). Spec: seções 8.3, 10 e 12.

**Resumo:**
- **Áudio: passou com folga.** A nota mediana dos sons capturados pelo Chrome é igual à do app (0,90 x 0,90).
- **Imagem: não passou.** A atribuição pela caixa que some concorda com o cursor em 4% a 8% das pegadas, contra os 95% exigidos.
- **Alternativa testada depois, com a mesma gravação: passou.** Achar a seta do mouse, que o Chrome desenha no
  vídeo, deu a caixa certa em 50 de 50 pegadas, sem nenhuma errada, na cadência gravada (um quadro a cada 200 ms).
  Os parâmetros foram ajustados nesta mesma gravação, então falta validar numa segunda. Veja a seção
  "Teste da alternativa 1".

Pela seção 10 da spec, a decisão volta ao autor antes da fase 2. As alternativas estão no fim deste documento.

## Sessão

- 02/11/2026, 14:57:12 a 14:59:00. Chrome 156 no Windows, tela inteira em 1920x1080, áudio do sistema
  (`deviceId: loopback`) com o processamento do navegador desligado.
- Gravação: `C:\Users\<usuário>\abi-ear-spike\2026-11-02-1433\2026-11-02-145712`. Ela fica só no PC e não vai para o
  repositório.
- O app desktop, uma cópia só, rodou na branch `feat/abi-ear-v1` com a linha de gabarito da Task 1. Foram 50 pegadas
  no gabarito durante a gravação, em caixas de 1x1 a 3x2, com rolagem e tooltips abertos.
- Cada caixa foi pega duas vezes, com cerca de 1 s entre as duas. Pegar é levantar a caixa para ouvir o som e
  devolvê-la ao lugar, como no uso real.

Comando:

```
.venv/bin/python -m tools.spike_eval /mnt/c/Users/<usuário>/abi-ear-spike/2026-11-02-1433/2026-11-02-145712 \
  <(iconv -f latin1 -t utf-8 /mnt/c/Users/<usuário>/AppData/Roaming/abi-ear/abi-ear.log) --hint 1255,190,64,9,10
```

Sem o `--hint`, o scan da tela inteira lê o grid do inventário, em x≈193, e não o do vendedor, em x=1255:
0% das pegadas é atribuído. Os números abaixo são com o `--hint`.

## Números

| fps | concorda | errada | nenhuma | som ouvido | nota app x Chrome | relógio | quadros sem grid |
|-----|----------|--------|---------|------------|-------------------|---------|------------------|
| 10  | 2 (4%)   | 0      | 48      | 50 (100%)  | 0,90 x 0,90       | +85 ms  | 122 de 537 (23%) |
| 8   | 2 (4%)   | 0      | 48      | 50 (100%)  | 0,90 x 0,90       | +85 ms  | 121 de 536 (23%) |
| 5   | 2 (4%)   | 0      | 48      | 50 (100%)  | 0,90 x 0,90       | +85 ms  | 106 de 447 (24%) |
| 3   | 4 (8%)   | 0      | 46      | 50 (100%)  | 0,90 x 0,90       | +85 ms  | 77 de 324 (24%)  |

- **Nenhuma taxa passa** no critério da imagem. A menor taxa que passa não existe.
- **Áudio:** o gatilho disparou nas 50 pegadas. A melhor nota a até ±500 ms ficou entre 0,85 e 0,96. A diferença
  de relógio de +85 ms está abaixo do limite de 200 ms.
- **Quadros sem grid** (cerca de 23%): a 5 fps, 105 dos 106 estão nos primeiros 34 s da gravação, antes da primeira
  pegada (aos 41 s). Durante as pegadas, o grid do vendedor foi lido em todos os quadros, menos um.

### O gravador fez 5 quadros por segundo, não 10

Quase todos os intervalos entre quadros são de 200 ms (424 de 536). Gerar um JPEG de 1080p com qualidade 0,95 e
gravá-lo leva mais de 100 ms, e o gravador pula o quadro seguinte enquanto a escrita anterior não termina, como o
plano manda. Por isso, as linhas de 10 e 8 fps medem, na prática, cerca de 5 fps. Isso não muda a conclusão: nenhuma
taxa chega perto de 95%.

## Por que a imagem falhou

O diagnóstico usou a recomposição do resultado do `scan` sobre os quadros, a 5 fps, a taxa real da gravação.

| motivo                                         | pegadas |
|------------------------------------------------|---------|
| cursor sobre célula incerta no quadro de antes | 18      |
| sem caixa sob o cursor no quadro de antes      | 16      |
| mais de uma caixa "sumiu" (2 a 5)              | 7       |
| sem quadro com grid antes                      | 4       |
| nada sumiu                                     | 3       |
| concorda                                       | 2       |

Três causas explicam quase tudo:

1. **O vídeo mostra a caixa levantada antes do som gravado.** Na pegada das 14:58:05.680, a caixa já está fora do
   lugar, com o realce vermelho de onde soltar, num quadro carimbado 24 ms antes do som. Assim, o quadro "de antes"
   escolhido na janela [t − 300 ms, t] muitas vezes já mostra o lugar vazio: são os 16 casos "sem caixa sob o
   cursor", todos com o quadro de antes a no máximo 130 ms do som. O áudio chega atrasado em relação ao vídeo.
   Hipóteses ainda não medidas: o jogo toca o som depois do clique, ou o carimbo pelo `getOutputTimestamp` aponta
   para a saída e não para a entrada.
2. **As áreas vazias do grid são lidas de forma instável.** Com células vazias perto da caixa sob o cursor, o `scan`
   marca uma região inteira como incerta, inclusive a caixa com o tooltip (exemplo: `1793642276741.jpg`, 27 células
   incertas). Em outros quadros, ele lê a mesma área vazia como caixas grandes, de 2x3 ou 5x3, que depois "somem".
   Isso explica os 18 casos de célula incerta e boa parte dos casos de várias caixas sumidas.
3. **A caixa some por pouco tempo.** Como ela é devolvida ao lugar, fica fora por cerca de 200 ms a 400 ms nos quadros
   examinados. A 5 fps,
   isso cabe em um ou dois quadros, e um deles costuma ter o tooltip ou o "R Rotate" por cima.

**Experimento (não entrou no avaliador):** compensar o atraso do áudio, movendo a janela para 100 ms, 200 ms e
300 ms antes do som. O melhor caso foi 11 de 50 (22%) a 10 fps, com a janela 300 ms antes. Com 100 ms e 200 ms
apareceu 1 atribuição errada. A compensação ajuda, mas fica longe dos 95% e não elimina os erros.

## Casos, a 5 fps

O quadro é o "de antes", na pasta `frames/` da gravação. As coordenadas do cursor vêm do log do app.

| hora (app)   | caixa (app) | cursor | quadro de antes | motivo |
|--------------|-------------|--------|-----------------|--------|
| 14:57:53.080 | (0, 5) 2x3 | (1351, 611) | 1793642272942.jpg | cursor em célula incerta |
| 14:57:54.411 | (2, 3) 2x3 | (1472, 522) | 1793642274342.jpg | cursor em célula incerta |
| 14:57:56.822 | (4, 3) 2x3 | (1587, 513) | 1793642276741.jpg | cursor em célula incerta |
| 14:57:57.837 | (4, 3) 2x3 | (1588, 488) | 1793642277741.jpg | cursor em célula incerta |
| 14:57:59.171 | (6, 4) 3x2 | (1734, 524) | - | sem quadro antes (com grid) |
| 14:58:00.213 | (6, 4) 3x2 | (1745, 573) | 1793642280141.jpg | nada sumiu |
| 14:58:01.475 | (6, 2) 2x2 | (1713, 419) | 1793642281342.jpg | concorda |
| 14:58:02.449 | (6, 2) 2x2 | (1706, 403) | 1793642282342.jpg | cursor em célula incerta |
| 14:58:03.595 | (4, 1) 2x2 | (1578, 345) | 1793642283542.jpg | 2 caixas sumiram |
| 14:58:05.680 | (2, 1) 2x2 | (1443, 334) | 1793642285741.jpg | cursor sem caixa |
| 14:58:06.570 | (2, 1) 2x2 | (1451, 330) | - | sem quadro antes (com grid) |
| 14:58:07.744 | (0, 1) 2x2 | (1314, 334) | 1793642287542.jpg | cursor em célula incerta |
| 14:58:08.782 | (0, 1) 2x2 | (1321, 321) | 1793642288742.jpg | cursor sem caixa |
| 14:58:10.074 | (0, 3) 2x2 | (1333, 456) | 1793642289942.jpg | cursor em célula incerta |
| 14:58:10.985 | (0, 3) 2x2 | (1316, 459) | 1793642290941.jpg | cursor sem caixa |
| 14:58:12.649 | (7, 0) 2x2 | (1764, 395) | 1793642292541.jpg | 2 caixas sumiram |
| 14:58:14.123 | (7, 0) 2x2 | (1766, 385) | 1793642294141.jpg | cursor sem caixa |
| 14:58:15.482 | (7, 0) 2x2 | (1766, 371) | 1793642295541.jpg | cursor sem caixa |
| 14:58:17.030 | (6, -1) 1x2 | (1667, 319) | 1793642296942.jpg | cursor em célula incerta |
| 14:58:18.217 | (6, -1) 1x2 | (1670, 312) | 1793642298141.jpg | cursor em célula incerta |
| 14:58:19.810 | (5, -1) 1x1 | (1601, 314) | 1793642299741.jpg | cursor em célula incerta |
| 14:58:21.156 | (5, -1) 1x1 | (1611, 314) | 1793642300942.jpg | 4 caixas sumiram |
| 14:58:22.564 | (4, -1) 1x2 | (1538, 298) | 1793642302541.jpg | cursor sem caixa |
| 14:58:23.730 | (4, -1) 1x2 | (1546, 302) | 1793642303741.jpg | cursor sem caixa |
| 14:58:25.062 | (3, -1) 1x2 | (1469, 303) | 1793642305141.jpg | cursor sem caixa |
| 14:58:26.163 | (3, -1) 1x2 | (1475, 302) | 1793642306141.jpg | cursor sem caixa |
| 14:58:27.491 | (2, -1) 1x2 | (1418, 301) | 1793642307541.jpg | cursor sem caixa |
| 14:58:28.614 | (2, -1) 1x2 | (1418, 301) | 1793642308541.jpg | 3 caixas sumiram |
| 14:58:29.731 | (0, -1) 2x1 | (1324, 284) | 1793642309742.jpg | 3 caixas sumiram |
| 14:58:30.924 | (0, -1) 2x1 | (1328, 290) | 1793642310742.jpg | nada sumiu |
| 14:58:32.224 | (0, 0) 2x3 | (1315, 346) | 1793642312141.jpg | cursor em célula incerta |
| 14:58:33.435 | (0, 0) 2x3 | (1328, 344) | 1793642313341.jpg | cursor em célula incerta |
| 14:58:35.853 | (0, -2) 1x1 | (1297, 222) | - | sem quadro antes (com grid) |
| 14:58:37.102 | (1, -2) 1x1 | (1346, 222) | 1793642316942.jpg | cursor em célula incerta |
| 14:58:38.277 | (1, -2) 1x1 | (1354, 218) | 1793642318342.jpg | cursor sem caixa |
| 14:58:39.489 | (2, -2) 1x1 | (1416, 218) | 1793642319541.jpg | concorda |
| 14:58:40.689 | (2, -2) 1x1 | (1424, 225) | 1793642320741.jpg | cursor sem caixa |
| 14:58:41.931 | (3, -2) 1x1 | (1482, 220) | 1793642321942.jpg | nada sumiu |
| 14:58:43.084 | (3, -2) 1x1 | (1481, 218) | 1793642323142.jpg | 5 caixas sumiram |
| 14:58:44.333 | (4, -2) 1x1 | (1544, 220) | 1793642324342.jpg | cursor sem caixa |
| 14:58:45.503 | (4, -2) 1x1 | (1540, 215) | 1793642325542.jpg | cursor sem caixa |
| 14:58:46.858 | (5, -2) 1x1 | (1602, 221) | 1793642326942.jpg | cursor sem caixa |
| 14:58:48.087 | (5, -2) 1x1 | (1604, 219) | 1793642327942.jpg | cursor em célula incerta |
| 14:58:49.237 | (6, -2) 2x1 | (1690, 226) | 1793642329142.jpg | cursor em célula incerta |
| 14:58:50.333 | (6, -2) 2x1 | (1708, 219) | 1793642330142.jpg | 5 caixas sumiram |
| 14:58:51.495 | (7, -1) 2x1 | (1813, 261) | 1793642331542.jpg | cursor em célula incerta |
| 14:58:52.534 | (8, -2) 1x1 | (1809, 248) | 1793642332542.jpg | cursor sem caixa |
| 14:58:53.690 | (7, 0) 2x2 | (1785, 366) | 1793642333542.jpg | cursor em célula incerta |
| 14:58:54.817 | (7, 0) 2x2 | (1778, 371) | - | sem quadro antes (com grid) |
| 14:58:57.170 | (6, 4) 3x2 | (1723, 608) | 1793642337142.jpg | cursor em célula incerta |

## Alternativas (decisão do autor)

1. **Cursor desenhado no vídeo.** O `session.json` mostra `cursor: "always"`: o Chrome já desenha o ponteiro em
   todos os quadros, e ele aparece nas capturas desta sessão. Achar a seta, que é branca e tem forma fixa, por
   correlação com um modelo dá a posição do cursor no quadro anterior ao som. A atribuição volta a ser "caixa sob o
   cursor", como no app desktop. Não depende de a caixa sumir nem das áreas vazias. É a opção mais direta.
   - Riscos: um jogo com cursor próprio, desenhado pelo jogo e não pelo Windows, pode não aparecer; a seta pode ficar
     sobre um tooltip claro.
   - Próximo passo: um avaliador da posição da seta contra o gabarito desta mesma gravação, sem gravar de novo.
2. **Âncora do tooltip** (spec 8.4). O tooltip abre a cerca de 6 px e 8 px do ponto do cursor. Quando há tooltip no
   quadro anterior ao som, ele dá o ponto sem procurar a seta. Nos quadros examinados desta gravação, porém, o `scan` não
   devolveu `overlays` com o tooltip visível. Isso precisa ser investigado antes, e o tooltip nem sempre está
   aberto no instante do clique.
3. **Destaque de hover** (spec 8.3, item 2). A caixa sob o cursor fica mais clara. É um sinal fraco nas capturas em
   JPEG e sofre do mesmo problema das áreas vazias.
4. **Insistir na caixa sumida.** Compensar o atraso de áudio e vídeo e estabilizar a leitura das áreas vazias no
   `scan`. Isso é trabalho no motor de visão, sem garantia de passar de 22% para 95% com zero erros.

**Recomendação:** testar a alternativa 1 com esta gravação antes de qualquer outra fase. Se a seta for achada em
pelo menos 95% das pegadas e a caixa sob ela concordar com o gabarito sem erros, a fase 2 segue com o cursor do
vídeo no lugar da caixa sumida, a 3 ou 5 fps. Também vale reduzir a qualidade do JPEG ou gravar só a região do
vendedor, se 10 fps vier a ser necessário.

## Teste da alternativa 1: cursor desenhado no vídeo

O autor aprovou o teste em 02/11. Ele usou a mesma gravação, sem gravar de novo.

**Método:**
- **Modelo da seta:** recorte de 14x17 px da seta branca com borda escura, tirado de um quadro desta gravação.
- **Busca:** correlação normalizada (`cv2.matchTemplate`, `TM_CCOEFF_NORMED`) no quadro inteiro em tons de cinza. O
  ponto do cursor é a ponta da seta.
- **Quadro usado:** o mais recente na janela de 200 ms a 400 ms antes do som ouvido pelo Chrome.
- **Atribuição:** a caixa que contém a célula da seta, no grid do vendedor lido pelo `scan` naquele quadro.
- **Comparação com o gabarito:** por caixa, não por célula. Uma célula vizinha dentro da mesma caixa 2x2 é a mesma
  pegada.
  - As linhas do gabarito são linhas de conteúdo do app; na tela, elas ficam deslocadas pela rolagem.
  - Para comparar, deduzi esse deslocamento das próprias pegadas do app: 0 enquanto o grid estava na fase y0=222 e 2
    na fase y0=190. Todas as 50 pegadas são compatíveis com esse valor.
  - Isso só serve para o teste. No produto, quem acompanha a rolagem é o modelo de sessão, como já faz o app.
- **Scripts:** exploratórios, fora do repositório. Viram ferramenta com testes se a fase 2 seguir por este caminho.

**Detecção e precisão:**
- A seta foi achada em todos os quadros de 700 ms antes até 500 ms depois de cada som (cerca de 300 quadros), com
  correlação de pelo menos 0,84 e mediana de 0,94 a 1,00.
- Entre 200 ms e 400 ms antes do som, a ponta fica a no máximo 16 px do ponto do app em 96% a 100% das pegadas,
  com mediana de 5,1 px. É um deslocamento constante de (+1, −5) px entre a ponta desenhada e o ponto do app.
- A partir de 100 ms antes do som, a seta já se afastou (mediana de 34 a 68 px), porque o jogador está arrastando a
  caixa. Isso confirma o que a caixa sumida já mostrava: o som chega uns 250 ms depois do clique, na escala de tempo
  da gravação.

**Atribuição por caixa:**

| quadros usados                            | janela antes do som | concorda | errada | nenhuma        |
|-------------------------------------------|---------------------|----------|--------|----------------|
| todos (um a cada 200 ms)                  | 200 a 400 ms        | 50       | 0      | 0              |
| todos                                     | 250 a 450 ms        | 50       | 0      | 0              |
| todos                                     | 150 a 350 ms        | 49       | 1      | 0              |
| reamostrados a 5 fps                      | 200 a 400 ms        | 37       | 0      | 13 (sem quadro)|
| reamostrados a 3 fps                      | 200 a 533 ms        | 40       | 1      | 9 (sem quadro) |

- Sem a correção de (+1, −5) px, o resultado é o mesmo: 50 de 50 com todos os quadros.
- **Reamostrado a 5 fps:** a gravação já está em cerca de 5 fps, e reamostrá-la a 5 fps perde 1 quadro em 6 por
  causa da variação nos intervalos. Por isso, 13 pegadas ficam sem quadro na janela. É um efeito da reamostragem.
  Um gravador que entregue um quadro a cada 200 ms sempre tem um quadro na janela.
- **A errada a 3 fps:** o quadro mais próximo estava 516 ms antes do som, com o cursor ainda chegando à caixa: 35 px
  de distância, já na caixa de baixo.
- **A errada com a janela de 150 ms:** o cursor já tinha começado a arrastar.
- **Conclusão:** a janela de 200 ms a 400 ms, com folga dos dois lados, passa no critério com um quadro a cada
  200 ms. A 3 fps não passa.

**Ressalvas:**
1. O modelo da seta, a janela e a correção foram escolhidos nesta mesma gravação. É preciso validar numa segunda
   gravação, sem mudar nada, antes de dar o resultado como certo.
2. O modelo vale para a seta padrão do Windows em escala de 100%. Outra escala, outro tamanho de cursor ou um cursor
   desenhado pelo próprio jogo exigem modelo próprio ou outra técnica. Nesta sessão, o jogo usa o cursor do Windows.
3. O atraso de uns 250 ms entre o clique e o som pode variar com o PC e a saída de áudio. Vale medi-lo em outra
   máquina, ou calibrá-lo na própria página, porque é o mesmo deslocamento constante visto aqui.

**Recomendação atualizada:**
1. Fazer uma segunda gravação de validação, com o mesmo procedimento e pelo menos 40 pegadas, e rodar o mesmo teste
   sem mudar os parâmetros.
2. Se passar de novo, seguir para a fase 2 com o cursor do vídeo no lugar da caixa sumida (8.3):
   - um quadro a cada 200 ms (5 Hz);
   - o quadro mais recente entre 200 ms e 400 ms antes do som;
   - a caixa sob a seta pelo modelo de sessão.

   A seção 8.3 da spec e o plano da fase 2 precisam refletir essa troca.
