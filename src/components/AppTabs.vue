<script setup>
import { computed } from 'vue'

const props = defineProps({
  tabs: {
    type: Array,
    default: () => [],
  },
  modelValue: {
    type: String,
    required: true,
  },
  variant: {
    type: String,
    default: 'normal', // normal | finance
  },
})

const emit = defineEmits(['update:modelValue'])

const isFinance = computed(() => props.variant === 'finance')

function tabClass(tabId) {
  const active = props.modelValue === tabId
  return [
    'tab-btn',
    active ? 'tab-active' : 'tab-inactive',
    isFinance.value ? 'finance-tab' : '',
    isFinance.value && active ? 'finance-tab-active' : '',
  ]
}
</script>

<template>
  <div class="flex items-center gap-2">
    <button
      v-for="tab in tabs"
      :key="tab.id"
      :class="tabClass(tab.id)"
      @click="emit('update:modelValue', tab.id)"
    >
      {{ tab.name }}
    </button>
  </div>
</template>
