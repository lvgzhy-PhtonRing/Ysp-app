<script setup>
const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false,
  },
  closeOnOverlay: {
    type: Boolean,
    default: true,
  },
  panelClass: {
    type: String,
    default: 'w-full max-w-xl p-5',
  },
})

const emit = defineEmits(['update:modelValue'])

function close() {
  emit('update:modelValue', false)
}

function onOverlayClick() {
  if (props.closeOnOverlay) close()
}
</script>

<template>
  <div v-if="modelValue" class="modal-overlay p-4" @click="onOverlayClick">
    <div class="glass-modal" :class="panelClass" @click.stop>
      <slot />
    </div>
  </div>
</template>
