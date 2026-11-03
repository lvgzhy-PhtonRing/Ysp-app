<script setup>
import { computed, ref, watch } from 'vue'
import GlassModal from '../../components/GlassModal.vue'
import { buildTaxWorkbookData, writeTaxWorkbook } from './buildTaxWorkbook'
import { buildPeriodInventoryReceipt, writePeriodInventoryReceipt } from './periodInventoryReceipt'
import { SALES_CHANNELS } from '../sales/salesChannels'
import { findTaxpayerProfileConflict, normalizeTaxpayerId, normalizeTaxpayerName } from '../../data/taxpayerProfiles'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  payload: { type: Object, default: () => ({}) },
})
const emit = defineEmits(['update:modelValue', 'downloaded', 'remember-taxpayer'])

function localDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

const now = new Date()
const quarterMonth = Math.floor(now.getMonth() / 3) * 3
const startDate = ref(localDate(new Date(now.getFullYear(), quarterMonth, 1)))
const endDate = ref(localDate(new Date(now.getFullYear(), quarterMonth + 3, 0)))
const taxpayerName = ref('')
const taxpayerId = ref('')
const taxpayerProfiles = computed(() => Array.isArray(props.payload?.taxpayerProfiles) ? props.payload.taxpayerProfiles : [])
const taxpayerConflict = computed(() => findTaxpayerProfileConflict(taxpayerProfiles.value, taxpayerName.value, taxpayerId.value))
const channels = ref(['PhtonRIng'])
const exportMode = ref('ledger')
const downloadError = ref('')
const workbookData = computed(() => buildTaxWorkbookData(props.payload, {
  startDate: startDate.value,
  endDate: endDate.value,
  taxpayerName: taxpayerName.value,
  taxpayerId: taxpayerId.value,
  channels: channels.value,
}))
const previewIssues = computed(() => workbookData.value.issues.slice(0, 8))
const receiptData = computed(() => buildPeriodInventoryReceipt(props.payload, { startDate: startDate.value, endDate: endDate.value }))

watch(taxpayerName, (value) => {
  const name = normalizeTaxpayerName(value)
  const match = taxpayerProfiles.value.find((profile) => normalizeTaxpayerName(profile.name) === name)
  if (match && !taxpayerId.value) taxpayerId.value = match.taxId
})
watch(taxpayerId, (value) => {
  const taxId = normalizeTaxpayerId(value)
  const match = taxpayerProfiles.value.find((profile) => normalizeTaxpayerId(profile.taxId) === taxId)
  if (match && !taxpayerName.value) taxpayerName.value = match.name
})

function restoreTaxpayerProfile() {
  const profiles = taxpayerProfiles.value
  const current = profiles.find((profile) => (
    normalizeTaxpayerName(profile.name) === normalizeTaxpayerName(taxpayerName.value) &&
    normalizeTaxpayerId(profile.taxId) === normalizeTaxpayerId(taxpayerId.value)
  ))
  const profile = current || profiles.at(-1)
  if (!profile) return
  taxpayerName.value = profile.name
  taxpayerId.value = profile.taxId
}

watch(() => props.modelValue, (isOpen) => {
  if (isOpen) restoreTaxpayerProfile()
})
watch(taxpayerProfiles, (profiles) => {
  if (props.modelValue && profiles.length && (!taxpayerName.value || !taxpayerId.value)) restoreTaxpayerProfile()
})

function rememberTaxpayer() {
  const name = normalizeTaxpayerName(taxpayerName.value)
  const taxId = normalizeTaxpayerId(taxpayerId.value)
  if (!name || !taxId || taxpayerConflict.value) return
  taxpayerName.value = name
  taxpayerId.value = taxId
  emit('remember-taxpayer', { name, taxId })
}

function close() {
  emit('update:modelValue', false)
}

