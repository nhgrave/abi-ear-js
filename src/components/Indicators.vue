<script setup lang="ts">
import { t, type Locale, type MessageKey } from '../i18n'
import type { Health } from '../live/health'

defineProps<{ health: { audio: Health; screen: Health; vendor: Health; cursor: Health }; locale: Locale }>()
const order = ['audio', 'screen', 'vendor', 'cursor'] as const
</script>

<template>
  <ul class="indicators">
    <li v-for="k in order" :key="k" :class="['ind', health[k].level]" :title="t(health[k].reason as MessageKey, locale)">
      <span class="dot" />{{ t(`ind.${k}` as MessageKey, locale) }}
    </li>
  </ul>
</template>

<style scoped>
.indicators { display: flex; gap: 12px; list-style: none; margin: 0; padding: 0; flex-wrap: wrap; }
.ind { display: flex; align-items: center; gap: 6px; font-size: 14px; cursor: help; }
.dot { width: 10px; height: 10px; border-radius: 50%; background: var(--gray); }
.green .dot { background: var(--green); }
.yellow .dot { background: var(--yellow); }
.red .dot { background: var(--red); }
</style>
