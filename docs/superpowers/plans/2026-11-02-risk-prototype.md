# Protótipo de risco (fase 1): plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Responder com dados reais às duas premissas de risco do design antes de portar qualquer coisa:
(a) o som de pegar chega pelo compartilhamento de tela do Chrome com qualidade parecida com a do
loopback WASAPI; (b) a caixa pega pode ser deduzida pela imagem (a caixa que some), sem cursor.

**Architecture:** Uma página descartável no abi-ear-js grava, só no PC do jogador, uma visita ao
vendedor: quadros JPEG a 10 Hz e o áudio do sistema, ambos vindos do `getDisplayMedia`, com carimbo de
hora. Ao mesmo tempo, o app desktop roda com uma linha nova de log que é o gabarito: instante da pegada,
posição do cursor e caixa. Um avaliador em Python, no repositório abi-ear, reaproveita o motor que já
existe (`scan`, `SoundMatcher`, `SoundTrigger`). Ele mede as notas dos sons e testa a atribuição por
"caixa sumida" contra o gabarito, em várias taxas de quadros. Nada é portado para TypeScript nesta fase.

**Tech Stack:**
- abi-ear-js: Vite, TypeScript, Vitest. O Vue entra na fase 3.
- abi-ear: Python 3.11, numpy, opencv e pytest, que já são usados no projeto.

**Spec:** `~/Projects/my-apps/abi-ear-js/docs/superpowers/specs/2026-11-02-abi-ear-js-design.md`
(seções 8.3, 10 e 12). Esta é a fase 1 da seção 10. As fases 2 a 5 ganham plano próprio depois
do resultado deste.

## Global Constraints

- Estritamente passivo: "sem injeção de memória, apenas monitoramento externo seguro". A entrada é só o `getDisplayMedia`.
- Nada sai do PC: o gravador só escreve na pasta local escolhida pelo usuário, sem rede.
- Chrome ou Edge no Windows, compartilhando a tela inteira com "compartilhar áudio do sistema" marcado.
- Processamento de áudio do navegador desligado: `echoCancellation: false`, `noiseSuppression: false`, `autoGainControl: false`, `suppressLocalAudioPlayback: false`.
- Áudio gravado em mono a 48000 Hz. Quadros JPEG com qualidade 0.95, a cada 100 ms.
- Testado só em 1080p. Nenhum valor em pixels fixos no avaliador: tudo em células do grid detectado.
- Critério de aprovação (spec 8.3 e 10):
  - a atribuição pela imagem concorda com a do cursor em pelo menos 95% das pegadas, com zero atribuições erradas;
  - a nota mediana dos sons capturados pelo Chrome fica no máximo 0,05 abaixo da do app.
- Commits terminam com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- abi-ear: trabalhar na branch `feat/abi-ear-v1`.
- abi-ear-js: criar a branch `spike/risk-prototype` antes do primeiro commit de código.

## Review Focus

1. **Compartilhamento de janela ou aba em vez da tela inteira:** vem sem faixa de áudio. O gravador precisa recusar a gravação com uma mensagem clara (testado na Task 2).
2. **Quadros pretos** (tela cheia exclusiva) ou tela errada compartilhada: o avaliador conta e mostra os quadros sem grid, em vez de dar 0% sem explicação (Task 4).
3. **Relógios desalinhados:** o log do app usa hora local e o navegador, epoch UTC. O avaliador mede o deslocamento mediano entre as pegadas do gabarito e os sons ouvidos na gravação, e avisa se passar de 200 ms (Task 4).
4. **Rolagem entre o quadro de antes e o de depois:** caixas que só mudaram de linha não podem contar como sumidas (Task 4).
5. **Tooltip cobrindo caixas no instante do clique:** caixa escondida pelo tooltip não pode contar como sumida (Task 4).

---

### Task 1: Linha de gabarito no log do app desktop (abi-ear)

**Files:**
- Modify: `abi_ear/controller.py` (`Controller.on_click`, depois de achar `box`)
- Test: `tests/test_controller.py`

**Interfaces:**
- Produces: a linha de log INFO, no logger `abi_ear.controller`, com o formato exato
  `pegada às HH:MM:SS.mmm em (X, Y): caixa (C, R) WxH`. A hora é o instante do som (`t`) convertido
  para relógio de parede: `time.time() - (self._clock() - t)`, em hora local. A Task 4 faz o parse
  dela.

