# Variáveis comuns dos scripts da skill replay-testing (use com `source`).
# REPO: raiz do projeto. REC_ROOT: pasta das gravações (ABI_RECORDINGS ou a primeira que existir no Windows).
# APP_LOG: log do app desktop (só as gravações até 03/11 têm pegadas nele). OUT_BASE: onde ficam os resultados.
REPO=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)
REC_ROOT=${ABI_RECORDINGS:-$(ls -d /mnt/c/Users/*/abi-ear-spike/2026-11-02-1433 2>/dev/null | head -1)}
APP_LOG=${ABI_APP_LOG:-$(ls /mnt/c/Users/*/AppData/Roaming/abi-ear/abi-ear.log 2>/dev/null | head -1)}
OUT_BASE=${ABI_REPLAY_RESULTS:-/tmp/claude-$(id -u)/abi-replay}
MODELS=${ABI_MODELS:-public/data/labels/en.json,public/data/labels/pt.json}
# gravações em inglês com as pegadas no log do app desktop: o gabarito de atribuição e de categoria
EN_WITH_LOG=(2026-11-02-145712 2026-11-02-155614 2026-11-02-160053 2026-11-02-185459 2026-11-03-220143)

[ -d "$REC_ROOT" ] || { echo "pasta das gravações não achada: defina ABI_RECORDINGS" >&2; return 1 2>/dev/null || exit 1; }

# gravações com gabarito de rótulos num idioma (labels-truth.json com "language": "<pt|en>")
recordings_with_truth() {
  local lang=$1 d
  for d in "$REC_ROOT"/*/; do
    [ -f "$d/labels-truth.json" ] && grep -q "\"language\": \"$lang\"" "$d/labels-truth.json" && basename "$d"
  done
}

# nomes de gravação a partir de grupos (en, pt, all) ou nomes soltos; sem repetir
resolve_recordings() {
  local arg out=()
  for arg in "$@"; do
    case $arg in
      en) out+=("${EN_WITH_LOG[@]}") ;;
      pt) mapfile -t -O "${#out[@]}" out < <(recordings_with_truth pt) ;;
      all) out+=("${EN_WITH_LOG[@]}"); mapfile -t -O "${#out[@]}" out < <(recordings_with_truth pt) ;;
      *) [ -d "$REC_ROOT/$arg" ] || { echo "gravação não achada: $arg" >&2; return 1; }; out+=("$arg") ;;
    esac
  done
  printf '%s\n' "${out[@]}" | awk '!seen[$0]++'
}

is_en_with_log() { local r; for r in "${EN_WITH_LOG[@]}"; do [ "$r" = "$1" ] && return 0; done; return 1; }

# replays do vitest ainda rodando (o colchete no padrão evita casar com o próprio comando)
running_replays() { pgrep -f "[v]itest run src/engine/replay.test.ts" | wc -l; }
