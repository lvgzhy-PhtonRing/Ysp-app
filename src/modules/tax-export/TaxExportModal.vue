<script setup>
import { computed, ref } from 'vue'
import GlassModal from '../../components/GlassModal.vue'
import { buildTaxWorkbookData, writeTaxWorkbook } from './buildTaxWorkbook'
import { SALES_CHANNELS } from '../sales/salesChannels'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  payload: { type: Object, default: () => ({}) },
})
const emit = defineEmits(['update:modelValue', 'downloaded'])

function localDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

const now = new Date()
const quarterMonth = Math.floor(now.getMonth() / 3) * 3
const startDate = ref(localDate(new Date(now.getFullYear(), quarterMonth, 1)))
const endDate = ref(localDate(new Date(now.getFullYear(), quarterMonth + 3, 0)))
const taxpayerName = ref('')
const taxpayerId = ref('')
const channels = ref(['PhtonRIng'])
const downloadError = ref('')
const workbookData = computed(() => buildTaxWorkbookData(props.payload, {
  startDate: startDate.value,
  endDate: endDate.value,
  taxpayerName: taxpayerName.value,
  taxpayerId: taxpayerId.value,
  channels: channels.value,
}))
const previewIssues = computed(() => workbookData.value.issues.slice(0, 8))

function close() {
  emit('update:modelValue', false)
}

async function download() {
  downloadError.value = ''
  const safeTaxpayer = (taxpayerName.value.trim() || '主体待确认').replace(/[\\/:*?"<>|]/g, '_')
  const filename = `YSP报税工作簿_${safeTaxpayer}_${startDate.value}_${endDate.value}_${localDate()}.xlsx`
  try {
    await writeTaxWorkbook(workbookData.value, filename)
    emit('downloaded', filename)
  } catch (error) {
    downloadError.value = `工作簿生成失败：${error?.message || '未知错误'}`
  }
}
</script>

<template>
  <GlassModal :model-value="modelValue" panel-class="w-full max-w-4xl relative max-h-[88vh] overflow-y-auto p-5" :close-on-overlay="false" @update:model-value="emit('update:modelValue', $event)">
    <div class="flex items-start justify-between gap-4">
      <div>
        <h2 class="text-xl font-bold text-gray-900">报税工作簿导出</h2>
        <p class="mt-1 text-sm text-gray-500">按已确认销售的入账日整理；不会展示下单日期，也不会上传数据。</p>
      </div>
      <button class="text-gray-400 hover:text-gray-800" aria-label="关闭" @click="close">✕</button>
    </div>

    <div class="mt-5 grid gap-4 md:grid-cols-2">
      <label class="text-sm text-gray-600">纳税主体名称<input v-model="taxpayerName" class="apple-input mt-1" placeholder="例如：营业执照主体名称" /></label>
      <label class="text-sm text-gray-600">纳税人识别号<input v-model="taxpayerId" class="apple-input mt-1" placeholder="请填写统一社会信用代码或税号" /></label>
      <div class="grid grid-cols-2 gap-3">
        <label class="text-sm text-gray-600">期间开始<input v-model="startDate" type="date" class="apple-input mt-1" /></label>
        <label class="text-sm text-gray-600">期间结束<input v-model="endDate" type="date" class="apple-input mt-1" /></label>
      </div>
      <fieldset class="md:col-span-2">
        <legend class="mb-2 text-sm font-semibold text-gray-700">导出前筛选销售</legend>
        <div class="flex flex-wrap gap-5">
          <label v-for="channel in SALES_CHANNELS" :key="channel" class="flex items-center gap-2 text-sm"><input v-model="channels" type="checkbox" :value="channel" />{{ channel }}</label>
        </div>
        <p class="mt-2 text-xs text-gray-500">默认仅纳入 PhtonRIng；“侧空翻棉”和“其它”个人出物不属于当前报税范围。</p>
      </fieldset>
    </div>

    <section class="mt-5 rounded-xl border border-blue-100 bg-blue-50/60 p-4" aria-label="导出预览">
      <h3 class="font-semibold text-blue-900">导出预览</h3>
      <div class="mt-3 grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
        <div><div class="text-gray-500">确认销售</div><b>{{ workbookData.totals.salesCount }} 笔</b></div>
        <div><div class="text-gray-500">成交总额</div><b>¥{{ workbookData.totals.revenue.toFixed(2) }}</b></div>
        <div><div class="text-gray-500">商品成本参考</div><b>¥{{ workbookData.totals.cost.toFixed(2) }}</b></div>
        <div><div class="text-gray-500">待确认事项</div><b :class="workbookData.issues.length ? 'text-amber-700' : 'text-green-700'">{{ workbookData.issues.length }} 项</b></div>
      </div>
      <ul v-if="previewIssues.length" class="mt-3 max-h-36 space-y-1 overflow-y-auto text-xs text-amber-800">
        <li v-for="(issue, index) in previewIssues" :key="`${issue.id}-${index}`">{{ issue.name || issue.sid || issue.id }}：{{ issue.issue }}</li>
        <li v-if="workbookData.issues.length > previewIssues.length">另有 {{ workbookData.issues.length - previewIssues.length }} 项，详见工作簿“待确认事项”。</li>
      </ul>
    </section>

    <p class="mt-4 rounded-lg bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">工作簿用于申报准备和人工复核，不计算应纳税所得额或税额。税务分类、发票数据、纳税主体及费用凭证请以当期电子税务局和实际资料为准。</p>
    <p v-if="downloadError" class="mt-3 text-sm text-red-700" role="alert">{{ downloadError }}</p>
    <div class="mt-5 flex justify-end gap-3"><button class="btn btn-outline" @click="close">关闭</button><button class="btn btn-primary" :disabled="!startDate || !endDate || startDate > endDate || !channels.length" @click="download">下载 Excel 工作簿</button></div>
  </GlassModal>
</template>
