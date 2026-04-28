<script setup>
import { computed, reactive, toRef, watch } from 'vue'
import { useRushCarPrototype } from './useRushCarPrototype'

const props = defineProps({
  sourceData: {
    type: Object,
    default: () => ({}),
  },
})

const {
  state,
  usPurchaseGroups,
  entrySnapshot,
  recipientOptions,
  unknownWebsiteUsernames,
  selectedRecipientForwarder,
  filteredCardsByHolder,
  filteredEntries,
  filterUsernameOptions,
  filterRecipientOptions,
  selectGroup,
  applyMasterRecipientDefault,
  addForwarderInfo,
  removeForwarderInfo,
  addMattelSiteInfo,
  removeMattelSiteInfo,
  toggleMattelForwarder,
  addPaymentCard,
  startEditPaymentCard,
  cancelEditPaymentCard,
  removePaymentCard,
  removeEntry,
  markEntryFailure,
  submitEntry,
} = useRushCarPrototype(toRef(props, 'sourceData'))

const browserOptions = ['AdsPower', 'HubStudio', 'BitBrowser', 'Chrome有痕', 'Chrome无痕', 'Edge有痕', 'Edge无痕', '设备自带浏览器']
const deviceOptions = ['台式机NT', '妈妈电脑P53', '爸爸小电脑ROG13', 'iPad', '妈妈手机Huawei', '爸爸手机Oppo']
const networkOptions = ['虹口家网', '宝山家网', '电信移动数据', '联通移动数据', '移动移动数据']
const vpnNodeOptions = ['美国', '日本', '香港', '马来西亚', '新加坡']
const bankOptions = ['工商', '招商', '中行', '贝宝']
const cardTypeOptions = ['Visa', 'Visa数字', 'Master', 'JCB', 'AE', '银联', 'Paypal']
const domesticReceiverOptions = ['吕', '郑', '爷']
const transferCompanyOptions = ['转运中国', '铭瑄海淘']
const baseMattelAccountOptions = ['zhylvg@gmail.com', 'll_gg@yeah.net', 'Payton-pi@zohomail.com']
const mattelAccountOptions = computed(() => {
  const options = [...baseMattelAccountOptions]
  unknownWebsiteUsernames.value.forEach((username) => {
    if (!options.includes(username)) options.push(username)
  })
  state.mattelSiteInfos.forEach((row) => {
    const username = String(row?.loginUsername || '').trim()
    if (username && !options.includes(username)) options.push(username)
  })
  return options
})

const isIntegratedMode = computed(() => Boolean(props?.sourceData?.rushcar))

const showForwarderPassword = reactive({})
const showMattelPassword = reactive({})
const forwarderEditableMap = reactive({})
const mattelEditableMap = reactive({})

const cardFilterOptions = computed(() => {
  const ids = new Set(filteredEntries.value.map((row) => row.cardId).filter(Boolean))
  return state.paymentCards.filter((c) => ids.has(c.id))
})

const existingGroupKeys = computed(() => new Set(state.entries.map((row) => row.sourceGroupKey).filter(Boolean)))

const failureDialog = reactive({
  open: false,
  entryId: '',
  notifiedAt: '',
  reason: '',
  refundStatus: '未退款',
  refundTime: '',
  detailLines: [],
})

watch(
  () => entrySnapshot.value.username,
  () => {
    applyMasterRecipientDefault()
  },
)

watch(
  () => state.form.holder,
  () => {
    const first = filteredCardsByHolder.value[0]
    if (!first) {
      state.form.cardId = ''
      return
    }
    const exists = filteredCardsByHolder.value.some((x) => x.id === state.form.cardId)
    if (!exists) state.form.cardId = first.id
  },
  { immediate: true },
)

watch(
  () => entrySnapshot.value.totalUSD,
  (value) => {
    state.form.actualChargeUSD = value ? String(Number(value)) : ''
  },
  { immediate: true },
)

watch(
  () => state.forwarderInfos.map((row) => row.id),
  (ids) => {
    const idSet = new Set(ids)
    Object.keys(forwarderEditableMap).forEach((id) => {
      if (!idSet.has(id)) delete forwarderEditableMap[id]
    })
    ids.forEach((id) => {
      if (!(id in forwarderEditableMap)) {
        const row = state.forwarderInfos.find((x) => x.id === id)
        forwarderEditableMap[id] = !isForwarderFilled(row)
      }
    })
  },
  { immediate: true },
)

