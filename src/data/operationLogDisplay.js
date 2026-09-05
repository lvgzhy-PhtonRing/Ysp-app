// 操作日志展示层：第一层简要语句 + 第二层结构化区块
// 纯函数，不依赖 Vue / DOM。旧日志（缺字段）一律回退为 log.message。

import { FIELD_LABEL_MAP } from './store'

// ── 类型元数据（由 App.vue 迁出，移除 summary 函数，改用 getLogBrief） ──

export const LOG_TYPE_META = {
  app_import: { label: '系统导入', color: 'text-teal-600', icon: 'fa-solid fa-upload', pillClass: 'bg-teal-100 text-teal-700' },
  app_export: { label: '系统导出', color: 'text-blue-600', icon: 'fa-solid fa-download', pillClass: 'bg-blue-100 text-blue-700' },
  app_undo: { label: '系统撤销', color: 'text-orange-600', icon: 'fa-solid fa-rotate-left', pillClass: 'bg-orange-100 text-orange-700' },
  app_redo: { label: '系统重做', color: 'text-emerald-600', icon: 'fa-solid fa-rotate-right', pillClass: 'bg-emerald-100 text-emerald-700' },
  app_auto_backup: { label: '系统备份', color: 'text-teal-600', icon: 'fa-solid fa-floppy-disk', pillClass: 'bg-teal-100 text-teal-700' },
  cloud_settings: { label: '云端', color: 'text-cyan-600', icon: 'fa-solid fa-cloud', pillClass: 'bg-cyan-100 text-cyan-700' },
  cloud_signin: { label: '云端', color: 'text-cyan-600', icon: 'fa-solid fa-user-check', pillClass: 'bg-cyan-100 text-cyan-700' },
  cloud_signout: { label: '云端', color: 'text-cyan-600', icon: 'fa-solid fa-user-slash', pillClass: 'bg-cyan-100 text-cyan-700' },
  cloud_sync: { label: '云端', color: 'text-cyan-600', icon: 'fa-solid fa-arrows-rotate', pillClass: 'bg-cyan-100 text-cyan-700' },
  cloud_pull: { label: '云端', color: 'text-cyan-600', icon: 'fa-solid fa-cloud-arrow-down', pillClass: 'bg-cyan-100 text-cyan-700' },
  cloud_conflict: { label: '云端冲突', color: 'text-orange-600', icon: 'fa-solid fa-triangle-exclamation', pillClass: 'bg-orange-100 text-orange-700' },
  purchase_add: { label: '采购新增', color: 'text-yellow-600', icon: 'fa-solid fa-plus', pillClass: 'bg-yellow-100 text-yellow-700' },
  purchase_transfer: { label: '采购转运', color: 'text-amber-600', icon: 'fa-solid fa-truck', pillClass: 'bg-amber-100 text-amber-700' },
  purchase_transfer_edit: { label: '采购转运编辑', color: 'text-blue-600', icon: 'fa-solid fa-pen-to-square', pillClass: 'bg-blue-100 text-blue-700' },
  purchase_transfer_delete: { label: '采购转运', color: 'text-amber-600', icon: 'fa-solid fa-truck-ramp-box', pillClass: 'bg-amber-100 text-amber-700' },
  purchase_edit: { label: '采购编辑', color: 'text-blue-600', icon: 'fa-solid fa-pen', pillClass: 'bg-blue-100 text-blue-700' },
  purchase_delete: { label: '采购删除', color: 'text-red-600', icon: 'fa-solid fa-trash', pillClass: 'bg-red-100 text-red-700' },
  purchase_to_inventory: { label: '采购入库', color: 'text-green-600', icon: 'fa-solid fa-box', pillClass: 'bg-green-100 text-green-700' },
  purchase_batch_to_inventory: { label: '采购入库', color: 'text-green-600', icon: 'fa-solid fa-boxes-stacked', pillClass: 'bg-green-100 text-green-700' },
  purchase_group_edit: { label: '购买组编辑', color: 'text-blue-600', icon: 'fa-solid fa-diagram-project', pillClass: 'bg-blue-100 text-blue-700' },
  inventory_manual_add: { label: '库存新增', color: 'text-blue-600', icon: 'fa-solid fa-bolt', pillClass: 'bg-blue-100 text-blue-700' },
  inventory_edit: { label: '库存编辑', color: 'text-blue-600', icon: 'fa-solid fa-pen', pillClass: 'bg-blue-100 text-blue-700' },
  inventory_unlist: { label: '库存下架', color: 'text-amber-600', icon: 'fa-solid fa-arrow-down', pillClass: 'bg-amber-100 text-amber-700' },
  inventory_delete: { label: '库存删除', color: 'text-red-600', icon: 'fa-solid fa-trash', pillClass: 'bg-red-100 text-red-700' },
  inventory_long_term: { label: '库存长线', color: 'text-purple-600', icon: 'fa-solid fa-infinity', pillClass: 'bg-purple-100 text-purple-700' },
  inventory_sales_sync: { label: '库存销售同步', color: 'text-green-600', icon: 'fa-solid fa-arrows-rotate', pillClass: 'bg-green-100 text-green-700' },
  sales_submit: { label: '销售新增', color: 'text-green-600', icon: 'fa-solid fa-cash-register', pillClass: 'bg-green-100 text-green-700' },
  sales_edit: { label: '销售编辑', color: 'text-blue-600', icon: 'fa-solid fa-pen', pillClass: 'bg-blue-100 text-blue-700' },
  sales_rollback: { label: '销售回滚', color: 'text-red-600', icon: 'fa-solid fa-rotate-left', pillClass: 'bg-red-100 text-red-700' },
  sales_unlist: { label: '销售下架', color: 'text-amber-600', icon: 'fa-solid fa-arrow-down', pillClass: 'bg-amber-100 text-amber-700' },
  finance_add_record: { label: '收支新增', color: 'text-indigo-600', icon: 'fa-solid fa-receipt', pillClass: 'bg-indigo-100 text-indigo-700' },
  finance_delete_record: { label: '收支删除', color: 'text-red-600', icon: 'fa-solid fa-trash', pillClass: 'bg-red-100 text-red-700' },
  finance_update_record: { label: '收支编辑', color: 'text-blue-600', icon: 'fa-solid fa-pen', pillClass: 'bg-blue-100 text-blue-700' },
  finance_add_loan: { label: '借贷新增', color: 'text-yellow-600', icon: 'fa-solid fa-hand-holding-dollar', pillClass: 'bg-yellow-100 text-yellow-700' },
  finance_update_loan: { label: '借贷编辑', color: 'text-blue-600', icon: 'fa-solid fa-pen', pillClass: 'bg-blue-100 text-blue-700' },
  finance_repaid: { label: '借贷归还', color: 'text-gray-600', icon: 'fa-solid fa-check', pillClass: 'bg-gray-100 text-gray-700' },
  finance_delete_loan: { label: '借贷删除', color: 'text-red-600', icon: 'fa-solid fa-trash', pillClass: 'bg-red-100 text-red-700' },
  calc_update: { label: '计算器', color: 'text-blue-600', icon: 'fa-solid fa-calculator', pillClass: 'bg-blue-100 text-blue-700' },
  home_calc: { label: '计算器', color: 'text-blue-600', icon: 'fa-solid fa-calculator', pillClass: 'bg-blue-100 text-blue-700' },
  market_price_update: { label: '市价更新', color: 'text-blue-600', icon: 'fa-solid fa-chart-line', pillClass: 'bg-blue-100 text-blue-700' },
}

