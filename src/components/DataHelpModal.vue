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
            <div class="font-bold text-gray-900 mb-1">① 本机浏览器（localStorage，约 5MB 上限）</div>
            <p class="text-gray-600">程序每天用的主要存储，里面分三块：</p>
            <ul class="mt-2 space-y-1 list-disc pl-5">
              <li><b>主数据</b>：商品、收支、借贷、转运、美淘、财务结算，以及每日快照。现在约 1MB。</li>
              <li><b>界面状态</b>：云端设置 / 登录 / 同步状态、操作日志（最多 500 条）。</li>
              <li><b>回朔点</b>：采纳云端前、导入文件前的备份，最多 1MB / 20 条。</li>
            </ul>
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
              若每日备份启用，每天会存一份完整数据文件：<code class="bg-white/70 px-1 rounded">PhtonRing数据_YYYY-MM-DD.json</code>。
              不受 5MB 限制，可以一直累积。<b>这是唯一存在浏览器之外的数据。</b>
            </p>
          </div>
        </div>
      </section>

      <section>
        <h4 class="text-lg font-bold text-gray-900 mb-3">四类数据各自在哪</h4>
        <table class="w-full text-left border border-gray-200 rounded-lg text-sm">
          <thead>
            <tr class="bg-gray-50 text-gray-900">
              <th class="px-3 py-2 border-b border-gray-200">数据</th>
              <th class="px-3 py-2 border-b border-gray-200">位置</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td class="px-3 py-2 border-b border-gray-100">主数据（商品 / 收支 / 负债）</td>
              <td class="px-3 py-2 border-b border-gray-100">浏览器 + 云端单行 + Downloads 文件</td>
            </tr>
            <tr>
              <td class="px-3 py-2 border-b border-gray-100">每日快照（负债历史等）</td>
              <td class="px-3 py-2 border-b border-gray-100">嵌在主数据里，跟着进云端和 Downloads</td>
            </tr>
            <tr>
              <td class="px-3 py-2 border-b border-gray-100">回朔点（完整数据快照）</td>
              <td class="px-3 py-2 border-b border-gray-100">只在浏览器，1MB / 20 条上限</td>
            </tr>
            <tr>
              <td class="px-3 py-2">操作日志</td>
              <td class="px-3 py-2">浏览器 + 每个 Downloads 文件</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section>
        <h4 class="text-lg font-bold text-gray-900 mb-3">几个要点</h4>
        <ul class="space-y-2 list-disc pl-5">
          <li>云端只存一份最新数据，被覆盖就没有旧版。</li>
          <li>每日快照没有上限，历史会越攒越多。</li>
          <li>回朔点不是按天存的，只覆盖最近几次「采纳云端 / 导入文件」事件。</li>
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
            <li><b>回朔点</b>：是「短时后悔药」。只保最近几次采纳云端 / 导入文件时的「刚才」。浏览器清空它也一起没。</li>
            <li><b>Downloads 文件</b>：是唯一真正在浏览器之外的数据。浏览器清空、换电脑、重装，它都还在。</li>
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
              <td class="px-3 py-2 border-b border-gray-100">本地主数据还在 → 重新上传；回朔点可撤销最近一次采纳</td>
            </tr>
            <tr>
              <td class="px-3 py-2 border-b border-gray-100">浏览器数据被清空</td>
              <td class="px-3 py-2 border-b border-gray-100">只有 Downloads 文件 → 导入最新一份</td>
            </tr>
            <tr>
              <td class="px-3 py-2 border-b border-gray-100">换电脑 / 重装浏览器</td>
              <td class="px-3 py-2 border-b border-gray-100">只有 Downloads 文件 → 导入</td>
            </tr>
            <tr>
              <td class="px-3 py-2 border-b border-gray-100">采纳云端 / 导入文件搞砸了</td>
              <td class="px-3 py-2 border-b border-gray-100">操作日志 → 数据回溯 / 恢复到最近一次导入前</td>
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
          <li><b>导出备份</b>：侧边栏 → 数据操作 → 导出备份，会下载一个「PhtonRing数据Manual_今天日期.json」文件。每日自动备份则是「PhtonRing数据_日期.json」。</li>
          <li><b>导入恢复</b>：侧边栏 → 数据操作 → 导入数据，选择要恢复的那个文件。</li>
          <li><b>撤销采纳 / 导入</b>：侧边栏 → 操作日志 → 数据回溯，或「恢复到最近一次导入前」。</li>
          <li><b>云端登录 / 同步</b>：侧边栏 → 云端同步。</li>
        </ul>
      </section>

      <div class="rounded-lg bg-red-50 border border-red-200 p-4">
        <div class="font-bold text-red-700 mb-1">重要提醒</div>
        <p class="text-red-600">
          回朔点和主数据都在浏览器里，<b>浏览器数据一清，两个一起没</b>。建议每天把导出的备份文件存到安全的地方（网盘 / U盘）。
        </p>
      </div>
    </div>
  </GlassModal>
</template>
