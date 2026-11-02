<script setup lang="ts">
import { computed } from 'vue'
import { t, type Locale, type MessageKey } from '../i18n'
import type { LastPickup } from '../live/runtime'

const props = defineProps<{ lastPickup: LastPickup | null; version: string; syncedAt: string | null; resolution: [number, number] | null; locale: Locale }>()
const pickupText = computed(() => {
  const p = props.lastPickup
  if (!p) return t('pickup.none', props.locale)
  const vars = { sound: p.sound, score: p.score.toFixed(2) }
  if (p.outcome === 'assigned') return t('pickup.assigned', props.locale, vars)
  return t('pickup.unassigned', props.locale, { ...vars, reason: t(`reason.${p.reason}` as MessageKey, props.locale) })
})
const date = computed(() => (props.syncedAt ? props.syncedAt.slice(0, 10) : '?'))
const untested = computed(() => props.resolution && (props.resolution[0] !== 1920 || props.resolution[1] !== 1080))
</script>

<template>
  <footer class="footer">
    <p :class="{ warn: lastPickup?.outcome === 'unassigned' }">{{ pickupText }}</p>
    <p v-if="untested && resolution" class="muted">{{ t('footer.untested', locale, { w: resolution[0], h: resolution[1] }) }}</p>
    <p class="muted">{{ t('footer.base', locale, { version, date }) }} {{ t('footer.credits', locale) }}</p>
    <p class="muted">{{ t('footer.passive', locale) }}</p>
  </footer>
</template>

<style scoped>
.footer { display: grid; gap: 4px; font-size: 13px; }
p { margin: 0; }
.muted { color: var(--muted); }
.warn { color: var(--yellow); }
</style>