- [ ] **Step 1: Write the failing test**

```python
def test_pickup_logs_wall_clock_time_and_cursor(qapp, tmp_path, caplog):
    caplog.set_level("INFO", logger="abi_ear.controller")
    c, _ = make([SoundHit(31, 0.95)], tmp_path)
    c.on_scan(scan_result(t=99.5))
    c.on_click(99.8, 7 * 64 + 10, 64 + 10)
    m = re.search(r"pegada às (\d\d:\d\d:\d\d\.\d{3}) em \((\d+), (\d+)\): caixa \(7, 1\) 1x2", caplog.text)
    assert m and (int(m[2]), int(m[3])) == (7 * 64 + 10, 64 + 10)
    wall = datetime.strptime(m[1], "%H:%M:%S.%f").time()
    expected = (datetime.now() - timedelta(seconds=0.2)).time()  # clock fixo em 100.0: o som foi 0,2 s atrás
    assert abs(datetime.combine(date.today(), wall) - datetime.combine(date.today(), expected)) < timedelta(seconds=1)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/bin/python -m pytest tests/test_controller.py::test_pickup_logs_wall_clock_time_and_cursor -q`
Expected: FAIL (`m` é None)

- [ ] **Step 3: Implement**: em `on_click`, depois que `box` não é None e antes de `box.pending += 1`, registrar a linha da interface. Formatar com `datetime.fromtimestamp(...).strftime("%H:%M:%S.%f")[:-3]`.

- [ ] **Step 4: Run all tests and pyflakes**

Run: `.venv/bin/python -m pytest -q && .venv/bin/python -m pyflakes abi_ear tests`
Expected: todos passam (204), pyflakes sem saída

- [ ] **Step 5: Commit**

```bash
git add abi_ear/controller.py tests/test_controller.py
git commit -m "feat(controller): log the pickup wall-clock time and cursor for the web prototype"
```

---

### Task 2: Projeto abi-ear-js e formato da gravação

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `.gitignore` (`node_modules`, `dist*`), `spike/recorder/format.ts`
- Test: `spike/recorder/format.test.ts`

**Interfaces:**
- Produces (em `spike/recorder/format.ts`):
  - `encodeWav(samples: Float32Array, sampleRate: number): ArrayBuffer`: WAV IEEE float de 32 bits (formato 3), mono.
  - `frameName(epochMs: number): string`: devolve `frames/<epochMs inteiro>.jpg`.
  - `epochOfFrame(frame: number, sampleRate: number, ts: { contextTime: number; performanceTime: number }, timeOrigin: number): number`: epoch em ms da amostra `frame` do `AudioContext`, pelo par de `getOutputTimestamp()`. Fórmula: `timeOrigin + ts.performanceTime + (frame / sampleRate - ts.contextTime) * 1000`.
  - `streamProblems(s: { audioTracks: number; displaySurface?: string }): string[]`: mensagens em pt-BR. A lista vazia significa que a gravação pode começar.
  - `interface SessionMeta { startedAt: string; userAgent: string; video: MediaTrackSettings; audio: MediaTrackSettings; sampleRate: number; audioStartEpochMs: number; frameIntervalMs: number }`: o conteúdo do `session.json`.

- [ ] **Step 1: Scaffold**:
  - `git checkout -b spike/risk-prototype`;
  - `npm init -y`;
  - `npm i -D vite typescript vitest`;
  - script `"dev": "vite --host 127.0.0.1"`;
  - script `"test": "vitest run"`;
  - `tsconfig` com `strict`, `target ES2022`, `lib` com `DOM`, `DOM.Iterable` e `ES2022`.

- [ ] **Step 2: Write the failing tests**