const FALLBACK_META = { label: '未知', color: 'text-gray-500', icon: 'fa-solid fa-circle-info', pillClass: 'bg-gray-100 text-gray-700' }

// ── 字段/取值中文化 ────────────────────────────────────────────

const KEY_LABEL = Object.assign(
  {},
  FIELD_LABEL_MAP,
  {
    itemId: '商品ID',
    sid: 'SID',
    transferId: '转运ID',
    purchaseGroupId: '购买组',
    recordId: '收支ID',
    loanId: '借贷ID',
    deletedCount: '件数',
    count: '件数',
    totalItems: '件数',
    totalSids: 'SID数',
    affected: '影响件数',
    linkedCount: '联动件数',
    qty: '数量',
    reason: '原因',
    field: '参数',
    before: '修改前',
    after: '修改后',
    record: '完整记录',
    loan: '完整借贷',
    transfer: '完整转运',
    file: '文件',
    fileName: '文件名',
    error: '错误',
    category: '大类',
    paymentBatch: '支付批次',
    inStockDate: '入库日期',
    groupPriceBefore: '组价前',
    groupPriceAfter: '组价后',
  },
)

const STATUS_LABEL = { inventory: '库存', purchase: '采购', sold: '已售', unlisted: '已下架' }
const TRANSFER_STATUS_LABEL = { pending: '待转运', completed: '已转运' }

