<script setup>
import { computed } from 'vue'

const props = defineProps({
  variant: {
    type: String,
    default: 'primary',
    validator: (v) =>
      ['primary', 'success', 'warning', 'yellow', 'danger', 'purple', 'teal', 'outline'].includes(
        v,
      ),
  },
  size: {
    type: String,
    default: 'md',
    validator: (v) => ['md', 'sm', 'xs'].includes(v),
  },
  type: {
    type: String,
    default: 'button',
  },
  disabled: {
    type: Boolean,
    default: false,
  },
})

const classList = computed(() => {
  const classes = ['btn', `btn-${props.variant}`]
  if (props.size === 'sm') classes.push('btn-sm')
  if (props.size === 'xs') classes.push('btn-xs')
  return classes
})
</script>

<template>
  <button :type="type" :disabled="disabled" :class="classList">
    <slot />
  </button>
</template>
