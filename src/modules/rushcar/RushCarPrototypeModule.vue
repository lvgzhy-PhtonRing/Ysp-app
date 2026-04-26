<script setup>
import { computed, watch } from 'vue'
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
  selectedGroup,
  entrySnapshot,
  usernameOptions,
  recipientOptions,
  filteredCardsByHolder,
  selectedCard,
  filteredEntries,
  filterUsernameOptions,
  filterRecipientOptions,
  filterWebsiteOptions,
  filterForwarderOptions,
  selectedRecipientForwarder,
  selectGroup,
  applyMasterRecipientDefault,
  addMasterAccount,
  removeMasterAccount,
  addWebsiteMapping,
  removeWebsiteMapping,
  addPaymentCard,
  removeEntry,
  submitEntry,
} = useRushCarPrototype(props.sourceData)

const browserOptions = ['AdsPower', 'HubStudio', 'BitBrowser', 'Chrome有痕', 'Chrome无痕', 'Edge有痕', 'Edge无痕', '设备自带浏览器']
const deviceOptions = ['台式机NT', '妈妈电脑P53', '爸爸小电脑ROG13', 'iPad', '妈妈手机Huawei', '爸爸手机Oppo']
const networkOptions = ['虹口家网', '宝山家网', '电信移动数据', '联通移动数据', '移动移动数据']
const vpnNodeOptions = ['美国', '日本', '香港', '马来西亚', '新加坡']
const bankOptions = ['工商', '招商', '中行', '贝宝']
const cardTypeOptions = ['Visa', 'Visa数字', 'Master', 'JCB', 'AE', '银联', 'Paypal']

const cardFilterOptions = computed(() => {
  const ids = new Set(filteredEntries.value.map((row) => row.cardId).filter(Boolean))
  return state.paymentCards.filter((c) => ids.has(c.id))
})

