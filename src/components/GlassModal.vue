<script setup>
import { shouldCloseOnOverlayClick } from './modalInteraction'

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
let pointerStartedOnOverlay = false
let pointerEndedOnOverlay = false

function close() {
  emit('update:modelValue', false)
}

function onPointerDown(event) {
  pointerStartedOnOverlay = event.target === event.currentTarget
  pointerEndedOnOverlay = false
}

function onPointerUp(event) {
  pointerEndedOnOverlay = event.target === event.currentTarget
}

function onOverlayClick(event) {
  const shouldClose = shouldCloseOnOverlayClick(
    props.closeOnOverlay,
    pointerStartedOnOverlay,
    pointerEndedOnOverlay,
    event.target === event.currentTarget,
  )
  pointerStartedOnOverlay = false
  pointerEndedOnOverlay = false
  if (shouldClose) close()
}
</script>

<template>
  <div v-if="modelValue" class="modal-overlay p-4" @pointerdown="onPointerDown" @pointerup="onPointerUp" @click="onOverlayClick">
    <div class="glass-modal" :class="panelClass" @click.stop>
      <slot />
    </div>
  </div>
</template>
