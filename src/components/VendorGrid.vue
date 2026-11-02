<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import type { SessionView } from '../engine/view'
import { boxDisplay } from '../view/format'

const props = defineProps<{ view: SessionView; selected: number | null }>()
const emit = defineEmits<{ select: [number] }>()
const CELL = 48
const scroller = ref<HTMLElement | null>(null)

const shown = computed(() => props.view.boxes.map((b) => ({ b, d: boxDisplay(b) })))
const cols = computed(() => props.view.geometry?.cols ?? 9)
const first = computed(() => props.view.extent[0])
const rows = computed(() => Math.max(1, props.view.extent[1] - props.view.extent[0]))
const band = computed(() => {
  const g = props.view.geometry
  return g ? { top: (props.view.rowOffset - first.value) * CELL, height: g.rows * CELL } : null
})

watch(() => props.view.rowOffset, async () => {
  await nextTick()
  if (scroller.value && band.value) scroller.value.scrollTo({ top: Math.max(0, band.value.top - CELL), behavior: 'smooth' })
})
</script>

<template>
  <div ref="scroller" class="scroller">
    <div class="grid" :style="{ width: `${cols * CELL}px`, height: `${rows * CELL}px`, backgroundSize: `${CELL}px ${CELL}px` }">
      <div v-if="band" class="band" :style="{ top: `${band.top}px`, height: `${band.height}px` }" />
      <button
        v-for="{ b, d } in shown"
        :key="b.uid"
        :class="['box', { picked: d.color, selected: b.uid === selected, clipped: b.clipped }]"
        :style="{
          left: `${b.col * CELL}px`,
          top: `${(b.row - first) * CELL}px`,
          width: `${b.w * CELL}px`,
          height: `${b.h * CELL}px`,
          '--rarity': d.color ?? undefined,
        }"
        :title="d.pct !== null ? `${d.text} ${d.pct}%` : d.text"
        @click="emit('select', b.uid)"
      >
        <template v-if="d.icon">
          <img :src="d.icon" :alt="d.text" />
          <span class="caption">{{ d.text }}</span>
        </template>
        <template v-else>
          <span class="name">{{ d.text }}</span>
          <span v-if="d.pct !== null" class="pct">{{ d.pct }}%</span>
        </template>
        <span v-if="d.count > 1" class="badge">⧉ {{ d.count }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.scroller { max-height: 70vh; overflow: auto; border: 1px solid var(--line); border-radius: 8px; background: var(--panel); max-width: 100%; }
.grid { position: relative; background-image: linear-gradient(var(--line) 1px, transparent 1px), linear-gradient(90deg, var(--line) 1px, transparent 1px); }
.band { position: absolute; left: 0; right: 0; background: var(--band); pointer-events: none; }
.box { position: absolute; --rarity: transparent; box-sizing: border-box; border: 1px solid var(--box-line); background: var(--box); color: var(--text); border-radius: 4px; padding: 2px; overflow: hidden; display: flex; flex-direction: column; align-items: center; justify-content: center; font: inherit; font-size: 11px; line-height: 1.15; cursor: pointer; text-align: center; }
.box.picked { background: color-mix(in srgb, var(--rarity) 42%, #14161b); border: 2px solid var(--rarity); }
.box.clipped { border-style: dashed; }
.box.selected { outline: 2px solid #fff; z-index: 1; }
.box img { flex: 1 1 auto; min-height: 0; max-width: 100%; object-fit: contain; }
.caption { font-size: 10px; max-width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.badge { position: absolute; right: 3px; bottom: 2px; font-size: 10px; font-weight: 700; color: #ffd54f; }
.pct { font-weight: 700; }
.name { overflow-wrap: anywhere; }
</style>
