#!/usr/bin/env bash
# Repete gravações pelo motor (src/engine/replay.test.ts), em paralelo, e resume.
# Uso: bash replay.sh [--out DIR] [--base DIR] [--snap T1,T2] [--models A,B] [--force] <gravações | en | pt | all>
#   --out    pasta dos resultados (padrão: $OUT_BASE/<data-hora>)
#   --base   rodada anterior para comparar no resumo
#   --snap   instantes (ms, como os nomes dos quadros) para gravar o grid da página no resumo
#   --force  roda mesmo com outros replays em andamento
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
source "$here/env.sh"
out="" base="" snap="" force=0 names=()
while [ $# -gt 0 ]; do
  case $1 in
    --out) out=$2; shift 2 ;;
    --base) base=$2; shift 2 ;;
    --snap) snap=$2; shift 2 ;;
    --models) MODELS=$2; shift 2 ;;
    --force) force=1; shift ;;
    *) names+=("$1"); shift ;;
  esac
done
[ ${#names[@]} -gt 0 ] || { echo "uso: bash replay.sh [opções] <gravações | en | pt | all>" >&2; exit 2; }
if [ "$force" = 0 ] && [ "$(running_replays)" -gt 0 ]; then
  echo "já há replays rodando ($(running_replays) processos): espere, pare com TaskStop, ou use --force" >&2; exit 3
fi
mapfile -t recs < <(resolve_recordings "${names[@]}")
out=${out:-$OUT_BASE/$(date +%Y%m%d-%H%M%S)}
mkdir -p "$out"
cd "$REPO"
echo "replay de ${#recs[@]} gravações em $out (modelos: $MODELS)"
for r in "${recs[@]}"; do
  envs=(ABI_REPLAY="$REC_ROOT/$r" ABI_REPLAY_STRICT=0 ABI_LABEL_MODELS="$MODELS" ABI_REPLAY_OUT="$out/$r.txt")
  if is_en_with_log "$r" && [ -n "$APP_LOG" ]; then envs+=(ABI_APP_LOG="$APP_LOG"); fi
  [ -n "$snap" ] && envs+=(ABI_REPLAY_SNAPSHOTS="$snap")
  env "${envs[@]}" npx vitest run src/engine/replay.test.ts > "$out/$r.log" 2>&1 &
done
wait
node "$here/summarize.mjs" "$out" ${base:+"$base"}