watch(
  () => state.mattelSiteInfos.map((row) => row.id),
  (ids) => {
    const idSet = new Set(ids)
    Object.keys(mattelEditableMap).forEach((id) => {
      if (!idSet.has(id)) delete mattelEditableMap[id]
    })
    ids.forEach((id) => {
      if (!(id in mattelEditableMap)) {
        const row = state.mattelSiteInfos.find((x) => x.id === id)
        mattelEditableMap[id] = !isMattelFilled(row)
      }
    })
  },
  { immediate: true },
)

function submit() {
  const res = submitEntry()
  if (!res.ok) {
    alert(res.message)
    return
  }
  alert(res.message)
}

function fmtUsd(value) {
  return Number(value || 0).toFixed(2)
}

function getEntryStatus(row) {
  if (row?.refundStatus === '已退款') return { label: '已退款', cls: 'bg-emerald-100 text-emerald-700' }
  if (row?.purchaseStatus === 'failed') return { label: '失败', cls: 'bg-orange-100 text-orange-700' }
  return { label: '购买成功', cls: 'bg-blue-100 text-blue-700' }
}

function getGroupProductName(group) {
  const lines = Array.isArray(group?.lines) ? group.lines : []
  if (lines.length === 0) return '-'
  const firstName = String(lines[0]?.name || '').trim() || '-'
  if (lines.length === 1) return firstName
  return `${firstName} +${lines.length - 1}`
}

function isGroupRecorded(groupKey) {
  return existingGroupKeys.value.has(String(groupKey || ''))
}

function getEntryProductName(row) {
  const lines = Array.isArray(row?.lines) ? row.lines : []
  if (lines.length === 0) return '-'
  const firstName = String(lines[0]?.name || '').trim() || '-'
  if (lines.length === 1) return firstName
  return `${firstName} +${lines.length - 1}`
}

function buildNetworkDetailLines(row) {
  return [
    `购买日期: ${row.purchaseDate || '-'}`,
    `付款编号: ${row.paymentBatch || '-'}`,
    `订单USD: ${fmtUsd(row.consumeUSD)}`,
    `购买设备: ${row.purchaseDevice || '-'}`,
    `虚拟机: ${row.virtualMachine ? '是' : '否'}`,
    `网络环境: ${row.networkEnv || '-'}`,
    `VPN节点: ${row.vpnNode || '-'}`,
    `网页浏览器: ${row.browser || '-'}`,
    `用户名: ${row.username || '-'}`,
    `收件人: ${row.recipient || '-'}`,
    `转运公司: ${row.forwarderCompany || '-'}`,
    `转运账号: ${row.forwarderAccount || '-'}`,
    `持有人: ${row.holder || '-'}`,
    `银行卡: ${row.cardLabel || '-'}`,
    `银行卡备注: ${row.cardRemark || '-'}`,
    `Shop快捷支付: ${row.shopQuickPay || '-'}`,
    `备注: ${row.note || '-'}`,
  ]
}

function viewEntryDetail(row) {
  alert(buildNetworkDetailLines(row).join('\n'))
}

function openFailureDialog(row) {
  failureDialog.entryId = row.id
  failureDialog.notifiedAt = row.failureNotifiedAt || ''
  failureDialog.reason = row.failureReason || ''
  failureDialog.refundStatus = row.refundStatus || '未退款'
  failureDialog.refundTime = row.refundTime || ''
  failureDialog.detailLines = buildNetworkDetailLines(row)
  failureDialog.open = true
}

function closeFailureDialog() {
  failureDialog.open = false
  failureDialog.entryId = ''
  failureDialog.notifiedAt = ''
  failureDialog.reason = ''
  failureDialog.refundStatus = '未退款'
  failureDialog.refundTime = ''
  failureDialog.detailLines = []
}

function saveFailureDialog() {
  if (!failureDialog.entryId) return
  markEntryFailure(failureDialog.entryId, {
    notifiedAt: failureDialog.notifiedAt,
    reason: failureDialog.reason,
    refundStatus: failureDialog.refundStatus,
    refundTime: failureDialog.refundTime,
  })
  closeFailureDialog()
  alert('已更新购买失败信息')
}

function toggleForwarderPassword(id) {
  showForwarderPassword[id] = !showForwarderPassword[id]
}

function toggleMattelPassword(id) {
  showMattelPassword[id] = !showMattelPassword[id]
}

function toggleSiteForwarder(siteRow, forwarderId, event) {
  toggleMattelForwarder(siteRow.id, forwarderId, event.target.checked)
}

