<script setup>
import { computed, ref, watch } from 'vue'

const props = defineProps({
  open: { type: Boolean, default: false },
  items: { type: Array, default: () => [] },
  highlightedIds: { type: Array, default: () => [] },
})

const emit = defineEmits(['close', 'complete'])
const selectedId = ref('')
const selectedItem = computed(() => props.items.find(item => item.id === selectedId.value) || null)

watch(() => props.open, (open) => {
  if (!open) return
  selectedId.value = props.highlightedIds[0] || props.items.find(item => !item.completed)?.id || props.items[0]?.id || ''
}, { immediate: true })

function dueTone(item) {
  if (item.daysLeft < 0) return 'border-red-200 bg-red-50 text-red-700'
  if (item.daysLeft <= 4) return 'border-amber-200 bg-amber-50 text-amber-800'
  return 'border-blue-100 bg-blue-50 text-blue-700'
}
</script>

<template>
  <div v-if="open" class="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/55 p-3 backdrop-blur-sm sm:p-6" @click.self="emit('close')">
    <section class="flex h-[92vh] max-h-[52rem] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="tax-reminder-title">
      <header class="flex items-start justify-between gap-4 border-b border-slate-100 bg-slate-50 px-5 py-4 sm:px-7">
        <div>
          <div class="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-amber-600">
            <i class="fa-solid fa-bell" /> 申报事项
          </div>
          <h2 id="tax-reminder-title" class="text-xl font-bold text-slate-900 sm:text-2xl">申报提醒</h2>
          <p class="mt-1 text-sm text-slate-500">提前 14、7、4、3、2、1 天提醒；申报日期以税务系统为准。</p>
        </div>
        <button class="rounded-lg px-3 py-2 text-sm font-semibold text-slate-500 hover:bg-white hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500" aria-label="关闭提醒" @click="emit('close')">关闭</button>
      </header>

      <div class="grid min-h-0 flex-1 overflow-hidden md:grid-cols-[minmax(250px,0.85fr)_minmax(0,1.4fr)]">
        <nav class="max-h-64 space-y-2 overflow-y-auto border-b border-slate-100 p-4 md:max-h-none md:border-b-0 md:border-r md:p-5" aria-label="申报事项列表">
          <button
            v-for="item in items"
            :key="item.id"
            class="w-full rounded-xl border p-3 text-left transition hover:-translate-y-px hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            :class="selectedId === item.id ? 'border-blue-400 bg-blue-50 shadow-sm' : 'border-slate-200 bg-white hover:border-slate-300'"
            @click="selectedId = item.id"
          >
            <span class="flex items-center justify-between gap-2">
              <span class="min-w-0 truncate text-sm font-bold text-slate-800">{{ item.type === 'vat' ? '增值税及附加税费' : item.type === 'pit-a' ? '经营所得预缴 A 表' : '经营所得年度汇算 B 表' }}</span>
              <span v-if="item.completed" class="shrink-0 text-xs font-semibold text-emerald-700">已申报</span>
              <span v-else class="shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-bold" :class="dueTone(item)">{{ item.status }}</span>
            </span>
            <span class="mt-1 block text-xs text-slate-500">{{ item.period }} · 截止 {{ item.dueDate }}</span>
          </button>
        </nav>

        <article v-if="selectedItem" class="min-h-0 overflow-y-auto p-5 sm:p-7">
          <div class="mb-5 rounded-xl border p-4" :class="dueTone(selectedItem)">
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p class="text-xs font-bold uppercase tracking-wide opacity-75">{{ selectedItem.period }}</p>
                <h3 class="mt-1 text-lg font-bold">{{ selectedItem.form }}</h3>
              </div>
              <div class="rounded-lg bg-white/80 px-3 py-2 text-right">
                <div class="text-[11px] font-semibold opacity-70">申报截止日</div>
                <div class="text-base font-extrabold">{{ selectedItem.dueDate }}</div>
              </div>
            </div>
            <p class="mt-2 text-sm font-semibold">{{ selectedItem.completed ? '已记录为申报完成' : selectedItem.status }}</p>
          </div>

          <div class="mb-5">
            <h4 class="mb-3 flex items-center gap-2 text-sm font-bold text-slate-900"><i class="fa-solid fa-list-check text-blue-600" />申报前核对的数据</h4>
            <ul class="space-y-2">
              <li v-for="(entry, index) in selectedItem.checklist" :key="entry" class="flex gap-3 rounded-lg bg-slate-50 px-3 py-2.5 text-sm leading-5 text-slate-700">
                <span class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white text-[11px] font-bold text-blue-600">{{ index + 1 }}</span>
                <span>{{ entry }}</span>
              </li>
            </ul>
          </div>

          <div class="mb-5 rounded-xl border border-slate-200 p-4">
            <div class="text-xs font-semibold text-slate-500">办理系统</div>
            <div class="mt-1 font-bold text-slate-800">{{ selectedItem.portal }}</div>
            <a class="mt-2 inline-flex items-center gap-2 text-sm font-bold text-blue-700 underline decoration-blue-200 underline-offset-4 hover:text-blue-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500" :href="selectedItem.url" target="_blank" rel="noopener noreferrer">
              打开办理入口 <i class="fa-solid fa-arrow-up-right-from-square text-xs" />
            </a>
            <div class="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-500">
              期限依据：{{ selectedItem.deadlineSource }}
              <a v-if="selectedItem.deadlineSourceUrl" class="ml-1 font-semibold text-blue-700 underline underline-offset-2 hover:text-blue-900" :href="selectedItem.deadlineSourceUrl" target="_blank" rel="noopener noreferrer">查看官方来源</a>
            </div>
          </div>

          <p class="mb-5 text-xs leading-5 text-slate-500">此清单用于准备和核对，不代替税务系统预填数据或正式申报。请按当前税务系统和实际资料核实；零收入也按系统要求办理。</p>

          <div class="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
            <button v-if="selectedItem.completed" class="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500" @click="emit('complete', selectedItem.id, false)">撤销已申报</button>
            <button v-else class="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2" @click="emit('complete', selectedItem.id, true)">标记为已申报</button>
          </div>
        </article>
        <div v-else class="p-8 text-center text-sm text-slate-500">暂无申报事项</div>
      </div>
    </section>
  </div>
</template>