export function getLogMeta(type) {
  return LOG_TYPE_META[type] || FALLBACK_META
}

export function getLogModule(type) {
  if (!type) return '-'
  const [mod] = String(type).split('_')
  const map = {
    app: '系统',
    cloud: '云端',
    purchase: '采购',
    inventory: '库存',
    sales: '销售',
    finance: '公共收支',
    home: '数据透视',
    calc: '数据透视',
    market: '市场价格',
  }
  return map[mod] || mod
}

export function fieldLabel(key) {
  return KEY_LABEL[key] || key || '-'
}

function fmtValue(value) {
  if (value === null || value === undefined || value === '') return '-'
  if (typeof value === 'number') return '¥' + Number(value).toFixed(0)
  if (typeof value === 'boolean') return value ? '是' : '否'
  return String(value)
}

function toCompactJson(value) {
  try {
    return JSON.stringify(value)
  } catch (_) {
    return String(value)
  }
}

function changesBrief(changes) {
  const parts = []
  Object.keys(changes || {}).forEach((key) => {
    const entry = changes[key]
    if (entry && typeof entry === 'object' && ('before' in entry || 'after' in entry)) {
      parts.push(fieldLabel(key) + ' ' + fmtValue(entry.before) + '→' + fmtValue(entry.after))
    } else {
      parts.push(fieldLabel(key))
    }
  })
  return parts.join('，')
}

function withSuffix(base, suffix) {
  return suffix ? base + '（' + suffix + '）' : base
}

const moneyText = (v) => '¥' + Number(v || 0).toFixed(0)

// ── 第一层简要语句 ─────────────────────────────────────────────