function isForwarderFilled(row) {
  if (!row) return false
  return Boolean(
    String(row.companyName || '').trim() &&
    String(row.loginUsername || '').trim() &&
    String(row.passwordPrefix || '').trim() &&
    String(row.recipientName || '').trim() &&
    String(row.domesticReceiver || '').trim(),
  )
}

function isMattelFilled(row) {
  if (!row) return false
  return Boolean(
    String(row.loginUsername || '').trim() &&
    String(row.passwordPrefix || '').trim() &&
    String(row.mattelDisplayName || '').trim(),
  )
}

function isForwarderEditable(id) {
  return !!forwarderEditableMap[id]
}

function isMattelEditable(id) {
  return !!mattelEditableMap[id]
}

function clampPasswordPrefix(row, field) {
  const value = String(row?.[field] || '')
  row[field] = value.slice(0, 3)
}

function saveForwarderRow(row) {
  clampPasswordPrefix(row, 'passwordPrefix')
  if (String(row.passwordPrefix || '').trim().length !== 3) {
    alert('密码前三位必须填写3位')
    return
  }
  forwarderEditableMap[row.id] = false
}

function editForwarderRow(id) {
  forwarderEditableMap[id] = true
}

function saveMattelRow(row) {
  clampPasswordPrefix(row, 'passwordPrefix')
  if (String(row.passwordPrefix || '').trim().length !== 3) {
    alert('密码前三位必须填写3位')
    return
  }
  mattelEditableMap[row.id] = false
}

function editMattelRow(id) {
  mattelEditableMap[id] = true
}

function getLockBadge(editable) {
  return editable
    ? { label: '编辑中', cls: 'bg-amber-100 text-amber-700' }
    : { label: '已保存', cls: 'bg-emerald-100 text-emerald-700' }
}

function confirmRemoveForwarder(id) {
  const ok = confirm('删除后将同步清除美泰网站信息中的关联收件人，确认删除吗？')
  if (!ok) return
  removeForwarderInfo(id)
}

function confirmRemoveMattel(id) {
  const ok = confirm('确认删除这条美泰网站信息吗？')
  if (!ok) return
  removeMattelSiteInfo(id)
}

function confirmRemovePaymentCard(id) {
  const ok = confirm('确认删除这张银行卡/账号信息吗？')
  if (!ok) return
  removePaymentCard(id)
}
</script>

