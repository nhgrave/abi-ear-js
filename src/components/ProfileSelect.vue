<script setup lang="ts">
import { t, type Locale } from '../i18n'
import type { ProfileOption } from '../engine/profiles'

defineProps<{ options: ProfileOption[]; modelValue: number | null; locale: Locale }>()
const emit = defineEmits<{ 'update:modelValue': [number | null] }>()
const onChange = (e: Event) => {
  const v = (e.target as HTMLSelectElement).value
  emit('update:modelValue', v === 'all' ? null : Number(v))
}
</script>

<template>
  <label class="profile">
    {{ t('map', locale) }}
    <select :value="modelValue === null ? 'all' : String(modelValue)" @change="onChange">
      <option value="all">{{ t('allMaps', locale) }}</option>
      <option v-for="o in options" :key="o.label" :value="String(o.profileId)">{{ o.label }}</option>
    </select>
  </label>
</template>

<style scoped>
.profile { display: flex; align-items: center; gap: 8px; font-size: 14px; }
select { background: var(--panel); color: var(--text); border: 1px solid var(--line); border-radius: 6px; padding: 4px 8px; font: inherit; }
</style>
