<script setup lang="ts">
import { t, type Locale } from '../i18n'
import type { BoxView } from '../engine/view'

defineProps<{ box: BoxView; locale: Locale }>()
</script>

<template>
  <aside class="details">
    <h2>{{ t('panel.title', locale) }}</h2>
    <p class="meta">{{ t('panel.size', locale) }}: {{ box.w }}x{{ box.h }}</p>
    <p v-if="box.picks === 0">{{ t('panel.notPicked', locale) }}</p>
    <p v-else-if="box.candidates.length === 0">{{ t('panel.none', locale) }}</p>
    <template v-else>
      <p v-if="box.sizeRelaxed" class="note">{{ t('panel.sizeRelaxed', locale) }}</p>
      <ul>
        <li v-for="c in box.candidates" :key="c.itemId">
          <img v-if="c.icon" :src="c.icon" alt="" />
          <span class="label">{{ c.name }}</span>
          <span class="bar"><span :style="{ width: `${c.pct}%` }" /></span>
          <span class="pct">{{ c.pct < 1 ? '<1' : Math.round(c.pct) }}%</span>
        </li>
      </ul>
    </template>
  </aside>
</template>

<style scoped>
.details { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 12px 16px; min-width: 0; }
h2 { font-size: 16px; margin: 0 0 4px; }
.meta, .note { color: var(--muted); font-size: 13px; margin: 0 0 8px; }
ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
li { display: grid; grid-template-columns: 28px 1fr 80px 40px; align-items: center; gap: 8px; font-size: 13px; }
img { width: 28px; height: 28px; object-fit: contain; }
.bar { height: 8px; background: var(--line); border-radius: 4px; overflow: hidden; }
.bar span { display: block; height: 100%; background: var(--accent); }
.pct { text-align: right; font-variant-numeric: tabular-nums; }
</style>