const BRIEF_BUILDERS = {
  inventory_delete: (d) => briefDelete(d, '库存'),
  purchase_delete: (d) => briefDelete(d, '采购商品'),
  inventory_manual_add: (d) => '手动添加商品：' + (d.name || '-'),
  inventory_edit: (d) => withSuffix('编辑库存：' + (d.name || '-'), changesBrief(d.changes)),
  inventory_unlist: (d) => withSuffix('下架回采购：' + (d.name || '-'), d.count > 1 ? d.count + '件' : null),
  inventory_long_term: (d) => '标记长线库存：' + (d.category || '-') + '/' + (d.batch || '-'),
  inventory_sales_sync: (d) => '同步销售记录：' + (d.name || d.sid || '-') + ' ×' + (d.qty || 0),
  sales_submit: (d) => '记录销售：' + (d.name || '-') + ' ×' + (d.qty || 1),
  sales_edit: (d) => withSuffix('编辑销售：' + (d.name || '-'), changesBrief(d.changes)),
  sales_rollback: (d) => '回滚销售：' + (d.name || '-'),
  sales_unlist: (d) => '下架商品：' + (d.name || '-'),
  purchase_add: (d) => {
    if (d.purchaseGroupId && d.totalItems) {
      return '新增购买组：' + d.purchaseGroupId + '（' + d.totalItems + '件/' + (d.totalSids || 0) + '个SID）'
    }
    return '新增采购：' + (d.name || '-')
  },
  purchase_edit: (d) => withSuffix('编辑采购：' + (d.name || d.sid || '-'), changesBrief(d.changes)),
  purchase_group_edit: (d) => withSuffix('编辑购买组：' + (d.purchaseGroupId || '-'), (d.itemIds && d.itemIds.length ? d.itemIds.length : 0) + '个商品变更'),
  purchase_transfer: (d) => withSuffix('提交转运：' + (d.transferBatch || d.transferId || '-'), d.count + '件'),
  purchase_transfer_edit: (d) => withSuffix('编辑转运：' + (d.transferId || '-'), changesBrief(d.changes)),
  purchase_transfer_delete: (d) => '删除转运记录：' + (d.transferBatch || d.transferId || '-') + (d.count ? '（' + d.count + '件）' : ''),
  purchase_to_inventory: (d) => '移入库存：' + (d.name || '-'),
  purchase_batch_to_inventory: (d) => withSuffix('批量移入库存', d.count + '件'),
  finance_add_record: (d) => withSuffix('新增收支：' + (d.item || '-'), moneyText(d.amount)),
  finance_delete_record: (d) => withSuffix('删除收支：' + (d.item || d.counterparty || '-'), moneyText(d.amount)),
  finance_update_record: (d) => withSuffix('编辑收支：' + (d.item || '-'), changesBrief(d.changes)),
  finance_add_loan: (d) => withSuffix('新增借贷：' + (d.counterparty || '-'), moneyText(d.amount)),
  finance_delete_loan: (d) => withSuffix('删除借贷：' + (d.counterparty || '-'), moneyText(d.amount)),
  finance_update_loan: (d) => withSuffix('编辑借贷：' + (d.counterparty || '-'), changesBrief(d.changes)),
  finance_repaid: (d) => '借贷归还：' + (d.counterparty || '-'),
  calc_update: (d) => '更新参数：' + fieldLabel(d.field) + ' ' + moneyText(d.before) + '→' + moneyText(d.after),
  market_price_update: (d) => '更新市价：' + (d.name || d.sid || '-') + ' ' + moneyText(d.price),
}

function briefDelete(d, kind) {
  const count = d.deletedCount || (Array.isArray(d.deletedNames) ? d.deletedNames.length : 0) || (Array.isArray(d.deletedItems) ? d.deletedItems.length : 0) || 1
  if (count > 1) return '删除了' + count + '件' + kind
  return '删除' + kind + '：' + (d.name || d.deletedNames?.[0] || d.deletedItems?.[0]?.name || d.sid || '-')
}

/** 第一层简要语句：按类型模板从 detail 生成，旧日志回退 log.message */
export function getLogBrief(log) {
  const builder = BRIEF_BUILDERS[log?.type]
  const detail = log?.detail
  const hasDetail = detail && typeof detail === 'object' && !Array.isArray(detail) && Object.keys(detail).length > 0
  if (!builder || !hasDetail) return log?.message || '-'
  return builder(detail) || log?.message || '-'
}

// ── 第二层结构化区块 ──────────────────────────────────────────

const ITEM_TABLES = {
  deletedItems: {
    title: '已删除商品',
    columns: [
      { key: 'name', label: '名称' },
      { key: 'sid', label: 'SID' },
      { key: 'status', label: '状态' },
      { key: 'cost', label: '成本', money: true },
    ],
  },
  sidSummary: {
    title: '商品清单',
    columns: [
      { key: 'sid', label: 'SID' },
      { key: 'name', label: '名称' },
      { key: 'originalPrice', label: '日元原价' },
      { key: 'qty', label: '件数' },
    ],
  },
  itemCosts: {
    title: '转运成本变化',
    columns: [
      { key: 'sid', label: 'SID' },
      { key: 'name', label: '名称' },
      { key: 'costBefore', label: '转运前', money: true },
      { key: 'costAfter', label: '转运后', money: true },
    ],
  },
  affectedItems: {
    title: '受影响商品',
    columns: [
      { key: 'sid', label: 'SID' },
      { key: 'name', label: '名称' },
      { key: 'cost', label: '成本', money: true },
      { key: 'transferCost', label: '转运费', money: true },
      { key: 'transferStatus', label: '转运状态' },
    ],
  },
}