```ts
test('encodeWav writes a float32 mono header', () => {
  const buf = encodeWav(new Float32Array([0, 0.5, -1]), 48000)
  const v = new DataView(buf)
  expect(String.fromCharCode(...new Uint8Array(buf, 0, 4))).toBe('RIFF')
  expect(v.getUint16(20, true)).toBe(3)        // IEEE float
  expect(v.getUint16(22, true)).toBe(1)        // mono
  expect(v.getUint32(24, true)).toBe(48000)
  expect(v.getUint16(34, true)).toBe(32)
  expect(v.getUint32(40, true)).toBe(12)       // 3 amostras * 4 bytes
  expect(v.getFloat32(48, true)).toBe(0.5)
  expect(buf.byteLength).toBe(44 + 12)
})
test('frameName uses the integer epoch', () => expect(frameName(1793600000123.7)).toBe('frames/1793600000123.jpg'))
test('epochOfFrame maps context time to epoch', () =>
  expect(epochOfFrame(96000, 48000, { contextTime: 1.5, performanceTime: 2000 }, 1_000_000)).toBe(1_002_500))
test('a stream without audio cannot be recorded', () => {
  expect(streamProblems({ audioTracks: 0, displaySurface: 'window' }).length).toBeGreaterThan(0)
  expect(streamProblems({ audioTracks: 1, displaySurface: 'browser' }).length).toBeGreaterThan(0)
  expect(streamProblems({ audioTracks: 1, displaySurface: 'monitor' })).toEqual([])
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL (módulo `./format` não existe)

- [ ] **Step 4: Implement `spike/recorder/format.ts`** com as assinaturas da interface. As mensagens de `streamProblems` explicam o que fazer: "Compartilhe a TELA INTEIRA, não uma janela ou aba" e "Marque 'Compartilhar áudio do sistema' na janela do Chrome".

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test`
Expected: 4 passed

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "spike: recording format helpers for the risk prototype"
```

---

### Task 3: Página do gravador (descartável)

**Files:**
- Create: `spike/recorder/index.html`, `spike/recorder/main.ts`, `spike/recorder/capture-worklet.ts`

**Interfaces:**
- Consumes: tudo de `format.ts` (Task 2).
- Produces: uma pasta de gravação, lida pela Task 4:
  ```
  <pasta>/session.json      SessionMeta
  <pasta>/audio.wav         mono, float32, 48000 Hz; a amostra 0 está em session.audioStartEpochMs
  <pasta>/frames/<epochMs>.jpg
  ```

- [ ] **Step 1: Implement the page**:
  - **Botões, em ordem:**
    1. "Escolher pasta": `showDirectoryPicker({ mode: 'readwrite' })`.
    2. "Compartilhar tela": `getDisplayMedia` com `video: { frameRate: 30 }`, o `audio` das Global Constraints, `systemAudio: 'include'` e `monitorTypeSurfaces: 'include'`.
    3. "Gravar" / "Parar".
  - **"Gravar" fica desabilitado** enquanto `streamProblems(...)` não estiver vazio. As mensagens aparecem na página.
  - **Status ao vivo:** quantidade de quadros gravados, segundos de áudio, RMS e pico do áudio do último segundo, e a resolução do vídeo.
  - **Quadros:**
    - a cada 100 ms, desenhar o `<video>` num `OffscreenCanvas` do tamanho do vídeo;
    - carimbar com `performance.timeOrigin + performance.now()` antes de desenhar;
    - gerar `convertToBlob({ type: 'image/jpeg', quality: 0.95 })` e gravar em `frames/` pelo handle da pasta;
    - se a escrita anterior ainda não terminou, pular o quadro, sem fila.
  - **Áudio:**
    - montar `AudioContext({ sampleRate: 48000 })` → `MediaStreamAudioSourceNode` → `AudioWorkletNode('capture')` → `GainNode` com ganho 0 → `destination`;
    - o worklet tira a média dos canais e envia `{ frame: currentFrame, samples: Float32Array }` a cada 4096 amostras;
    - na primeira mensagem, fixar `audioStartEpochMs = epochOfFrame(msg.frame, 48000, ctx.getOutputTimestamp(), performance.timeOrigin)`;
    - os pedaços se acumulam em memória.
  - **Carregar o worklet** com `import workletUrl from './capture-worklet.ts?worker&url'` e `ctx.audioWorklet.addModule(workletUrl)`.
  - **Em "Parar":** gravar `audio.wav` com `encodeWav` e `session.json`, e mostrar "Gravação salva".

- [ ] **Step 2: Verify typecheck and build**

Run: `npx tsc --noEmit && npx vite build --outDir dist-spike`
Expected: sem erros; `dist-spike/spike/recorder/index.html` existe

- [ ] **Step 3: Verify in Chrome on Windows (manual)**:
  1. Rodar `npm run dev` e abrir `http://localhost:5173/spike/recorder/` no Chrome do Windows.
  2. Se o Windows não alcançar o servidor do WSL, servir o `dist-spike` pelo Python portátil:
     ```
     C:\Users\<usuário>\abi-ear-runtime\python\python.exe -m http.server 8765 --bind 127.0.0.1 -d <cópia do dist-spike em C:\>
     ```
     e abrir `http://127.0.0.1:8765/spike/recorder/`.
  3. Gravar 10 s de um vídeo qualquer com som.

  Expected:
  - a pasta tem cerca de 100 quadros, `audio.wav` com cerca de 10 s e `session.json` com o `sampleRate` 48000;
  - compartilhar só uma janela deixa "Gravar" desabilitado, com a mensagem.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "spike: local screen and system-audio recorder for the risk prototype"
