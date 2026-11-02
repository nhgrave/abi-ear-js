<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import type { SessionView } from '../engine/view'
import { boxDisplay } from '../view/format'

const props = defineProps<{ view: SessionView; selected: number | null }>()
const emit = defineEmits<{ select: [number] }>()
const CELL = 48
const scroller = ref<HTMLElement | null>(null)

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
        v-for="b in view.boxes"
        :key="b.uid"
        :class="['box', boxDisplay(b).tone, { selected: b.uid === selected }]"
        :style="{ left: `${b.col * CELL}px`, top: `${(b.row - first) * CELL}px`, width: `${b.w * CELL}px`, height: `${b.h * CELL}px` }"
        @click="emit('select', b.uid)"
      >
        <img v-if="boxDisplay(b).icon" :src="boxDisplay(b).icon!" :alt="boxDisplay(b).text" />
        <template v-else>
          <span class="name">{{ boxDisplay(b).text }}</span>
          <span v-if="boxDisplay(b).pct !== null" class="pct">{{ boxDisplay(b).pct }}%</span>
        </template>
      </button>
    </div>
  </div>
</template>

<style scoped>
.scroller { max-height: 70vh; overflow: auto; border: 1px solid var(--line); border-radius: 8px; background: var(--panel); max-width: 100%; }
.grid { position: relative; background-image: linear-gradient(var(--line) 1px, transparent 1px), linear-gradient(90deg, var(--line) 1px, transparent 1px); }
.band { position: absolute; left: 0; right: 0; background: var(--band); pointer-events: none; }
.box { position: absolute; box-sizing: border-box; border: 1px solid var(--box-line); background: var(--box); color: var(--text); border-radius: 4px; padding: 2px; overflow: hidden; display: flex; flex-direction: column; align-items: center; justify-content: center; font: inherit; font-size: 11px; line-height: 1.15; cursor: pointer; text-align: center; }
.box.sure { background: var(--sure); border-color: var(--green); }
.box.doubt { background: var(--doubt); border-color: var(--yellow); }
.box.selected { outline: 2px solid var(--accent); z-index: 1; }
.box img { max-width: 100%; max-height: 100%; object-fit: contain; }
.pct { font-weight: 700; }
.name { overflow-wrap: anywhere; }
</style>
