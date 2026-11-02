<script setup lang="ts">
import { t, type Locale, type MessageKey } from '../i18n'

defineProps<{ locale: Locale }>()
const steps: MessageKey[] = ['guide.step1', 'guide.step2', 'guide.step3', 'guide.step4', 'guide.step5']
</script>

<template>
  <section class="guide">
    <h2>{{ t('guide.title', locale) }}</h2>
    <ol>
      <li v-for="s in steps" :key="s">{{ t(s, locale) }}</li>
    </ol>
    <p class="privacy">{{ t('guide.privacy', locale) }}</p>
  </section>
</template>

<style scoped>
.guide { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 12px 20px; }
h2 { font-size: 16px; margin: 0 0 8px; }
ol { margin: 0; padding-left: 20px; display: grid; gap: 6px; }
.privacy { color: var(--muted); font-size: 13px; margin: 10px 0 0; }
</style>