async function download() {
  downloadError.value = ''
  if (taxpayerConflict.value) {
    downloadError.value = taxpayerConflict.value.field === 'name'
      ? `“${taxpayerName.value.trim()}”已对应税号 ${taxpayerConflict.value.existing.taxId}，请使用已保存的配对。`
      : `税号“${normalizeTaxpayerId(taxpayerId.value)}”已对应纳税主体“${taxpayerConflict.value.existing.name}”，请使用已保存的配对。`
    return
  }
  rememberTaxpayer()
  const safeTaxpayer = (taxpayerName.value.trim() || '主体待确认').replace(/[\\/:*?"<>|]/g, '_')
  const filename = exportMode.value === 'ledger'
    ? `YSP报税导出_${safeTaxpayer}_${startDate.value}_${endDate.value}_${localDate()}.xlsx`
    : `${startDate.value.replaceAll('-', '')}-${endDate.value.replaceAll('-', '')}期间入库清单.xlsx`
  try {
    if (exportMode.value === 'ledger') {
      await writeTaxWorkbook(workbookData.value, filename)
    } else {
      await writePeriodInventoryReceipt(props.payload, {
        startDate: startDate.value,
        endDate: endDate.value,
        taxpayerName: taxpayerName.value,
        taxpayerId: taxpayerId.value,
      }, filename)
    }
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
        <h2 class="text-xl font-bold text-gray-900">报税导出</h2>
        <p class="mt-1 text-sm text-gray-500">按已确认销售的入账日整理；不会展示下单日期，也不会上传数据。</p>
      </div>
      <button class="text-gray-400 hover:text-gray-800" aria-label="关闭" @click="close">✕</button>
    </div>

    <div class="mt-5 grid gap-4 md:grid-cols-2">
      <label class="text-sm text-gray-600">纳税主体名称<input v-model="taxpayerName" list="taxpayer-name-suggestions" class="apple-input mt-1" placeholder="输入或选择已记住的主体名称" @change="rememberTaxpayer" @blur="rememberTaxpayer" /><datalist id="taxpayer-name-suggestions"><option v-for="profile in taxpayerProfiles" :key="profile.name" :value="profile.name">{{ profile.taxId }}</option></datalist></label>
      <label class="text-sm text-gray-600">纳税人识别号<input v-model="taxpayerId" list="taxpayer-id-suggestions" class="apple-input mt-1" placeholder="输入或选择对应的税号" @change="rememberTaxpayer" @blur="rememberTaxpayer" /><datalist id="taxpayer-id-suggestions"><option v-for="profile in taxpayerProfiles" :key="profile.taxId" :value="profile.taxId">{{ profile.name }}</option></datalist></label>
      <p v-if="taxpayerConflict" class="md:col-span-2 -mt-2 text-xs text-red-700" role="alert">配对冲突：{{ taxpayerConflict.field === 'name' ? `“${taxpayerName.trim()}”已对应税号 ${taxpayerConflict.existing.taxId}` : `税号“${normalizeTaxpayerId(taxpayerId)}”已对应主体“${taxpayerConflict.existing.name}”` }}。请选择已有配对，不会覆盖已记忆的信息。</p>
      <div class="grid grid-cols-2 gap-3">
        <label class="text-sm text-gray-600">期间开始<input v-model="startDate" type="date" class="apple-input mt-1" /></label>
        <label class="text-sm text-gray-600">期间结束<input v-model="endDate" type="date" class="apple-input mt-1" /></label>
      </div>
      <fieldset class="md:col-span-2">
        <legend class="mb-2 text-sm font-semibold text-gray-700">导出内容</legend>
        <div class="inline-flex rounded-full border border-gray-200 bg-gray-50 p-1" role="radiogroup" aria-label="导出内容">
          <button type="button" role="radio" :aria-checked="exportMode === 'ledger'" class="rounded-full px-4 py-2 text-sm font-medium" :class="exportMode === 'ledger' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500'" @click="exportMode = 'ledger'">台账</button>
          <button type="button" role="radio" :aria-checked="exportMode === 'receipt'" class="rounded-full px-4 py-2 text-sm font-medium" :class="exportMode === 'receipt' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500'" @click="exportMode = 'receipt'">期间入库清单</button>
        </div>
        <p v-if="exportMode === 'receipt'" class="mt-2 text-xs text-gray-500">按采购日期筛选；选定期间发生采购即列入，包括尚未完成 YSP 实际入库的商品。文件使用 A3 横向入库单版式。</p>
      </fieldset>
      <fieldset v-if="exportMode === 'ledger'" class="md:col-span-2">
        <legend class="mb-2 text-sm font-semibold text-gray-700">导出前筛选销售</legend>
        <div class="flex flex-wrap gap-5">
          <label v-for="channel in SALES_CHANNELS" :key="channel" class="flex items-center gap-2 text-sm"><input v-model="channels" type="checkbox" :value="channel" />{{ channel }}</label>
        </div>
        <p class="mt-2 text-xs text-gray-500">默认仅纳入 PhtonRIng；“侧空翻棉”和“其它”个人出物不属于当前报税范围。</p>
      </fieldset>
    </div>

    <section v-if="exportMode === 'ledger'" class="mt-5 rounded-xl border border-blue-100 bg-blue-50/60 p-4" aria-label="导出预览">
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

    <section v-else class="mt-5 rounded-xl border border-blue-100 bg-blue-50/60 p-4" aria-label="期间入库清单预览">
      <h3 class="font-semibold text-blue-900">期间入库清单预览</h3>
      <div class="mt-3 grid grid-cols-2 gap-3 text-sm md:grid-cols-3">
        <div><div class="text-gray-500">采购商品</div><b>{{ receiptData.totals.quantity }} 件</b></div>
        <div><div class="text-gray-500">系统成本合计</div><b>¥{{ receiptData.totals.cost.toFixed(2) }}</b></div>
        <div><div class="text-gray-500">尚未实际入库</div><b>{{ receiptData.totals.pendingInventoryCount }} 件</b></div>
      </div>
      <p v-if="receiptData.missingDateCount" class="mt-2 text-xs text-amber-800">另有 {{ receiptData.missingDateCount }} 件采购日期缺失，无法判断是否属于该期间，未列入清单。</p>
    </section>

    <p class="mt-4 rounded-lg bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">工作簿用于申报准备和人工复核，不计算应纳税所得额或税额。税务分类、发票数据、纳税主体及费用凭证请以当期电子税务局和实际资料为准。</p>
    <p v-if="downloadError" class="mt-3 text-sm text-red-700" role="alert">{{ downloadError }}</p>
    <div class="mt-5 flex justify-end gap-3"><button class="btn btn-outline" @click="close">关闭</button><button class="btn btn-primary" :disabled="!startDate || !endDate || startDate > endDate || (exportMode === 'ledger' && !channels.length)" @click="download">{{ exportMode === 'ledger' ? '下载 Excel 工作簿' : '下载 A3 期间入库清单' }}</button></div>
  </GlassModal>
</template>
