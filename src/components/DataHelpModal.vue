<script setup>
import GlassModal from './GlassModal.vue'

const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['update:modelValue'])

function close() {
  emit('update:modelValue', false)
}
</script>

<template>
  <GlassModal
    :model-value="modelValue"
    @update:model-value="close"
    panel-class="w-full max-w-3xl relative max-h-[85vh] flex flex-col p-0"
    :close-on-overlay="true"
  >
    <div class="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
      <h3 class="text-xl font-bold">数据说明</h3>
      <button class="btn btn-outline btn-sm" @click="close">关闭</button>
    </div>

    <div class="flex-1 overflow-y-auto px-6 py-5 space-y-8 text-sm text-gray-700 leading-relaxed">
      <!-- ============ 第一部分：储存位置 ============ -->
      <section>
        <h4 class="text-lg font-bold text-gray-900 mb-3">一、你的数据存在哪里</h4>

        <div class="space-y-3">
          <div class="rounded-lg bg-blue-50/60 border border-blue-100 p-4">
            <div class="font-bold text-gray-900 mb-1">① 本机浏览器（localStorage，容量因浏览器而异）</div>
            <p class="text-gray-600">程序每天用的主要存储，里面分三块：</p>
            <ul class="mt-2 space-y-1 list-disc pl-5">
              <li><b>主数据</b>：Papa / Payton 商品及 Owner 归属、收支和借贷、转运、美淘、Payton 资金与贷款、财务结算及每日快照。已售商品的销售渠道也保存在商品记录中。数据量随记录和快照增长。</li>
              <li><b>界面状态</b>：云端设置 / 登录 / 同步状态、操作日志（最多 500 条）。</li>
              <li><b>回溯点</b>：采纳云端前、导入文件前的备份，最多约 1MB / 20 条；本机空间不足时，旧回溯点可能被清理。</li>
            </ul>
            <p class="mt-2 text-gray-600">浏览器本地存储有容量限制，主数据空间不足时可能无法保存；请定期导出备份，并确认下载文件确实生成。</p>
          </div>

          <div class="rounded-lg bg-green-50/60 border border-green-100 p-4">
            <div class="font-bold text-gray-900 mb-1">② Supabase 云端（单行）</div>
            <p class="text-gray-600">
              与本地主数据同步的一份副本，内容一致。<b>注意：它是整行覆盖式的</b>，只留最新一份，没有历史版本。
            </p>
          </div>

          <div class="rounded-lg bg-amber-50/60 border border-amber-100 p-4">
            <div class="font-bold text-gray-900 mb-1">③ 本机 Downloads 文件夹（每日 JSON 文件）</div>
            <p class="text-gray-600">
              每天页面可见时首次保存会尝试下载一份完整业务数据文件：<code class="bg-white/70 px-1 rounded">PhtonRing数据_YYYY-MM-DD.json</code>。
              浏览器可能拦截自动下载，请确认文件已生成；未生成时请使用“导出备份”。文件保存在浏览器之外，可另存到网盘或 U 盘。
            </p>
          </div>
        </div>
      </section>

      <section>
        <h4 class="text-lg font-bold text-gray-900 mb-3">数据各自保存在哪里</h4>
        <table class="w-full text-left border border-gray-200 rounded-lg text-sm">
          <thead>
            <tr class="bg-gray-50 text-gray-900">
              <th class="px-3 py-2 border-b border-gray-200">数据</th>
              <th class="px-3 py-2 border-b border-gray-200">位置</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td class="px-3 py-2 border-b border-gray-100">主数据（商品、Owner、销售渠道、资金 / 负债等）</td>
              <td class="px-3 py-2 border-b border-gray-100">浏览器 + 云端单行 + Downloads 文件</td>
            </tr>
            <tr>
              <td class="px-3 py-2 border-b border-gray-100">每日快照（负债历史等）</td>
              <td class="px-3 py-2 border-b border-gray-100">嵌在主数据里，跟着进云端和 Downloads</td>
            </tr>
            <tr>
              <td class="px-3 py-2 border-b border-gray-100">回溯点（完整数据快照）</td>
              <td class="px-3 py-2 border-b border-gray-100">只在浏览器，1MB / 20 条上限</td>
            </tr>
            <tr>
              <td class="px-3 py-2">操作日志</td>
              <td class="px-3 py-2">浏览器 + 每日自动备份文件；手动导出不包含日志</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section>
        <h4 class="text-lg font-bold text-gray-900 mb-3">几个要点</h4>
        <ul class="space-y-2 list-disc pl-5">
          <li>云端只存一份最新数据，被覆盖就没有旧版。</li>
          <li>每日快照没有上限，历史会越攒越多。</li>
          <li>回溯点不是按天存的，只覆盖最近几次「采纳云端 / 导入文件」事件。</li>
          <li>商品的 Owner、销售渠道，以及 Payton 资金和贷款属于主数据，会随完整业务数据一起同步和导出。</li>
          <li>导入旧备份不会自动补回之后新增的 Payton 商品或资金记录；请选择包含这些数据的备份。</li>
          <li>撤销 / 重做只存在于内存，刷新页面就没了。</li>
        </ul>
      </section>

      <!-- ============ 第二部分：丢失恢复指南 ============ -->
      <section>
        <h4 class="text-lg font-bold text-gray-900 mb-3">二、数据丢了怎么办</h4>

        <div class="space-y-2">
          <div class="font-bold text-gray-900">三样东西的分工</div>
          <ul class="space-y-2 list-disc pl-5">
            <li><b>主数据</b>：是「当下的数据」本身，不是备份。云端坏了它可以救急（重新上传），但它自己也在浏览器里，浏览器清空它也一起没。</li>
            <li><b>回溯点</b>：是「短时后悔药」。只保最近几次采纳云端 / 导入文件时的「刚才」。浏览器清空它也一起没。</li>
            <li><b>Downloads 文件</b>：独立于浏览器本地存储的备份。浏览器清空或更换电脑时，可导入备份恢复；建议再复制到网盘 / U 盘。</li>
          </ul>
        </div>
      </section>

      <section>
        <h4 class="text-lg font-bold text-gray-900 mb-3">不同丢失场景该靠哪个</h4>
        <table class="w-full text-left border border-gray-200 rounded-lg text-sm">
          <thead>
            <tr class="bg-gray-50 text-gray-900">
              <th class="px-3 py-2 border-b border-gray-200">丢的是</th>
              <th class="px-3 py-2 border-b border-gray-200">靠什么救</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td class="px-3 py-2 border-b border-gray-100">云端被覆盖 / 损坏</td>
              <td class="px-3 py-2 border-b border-gray-100">本地主数据还在 → 重新上传；回溯点可撤销最近一次采纳</td>
            </tr>
            <tr>
              <td class="px-3 py-2 border-b border-gray-100">浏览器数据被清空</td>
              <td class="px-3 py-2 border-b border-gray-100">云同步已启用且云端数据完好时可从云端恢复；否则导入 Downloads 中最新备份</td>
            </tr>
            <tr>
              <td class="px-3 py-2 border-b border-gray-100">换电脑 / 重装浏览器</td>
              <td class="px-3 py-2 border-b border-gray-100">从完好的云端数据恢复，或导入 Downloads / 网盘 / U 盘里的备份</td>
            </tr>
            <tr>
              <td class="px-3 py-2 border-b border-gray-100">采纳云端 / 导入文件搞砸了</td>
              <td class="px-3 py-2 border-b border-gray-100">操作日志 → 数据回溯 / 恢复到最近一次导入前；回溯点仅保存在本机</td>
            </tr>
            <tr>
              <td class="px-3 py-2">想找回几天 / 几周前的数据</td>
              <td class="px-3 py-2">找对应日期的 Downloads 文件导入</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section>
        <h4 class="text-lg font-bold text-gray-900 mb-3">怎么操作</h4>
        <ul class="space-y-2 list-disc pl-5">
          <li><b>导出备份</b>：侧边栏 → 数据操作 → 导出备份，会下载一个「PhtonRing数据Manual_今天日期.json」文件，包含商品、Owner、销售渠道、Payton 资金等业务数据及每日快照，不包含操作日志。每日自动备份文件名为「PhtonRing数据_日期.json」，并包含当时的操作日志。</li>
          <li><b>报税工作簿</b>：侧边栏 → 数据操作 → 报税工作簿，选择纳税主体、Owner 和期间后下载 Excel。销售按已确认的入账日筛选，不显示下单日；未确认交易、缺失日期及税务分类问题列入“待确认事项”。工作簿只用于准备和人工复核，不计算税额、不提交申报，也不会上传数据。</li>
          <li><b>导入恢复</b>：侧边栏 → 数据操作 → 导入数据，选择要恢复的那个文件。</li>
          <li><b>撤销采纳 / 导入</b>：侧边栏 → 操作日志 → 数据回溯，或「恢复到最近一次导入前」。</li>
          <li><b>云端登录 / 同步</b>：侧边栏 → 云端同步。</li>
        </ul>
      </section>

      <div class="rounded-lg bg-red-50 border border-red-200 p-4">
        <div class="font-bold text-red-700 mb-1">重要提醒</div>
        <p class="text-red-600">
          回溯点和主数据都在浏览器里，浏览器数据清除后会一起丢失；云端只有最新副本，也没有历史版本。建议定期导出备份，确认文件已下载，并另存到安全位置（网盘 / U 盘）。
        </p>
      </div>
    </div>
  </GlassModal>
</template>
