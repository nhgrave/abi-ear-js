#!/usr/bin/env bash
# Olha os quadros de uma gravação com a visão da página (src/engine/frames.probe.test.ts).
# Uso: bash probe.sh <gravação> timeline [de-ms] [até-ms] [passo-ms]
#      bash probe.sh <gravação> boxes <quadro>[,<quadro>...]
#      bash probe.sh <gravação> truth
# O resultado vai para a tela e para $OUT_BASE/probe-<gravação>-<modo>.txt
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
source "$here/env.sh"
rec=${1:?gravação}; mode=${2:?modo: timeline, boxes ou truth}
mkdir -p "$OUT_BASE"
out="$OUT_BASE/probe-$rec-$mode.txt"
envs=(ABI_PROBE_DIR="$REC_ROOT/$rec" ABI_PROBE_MODE="$mode" ABI_PROBE_OUT="$out" ABI_PROBE_MODELS="$MODELS")
case $mode in
  timeline) [ -n "${3:-}" ] && envs+=(ABI_PROBE_FROM="$3"); [ -n "${4:-}" ] && envs+=(ABI_PROBE_TO="$4"); [ -n "${5:-}" ] && envs+=(ABI_PROBE_STEP="$5") ;;
  boxes) envs+=(ABI_PROBE_FRAMES="${3:?quadros}") ;;
  truth) ;;
  *) echo "modo desconhecido: $mode" >&2; exit 2 ;;
esac
cd "$REPO"
env "${envs[@]}" npx vitest run src/engine/frames.probe.test.ts > "$out.log" 2>&1 || { tail -30 "$out.log"; exit 1; }
cat "$out"
echo "(salvo em $out)"