```

---

### Task 4: Avaliador (abi-ear)

**Files:**
- Create: `tools/__init__.py` (vazio), `tools/spike_eval.py`
- Create fixtures:
  - `tests/fixtures/vanish_before.png`: cópia de `C:\Users\<usuário>\abi-ear-runtime\diag\04_145608177\145607417.png`;
  - `tests/fixtures/vanish_after.png`: cópia de `...\145607666.png`.

  Ambos foram capturados ao vivo em 24/10: a caixa 2x3 da coluna 7, linha 4, é pega entre os dois quadros, e o cursor estava em (1767, 630).
- Test: `tests/test_spike_eval.py`

**Interfaces:**
- Consumes:
  - `abi_ear.vision.grid.scan(frame, region=None, hint=None) -> Optional[GridScan]`;
  - `GridScan(geometry, boxes, uncertain, overlays)`, `BoxRect(col, row, w, h, clipped)`, `GridGeometry(x0, y0, pitch, cols, rows).cell_at(x, y)`;
  - `abi_ear.audio.matcher.load_matcher`, `SoundMatcher.peaks(clip) -> {sound_id: (score, index)}`, `SAMPLE_RATE`;
  - `abi_ear.audio.trigger.SoundTrigger(matcher_fn).feed(clip, t_start) -> Optional[Heard(t, sound_id, score)]`;
  - a linha de log da Task 1 e a pasta de gravação da Task 3.
- Produces (em `tools/spike_eval.py`):
  - `@dataclass(frozen=True) AppPick(epoch_ms: float, x: int, y: int, key: tuple[int, int], size: str)`
  - `parse_app_picks(log_text: str) -> list[AppPick]`: lê as linhas `AAAA-MM-DD HH:MM:SS,mmm INFO abi_ear.controller: pegada às HH:MM:SS.mmm em (X, Y): caixa (C, R) WxH`. A data vem do prefixo e a hora, do "às". A hora é local, convertida com `datetime.timestamp()`. Linhas repetidas (mesma hora, mesma posição, por duas cópias do app abertas) contam uma vez.
  - `app_scores(log_text: str, start_ms: float, end_ms: float) -> list[float]`: as notas do primeiro som das linhas `... caixa (C, R) ... pega: sons=[('Nome', 0.84), ...]` cujo prefixo de data e hora cai em [`start_ms`, `end_ms`]. Linhas duplicadas por duas cópias do app contam uma vez. É a base de `app_median_score`.
  - `@dataclass Recording(frames: list[tuple[float, Path]], audio: np.ndarray, audio_epoch_ms: float)`, e `load_recording(path: Path) -> Recording`, com os quadros ordenados por epoch.
  - `hear(rec: Recording, matcher: SoundMatcher) -> list[tuple[float, int, float]]`: (epoch_ms, sound_id, score). Reproduz o `ListenWorker`: janela de 0,5 s andando a cada 0,1 s pelo `SoundTrigger`.
  - `best_near(rec: Recording, matcher: SoundMatcher, epoch_ms: float, radius_ms: float = 500) -> tuple[int, float]`: a melhor nota de qualquer som em ±`radius_ms`, inclusive abaixo do limite. Mede a qualidade do áudio mesmo quando o gatilho não dispara.
  - `cursor_box(scan: GridScan, x: float, y: float) -> Optional[BoxRect]`
  - `attribute_by_vanish(scans: Sequence[tuple[float, GridScan]], t_ms: float, before_ms: float = 300, after_ms: float = 600) -> Optional[BoxRect]`
  - `evaluate(rec: Recording, picks: list[AppPick], matcher: SoundMatcher, fps: float) -> dict`, com as chaves:
    - `picks`, `heard`, `app_median_score`, `chrome_median_score`, `clock_offset_ms`;
    - `agree`, `wrong`, `none`, `frames`, `frames_without_grid`.
  - `main(argv: list[str]) -> int`: argumentos `recording_dir`, `app_log` e `--fps` (padrão `10,8,5,3`). Imprime uma linha por pegada e o resumo por fps.

**Algoritmo de `attribute_by_vanish`** (o que a assinatura não determina):
1. `before`: o último scan com `t_ms - before_ms <= t <= t_ms`. Sem ele, devolve None.
2. Candidatas: as caixas de `before` que não são `clipped`.
3. Para cada scan `after` com `t_ms < t <= t_ms + after_ms` e com o mesmo reticulado que `before` (pitch a ±10% e `y0` a ±0,15 da célula, como `PITCH_TOL` e `PHASE_TOL` em `session.py`), uma candidata `b` some quando:
   - nenhuma caixa de `after` é igual a ela (mesmos col, row, w, h);
   - nenhuma caixa de `after` ocupa uma célula dela;
   - nenhum retângulo de `after.overlays` cobre alguma célula dela, para que um tooltip não esconda caixas.
4. Juntar as que sumiram em qualquer `after`. Exatamente uma: devolvê-la. Nenhuma ou mais de uma: None.

Antes de passar ao `scan`, os quadros JPEG viram BGR com `cv2.imread`. O `hint` é a geometria do scan
válido anterior, como o app faz.

O `evaluate` amostra os quadros na taxa `fps`: de cada intervalo de `1000/fps` ms, fica o primeiro
quadro. Para cada pegada, o cursor é avaliado no scan `before`:
- `agree`: `attribute_by_vanish` devolve a caixa onde o cursor estava;
- `wrong`: devolve outra caixa;
- `none`: devolve None, ou o cursor não estava sobre caixa nenhuma no `before`.

`clock_offset_ms` é a mediana de (som ouvido mais próximo − `epoch_ms` da pegada), considerando só
pegadas com som a até 500 ms. Se o valor passar de 200 ms, o `main` imprime um aviso.

- [ ] **Step 1: Write the failing tests**

```python
LOG = ("2026-11-03 21:05:39,994 INFO abi_ear.controller: pegada às 21:05:39.612 em (1767, 630): caixa (7, 7) 2x3\n"
       "2026-11-03 21:05:39,995 INFO abi_ear.controller: pegada às 21:05:39.612 em (1767, 630): caixa (7, 7) 2x3\n"
       "2026-11-03 21:05:41,000 INFO abi_ear.controller: caixa (7, 7) Mystery Cargo 2x3 pega: sons=[]\n")