<template>
  <div class="space-y-5">
    <div class="apple-card bg-gradient-to-r from-cyan-50 to-white border-cyan-100">
      <div class="flex items-center justify-between gap-4">
        <div>
          <h2 class="text-xl font-bold text-gray-800">美淘记录（独立原型）</h2>
          <p class="text-sm text-gray-500 mt-1">只读引用采购数据，记录独立保存，不影响 ysp-app 源数据。</p>
        </div>
        <div class="text-right text-xs text-gray-500">
          <div>数据源：{{ state.sourceLoadedFrom }}</div>
          <div>加载日期：{{ state.loadedAt }}</div>
        </div>
      </div>
    </div>

    <div class="apple-card p-2">
      <div class="flex gap-2">
        <button
          class="flex-1 py-2.5 rounded-lg font-semibold"
          :class="state.activePage === 'entry' ? 'bg-cyan-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'"
          @click="state.activePage = 'entry'"
        >
          美淘购买信息记录
        </button>
        <button
          class="flex-1 py-2.5 rounded-lg font-semibold"
          :class="state.activePage === 'master' ? 'bg-cyan-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'"
          @click="state.activePage = 'master'"
        >
          帐号与卡片管理
        </button>
      </div>
    </div>

    <template v-if="state.activePage === 'entry'">
      <div class="apple-card">
        <div class="text-sm font-semibold text-gray-700 mb-3">第一组：订单基本信息（只读带入）</div>
        <div class="grid grid-cols-12 gap-3">
          <div class="col-span-12 md:col-span-5">
            <label class="block text-xs text-gray-500 mb-1">购买组点选（美淘）</label>
            <select class="apple-select" :value="state.selectedGroupKey" @change="selectGroup($event.target.value)">
              <option value="">请选择购买组</option>
              <option v-for="g in usPurchaseGroups" :key="g.key" :value="g.key">
                {{ isGroupRecorded(g.key) ? '【已录入】' : '' }}{{ g.date || '-' }} / {{ getGroupProductName(g) }} / {{ g.paymentBatch || '-' }}
              </option>
            </select>
            <div v-if="state.selectedGroupKey && isGroupRecorded(state.selectedGroupKey)" class="mt-1 text-[11px] text-amber-700">
              当前购买组已录入历史记录，若需更新请先删除原记录再重建。
            </div>
          </div>
          <div class="col-span-6 md:col-span-2">
            <label class="block text-xs text-gray-500 mb-1">购买日期</label>
            <input class="apple-input bg-gray-100" :value="entrySnapshot.date" disabled />
          </div>
          <div class="col-span-6 md:col-span-2">
            <label class="block text-xs text-gray-500 mb-1">购买网站</label>
            <input class="apple-input bg-gray-100" :value="entrySnapshot.website" disabled />
          </div>
          <div class="col-span-12 md:col-span-3">
            <label class="block text-xs text-gray-500 mb-1">网站账户</label>
            <input class="apple-input bg-gray-100" :value="entrySnapshot.websiteAccount" disabled />
          </div>
        </div>

        <div class="mt-4 overflow-x-auto border border-gray-100 rounded-lg">
          <table class="apple-table min-w-[760px]">
            <thead>
              <tr>
                <th>SID</th>
                <th>商品名称</th>
                <th class="text-right">数目</th>
                <th class="text-right">官网原价(USD)</th>
                <th class="text-right">运费(USD)</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="line in entrySnapshot.lines" :key="line.lineKey">
                <td>{{ line.sid }}</td>
                <td>{{ line.name }}</td>
                <td class="text-right">{{ line.qty }}</td>
                <td class="text-right">{{ fmtUsd(line.originalPrice) }}</td>
                <td class="text-right">{{ fmtUsd(line.shipping) }}</td>
              </tr>
              <tr v-if="entrySnapshot.lines.length === 0">
                <td colspan="5" class="text-center text-gray-400 py-4">请先选择购买组</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="mt-3 flex justify-end text-sm">
          <div class="bg-cyan-50 border border-cyan-100 rounded px-3 py-2">总计金额（Total USD）：<span class="font-bold text-cyan-700">{{ fmtUsd(entrySnapshot.totalUSD) }}</span></div>
        </div>
      </div>

      <div class="apple-card">
        <div class="text-sm font-semibold text-gray-700 mb-3">第二组：操作环境信息（全点选）</div>
        <div class="grid grid-cols-1 md:grid-cols-5 gap-3">
          <div>
            <label class="block text-xs text-gray-500 mb-1">购买设备</label>
            <select v-model="state.form.purchaseDevice" class="apple-select">
              <option value="">请选择</option>
              <option v-for="v in deviceOptions" :key="v" :value="v">{{ v }}</option>
            </select>
          </div>
          <div class="flex items-end">
            <label class="inline-flex items-center gap-2 text-sm text-gray-700 h-10 px-3 border border-gray-200 rounded-lg bg-white">
              <input v-model="state.form.virtualMachine" type="checkbox" class="rounded border-gray-300" />
              <span>虚拟机</span>
            </label>
          </div>
          <div>
            <label class="block text-xs text-gray-500 mb-1">网络环境</label>
            <select v-model="state.form.networkEnv" class="apple-select">
              <option value="">请选择</option>
              <option v-for="v in networkOptions" :key="v" :value="v">{{ v }}</option>
            </select>
          </div>
          <div>
            <label class="block text-xs text-gray-500 mb-1">VPN节点</label>
            <select v-model="state.form.vpnNode" class="apple-select">
              <option value="">请选择</option>
              <option v-for="v in vpnNodeOptions" :key="v" :value="v">{{ v }}</option>
            </select>
          </div>
          <div>
            <label class="block text-xs text-gray-500 mb-1">网页浏览器</label>
            <select v-model="state.form.browser" class="apple-select">
              <option value="">请选择</option>
              <option v-for="v in browserOptions" :key="v" :value="v">{{ v }}</option>
            </select>
          </div>
        </div>
      </div>

      <div class="apple-card">
        <div class="text-sm font-semibold text-gray-700 mb-3">第三组：网站登录信息</div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label class="block text-xs text-gray-500 mb-1">网站用户名（自动带入）</label>
            <input class="apple-input bg-gray-100" :value="entrySnapshot.username || '-'" disabled />
          </div>
          <div>
            <label class="block text-xs text-gray-500 mb-1">收件人（联动转运）</label>
            <select v-model="state.form.recipientId" class="apple-select">
              <option value="">请选择收件人</option>
              <option v-for="r in recipientOptions" :key="r.id" :value="r.id">{{ r.label }}</option>
            </select>
          </div>
        </div>
        <div class="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-gray-600">
          <div>
            <label class="block text-[11px] text-gray-500 mb-1">转运公司</label>
            <input class="apple-input bg-gray-100" :value="selectedRecipientForwarder?.companyName || '-'" disabled />
          </div>
          <div>
            <label class="block text-[11px] text-gray-500 mb-1">转运账号</label>
            <input class="apple-input bg-gray-100" :value="selectedRecipientForwarder?.account || '-'" disabled />
          </div>
        </div>
      </div>

      <div class="apple-card">
        <div class="text-sm font-semibold text-gray-700 mb-3">第四组：付款信息</div>
        <div class="grid grid-cols-1 md:grid-cols-5 gap-3">
          <div>
            <label class="block text-xs text-gray-500 mb-1">持有人</label>
            <select v-model="state.form.holder" class="apple-select">
              <option>PT</option>
              <option>NT</option>
            </select>
          </div>
          <div class="md:col-span-2">
            <label class="block text-xs text-gray-500 mb-1">银行卡/账号</label>
            <select v-model="state.form.cardId" class="apple-select">
              <option value="">请选择卡片</option>
              <option v-for="c in filteredCardsByHolder" :key="c.id" :value="c.id">{{ c.label }}</option>
            </select>
          </div>
          <div>
            <label class="block text-xs text-gray-500 mb-1">Shop快捷支付</label>
            <select v-model="state.form.shopQuickPay" class="apple-select">
              <option>是</option>
              <option>否</option>
            </select>
          </div>
          <div>
            <label class="block text-xs text-gray-500 mb-1">消费金额(USD)</label>
            <input class="apple-input bg-gray-100" :value="fmtUsd(entrySnapshot.totalUSD)" disabled />
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
          <div>
            <label class="block text-xs text-gray-500 mb-1">实际扣款金额(USD)</label>
            <input v-model="state.form.actualChargeUSD" type="number" step="0.01" class="apple-input" placeholder="默认等于消费金额" />
          </div>
          <div>
            <label class="block text-xs text-gray-500 mb-1">备注</label>
            <input v-model="state.form.note" class="apple-input" placeholder="记录支付特殊情况" />
          </div>
        </div>

        <div class="mt-4 flex justify-end">
          <button class="btn btn-primary" @click="submit">保存美淘记录</button>
        </div>
      </div>

      <div class="apple-card">
        <div class="text-sm font-semibold text-gray-700 mb-3">历史记录过滤（用户名 / 支付卡 / 收件人）</div>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
          <div>
            <label class="block text-xs text-gray-500 mb-1">用户名</label>
            <select v-model="state.filters.username" class="apple-select">
              <option value="">全部</option>
              <option v-for="u in filterUsernameOptions" :key="u" :value="u">{{ u }}</option>
            </select>
          </div>
          <div>
            <label class="block text-xs text-gray-500 mb-1">支付卡</label>
            <select v-model="state.filters.cardId" class="apple-select">
              <option value="">全部</option>
              <option v-for="c in cardFilterOptions" :key="c.id" :value="c.id">{{ c.label }}</option>
            </select>
          </div>
          <div>
            <label class="block text-xs text-gray-500 mb-1">收件人</label>
            <select v-model="state.filters.recipient" class="apple-select">
              <option value="">全部</option>
              <option v-for="r in filterRecipientOptions" :key="r" :value="r">{{ r }}</option>
            </select>
          </div>
        </div>

        <div class="overflow-x-auto border border-gray-100 rounded-lg">
          <table class="apple-table min-w-[1040px]">
            <thead>
              <tr>
                <th>购买日期</th>
                <th>商品名称</th>
                <th>用户名</th>
                <th>收件人</th>
                <th>转运公司</th>
                <th>卡片</th>
                <th>Shop快捷支付</th>
                <th class="text-right">订单USD</th>
                <th>状态</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in filteredEntries" :key="row.id">
                <td>{{ row.purchaseDate }}</td>
                <td>{{ getEntryProductName(row) }}</td>
                <td>{{ row.username }}</td>
                <td>{{ row.recipient }}</td>
                <td>{{ row.forwarderCompany || '-' }}</td>
                <td>{{ row.cardLabel }}</td>
                <td>{{ row.shopQuickPay || '-' }}</td>
                <td class="text-right">{{ fmtUsd(row.consumeUSD) }}</td>
                <td>
                  <span class="inline-flex px-2 py-0.5 rounded text-xs" :class="getEntryStatus(row).cls">{{ getEntryStatus(row).label }}</span>
                </td>
                <td class="text-right whitespace-nowrap">
                  <button class="btn btn-outline btn-sm" @click="viewEntryDetail(row)">网络信息</button>
                  <button class="btn btn-sm ml-1 border border-orange-200 bg-orange-100 text-orange-700 hover:bg-orange-200" @click="openFailureDialog(row)">失败</button>
                  <button class="btn btn-outline btn-sm ml-1" @click="removeEntry(row.id)">删除</button>
                </td>
              </tr>
              <tr v-if="filteredEntries.length === 0">
                <td colspan="10" class="text-center text-gray-400 py-4">暂无记录</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>

    <template v-else>
      <div class="apple-card">
        <div class="text-sm font-semibold text-gray-700 mb-3">A 转运公司信息</div>
        <div class="mb-3 text-xs text-gray-500">字段：转运公司名称、登录用户名、密码前三位、收件人名称、国内收件人（吕/郑/爷）</div>
        <div class="flex justify-end mb-3">
          <button class="btn btn-outline btn-sm" @click="addForwarderInfo">新增转运公司信息</button>
        </div>
        <div class="overflow-x-auto border border-gray-100 rounded-lg">
          <table class="apple-table min-w-[1260px]">
            <thead>
              <tr>
                <th>转运公司名称</th>
                <th>登录用户名</th>
                <th>密码前三位</th>
                <th>收件人名称</th>
                <th>国内收件人</th>
                <th>状态</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in state.forwarderInfos" :key="row.id" :class="isForwarderEditable(row.id) ? '' : 'bg-gray-50'">
                <td>
                  <select v-model="row.companyName" class="apple-select" :disabled="!isForwarderEditable(row.id)" :class="!isForwarderEditable(row.id) ? 'bg-gray-100' : ''">
                    <option value="">请选择</option>
                    <option v-for="x in transferCompanyOptions" :key="x" :value="x">{{ x }}</option>
                  </select>
                </td>
                <td><input v-model="row.loginUsername" class="apple-input" :disabled="!isForwarderEditable(row.id)" :class="!isForwarderEditable(row.id) ? 'bg-gray-100' : ''" placeholder="登录用户名" /></td>
                <td>
                  <div class="flex gap-2">
                    <input
                      :type="showForwarderPassword[row.id] ? 'text' : 'password'"
                      v-model="row.passwordPrefix"
                      class="apple-input w-24"
                      maxlength="3"
                      :disabled="!isForwarderEditable(row.id)"
                      :class="!isForwarderEditable(row.id) ? 'bg-gray-100' : ''"
                      placeholder="前三位"
                      @input="clampPasswordPrefix(row, 'passwordPrefix')"
                    />
                    <button class="btn btn-outline btn-sm" @click="toggleForwarderPassword(row.id)">{{ showForwarderPassword[row.id] ? '隐藏' : '显示' }}</button>
                  </div>
                </td>
                <td><input v-model="row.recipientName" class="apple-input" :disabled="!isForwarderEditable(row.id)" :class="!isForwarderEditable(row.id) ? 'bg-gray-100' : ''" placeholder="收件人名称" /></td>
                <td>
                  <select v-model="row.domesticReceiver" class="apple-select" :disabled="!isForwarderEditable(row.id)" :class="!isForwarderEditable(row.id) ? 'bg-gray-100' : ''">
                    <option v-for="v in domesticReceiverOptions" :key="v" :value="v">{{ v }}</option>
                  </select>
                </td>
                <td>
                  <span class="inline-flex px-2 py-0.5 rounded text-xs" :class="getLockBadge(isForwarderEditable(row.id)).cls">
                    {{ getLockBadge(isForwarderEditable(row.id)).label }}
                  </span>
                </td>
                <td class="text-right whitespace-nowrap">
                  <button v-if="isForwarderEditable(row.id)" class="btn btn-sm" style="background:#06b6d4;color:white" @click="saveForwarderRow(row)">保存</button>
                  <button v-else class="btn btn-outline btn-sm" @click="editForwarderRow(row.id)">编辑</button>
                  <button class="btn btn-outline btn-sm ml-1" @click="confirmRemoveForwarder(row.id)">删除</button>
                </td>
              </tr>
              <tr v-if="state.forwarderInfos.length === 0">
                <td colspan="7" class="text-center text-gray-400 py-4">暂无转运公司信息</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="apple-card">
        <div class="text-sm font-semibold text-gray-700 mb-3">B 美泰网站信息</div>
        <div class="mb-3 text-xs text-gray-500">字段：登录用户名、密码前三位、收件人名称（从转运公司信息多选）、美泰网站显示的称呼</div>
        <div v-if="unknownWebsiteUsernames.length > 0" class="mb-3 text-xs text-orange-700 bg-orange-50 border border-orange-100 rounded px-3 py-2">
          发现购买记录中有新增网站账户未在预置列表：{{ unknownWebsiteUsernames.join('，') }}。请确认后补充映射信息。
        </div>
        <div class="flex justify-end mb-3">
          <button class="btn btn-outline btn-sm" @click="addMattelSiteInfo">新增美泰网站信息</button>
        </div>
        <div class="overflow-x-auto border border-gray-100 rounded-lg">
          <table class="apple-table min-w-[1300px]">
            <thead>
              <tr>
                <th>登录用户名</th>
                <th>密码前三位</th>
                <th>收件人名称（可多选）</th>
                <th>美泰网站显示称呼</th>
                <th>状态</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in state.mattelSiteInfos" :key="row.id" :class="isMattelEditable(row.id) ? '' : 'bg-gray-50'">
                <td>
                  <select v-model="row.loginUsername" class="apple-select" :disabled="!isMattelEditable(row.id)" :class="!isMattelEditable(row.id) ? 'bg-gray-100' : ''">
                    <option v-for="acc in mattelAccountOptions" :key="acc" :value="acc">{{ acc }}</option>
                  </select>
                </td>
                <td>
                  <div class="flex gap-2">
                    <input
                      :type="showMattelPassword[row.id] ? 'text' : 'password'"
                      v-model="row.passwordPrefix"
                      class="apple-input w-24"
                      maxlength="3"
                      :disabled="!isMattelEditable(row.id)"
                      :class="!isMattelEditable(row.id) ? 'bg-gray-100' : ''"
                      placeholder="前三位"
                      @input="clampPasswordPrefix(row, 'passwordPrefix')"
                    />
                    <button class="btn btn-outline btn-sm" @click="toggleMattelPassword(row.id)">{{ showMattelPassword[row.id] ? '隐藏' : '显示' }}</button>
                  </div>
                </td>
                <td>
                  <div class="grid grid-cols-1 md:grid-cols-2 gap-2 min-w-[420px]">
                    <label v-for="fw in state.forwarderInfos" :key="fw.id" class="inline-flex items-center gap-2 text-xs text-gray-600">
                      <input
                        type="checkbox"
                        class="rounded border-gray-300"
                        :checked="(row.forwarderIds || []).includes(fw.id)"
                        :disabled="!isMattelEditable(row.id)"
                        @change="toggleSiteForwarder(row, fw.id, $event)"
                      />
                      <span>{{ fw.recipientName || '-' }}（{{ fw.companyName || '-' }}）</span>
                    </label>
                  </div>
                </td>
                <td><input v-model="row.mattelDisplayName" class="apple-input" :disabled="!isMattelEditable(row.id)" :class="!isMattelEditable(row.id) ? 'bg-gray-100' : ''" placeholder="美泰网站显示的称呼" /></td>
                <td>
                  <span class="inline-flex px-2 py-0.5 rounded text-xs" :class="getLockBadge(isMattelEditable(row.id)).cls">
                    {{ getLockBadge(isMattelEditable(row.id)).label }}
                  </span>
                </td>
                <td class="text-right whitespace-nowrap">
                  <button v-if="isMattelEditable(row.id)" class="btn btn-sm" style="background:#06b6d4;color:white" @click="saveMattelRow(row)">保存</button>
                  <button v-else class="btn btn-outline btn-sm" @click="editMattelRow(row.id)">编辑</button>
                  <button class="btn btn-outline btn-sm ml-1" @click="confirmRemoveMattel(row.id)">删除</button>
                </td>
              </tr>
              <tr v-if="state.mattelSiteInfos.length === 0">
                <td colspan="6" class="text-center text-gray-400 py-4">暂无美泰网站信息</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="apple-card">
        <div class="text-sm font-semibold text-gray-700 mb-3">C 银行卡信息</div>
        <div class="text-xs text-gray-500 mb-3">按规范新增卡片；如是贝宝请填写密码前三位和默认扣卡（写在备注栏）。</div>

        <div class="grid grid-cols-2 md:grid-cols-6 gap-2 mb-4">
          <select v-model="state.addCardForm.holder" class="apple-select">
            <option>PT</option>
            <option>NT</option>
          </select>
          <select v-model="state.addCardForm.bank" class="apple-select">
            <option v-for="b in bankOptions" :key="b" :value="b">{{ b }}</option>
          </select>
          <input v-model="state.addCardForm.identifier" class="apple-input" placeholder="尾号4位或PayPal用户名" />
          <select v-model="state.addCardForm.cardType" class="apple-select">
            <option v-for="t in cardTypeOptions" :key="t" :value="t">{{ t }}</option>
          </select>
          <input v-model="state.addCardForm.remark" class="apple-input" placeholder="备注（贝宝写密码前三位+默认扣卡）" />
          <button class="btn btn-outline" @click="addPaymentCard()">{{ state.cardEditId ? '保存编辑' : '新增卡片' }}</button>
        </div>
        <div v-if="state.cardEditId" class="mb-3 text-right">
          <button class="btn btn-outline btn-sm" @click="cancelEditPaymentCard">取消编辑</button>
        </div>

        <div class="overflow-x-auto border border-gray-100 rounded-lg">
          <table class="apple-table min-w-[1080px]">
            <thead>
              <tr>
                <th>名称</th>
                <th>持有人</th>
                <th>银行</th>
                <th>识别信息</th>
                <th>卡类型</th>
                <th>备注</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="card in state.paymentCards" :key="card.id">
                <td>{{ card.label }}</td>
                <td>{{ card.holder }}</td>
                <td>{{ card.bank }}</td>
                <td>{{ card.identifier || card.tailNo }}</td>
                <td>{{ card.cardType }}</td>
                <td>{{ card.remark || '-' }}</td>
                <td class="text-right whitespace-nowrap">
                  <button class="btn btn-outline btn-sm" @click="startEditPaymentCard(card.id)">编辑</button>
                  <button class="btn btn-outline btn-sm ml-1" @click="confirmRemovePaymentCard(card.id)">删除</button>
                </td>
              </tr>
              <tr v-if="state.paymentCards.length === 0">
                <td colspan="7" class="text-center text-gray-400 py-4">暂无银行卡信息</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>

    <div v-if="!isIntegratedMode" class="apple-card border-yellow-100 bg-yellow-50 text-sm text-yellow-800">
      <span class="font-semibold">当前为原型沙盒：</span>
      侧边栏保留完整结构，但 ysp-app 其他模块已禁用点击；本页删除/保存仅作用于原型内存，不影响采购管理源数据。
    </div>

    <div v-if="failureDialog.open" class="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4">
      <div class="bg-white rounded-xl shadow-xl w-full max-w-2xl p-4 space-y-4">
        <div class="flex items-center justify-between">
          <h3 class="text-base font-semibold text-gray-800">购买失败信息</h3>
          <button class="btn btn-outline btn-sm" @click="closeFailureDialog">关闭</button>
        </div>

        <div class="border border-gray-100 rounded-lg p-3 bg-gray-50">
          <div class="text-xs text-gray-500 mb-2">网络信息（只读）</div>
          <div class="space-y-1 text-sm text-gray-700">
            <div v-for="line in failureDialog.detailLines" :key="line">{{ line }}</div>
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label class="block text-xs text-gray-500 mb-1">A 通知购买失败时间</label>
            <input v-model="failureDialog.notifiedAt" class="apple-input" placeholder="填写多少分钟后或具体日期" />
          </div>
          <div>
            <label class="block text-xs text-gray-500 mb-1">C 是否退款</label>
            <select v-model="failureDialog.refundStatus" class="apple-select">
              <option>未退款</option>
              <option>已退款</option>
            </select>
          </div>
        </div>

        <div>
          <label class="block text-xs text-gray-500 mb-1">B 失败原因</label>
          <input v-model="failureDialog.reason" class="apple-input" placeholder="填写缺货或Cancel邮件里的理由" />
        </div>

        <div v-if="failureDialog.refundStatus === '已退款'">
          <label class="block text-xs text-gray-500 mb-1">退款时间</label>
          <input v-model="failureDialog.refundTime" class="apple-input" placeholder="填写退款时间" />
        </div>

        <div class="flex justify-end gap-2">
          <button class="btn btn-outline" @click="closeFailureDialog">取消</button>
          <button class="btn" style="background:#fb923c;color:#7c2d12" @click="saveFailureDialog">保存购买失败信息</button>
        </div>
      </div>
    </div>
  </div>
</template>
