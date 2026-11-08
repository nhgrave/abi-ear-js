#!/usr/bin/env bash
# Reconstrói os modelos de rótulo de um idioma a partir das gravações com gabarito (labels-truth.json).
# Uso: bash build-labels.sh pt|en
#   pt: as gravações com labels-truth.json em português; nota mínima 0,9 (os nomes começam iguais:
#       "Colecionáveis" e "Colecionáveis Incomuns")
#   en: as gravações com log do app desktop (categoria pelo log) e as com gabarito em inglês; nota mínima 0,5
# Grava public/data/labels/<idioma>.json e mostra as amostras por categoria. Depois: bash probe.sh <gravação> truth
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
source "$here/env.sh"
lang=${1:?idioma: pt ou en}
case $lang in
  pt) mapfile -t recs < <(recordings_with_truth pt); min=0.9; log_env=() ;;
  en) mapfile -t recs < <({ printf '%s\n' "${EN_WITH_LOG[@]}"; recordings_with_truth en; } | awk '!seen[$0]++'); min=0.5; log_env=(ABI_APP_LOG="$APP_LOG") ;;
  *) echo "idioma desconhecido: $lang" >&2; exit 2 ;;
esac
[ ${#recs[@]} -gt 0 ] || { echo "nenhuma gravação com gabarito em $lang" >&2; exit 1; }
dirs=$(printf "$REC_ROOT/%s," "${recs[@]}"); dirs=${dirs%,}
mkdir -p "$OUT_BASE"
cd "$REPO"
echo "modelos $lang de: ${recs[*]}"
env "${log_env[@]}" ABI_LABEL_BUILD="$dirs" ABI_LABEL_OUT="public/data/labels/$lang.json" ABI_LABEL_MIN_SCORE=$min ABI_LABEL_MARGIN=0.15 \
  npx vitest run src/engine/label-models.build.test.ts > "$OUT_BASE/build-$lang.log" 2>&1 || { tail -30 "$OUT_BASE/build-$lang.log"; exit 1; }
mv "public/data/labels/$lang.json.txt" "$OUT_BASE/build-$lang.txt"
cat "$OUT_BASE/build-$lang.txt"