G = GridGeometry(0, 0, 64, 9, 6)

def scan_of(*boxes, uncertain=(), overlays=(), geom=G):
    return GridScan(geom, tuple(boxes), frozenset(uncertain), tuple(overlays))

A, B = BoxRect(0, 0, 2, 2), BoxRect(3, 0, 1, 2)

def test_parse_app_picks_reads_time_cursor_and_dedups():
    (p,) = parse_app_picks(LOG)
    assert (p.x, p.y, p.key, p.size) == (1767, 630, (7, 7), "2x3")
    assert p.epoch_ms == datetime(2026, 11, 3, 21, 5, 39, 612000).timestamp() * 1000

def test_app_scores_reads_the_first_sound_score_in_the_window():
    text = LOG + ("2026-11-03 21:05:42,000 INFO abi_ear.controller: caixa (1, 1) Paper 1x2 pega: "
                  "sons=[('Item_Misc_Small_Paper_Up', 0.77)] candidatos=[]\n")
    start = datetime(2026, 11, 3, 21, 5, 41).timestamp() * 1000
    assert app_scores(text, start, start + 5000) == [0.77]

def test_vanished_box_is_the_pick():
    scans = [(900.0, scan_of(A, B)), (1100.0, scan_of(B))]
    assert attribute_by_vanish(scans, 1000.0) == A

def test_two_vanished_boxes_are_ambiguous():
    assert attribute_by_vanish([(900.0, scan_of(A, B)), (1100.0, scan_of())], 1000.0) is None

