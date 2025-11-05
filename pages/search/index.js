const storage = require('../../utils/storage.js')
const settings = require('../../utils/settings.js')

function formatDateKey(d){
  const y = d.getFullYear()
  const m = d.getMonth() + 1
  const day = d.getDate()
  const pad = n => (n < 10 ? '0' + n : '' + n)
  return `${y}-${pad(m)}-${pad(day)}`
}

Page({
  data: {
    theme: 'light',
    keyword: '',
    startDate: '',
    endDate: '',
    emojiOptions: [],
    selectedEmojis: {},
    results: []
  },
  onShow() {
    try {
      const s = settings.getSettings()
      const theme = s.theme || 'light'
      const emojiOptions = s.emojiOptions || []
      this.setData({ theme, emojiOptions })
      try { wx.setNavigationBarColor({ frontColor: theme === 'dark' ? '#ffffff' : '#000000', backgroundColor: theme === 'dark' ? '#0f0f0f' : '#ffffff' }) } catch(e) {}
    } catch(e) {}
    if (!this.data.startDate || !this.data.endDate) {
      const now = new Date()
      const start = new Date(now.getTime() - 29*24*3600*1000)
      this.setData({ startDate: formatDateKey(start), endDate: formatDateKey(now) })
    }
    this.doSearch()
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
  onClearFilters() {
    this.setData({ keyword: '', selectedEmojis: {} })
    this.doSearch()
  },
  doSearch() {
    const all = storage.getAllEntries()
    const { keyword, startDate, endDate, selectedEmojis } = this.data
    const hasEmojiFilter = Object.keys(selectedEmojis).some(k => !!selectedEmojis[k])
    const res = []
    const start = startDate ? new Date(startDate.replace(/-/g,'/')).getTime() : 0
    const end = endDate ? (new Date(endDate.replace(/-/g,'/')).getTime() + 24*3600*1000 - 1) : Number.MAX_SAFE_INTEGER
    const kw = (keyword || '').trim()
    for (const k in all) {
      const e = all[k]
      if (!e || (!e.mood && !e.note)) continue
      const t = e.ts || 0
      if (t < start || t > end) continue
      if (hasEmojiFilter) {
        if (!e.mood || !selectedEmojis[e.mood]) continue
      }
      if (kw) {
        const text = (e.note || '') + (e.mood || '')
        if (text.indexOf(kw) === -1 && k.indexOf(kw) === -1) continue
      }
      res.push({ dateKey: k, mood: e.mood || '', note: e.note || '', ts: t })
    }
    res.sort((a,b) => b.ts - a.ts)
    this.setData({ results: res })
  },
  onItemTap(e) {
    const key = e.currentTarget.dataset.datekey
    if (key) wx.navigateTo({ url: '/pages/detail/index?dateKey=' + key })
  },
  onExportResults() {
    const list = this.data.results || []
    if (!list.length) {
      wx.showToast({ title: '暂无可导出的结果', icon: 'none' })
      return
    }
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
      wx.showToast({ title: '暂无可导出的结果', icon: 'none' })
      return
    }
    map.__exportedAt = new Date().toISOString()
    const text = JSON.stringify(map, null, 2)
    wx.setClipboardData({
      data: text,
      success: () => {
        wx.showToast({ title: '已复制到剪贴板', icon: 'success' })
      },
      fail: () => {
        wx.showToast({ title: '复制失败', icon: 'none' })
      }
    })
  }
})
