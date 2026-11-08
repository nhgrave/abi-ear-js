#!/usr/bin/env bash
# Buracos entre quadros gravados (o gravador perde quadros com a máquina ocupada). Pegadas "no-frame" no replay caem
# num buraco: não dá para julgar a atribuição delas.
# Uso: bash gaps.sh <gravação> [mínimo-ms, padrão 300] [de-ms] [até-ms]
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
source "$here/env.sh"
rec=${1:?gravação}; min=${2:-300}; from=${3:-0}; to=${4:-99999999999999}
ls "$REC_ROOT/$rec/frames" | sed 's/\.jpg$//' | sort -n | awk -v min="$min" -v from="$from" -v to="$to" '
  $1 >= from && $1 <= to { if (p) { d = $1 - p; if (d >= min) { n++; printf "%s (%s UTC) buraco de %d ms\n", p, strftime("%H:%M:%S", int(p / 1000), 1), d } } p = $1 }
  END { printf "%d buracos de %d ms ou mais\n", n, min }'
