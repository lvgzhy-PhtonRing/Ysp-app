import { computed, isRef, reactive } from 'vue'

function toNum(value, fallback = 0) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function normalizeWebsite(website, purchaseGroupId, mappings = []) {
  const rawWebsite = String(website || '').trim()
  const rawGroup = String(purchaseGroupId || '').trim()
  const websiteLower = rawWebsite.toLowerCase()
  const groupLower = rawGroup.toLowerCase()

  for (const row of mappings || []) {
    const match = String(row?.match || '').trim().toLowerCase()
    const target = String(row?.target || '').trim()
    if (!match || !target) continue
    if (websiteLower.includes(match) || groupLower.includes(match)) {
      return target
    }
  }

  if (websiteLower === 'mattel' || websiteLower.includes('mattel') || groupLower.includes('mattel')) {
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

function getRecipientForwarderMeta(row, recipient) {
  if (!row || !recipient) {
    return {
      company: '',
      account: '',
      passwordMasked: '',
    }
  }

  const r = String(recipient || '').trim()
  if (r && r === String(row.recipientA || '').trim()) {
    return {
      company: String(row.forwarderA || '').trim(),
      account: String(row.forwarderAAccount || '').trim(),
      passwordMasked: String(row.forwarderAPassword || '').trim(),
    }
  }
  if (r && r === String(row.recipientB || '').trim()) {
    return {
      company: String(row.forwarderB || '').trim(),
      account: String(row.forwarderBAccount || '').trim(),
      passwordMasked: String(row.forwarderBPassword || '').trim(),
    }
  }
  if (r && r === String(row.recipientC || '').trim()) {
    return {
      company: String(row.forwarderC || '').trim(),
      account: String(row.forwarderCAccount || '').trim(),
      passwordMasked: String(row.forwarderCPassword || '').trim(),
    }
  }

  return {
    company: '',
    account: '',
    passwordMasked: '',
    addressAlias: '',
  }
}

function createMasterRow() {
  return {
    id: `m_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    username: '',
    password: '',
    recipientA: '',
    recipientB: '',
    recipientC: '',
    forwarderA: '',
    forwarderAAccount: '',
    forwarderAPassword: '',
    forwarderB: '',
    forwarderBAccount: '',
    forwarderBPassword: '',
    forwarderC: '',
    forwarderCAccount: '',
    forwarderCPassword: '',
  }
}

function createWebsiteMappingRow() {
  return {
    id: `wm_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    match: '',
    target: '',
  }
}

function createCardOption(label, holder, bank, tailNo, cardType) {
  return {
    id: `card_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    label,
    holder,
    bank,
    identifier: tailNo,
    tailNo,
    cardType,
  }
}

function createInitialState(seed = {}) {
  const now = new Date().toISOString().slice(0, 10)
  return reactive({
    entries: Array.isArray(seed.entries) ? seed.entries : [],
    masterAccounts: Array.isArray(seed.masterAccounts) && seed.masterAccounts.length
      ? seed.masterAccounts
      : [
          {
            ...createMasterRow(),
            username: 'zhylvg@gmail.com',
            password: '***',
            recipientA: 'Lu 003',
            recipientB: '004',
            recipientC: '',
            forwarderA: 'US-Forward-1',
            forwarderAAccount: 'lvy_us_01',
            forwarderAPassword: '***',
            forwarderB: 'US-Forward-2',
            forwarderBAccount: 'payton_us_02',
            forwarderBPassword: '***',
            forwarderC: 'US-Forward-3',
            forwarderCAccount: 'nina_us_03',
            forwarderCPassword: '***',
          },
          {
            ...createMasterRow(),
            username: 'll_gg@yeah.net',
            password: '***',
            recipientA: 'Lu Gang LvGang',
            recipientB: 'MVCXJ lvg-pi',
            recipientC: '',
            forwarderA: '转运中国',
            forwarderAAccount: 'll_gg@yeah.net',
            forwarderAPassword: '***',
            forwarderB: '铭瑄海淘',
            forwarderBAccount: 'll_gg',
            forwarderBPassword: '***',
          },
          {
            ...createMasterRow(),
            username: 'Payton-pi@zohomail.com',
            password: '***',
            recipientA: '001',
            recipientB: '005i',
            recipientC: '',
            forwarderA: 'US-Forward-2',
            forwarderAAccount: 'payton_us_01',
            forwarderAPassword: '***',
            forwarderB: 'US-Forward-3',
            forwarderBAccount: 'payton_us_02',
            forwarderBPassword: '***',
          },
        ],
    paymentCards: Array.isArray(seed.paymentCards) && seed.paymentCards.length
      ? seed.paymentCards
      : [
          createCardOption('PT招商0940Visa数字', 'PT', '招商', '0940', 'Visa数字'),
          createCardOption('NT贝宝Babey@163.comPaypal', 'NT', '贝宝', 'Babey@163.com', 'Paypal'),
        ],
    addCardForm: {
      holder: 'PT',
      bank: '招商',
      identifier: '',
      cardType: 'Visa数字',
    },
    activePage: 'entry',
    selectedGroupKey: '',
    form: {
      purchaseDevice: '',
      networkEnv: '',
      vpnNode: '',
      browser: '',
      username: '',
      recipient: '',
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
      website: '',
      forwarder: '',
    },
    websiteMappings: Array.isArray(seed.websiteMappings) && seed.websiteMappings.length
      ? seed.websiteMappings
      : [{ id: 'wm_mattel', match: 'mattel', target: 'creations.mattel.com' }],
    sourceLoadedFrom: seed.sourceLoadedFrom || 'public/a.json',
    loadedAt: now,
  })
}

function buildUsPurchaseGroups(items = []) {
  const usItems = (items || []).filter((item) => String(item?.category || '') === '美淘')
  const allDateTs = usItems
    .map((item) => parseDateTs(safeDate(item?.purchaseDetails?.date)))
    .filter((ts) => ts > 0)
  const latestTs = allDateTs.length ? Math.max(...allDateTs) : 0
  const monthAgoTs = Date.now() - 30 * 24 * 60 * 60 * 1000
  const map = new Map()

  usItems.forEach((item) => {
    const pd = item?.purchaseDetails || {}
    const date = safeDate(pd.date)
    const dateTs = parseDateTs(date)
    // include all US items (disable date filter to see more data)
    // if (dateTs > 0 && dateTs < monthAgoTs) return

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
        return sum + toNum(line.originalPrice) * toNum(line.qty) + toNum(line.shipping)
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

  const usPurchaseGroups = computed(() => {
    const resolved = isSeedRef ? (rawSeedData.value || {}) : (seedData || {})
    return buildUsPurchaseGroups(resolved.items || [])
  })

  const selectedGroup = computed(() =>
    usPurchaseGroups.value.find((g) => g.key === state.selectedGroupKey) || null,
  )

  const masterByUsername = computed(() => {
    const map = new Map()
    state.masterAccounts.forEach((row) => {
      const key = String(row?.username || '').trim()
      if (!key) return
      map.set(key, row)
    })
    return map
  })

  const usernameOptions = computed(() =>
    state.masterAccounts
      .map((row) => String(row?.username || '').trim())
      .filter(Boolean),
  )

  const recipientOptions = computed(() => {
    const autoUsername = String(entrySnapshot.value.username || '').trim()
    if (!autoUsername) return []
    const row = masterByUsername.value.get(autoUsername) || null
    if (!row) return []
    return [row.recipientA, row.recipientB, row.recipientC]
      .map((v) => String(v || '').trim())
      .filter(Boolean)
  })

  const filteredCardsByHolder = computed(() =>
    state.paymentCards.filter((c) => String(c.holder || '') === String(state.form.holder || '')),
  )

  const selectedMasterAccount = computed(() => {
    const autoUsername = String(entrySnapshot.value.username || '').trim()
    if (!autoUsername) return null
    return masterByUsername.value.get(autoUsername) || null
  })

  const selectedRecipientForwarder = computed(() =>
    getRecipientForwarderMeta(selectedMasterAccount.value, state.form.recipient),
  )

  const selectedCard = computed(() =>
    state.paymentCards.find((c) => c.id === state.form.cardId) || null,
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
      }
    }
    return {
      date: g.date,
      website: normalizeWebsite(g.website, g.purchaseGroupId, state.websiteMappings),
      websiteAccount: g.websiteAccount,
      totalUSD: toNum(g.totalUSD),
      lines: g.lines,
      purchaseGroupId: g.purchaseGroupId,
      paymentBatch: g.paymentBatch,
      username: g.websiteAccount,
    }
  })

  const filteredEntries = computed(() => {
    return [...state.entries]
      .filter((row) => {
        if (state.filters.username && row.username !== state.filters.username) return false
        if (state.filters.cardId && row.cardId !== state.filters.cardId) return false
        if (state.filters.recipient && row.recipient !== state.filters.recipient) return false
        if (state.filters.website && row.website !== state.filters.website) return false
        if (state.filters.forwarder && row.forwarderCompany !== state.filters.forwarder) return false
        return true
      })
      .sort((a, b) => toNum(b.createdAt) - toNum(a.createdAt))
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

  const filterWebsiteOptions = computed(() => {
    const set = new Set()
    state.entries.forEach((row) => {
      const value = String(row?.website || '').trim()
      if (value) set.add(value)
    })
    return Array.from(set)
  })

  const filterForwarderOptions = computed(() => {
    const set = new Set()
    state.entries.forEach((row) => {
      const value = String(row?.forwarderCompany || '').trim()
      if (value) set.add(value)
    })
    return Array.from(set)
  })

  function applyMasterRecipientDefault() {
    const options = recipientOptions.value
    if (options.length === 0) {
      state.form.recipient = ''
      return
    }
    if (!options.includes(state.form.recipient)) {
      state.form.recipient = options[0]
    }
  }

  function selectGroup(key) {
    state.selectedGroupKey = String(key || '')
  }

  function addMasterAccount() {
    state.masterAccounts.push(createMasterRow())
  }

  function removeMasterAccount(id) {
    const idx = state.masterAccounts.findIndex((row) => row.id === id)
    if (idx >= 0) state.masterAccounts.splice(idx, 1)
    if (!masterByUsername.value.has(state.form.username)) {
      state.form.username = ''
      state.form.recipient = ''
    }
  }

  function addWebsiteMapping() {
    state.websiteMappings.push(createWebsiteMappingRow())
  }

  function removeWebsiteMapping(id) {
    const idx = state.websiteMappings.findIndex((row) => row.id === id)
    if (idx >= 0) state.websiteMappings.splice(idx, 1)
  }

  function addPaymentCard() {
    const holder = String(state.addCardForm.holder || '').trim()
    const bank = String(state.addCardForm.bank || '').trim()
    const identifier = String(state.addCardForm.identifier || '').trim()
    const cardType = String(state.addCardForm.cardType || '').trim() || 'Visa数字'
    if (!holder || !bank || !identifier || identifier.length < 2) return false

    const label = buildCardLabel(holder, bank, identifier, cardType)
    state.paymentCards.unshift(createCardOption(label, holder, bank, identifier, cardType))
    state.addCardForm.bank = '招商'
    state.addCardForm.identifier = ''
    state.addCardForm.cardType = 'Visa数字'
    return true
  }

  function removeEntry(id) {
    const idx = state.entries.findIndex((row) => row.id === id)
    if (idx >= 0) state.entries.splice(idx, 1)
  }

  function submitEntry() {
    if (!selectedGroup.value) return { ok: false, message: '请先选择购买组' }
    const key = selectedGroup.value.key
    const existing = state.entries.find((e) => e.sourceGroupKey === key)
    if (existing) {
      return { ok: false, message: '该购买组已存在抢车记录，请先删除或修改现有记录' }
    }
    if (!state.form.purchaseDevice || !state.form.networkEnv || !state.form.vpnNode || !state.form.browser) {
      return { ok: false, message: '请完整填写操作环境信息' }
    }
    if (!entrySnapshot.value.username || !state.form.recipient) {
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
      networkEnv: state.form.networkEnv,
      vpnNode: state.form.vpnNode,
      browser: state.form.browser,
      username: entrySnapshot.value.username,
      recipient: state.form.recipient,
      forwarderCompany: selectedRecipientForwarder.value.company,
      forwarderAccount: selectedRecipientForwarder.value.account,
      holder: state.form.holder,
      cardId: selectedCard.value.id,
      cardLabel: selectedCardLabel,
      shopQuickPay: state.form.shopQuickPay,
      note: String(state.form.note || '').trim(),
      consumeUSD: toNum(entrySnapshot.value.totalUSD),
      actualChargeUSD,
      chargeDiffUSD,
    }

    state.entries.unshift(row)
    return { ok: true, message: '已保存抢车记录（仅原型内数据）' }
  }

  return {
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
  }
}