// 各区块消费的字段，避免在「其他信息」中重复展示
const CONSUMED_KEYS = {
  changes: ['changes', 'changedFields'],
  deletedItems: ['deletedItems', 'deletedNames', 'deletedItemIds', 'deletedCount'],
  sidSummary: ['sidSummary'],
  itemCosts: ['itemCosts'],
  affectedItems: ['affectedItems'],
  names: ['itemNames'],
}

const NAME_SECTION_TITLES = {
  inventory_long_term: '标记长线的商品',
  purchase_group_edit: '本组商品',
  purchase_batch_to_inventory: '移入库存的商品',
  purchase_add: '本组商品',
}

function formatCell(row, col) {
  const value = row[col.key]
  if (value === undefined || value === null || value === '') return '-'
  if (col.money) return '¥' + Number(value || 0).toFixed(2)
  if (col.key === 'status') return STATUS_LABEL[value] || String(value)
  if (col.key === 'transferStatus') return TRANSFER_STATUS_LABEL[value] || String(value)
  return String(value)
}

function buildItemsSection(detail, field) {
  const rows = detail[field]
  if (!Array.isArray(rows) || rows.length === 0) return null
  const table = ITEM_TABLES[field]
  return {
    kind: 'items',
    title: table.title,
    columns: table.columns.map((col) => col.label),
    rows: rows.map((row) => table.columns.map((col) => formatCell(row, col))),
  }
}

/**
 * 第二层结构化区块，按形态顺序输出：
 * changes(修改明细) → items(表格) → names(名称列表) → kv(其他信息) → raw(原始数据)
 */
export function getLogDetailSections(log) {
  const detail = log?.detail
  if (!detail || typeof detail !== 'object' || Array.isArray(detail) || Object.keys(detail).length === 0) {
    return []
  }

  const sections = []
  const used = new Set()
  const consume = (field) => {
    ;(CONSUMED_KEYS[field] || []).forEach((key) => used.add(key))
  }

  if (detail.changes && Object.keys(detail.changes).length > 0) {
    consume('changes')
    sections.push({
      kind: 'changes',
      title: '修改明细',
      rows: Object.keys(detail.changes).map((key) => {
        const entry = detail.changes[key]
        return {
          field: fieldLabel(key),
          before: entry && typeof entry === 'object' ? fmtValue(entry.before) : fmtValue(entry),
          after: entry && typeof entry === 'object' ? fmtValue(entry.after) : '-',
        }
      }),
    })
  }

  Object.keys(ITEM_TABLES).forEach((field) => {
    const section = buildItemsSection(detail, field)
    if (section) {
      consume(field)
      sections.push(section)
    }
  })

  if (Array.isArray(detail.itemNames) && detail.itemNames.length > 0 && !used.has('itemNames')) {
    consume('names')
    sections.push({
      kind: 'names',
      title: NAME_SECTION_TITLES[log?.type] || '涉及商品',
      names: detail.itemNames,
    })
  }

  const entries = Object.keys(detail)
    .filter((key) => !used.has(key))
    .map((key) => {
      const value = detail[key]
      const isObject = value !== null && typeof value === 'object'
      return { key: fieldLabel(key), value: isObject ? toCompactJson(value) : fmtValue(value) }
    })
  if (entries.length > 0) {
    sections.push({ kind: 'kv', title: '其他信息', entries })
  }

  sections.push({ kind: 'raw', title: '原始数据', json: toCompactJson(detail) })

  return sections
}

/** 是否存在第二层信息（除原始数据外的区块） */
export function hasLogDetail(log) {
  return getLogDetailSections(log).some((section) => section.kind !== 'raw')
}