def test_box_under_a_tooltip_did_not_vanish():
    after = scan_of(B, overlays=[(10, 10, 200, 100)])
    assert attribute_by_vanish([(900.0, scan_of(A, B)), (1100.0, after)], 1000.0) is None

def test_scrolled_view_is_not_a_vanish():
    moved = GridGeometry(0, 32, 64, 9, 6)
    assert attribute_by_vanish([(900.0, scan_of(A, B)), (1100.0, scan_of(B, geom=moved))], 1000.0) is None

def test_live_frames_attribute_the_dragged_box():
    hint = GridGeometry(1255, 227, 64.0, 9, 9)
    before = scan(cv2.imread(str(fixture("vanish_before.png"))), None, hint)
    after = scan(cv2.imread(str(fixture("vanish_after.png"))), None, before.geometry)
    picked = attribute_by_vanish([(0.0, before), (250.0, after)], 100.0)
    assert picked == cursor_box(before, 1767, 630)
    assert (picked.col, picked.row, picked.w, picked.h) == (7, 4, 2, 3)

def test_frames_without_grid_are_counted(tmp_path):
    # gravação sintética: 2 quadros pretos de 1920x1080, 1 s de silêncio
    ...  # escrever session.json, audio.wav (soundfile) e frames/*.jpg em tmp_path
    report = evaluate(load_recording(tmp_path), [], FakeMatcher(), fps=10)
    assert report["frames"] == 2 and report["frames_without_grid"] == 2
```

`FakeMatcher` devolve `{}` em `peaks`. O último teste monta a pasta com
`cv2.imwrite(np.zeros((1080, 1920, 3), np.uint8))` e `soundfile.write(..., subtype="FLOAT")`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `.venv/bin/python -m pytest tests/test_spike_eval.py -q`
Expected: FAIL (`tools.spike_eval` não existe)

- [ ] **Step 3: Implement `tools/spike_eval.py`** com as interfaces e o algoritmo acima, e `if __name__ == "__main__": raise SystemExit(main(sys.argv[1:]))`.

- [ ] **Step 4: Run all tests and pyflakes**

Run: `.venv/bin/python -m pytest -q && .venv/bin/python -m pyflakes abi_ear tests tools`
Expected: todos passam, pyflakes sem saída

- [ ] **Step 5: Commit**

```bash
git add tools tests/test_spike_eval.py tests/fixtures/vanish_before.png tests/fixtures/vanish_after.png
git commit -m "feat(tools): evaluate the web prototype recordings against the desktop app picks"
```

---

### Task 5: Sessão de campo e decisão (com o usuário)

**Files:**
- Create: `~/Projects/my-apps/abi-ear-js/docs/superpowers/spikes/2026-11-XX-risk-prototype.md` (data do dia)

- [ ] **Step 1: Preparar**:
  - abrir o app desktop com a Task 1 (uma cópia só) e o gravador no Chrome;
  - pasta de gravação: `C:\Users\<usuário>\abi-ear-spike\<AAAA-MM-DD-HHMM>`;
  - compartilhar a tela inteira do monitor do jogo, com o áudio do sistema marcado.
- [ ] **Step 2: Gravar uma visita ao vendedor** com pelo menos 40 pegadas: caixas de vários tamanhos, com rolagem, e algumas com o tooltip aberto antes do clique.
- [ ] **Step 3: Avaliar**

Run:
```
.venv/bin/python -m tools.spike_eval /mnt/c/Users/<usuário>/abi-ear-spike/<pasta> \
  <(iconv -f latin1 -t utf-8 /mnt/c/Users/<usuário>/AppData/Roaming/abi-ear/abi-ear.log)
```
Expected: o resumo por fps. Sem aviso de relógio e com `frames_without_grid` baixo enquanto o vendedor estava aberto.

- [ ] **Step 4: Escrever o resultado**: os números de cada fps, a menor taxa que passa no critério das Global Constraints e os casos `wrong` e `none`, cada um com o quadro e o motivo.
  - **Passou:** recomendar a fase 2 com essa taxa.
  - **Não passou:** descrever as alternativas (destaque de hover, cursor desenhado no vídeo) e levar a decisão ao usuário antes de qualquer outra fase.
- [ ] **Step 5: Commit** no abi-ear-js: `docs: risk prototype results`.
