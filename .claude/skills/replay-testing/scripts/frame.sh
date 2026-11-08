#!/usr/bin/env bash
# Acha o quadro de uma gravação mais perto de um instante e recorta para ver com Read.
# Uso: bash frame.sh <gravação> <ms> [vendor|full|top|bottom|zoom:X,Y,L,A] [saída.jpg]
#   vendor: a grade do vendedor (padrão)   full: a tela inteira reduzida
#   top / bottom: a parte de cima / de baixo da grade   zoom: um retângulo da tela em 4x
# Imprime o nome do quadro e o arquivo gerado.
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
source "$here/env.sh"
rec=${1:?gravação}; ms=${2:?instante em ms}; what=${3:-vendor}
# o awk sai no primeiro quadro: o ls toma SIGPIPE, e com pipefail isso não pode derrubar o script
frame=$(ls "$REC_ROOT/$rec/frames" | awk -F. -v t="$ms" '$1>=t {print; exit}') || true
[ -n "$frame" ] || { echo "nenhum quadro depois de $ms" >&2; exit 1; }
mkdir -p "$OUT_BASE"
out=${4:-$OUT_BASE/frame-$rec-${frame%.jpg}-${what//[:,]/_}.jpg}
src="$REC_ROOT/$rec/frames/$frame"
case $what in
  vendor) convert "$src" -crop 700x900+1220+150 -resize 75% "$out" ;;
  full) convert "$src" -resize 50% "$out" ;;
  top) convert "$src" -crop 700x360+1220+150 "$out" ;;
  bottom) convert "$src" -crop 700x360+1220+720 "$out" ;;
  zoom:*) IFS=, read -r x y w h <<< "${what#zoom:}"; convert "$src" -crop "${w}x${h}+${x}+${y}" -scale 400% "$out" ;;
  *) echo "recorte desconhecido: $what" >&2; exit 2 ;;
esac
echo "quadro ${frame%.jpg} ($(date -u -d @$((${frame%.jpg} / 1000)) +%H:%M:%S) UTC) -> $out"
