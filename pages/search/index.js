const storage = require('../../utils/storage.js')
const settings = require('../../utils/settings.js')
const i18n = require('../../utils/i18n.js')

function defaultRange() {
  const end = new Date()
  const start = new Date(end.getTime() - 29 * 24 * 3600 * 1000)
  const format = (d) => {
    const y = d.getFullYear()
    const m = d.getMonth() + 1
    const day = d.getDate()
    const pad = n => (n < 10 ? '0' + n : '' + n)
    return `${y}-${pad(m)}-${pad(day)}`
  }
  return { start: format(start), end: format(end) }
}

Page({
  data: {
    theme: 'light',
    accentColor: '#07c160',
    keyword: '',
    startDate: '',
    endDate: '',
    emojiOptions: [],
    selectedEmojis: {},
    onlyWithNotes: false,
    sortOrder: 'desc',
    sortIndex: 0,
    sortOptions: [],
    results: [],
    i18n: {},
    dataLocked: false
  },
  onShow() {
    this.refreshTexts()
    this.setupTheme()
    if (!this.data.startDate || !this.data.endDate) {
      const def = defaultRange()
      this.setData({ startDate: def.start, endDate: def.end })
    }
    if (storage.isLocked()) {
      this.setData({ dataLocked: true, results: [] })
      return
    }
    this.setData({ dataLocked: false })
    this.doSearch()
  },
  refreshTexts() {
    const dict = i18n.getScope('search')
    const options = [
      { value: 'desc', label: dict.sortDesc },
      { value: 'asc', label: dict.sortAsc }
    ]
    const sortOrder = this.data.sortOrder || 'desc'
    const sortIndex = options.findIndex(item => item.value === sortOrder)
    this.setData({ i18n: dict, sortOptions: options, sortIndex: sortIndex >= 0 ? sortIndex : 0 })
  },
  setupTheme() {
    try {
      const s = settings.getSettings()
      const theme = s.theme || 'light'
      const accent = s.accentColor || '#07c160'
      this.setData({ theme, accentColor: accent, emojiOptions: s.emojiOptions || [] })
      try {
        wx.setNavigationBarColor({
          frontColor: theme === 'dark' ? '#ffffff' : '#000000',
          backgroundColor: theme === 'dark' ? '#0f0f0f' : '#ffffff'
        })
      } catch (e) {}
    } catch (e) {}
  },
  onKeywordInput(e) {
    this.setData({ keyword: e.detail.value })
  },
  onStartChange(e) { this.setData({ startDate: e.detail.value }) },
  onEndChange(e) { this.setData({ endDate: e.detail.value }) },
  onEmojiToggle(e) {
    const em = e.currentTarget.dataset.em
    const sel = Object.assign({}, this.data.selectedEmojis)
    sel[em] = !sel[em]
    this.setData({ selectedEmojis: sel })
  },
  onNoteToggle(e) {
    this.setData({ onlyWithNotes: !!(e && e.detail && e.detail.value) })
  },
  onSortChange(e) {
    const idx = Number(e.detail.value)
    const options = this.data.sortOptions || []
    if (!isNaN(idx) && options[idx]) {
      this.setData({ sortIndex: idx, sortOrder: options[idx].value })
      this.doSearch()
    }
  },
  onClearFilters() {
    this.setData({ keyword: '', selectedEmojis: {}, onlyWithNotes: false })
    this.doSearch()
  },
  doSearch() {
    if (storage.isLocked()) {
      this.setData({ dataLocked: true, results: [] })
      return
    }
    const all = storage.getAllEntries()
    const { keyword, startDate, endDate, selectedEmojis, onlyWithNotes, sortOrder } = this.data
    const hasEmojiFilter = Object.keys(selectedEmojis).some(k => !!selectedEmojis[k])
    const res = []
    const start = startDate ? new Date(startDate.replace(/-/g, '/')).getTime() : 0
    const end = endDate ? (new Date(endDate.replace(/-/g, '/')).getTime() + 24 * 3600 * 1000 - 1) : Number.MAX_SAFE_INTEGER
    const kw = (keyword || '').trim().toLowerCase()
    for (const k in all) {
      const e = all[k]
      if (!e || (!e.mood && !e.note)) continue
      const t = e.ts || 0
      if (t < start || t > end) continue
      if (hasEmojiFilter) {
        if (!e.mood || !selectedEmojis[e.mood]) continue
      }
      if (onlyWithNotes && !(e.note && e.note.trim())) continue
      if (kw) {
        const text = ((e.note || '') + (e.mood || '') + k).toLowerCase()
        if (text.indexOf(kw) === -1) continue
      }
      res.push({ dateKey: k, mood: e.mood || '', note: e.note || '', ts: t })
    }
    res.sort((a, b) => sortOrder === 'asc' ? a.ts - b.ts : b.ts - a.ts)
    this.setData({ results: res, dataLocked: false })
  },
  onItemTap(e) {
    const key = e.currentTarget.dataset.datekey
    if (key) wx.navigateTo({ url: '/pages/detail/index?dateKey=' + key })
  },
  ensureExportable(list) {
    if (storage.isLocked()) {
      wx.showToast({ title: this.data.i18n.lockedMessage, icon: 'none' })
      return false
    }
    if (!list.length) {
      wx.showToast({ title: this.data.i18n.exportEmpty, icon: 'none' })
      return false
    }
    return true
  },
  onExportResults() {
    const list = this.data.results || []
    if (!this.ensureExportable(list)) return
    const map = {}
    list.forEach(item => {
      if (!item || !item.dateKey) return
      map[item.dateKey] = {
        mood: item.mood || '',
        note: item.note || '',
        ts: item.ts || Date.now()
      }
    })
    if (Object.keys(map).length === 0) {
      wx.showToast({ title: this.data.i18n.exportEmpty, icon: 'none' })
      return
    }
    map.__exportedAt = new Date().toISOString()
    const text = JSON.stringify(map, null, 2)
    wx.setClipboardData({
      data: text,
      success: () => wx.showToast({ title: this.data.i18n.exportSuccess, icon: 'success' }),
      fail: () => wx.showToast({ title: this.data.i18n.exportFail, icon: 'none' })
    })
  },
  onExportCsv() {
    const list = this.data.results || []
    if (!this.ensureExportable(list)) return
    const header = 'date,mood,note'
    const rows = list.map(item => {
      const sanitize = (value) => {
        if (value === null || value === undefined) return ''
        const text = String(value)
        const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
        const escaped = normalized.replace(/"/g, '""')
        if (/[",\n]/.test(escaped)) {
          return '"' + escaped + '"'
        }
        return escaped
      }
      return `${sanitize(item.dateKey)},${sanitize(item.mood)},${sanitize(item.note)}`
    })
    const csv = [header].concat(rows).join('\n')
    wx.setClipboardData({
      data: csv,
      success: () => wx.showToast({ title: this.data.i18n.csvSuccess, icon: 'success' }),
      fail: () => wx.showToast({ title: this.data.i18n.exportFail, icon: 'none' })
    })
  }
})