watch(
  () => state.form.username,
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

function fmtDiff(value) {
  const n = Number(value || 0)
  const sign = n > 0 ? '+' : ''
  return `${sign}${n.toFixed(2)}`
}
</script>

<template>
  <div class="space-y-5">
    <div class="apple-card bg-gradient-to-r from-cyan-50 to-white border-cyan-100">
      <div class="flex items-center justify-between gap-4">
        <div>
          <h2 class="text-xl font-bold text-gray-800">抢车记录（独立原型）</h2>
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
          账号与转运管理
        </button>
      </div>
    </div>

    <template v-if="state.activePage === 'entry'">
      <div class="apple-card">
        <div class="text-sm font-semibold text-gray-700 mb-3">第一组：订单基本信息（只读带入）</div>
        <div class="grid grid-cols-12 gap-3">
          <div class="col-span-12 md:col-span-5">
            <label class="block text-xs text-gray-500 mb-1">购买组点选（美淘近30天）</label>
            <select class="apple-select" :value="state.selectedGroupKey" @change="selectGroup($event.target.value)">
              <option value="">请选择购买组</option>
              <option v-for="g in usPurchaseGroups" :key="g.key" :value="g.key">
                {{ g.date }} / {{ g.purchaseGroupId }} / {{ g.website }} / {{ g.paymentBatch }}
              </option>
            </select>
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
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label class="block text-xs text-gray-500 mb-1">购买设备</label>
            <select v-model="state.form.purchaseDevice" class="apple-select">
              <option value="">请选择</option>
              <option v-for="v in deviceOptions" :key="v" :value="v">{{ v }}</option>
            </select>
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
        <div class="text-sm font-semibold text-gray-700 mb-3">第三组：网站登录信息（用户名联动收件人）</div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label class="block text-xs text-gray-500 mb-1">网站用户名</label>
            <select v-model="state.form.username" class="apple-select">
              <option value="">请选择用户名</option>
              <option v-for="u in usernameOptions" :key="u" :value="u">{{ u }}</option>
            </select>
          </div>
          <div>
            <label class="block text-xs text-gray-500 mb-1">收件人（联动）</label>
            <select v-model="state.form.recipient" class="apple-select">
              <option value="">请选择收件人</option>
              <option v-for="r in recipientOptions" :key="r" :value="r">{{ r }}</option>
            </select>
          </div>
        </div>
        <div class="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3 text-xs text-gray-600">
          <div>
            <label class="block text-[11px] text-gray-500 mb-1">转运公司（收件人映射）</label>
            <input class="apple-input bg-gray-100" :value="selectedRecipientForwarder.company || '-'" disabled />
          </div>
          <div>
            <label class="block text-[11px] text-gray-500 mb-1">转运账号</label>
            <input class="apple-input bg-gray-100" :value="selectedRecipientForwarder.account || '-'" disabled />
          </div>
          <div>
            <label class="block text-[11px] text-gray-500 mb-1">地址别名</label>
            <input class="apple-input bg-gray-100" :value="selectedRecipientForwarder.addressAlias || '-'" disabled />
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

        <div class="mt-4 border-t border-gray-100 pt-3">
          <div class="text-xs text-gray-500 mb-2">按规范新增卡片</div>
          <div class="grid grid-cols-2 md:grid-cols-5 gap-2">
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
            <button class="btn btn-outline" @click="addPaymentCard()">新增卡片</button>
          </div>
        </div>

        <div class="mt-4 flex justify-end">
          <button class="btn btn-primary" @click="submit">保存抢车记录</button>
        </div>
      </div>

      <div class="apple-card">
        <div class="text-sm font-semibold text-gray-700 mb-3">历史记录过滤（用户名 / 支付卡 / 收件人 / 网站 / 转运公司）</div>
        <div class="grid grid-cols-1 md:grid-cols-5 gap-3 mb-3">
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
          <div>
            <label class="block text-xs text-gray-500 mb-1">购买网站</label>
            <select v-model="state.filters.website" class="apple-select">
              <option value="">全部</option>
              <option v-for="w in filterWebsiteOptions" :key="w" :value="w">{{ w }}</option>
            </select>
          </div>
          <div>
            <label class="block text-xs text-gray-500 mb-1">转运公司</label>
            <select v-model="state.filters.forwarder" class="apple-select">
              <option value="">全部</option>
              <option v-for="f in filterForwarderOptions" :key="f" :value="f">{{ f }}</option>
            </select>
          </div>
        </div>

        <div class="overflow-x-auto border border-gray-100 rounded-lg">
          <table class="apple-table min-w-[1360px]">
            <thead>
              <tr>
                <th>创建时间</th>
                <th>购买日期</th>
                <th>购买组</th>
                <th>购买网站</th>
                <th>用户名</th>
                <th>收件人</th>
                <th>转运公司</th>
                <th>卡片</th>
                <th class="text-right">订单USD</th>
                <th class="text-right">实扣USD</th>
                <th class="text-right">差额USD</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in filteredEntries" :key="row.id">
                <td>{{ new Date(row.createdAt).toLocaleString() }}</td>
                <td>{{ row.purchaseDate }}</td>
                <td>{{ row.purchaseGroupId }} / {{ row.paymentBatch }}</td>
                <td>{{ row.website }}</td>
                <td>{{ row.username }}</td>
                <td>{{ row.recipient }}</td>
                <td>{{ row.forwarderCompany || '-' }}</td>
                <td>{{ row.cardLabel }}</td>
                <td class="text-right">{{ fmtUsd(row.consumeUSD) }}</td>
                <td class="text-right">{{ fmtUsd(row.actualChargeUSD) }}</td>
                <td class="text-right" :class="Number(row.chargeDiffUSD || 0) === 0 ? 'text-gray-500' : Number(row.chargeDiffUSD || 0) > 0 ? 'text-red-600' : 'text-green-600'">{{ fmtDiff(row.chargeDiffUSD) }}</td>
                <td class="text-right"><button class="btn btn-outline btn-sm" @click="removeEntry(row.id)">删除</button></td>
              </tr>
              <tr v-if="filteredEntries.length === 0">
                <td colspan="12" class="text-center text-gray-400 py-4">暂无记录</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>

    <template v-else>
      <div class="apple-card">
        <div class="flex items-center justify-between mb-3">
          <div class="text-sm font-semibold text-gray-700">账号与转运管理（Excel风格）</div>
          <button class="btn btn-outline btn-sm" @click="addMasterAccount">新增一行</button>
        </div>

        <div class="overflow-x-auto border border-gray-100 rounded-lg">
          <table class="apple-table min-w-[1600px]">
            <thead>
              <tr>
                <th>网站用户名</th>
                <th>密码</th>
                <th>收件人A</th>
                <th>收件人B</th>
                <th>收件人C</th>
                <th>转运A</th>
                <th>A账号</th>
                <th>A密码</th>
                <th>转运B</th>
                <th>B账号</th>
                <th>B密码</th>
                <th>转运C</th>
                <th>C账号</th>
                <th>C密码</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in state.masterAccounts" :key="row.id">
                <td><input v-model="row.username" class="apple-input" placeholder="用户名邮箱" /></td>
                <td><input v-model="row.password" type="password" class="apple-input" placeholder="密码" /></td>
                <td><input v-model="row.recipientA" class="apple-input" /></td>
                <td><input v-model="row.recipientB" class="apple-input" /></td>
                <td><input v-model="row.recipientC" class="apple-input" /></td>
                <td><input v-model="row.forwarderA" class="apple-input" /></td>
                <td><input v-model="row.forwarderAAccount" class="apple-input" /></td>
                <td><input v-model="row.forwarderAPassword" type="password" class="apple-input" /></td>
                <td><input v-model="row.forwarderB" class="apple-input" /></td>
                <td><input v-model="row.forwarderBAccount" class="apple-input" /></td>
                <td><input v-model="row.forwarderBPassword" type="password" class="apple-input" /></td>
                <td><input v-model="row.forwarderC" class="apple-input" /></td>
                <td><input v-model="row.forwarderCAccount" class="apple-input" /></td>
                <td><input v-model="row.forwarderCPassword" type="password" class="apple-input" /></td>
                <td class="text-right"><button class="btn btn-outline btn-sm" @click="removeMasterAccount(row.id)">删除</button></td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="text-xs text-gray-500 mt-3">
          页面2的点选项会实时联动页面1，不写入采购源数据；密码字段建议仅填脱敏值。
        </div>
      </div>

      <div class="apple-card">
        <div class="flex items-center justify-between mb-3">
          <div class="text-sm font-semibold text-gray-700">网站映射规则（自动化）</div>
          <button class="btn btn-outline btn-sm" @click="addWebsiteMapping">新增映射</button>
        </div>
        <div class="overflow-x-auto border border-gray-100 rounded-lg">
          <table class="apple-table min-w-[720px]">
            <thead>
              <tr>
                <th>匹配关键词</th>
                <th>映射域名</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in state.websiteMappings" :key="row.id">
                <td><input v-model="row.match" class="apple-input" placeholder="如：mattel" /></td>
                <td><input v-model="row.target" class="apple-input" placeholder="如：creations.mattel.com" /></td>
                <td class="text-right"><button class="btn btn-outline btn-sm" @click="removeWebsiteMapping(row.id)">删除</button></td>
              </tr>
              <tr v-if="state.websiteMappings.length === 0">
                <td colspan="3" class="text-center text-gray-400 py-4">暂无映射规则</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>

    <div class="apple-card border-yellow-100 bg-yellow-50 text-sm text-yellow-800">
      <span class="font-semibold">当前为原型沙盒：</span>
      侧边栏保留完整结构，但 ysp-app 其他模块已禁用点击；本页删除/保存仅作用于原型内存，不影响采购管理源数据。
    </div>
  </div>
</template>
