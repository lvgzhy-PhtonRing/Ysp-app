import { computed, isRef, reactive, watch } from 'vue'

const PRESET_MATTEL_USERNAMES = ['zhylvg@gmail.com', 'll_gg@yeah.net', 'Payton-pi@zohomail.com']

function toNum(value, fallback = 0) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function normalizeWebsite(website, purchaseGroupId) {
  const rawWebsite = String(website || '').trim()
  const rawGroup = String(purchaseGroupId || '').trim().toLowerCase()
  const websiteLower = rawWebsite.toLowerCase()
  if (websiteLower === 'mattel' || websiteLower.includes('mattel') || rawGroup.includes('mattel')) {
    return 'creations.mattel.com'
  }
  return rawWebsite
}

function parseDateTs(value) {
  const text = String(value || '').trim()
  if (!text) return 0
  const ts = new Date(text).getTime()
  return Number.isFinite(ts) ? ts : 0
}

function safeDate(value) {
  const text = String(value || '').trim()
  if (!text) return ''
  return text.slice(0, 10)
}

function buildCardLabel(holder, bank, identifier, cardType) {
  return `${holder}${bank}${identifier}${cardType}`
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function replaceArray(target, source) {
  target.splice(0, target.length, ...clone(Array.isArray(source) ? source : []))
}

function createForwarderInfo(partial = {}) {
  return {
    id: partial.id || `fw_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    companyName: partial.companyName || '',
    loginUsername: partial.loginUsername || '',
    passwordPrefix: partial.passwordPrefix || '',
    recipientName: partial.recipientName || '',
    domesticReceiver: partial.domesticReceiver || '吕',
  }
}

function createMattelSiteInfo(partial = {}) {
  return {
    id: partial.id || `ms_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    loginUsername: partial.loginUsername || 'zhylvg@gmail.com',
    passwordPrefix: partial.passwordPrefix || '',
    forwarderIds: Array.isArray(partial.forwarderIds) ? [...partial.forwarderIds] : [],
    mattelDisplayName: partial.mattelDisplayName || '',
  }
}

function createCardOption(label, holder, bank, identifier, cardType, remark = '') {
  return {
    id: `card_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    label,
    holder,
    bank,
    identifier,
    tailNo: identifier,
    cardType,
    remark: String(remark || '').trim(),
  }
}

function createInitialState(seed = {}) {
  const now = new Date().toISOString().slice(0, 10)
  return reactive({
    entries: Array.isArray(seed.entries) ? seed.entries : [],
    forwarderInfos: Array.isArray(seed.forwarderInfos) && seed.forwarderInfos.length
      ? seed.forwarderInfos.map((x) => createForwarderInfo(x))
      : [],
    mattelSiteInfos: Array.isArray(seed.mattelSiteInfos) && seed.mattelSiteInfos.length
      ? seed.mattelSiteInfos.map((x) => createMattelSiteInfo(x))
      : [],
    paymentCards: Array.isArray(seed.paymentCards) && seed.paymentCards.length
      ? seed.paymentCards
      : [],
    addCardForm: {
      holder: 'PT',
      bank: '招商',
      identifier: '',
      cardType: 'Visa数字',
      remark: '',
    },
    cardEditId: '',
    activePage: 'entry',
    selectedGroupKey: '',
    form: {
      purchaseDevice: '',
      virtualMachine: false,
      networkEnv: '',
      vpnNode: '',
      browser: '',
      recipientId: '',
      holder: 'PT',
      cardId: '',
      shopQuickPay: '否',
      note: '',
      actualChargeUSD: '',
    },
    filters: {
      username: '',
      cardId: '',
      recipient: '',
    },
    sourceLoadedFrom: seed.sourceLoadedFrom || 'public/a.json',
    loadedAt: now,
  })
}

function buildUsPurchaseGroups(items = []) {
  const usItems = (items || []).filter((item) => String(item?.category || '') === '美淘')
  const map = new Map()

  usItems.forEach((item) => {
    const pd = item?.purchaseDetails || {}
    const date = safeDate(pd.date)
    const purchaseGroupId = String(pd.purchaseGroupId || '').trim()
    const paymentBatch = String(pd.paymentBatch || '').trim()
    const website = String(pd.website || '').trim()
    const key = purchaseGroupId || `${date}__${website}__${paymentBatch}`
    const finalKey = String(key).trim() || `no-group__${String(item.id || '').trim()}`
    if (!finalKey || finalKey === 'no-group__') return

    if (!map.has(finalKey)) {
      map.set(finalKey, {
        key: finalKey,
        purchaseGroupId: purchaseGroupId || '-',
        paymentBatch: paymentBatch || '-',
        date,
        website: website || '-',
        websiteAccount: String(pd.websiteAccount || '').trim() || '-',
        lines: [],
        totalUSD: 0,
      })
    }

    const row = map.get(finalKey)
    const sid = String(item?.sid || '').trim() || String(item?.id || '')
    const lineKey = `${sid}__${String(item?.name || '').trim()}`
    let line = row.lines.find((x) => x.lineKey === lineKey)
    if (!line) {
      line = {
        lineKey,
        sid,
        name: String(item?.name || '').trim() || '-',
        qty: 0,
        originalPrice: toNum(pd.originalPrice),
        shipping: toNum(pd.domesticShipping),
      }
      row.lines.push(line)
    }
    line.qty += 1
    line.originalPrice = toNum(pd.originalPrice)
    line.shipping = toNum(pd.domesticShipping)
  })

  return Array.from(map.values())
    .map((g) => {
      const itemTotal = g.lines.reduce((sum, line) => {
        return sum + (toNum(line.originalPrice) + toNum(line.shipping)) * toNum(line.qty)
      }, 0)
      return {
        ...g,
        totalUSD: itemTotal,
      }
    })
    .sort((a, b) => parseDateTs(b.date) - parseDateTs(a.date))
}

export function useRushCarPrototype(rawSeedData = {}) {
  const isSeedRef = isRef(rawSeedData)
  const seedData = isSeedRef ? rawSeedData.value : rawSeedData
  const state = createInitialState(seedData)

  const storeStateRef = computed(() => {
    const resolved = isSeedRef ? rawSeedData.value : seedData
    if (resolved && typeof resolved === 'object' && resolved.rushcar && typeof resolved.rushcar === 'object') {
      return resolved
    }
    return null
  })

  watch(
    () => storeStateRef.value?.rushcar,
    (rushcarData) => {
      if (!rushcarData || typeof rushcarData !== 'object') return
      replaceArray(state.entries, rushcarData.entries)
      replaceArray(state.forwarderInfos, rushcarData.forwarderInfos)
      replaceArray(state.mattelSiteInfos, rushcarData.mattelSiteInfos)
      replaceArray(state.paymentCards, rushcarData.paymentCards)
    },
    { immediate: true },
  )

  watch(
    () => [state.entries, state.forwarderInfos, state.mattelSiteInfos, state.paymentCards],
    () => {
      const host = storeStateRef.value
      if (!host?.rushcar) return
      host.rushcar.entries = clone(state.entries)
      host.rushcar.forwarderInfos = clone(state.forwarderInfos)
      host.rushcar.mattelSiteInfos = clone(state.mattelSiteInfos)
      host.rushcar.paymentCards = clone(state.paymentCards)
    },
    { deep: true },
  )

  const usPurchaseGroups = computed(() => {
    const resolved = isSeedRef ? (rawSeedData.value || {}) : (seedData || {})
    return buildUsPurchaseGroups(resolved.items || [])
  })

  const selectedGroup = computed(() =>
    usPurchaseGroups.value.find((g) => g.key === state.selectedGroupKey) || null,
  )

  const entrySnapshot = computed(() => {
    const g = selectedGroup.value
    if (!g) {
      return {
        date: '',
        website: '',
        websiteAccount: '',
        totalUSD: 0,
        lines: [],
        purchaseGroupId: '',
        paymentBatch: '',
        username: '',
      }
    }
    return {
      date: g.date,
      website: normalizeWebsite(g.website, g.purchaseGroupId),
      websiteAccount: g.websiteAccount,
      totalUSD: toNum(g.totalUSD),
      lines: g.lines,
      purchaseGroupId: g.purchaseGroupId,
      paymentBatch: g.paymentBatch,
      username: g.websiteAccount,
    }
  })

  const recipientOptions = computed(() => {
    const autoUsername = String(entrySnapshot.value.username || '').trim()
    if (!autoUsername) return []

    const ids = []
    state.mattelSiteInfos.forEach((row) => {
      if (String(row?.loginUsername || '').trim() !== autoUsername) return
      ;(row.forwarderIds || []).forEach((id) => {
        if (!ids.includes(id)) ids.push(id)
      })
    })

    return ids
      .map((id) => state.forwarderInfos.find((f) => f.id === id))
      .filter(Boolean)
      .map((f) => ({
        id: f.id,
        label: String(f.recipientName || '').trim() || '-',
        companyName: String(f.companyName || '').trim() || '-',
        account: String(f.loginUsername || '').trim() || '-',
      }))
      .filter((x) => x.label && x.label !== '-')
  })

  const unknownWebsiteUsernames = computed(() => {
    const known = new Set(PRESET_MATTEL_USERNAMES)
    const set = new Set()
    usPurchaseGroups.value.forEach((g) => {
      const username = String(g?.websiteAccount || '').trim()
      if (!username || username === '-') return
      if (!known.has(username)) set.add(username)
    })
    return Array.from(set)
  })

  const selectedRecipientForwarder = computed(() =>
    recipientOptions.value.find((x) => x.id === state.form.recipientId) || null,
  )

  const filteredCardsByHolder = computed(() =>
    state.paymentCards.filter((c) => String(c.holder || '') === String(state.form.holder || '')),
  )

  const selectedCard = computed(() =>
    state.paymentCards.find((c) => c.id === state.form.cardId) || null,
  )

  const filteredEntries = computed(() => {
    return [...state.entries]
      .filter((row) => {
        if (state.filters.username && row.username !== state.filters.username) return false
        if (state.filters.cardId && row.cardId !== state.filters.cardId) return false
        if (state.filters.recipient && row.recipient !== state.filters.recipient) return false
        return true
      })
      .sort((a, b) => {
        const purchaseDiff = parseDateTs(b.purchaseDate) - parseDateTs(a.purchaseDate)
        if (purchaseDiff !== 0) return purchaseDiff
        return toNum(b.createdAt) - toNum(a.createdAt)
      })
  })

  const filterUsernameOptions = computed(() => {
    const set = new Set()
    state.entries.forEach((row) => {
      if (row?.username) set.add(row.username)
    })
    return Array.from(set)
  })

  const filterRecipientOptions = computed(() => {
    const set = new Set()
    state.entries.forEach((row) => {
      if (row?.recipient) set.add(row.recipient)
    })
    return Array.from(set)
  })

  function applyMasterRecipientDefault() {
    const options = recipientOptions.value
    if (options.length === 0) {
      state.form.recipientId = ''
      return
    }
    const exists = options.some((x) => x.id === state.form.recipientId)
    if (!exists) {
      state.form.recipientId = options[0].id
    }
  }

  function selectGroup(key) {
    state.selectedGroupKey = String(key || '')
  }

  function addForwarderInfo() {
    state.forwarderInfos.push(createForwarderInfo())
  }

  function removeForwarderInfo(id) {
    const idx = state.forwarderInfos.findIndex((row) => row.id === id)
    if (idx >= 0) state.forwarderInfos.splice(idx, 1)
    state.mattelSiteInfos.forEach((row) => {
      row.forwarderIds = (row.forwarderIds || []).filter((x) => x !== id)
    })
    if (state.form.recipientId === id) state.form.recipientId = ''
  }

  function addMattelSiteInfo() {
    state.mattelSiteInfos.push(createMattelSiteInfo())
  }

  function removeMattelSiteInfo(id) {
    const idx = state.mattelSiteInfos.findIndex((row) => row.id === id)
    if (idx >= 0) state.mattelSiteInfos.splice(idx, 1)
  }

  function toggleMattelForwarder(siteInfoId, forwarderId, checked) {
    const row = state.mattelSiteInfos.find((x) => x.id === siteInfoId)
    if (!row) return
    if (!Array.isArray(row.forwarderIds)) row.forwarderIds = []
    if (checked) {
      if (!row.forwarderIds.includes(forwarderId)) row.forwarderIds.push(forwarderId)
    } else {
      row.forwarderIds = row.forwarderIds.filter((x) => x !== forwarderId)
    }
  }

  function addPaymentCard() {
    const holder = String(state.addCardForm.holder || '').trim()
    const bank = String(state.addCardForm.bank || '').trim()
    const identifier = String(state.addCardForm.identifier || '').trim()
    const cardType = String(state.addCardForm.cardType || '').trim() || 'Visa数字'
    const remark = String(state.addCardForm.remark || '').trim()
    if (!holder || !bank || !identifier || identifier.length < 2) return false

    const label = buildCardLabel(holder, bank, identifier, cardType)
    if (state.cardEditId) {
      const row = state.paymentCards.find((x) => x.id === state.cardEditId)
      if (row) {
        row.label = label
        row.holder = holder
        row.bank = bank
        row.identifier = identifier
        row.tailNo = identifier
        row.cardType = cardType
        row.remark = remark
      }
      state.cardEditId = ''
    } else {
      state.paymentCards.unshift(createCardOption(label, holder, bank, identifier, cardType, remark))
    }
    state.addCardForm.bank = '招商'
    state.addCardForm.identifier = ''
    state.addCardForm.cardType = 'Visa数字'
    state.addCardForm.remark = ''
    return true
  }

  function startEditPaymentCard(id) {
    const row = state.paymentCards.find((x) => x.id === id)
    if (!row) return
    state.cardEditId = id
    state.addCardForm.holder = row.holder || 'PT'
    state.addCardForm.bank = row.bank || '招商'
    state.addCardForm.identifier = row.identifier || row.tailNo || ''
    state.addCardForm.cardType = row.cardType || 'Visa数字'
    state.addCardForm.remark = row.remark || ''
  }

  function cancelEditPaymentCard() {
    state.cardEditId = ''
    state.addCardForm.holder = 'PT'
    state.addCardForm.bank = '招商'
    state.addCardForm.identifier = ''
    state.addCardForm.cardType = 'Visa数字'
    state.addCardForm.remark = ''
  }

  function removePaymentCard(id) {
    const idx = state.paymentCards.findIndex((x) => x.id === id)
    if (idx >= 0) state.paymentCards.splice(idx, 1)
    if (state.form.cardId === id) state.form.cardId = ''
    if (state.filters.cardId === id) state.filters.cardId = ''
  }

  function removeEntry(id) {
    const idx = state.entries.findIndex((row) => row.id === id)
    if (idx >= 0) state.entries.splice(idx, 1)
  }

  function markEntryFailure(entryId, payload = {}) {
    const row = state.entries.find((x) => x.id === entryId)
    if (!row) return false
    row.purchaseStatus = 'failed'
    row.failureNotifiedAt = String(payload.notifiedAt || '').trim()
    row.failureReason = String(payload.reason || '').trim()
    row.refundStatus = payload.refundStatus === '已退款' ? '已退款' : '未退款'
    row.refundTime = row.refundStatus === '已退款' ? String(payload.refundTime || '').trim() : ''
    row.updatedAt = Date.now()
    return true
  }

  function submitEntry() {
    if (!selectedGroup.value) return { ok: false, message: '请先选择购买组' }
    const key = selectedGroup.value.key
    const existing = state.entries.find((e) => e.sourceGroupKey === key)
    if (existing) {
      return { ok: false, message: '该购买组已存在美淘记录，避免覆盖，请先删除或修改现有记录' }
    }
    if (!entrySnapshot.value.username || !state.form.recipientId || !selectedRecipientForwarder.value) {
      return { ok: false, message: '请选择收件人' }
    }
    if (!state.form.holder || !selectedCard.value) {
      return { ok: false, message: '请填写付款信息' }
    }

    const actualChargeUSD =
      state.form.actualChargeUSD === '' || state.form.actualChargeUSD === null
        ? toNum(entrySnapshot.value.totalUSD)
        : toNum(state.form.actualChargeUSD)
    const chargeDiffUSD = Number((actualChargeUSD - toNum(entrySnapshot.value.totalUSD)).toFixed(2))
    const selectedCardLabel =
      String(selectedCard.value.label || '').trim() ||
      buildCardLabel(
        selectedCard.value.holder,
        selectedCard.value.bank,
        selectedCard.value.identifier || selectedCard.value.tailNo || '',
        selectedCard.value.cardType,
      )

    const now = Date.now()
    const row = {
      id: `entry_${now}_${Math.floor(Math.random() * 1000)}`,
      createdAt: now,
      updatedAt: now,
      sourceGroupKey: selectedGroup.value.key,
      purchaseGroupId: selectedGroup.value.purchaseGroupId,
      paymentBatch: selectedGroup.value.paymentBatch,
      purchaseDate: entrySnapshot.value.date,
      website: entrySnapshot.value.website,
      websiteAccount: entrySnapshot.value.websiteAccount,
      lines: JSON.parse(JSON.stringify(entrySnapshot.value.lines)),
      totalUSD: toNum(entrySnapshot.value.totalUSD),
      sourceWebsiteRaw: String(selectedGroup.value.website || '').trim(),
      purchaseDevice: state.form.purchaseDevice,
      virtualMachine: Boolean(state.form.virtualMachine),
      networkEnv: state.form.networkEnv,
      vpnNode: state.form.vpnNode,
      browser: state.form.browser,
      username: entrySnapshot.value.username,
      recipient: selectedRecipientForwarder.value.label,
      recipientId: selectedRecipientForwarder.value.id,
      forwarderCompany: selectedRecipientForwarder.value.companyName,
      forwarderAccount: selectedRecipientForwarder.value.account,
      holder: state.form.holder,
      cardId: selectedCard.value.id,
      cardLabel: selectedCardLabel,
      cardRemark: String(selectedCard.value.remark || '').trim(),
      shopQuickPay: state.form.shopQuickPay,
      note: String(state.form.note || '').trim(),
      consumeUSD: toNum(entrySnapshot.value.totalUSD),
      actualChargeUSD,
      chargeDiffUSD,
      purchaseStatus: 'success',
      failureNotifiedAt: '',
      failureReason: '',
      refundStatus: '未退款',
      refundTime: '',
    }

    state.entries.unshift(row)
    return { ok: true, message: '已保存美淘记录（仅原型内数据）' }
  }

  return {
    state,
    usPurchaseGroups,
    selectedGroup,
    entrySnapshot,
    recipientOptions,
    unknownWebsiteUsernames,
    selectedRecipientForwarder,
    filteredCardsByHolder,
    selectedCard,
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
  }
}
