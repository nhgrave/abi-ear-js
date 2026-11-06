<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import type { BoxView, SessionView } from '../engine/view'
import { boxDisplay } from '../view/format'

const props = defineProps<{ view: SessionView; selected: number | null }>()
const emit = defineEmits<{ select: [number] }>()
const scroller = ref<HTMLElement | null>(null)
const gridEl = ref<HTMLElement | null>(null)

const shown = computed(() => props.view.boxes.map((b) => ({ b, d: boxDisplay(b) })))
const cols = computed(() => props.view.geometry?.cols ?? 9)
const first = computed(() => props.view.extent[0])
const rows = computed(() => Math.max(1, props.view.extent[1] - props.view.extent[0]))
// posições em % da largura/altura do grid: ele acompanha a largura da coluna (células quadradas pelo aspect-ratio)
const pctX = (c: number) => `${(100 * c) / cols.value}%`
const pctY = (r: number) => `${(100 * r) / rows.value}%`
const band = computed(() => {
  const g = props.view.geometry
  return g ? { top: props.view.rowOffset - first.value, rows: g.rows } : null
})
const title = (b: BoxView, text: string, pct: number | null) =>
  [pct !== null ? `${text} ${pct}%` : text, b.picks > 0 && b.label ? b.label : '', `${b.w}x${b.h}`].filter(Boolean).join(' · ')

watch(
  () => props.view.rowOffset,
  async () => {
    await nextTick()
    if (!scroller.value || !gridEl.value || !band.value) return
    const cell = gridEl.value.clientHeight / rows.value
    scroller.value.scrollTo({ top: Math.max(0, (band.value.top - 1) * cell), behavior: 'smooth' })
  },
)
</script>

<template>
  <div ref="scroller" class="scroller">
    <div
      ref="gridEl"
      class="grid"
      :style="{ aspectRatio: `${cols} / ${rows}`, backgroundSize: `${100 / cols}% ${100 / rows}%` }"
    >
      <div v-if="band" class="band" :style="{ top: pctY(band.top), height: pctY(band.rows) }" />
      <button
        v-for="{ b, d } in shown"
        :key="b.uid"
        :class="['box', { picked: d.color, split: d.edge, hint: d.hint, selected: b.uid === selected, clipped: b.clipped, short: b.h === 1 }]"
        :style="{
          left: pctX(b.col),
          top: pctY(b.row - first),
          width: pctX(b.w),
          height: pctY(b.h),
          '--rarity': d.color ?? undefined,
          '--edge-high': d.edge?.high,
          '--edge-low': d.edge?.low,
          '--lines': b.h === 1 ? (d.pct !== null ? 2 : 3) : 4,
        }"
        :title="title(b, d.text, d.pct)"
        @click="emit('select', b.uid)"
      >
        <template v-if="d.icon">
          <img :src="d.icon" :alt="d.text" />
          <span class="caption" lang="en">{{ d.text }}</span>
        </template>
        <template v-else>
          <span class="name" lang="en">{{ d.text }}</span>
          <span v-if="d.pct !== null" class="pct">{{ d.pct }}%</span>
        </template>
        <span v-if="d.count > 1" class="badge">+{{ d.count - 1 }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.scroller { max-height: 75vh; overflow: auto; border: 1px solid var(--line); border-radius: 8px; background: var(--panel); }
.grid {
  position: relative; width: 100%;
  background-image: linear-gradient(var(--line) 1px, transparent 1px), linear-gradient(90deg, var(--line) 1px, transparent 1px);
}
.band { position: absolute; left: 0; right: 0; background: var(--band); pointer-events: none; }
.box {
  position: absolute; --rarity: transparent; box-sizing: border-box; border: 1px solid var(--box-line); background: var(--box);
  color: var(--text); border-radius: 4px; padding: 3px; overflow: hidden; display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 1px; font: inherit; font-size: 11px; line-height: 1.15; cursor: pointer;
  text-align: center;
}
.box:hover { border-color: var(--muted); }
.box.hint { color: var(--muted); }
.box.picked { background: color-mix(in srgb, var(--rarity) 32%, #14161b); border: 2px solid var(--rarity); }
/* raridades diferentes entre os candidatos: a caixa é cortada na diagonal, sem gradiente — a maior raridade no
   canto superior esquerdo, a menor no inferior direito, na borda e no fundo */
.box.picked.split {
  --tint-high: color-mix(in srgb, var(--edge-high) 32%, #14161b);
  --tint-low: color-mix(in srgb, var(--edge-low) 32%, #14161b);
  border: 3px solid transparent;
  background:
    linear-gradient(to bottom right, var(--tint-high) 50%, var(--tint-low) 50%) padding-box,
    linear-gradient(to bottom right, var(--edge-high) 50%, var(--edge-low) 50%) border-box;
}
.box.clipped { border-style: dashed; }
.box.selected { outline: 2px solid #fff; outline-offset: -1px; z-index: 1; }
.box img { flex: 1 1 auto; min-height: 0; max-width: 100%; object-fit: contain; }
.caption { font-size: 10px; max-width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.badge {
  position: absolute; right: 2px; bottom: 2px; font-size: 10px; font-weight: 700; line-height: 1; padding: 2px 3px;
  border-radius: 3px; background: rgba(0, 0, 0, 0.55); color: #ffd54f;
}
.box.short .badge { bottom: auto; top: 2px; }
.pct { font-weight: 700; font-variant-numeric: tabular-nums; }
.name { hyphens: auto; overflow-wrap: anywhere; display: -webkit-box; -webkit-line-clamp: var(--lines); -webkit-box-orient: vertical; overflow: hidden; }
.box.hint .name { font-size: 9.5px; }
</style>
