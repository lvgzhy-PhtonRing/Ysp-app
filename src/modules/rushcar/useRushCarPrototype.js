import { computed, reactive } from 'vue'

function toNum(value, fallback = 0) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
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

function createCardOption(label, holder, bank, tailNo, cardType) {
  return {
    id: `card_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    label,
    holder,
    bank,
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
            recipientA: 'Lvy',
            recipientB: 'Payton',
            recipientC: 'Nina',
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
        ],
    paymentCards: Array.isArray(seed.paymentCards) && seed.paymentCards.length
      ? seed.paymentCards
      : [
          createCardOption('PT-招商-1123-信用卡', 'PT', '招商', '1123', '信用卡'),
          createCardOption('NT-中行-8871-借记卡', 'NT', '中行', '8871', '借记卡'),
        ],
    addCardForm: {
      holder: 'PT',
      bank: '',
      tailNo: '',
      cardType: '信用卡',
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
  const monthAgoTs = Date.now() - 30 * 24 * 60 * 60 * 1000
  const map = new Map()

  items.forEach((item) => {
    if (String(item?.category || '') !== '美淘') return
    const pd = item?.purchaseDetails || {}
    const date = safeDate(pd.date)
    const dateTs = parseDateTs(date)
    if (!date || dateTs <= 0 || dateTs < monthAgoTs) return

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

export function useRushCarPrototype(seedData = {}) {
  const state = createInitialState(seedData)

  const usPurchaseGroups = computed(() => buildUsPurchaseGroups(seedData?.items || []))

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
    const row = masterByUsername.value.get(state.form.username)
    if (!row) return []
    return [row.recipientA, row.recipientB, row.recipientC]
      .map((v) => String(v || '').trim())
      .filter(Boolean)
  })

  const filteredCardsByHolder = computed(() =>
    state.paymentCards.filter((c) => String(c.holder || '') === String(state.form.holder || '')),
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
      website: g.website,
      websiteAccount: g.websiteAccount,
      totalUSD: toNum(g.totalUSD),
      lines: g.lines,
      purchaseGroupId: g.purchaseGroupId,
      paymentBatch: g.paymentBatch,
    }
  })

  const filteredEntries = computed(() => {
    return [...state.entries]
      .filter((row) => {
        if (state.filters.username && row.username !== state.filters.username) return false
        if (state.filters.cardId && row.cardId !== state.filters.cardId) return false
        if (state.filters.recipient && row.recipient !== state.filters.recipient) return false
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

  function addPaymentCard() {
    const holder = String(state.addCardForm.holder || '').trim()
    const bank = String(state.addCardForm.bank || '').trim()
    const tailNo = String(state.addCardForm.tailNo || '').trim()
    const cardType = String(state.addCardForm.cardType || '').trim() || '信用卡'
    if (!holder || !bank || !tailNo || tailNo.length < 2) return false

    const label = `${holder}-${bank}-${tailNo}-${cardType}`
    state.paymentCards.unshift(createCardOption(label, holder, bank, tailNo, cardType))
    state.addCardForm.bank = ''
    state.addCardForm.tailNo = ''
    state.addCardForm.cardType = '信用卡'
    return true
  }

  function removeEntry(id) {
    const idx = state.entries.findIndex((row) => row.id === id)
    if (idx >= 0) state.entries.splice(idx, 1)
  }

  function submitEntry() {
    if (!selectedGroup.value) return { ok: false, message: '请先选择购买组' }
    if (!state.form.purchaseDevice || !state.form.networkEnv || !state.form.vpnNode || !state.form.browser) {
      return { ok: false, message: '请完整填写操作环境信息' }
    }
    if (!state.form.username || !state.form.recipient) {
      return { ok: false, message: '请填写网站登录信息' }
    }
    if (!state.form.holder || !selectedCard.value) {
      return { ok: false, message: '请填写付款信息' }
    }

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
      purchaseDevice: state.form.purchaseDevice,
      networkEnv: state.form.networkEnv,
      vpnNode: state.form.vpnNode,
      browser: state.form.browser,
      username: state.form.username,
      recipient: state.form.recipient,
      holder: state.form.holder,
      cardId: selectedCard.value.id,
      cardLabel: selectedCard.value.label,
      shopQuickPay: state.form.shopQuickPay,
      consumeUSD: toNum(entrySnapshot.value.totalUSD),
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
    selectGroup,
    applyMasterRecipientDefault,
    addMasterAccount,
    removeMasterAccount,
    addPaymentCard,
    removeEntry,
    submitEntry,
  }
}
