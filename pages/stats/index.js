const storage = require('../../utils/storage.js')
const settings = require('../../utils/settings.js')
const dateUtil = require('../../utils/date.js')
const i18n = require('../../utils/i18n.js')

const ONE_DAY = 24 * 3600 * 1000
const MAX_DAYS = 180
const MAX_BUCKETS = 120

function computeStreak(all) {
  let streak = 0
  const d = new Date()
  for (;;) {
    const key = dateUtil.formatDateKey(d.getFullYear(), d.getMonth() + 1, d.getDate())
    const e = all[key]
    if (e && (e.mood || e.note)) streak++
    else break
    d.setDate(d.getDate() - 1)
  }
  return streak
}

function defaultRange() {
  const end = new Date()
  end.setHours(0, 0, 0, 0)
  const start = new Date(end.getTime() - 29 * ONE_DAY)
  return {
    start: dateUtil.formatDateKey(start.getFullYear(), start.getMonth() + 1, start.getDate()),
    end: dateUtil.formatDateKey(end.getFullYear(), end.getMonth() + 1, end.getDate())
  }
}

function parseDateKey(str) {
  if (!str) return null
  const t = str.replace(/-/g, '/')
  const d = new Date(t)
  if (Number.isNaN(d.getTime())) return null
  d.setHours(0, 0, 0, 0)
  return d
}

function ensureRange(startStr, endStr) {
  let start = parseDateKey(startStr)
  let end = parseDateKey(endStr)
  if (!start || !end || start.getTime() > end.getTime()) {
    const def = defaultRange()
    start = parseDateKey(def.start)
    end = parseDateKey(def.end)
  }
  const diffDays = Math.floor((end.getTime() - start.getTime()) / ONE_DAY) + 1
  if (diffDays > MAX_DAYS) {
    start = new Date(end.getTime() - (MAX_DAYS - 1) * ONE_DAY)
  }
  return {
    startKey: dateUtil.formatDateKey(start.getFullYear(), start.getMonth() + 1, start.getDate()),
    endKey: dateUtil.formatDateKey(end.getFullYear(), end.getMonth() + 1, end.getDate()),
    startTs: start.getTime(),
    endTs: end.getTime() + ONE_DAY - 1,
    days: Math.floor((end.getTime() - start.getTime()) / ONE_DAY) + 1
  }
}

Page({
  data: {
    theme: 'light',
    accentColor: '#07c160',
    language: 'zh',
    i18n: {},
    emojiOptions: [],
    moodCounts: [],
    rangeMoodCounts: [],
    totalCount: 0,
    monthLabel: '',
    streakDays: 0,
    granularity: 'day',
    useEcharts: false,
    rangeStart: '',
    rangeEnd: '',
    summaryAverageLabel: '',
    summaryTopMoodLabel: '',
    summaryQuietLabel: '',
    summaryClipboard: '',
    dataLocked: false
  },
  onShow() {
    this.refreshTexts()
    this.setupTheme()
    this.ensureRange()
    this.computeStats()
    this.trySetupEcharts()
  },
  refreshTexts() {
    this.setData({ i18n: i18n.getScope('stats') })
  },
  setupTheme() {
    try {
      const s = settings.getSettings()
      const theme = s.theme || 'light'
      const accent = s.accentColor || '#07c160'
      const language = s.language || 'zh'
      this.setData({ theme, accentColor: accent, language, emojiOptions: s.emojiOptions || [] })
      try {
        wx.setNavigationBarColor({
          frontColor: theme === 'dark' ? '#ffffff' : '#000000',
          backgroundColor: theme === 'dark' ? '#0f0f0f' : '#ffffff'
        })
      } catch (e) {}
    } catch (e) {}
  },
  ensureRange() {
    if (!this.data.rangeStart || !this.data.rangeEnd) {
      const def = defaultRange()
      this.setData({ rangeStart: def.start, rangeEnd: def.end })
    }
  },
  computeStats() {
    if (storage.isLocked()) {
      this.setData({
        dataLocked: true,
        moodCounts: [],
        rangeMoodCounts: [],
        totalCount: 0,
        summaryAverageLabel: '',
        summaryTopMoodLabel: '',
        summaryQuietLabel: '',
        summaryClipboard: ''
      })
      return
    }
    const s = settings.getSettings()
    const order = s.emojiOptions || []
    const all = storage.getAllEntries()

    const moodCountMap = {}
    let total = 0
    for (const k in all) {
      const e = all[k]
      if (e && (e.mood || e.note)) total++
      if (e && e.mood) moodCountMap[e.mood] = (moodCountMap[e.mood] || 0) + 1
    }

    const now = new Date()
    const y = now.getFullYear()
    const m = now.getMonth() + 1
    const monthLabel = dateUtil.monthLabel(y, m, this.data.language)
    const streak = computeStreak(all)

    const orderedList = (map) => {
      const arr = []
      for (const em of order) {
        if (map[em]) arr.push({ mood: em, count: map[em] })
      }
      for (const key in map) {
        if (order.indexOf(key) === -1) arr.push({ mood: key, count: map[key] })
      }
      return arr
    }

    const trend = this.buildTrendData(this.data.granularity)

    const moodCounts = orderedList(moodCountMap)
    const rangeMoodCounts = orderedList(trend.moodTotals)

    const avg = trend.rangeDays > 0 ? trend.totalEntries / trend.rangeDays : 0
    const avgText = avg.toFixed(1)
    const topMood = trend.sortedMoodTotals.length ? trend.sortedMoodTotals[0].mood : '-'
    const topCount = trend.sortedMoodTotals.length ? trend.sortedMoodTotals[0].count : 0
    const summaryAverageLabel = i18n.t('stats.summaryAverage', { value: avgText })
    const summaryTopMoodLabel = i18n.t('stats.summaryTopMood', { mood: topMood, count: topCount })
    const summaryQuietLabel = i18n.t('stats.summaryQuiet', { value: trend.quietDays })
    const summaryClipboard = `${summaryAverageLabel}\n${summaryTopMoodLabel}\n${summaryQuietLabel}`

    this.setData({
      dataLocked: false,
      moodCounts,
      rangeMoodCounts,
      totalCount: total,
      monthLabel,
      streakDays: streak,
      summaryAverageLabel,
      summaryTopMoodLabel,
      summaryQuietLabel,
      summaryClipboard
    })

    this._latestTrend = trend
    if (this.data.useEcharts) {
      this.updateEcharts()
    } else {
      this.drawCharts()
    }
  },
  onGranularityTap(e) {
    const g = e.currentTarget.dataset.g
    if (!g) return
    this.setData({ granularity: g })
    this.computeStats()
  },
  onRangeStartChange(e) {
    this.setData({ rangeStart: e.detail.value })
  },
  onRangeEndChange(e) {
    this.setData({ rangeEnd: e.detail.value })
  },
  onRangeApply() {
    this.computeStats()
  },
  onRangeReset() {
    const def = defaultRange()
    this.setData({ rangeStart: def.start, rangeEnd: def.end })
    this.computeStats()
  },
  onCopySummary() {
    const text = this.data.summaryClipboard || ''
    if (!text) return
    wx.setClipboardData({
      data: text,
      success: () => wx.showToast({ title: this.data.i18n.copySummary, icon: 'success' }),
      fail: () => wx.showToast({ title: this.data.i18n.copyFail || 'failed', icon: 'none' })
    })
  },
  trySetupEcharts() {
    if (this.data.dataLocked) {
      this.setData({ useEcharts: false })
      return
    }
    let echarts = null
    try {
      echarts = require('../../ec-canvas/echarts.js')
    } catch (e) { echarts = null }
    if (!echarts) {
      this.setData({ useEcharts: false })
      this.drawCharts()
      return
    }
    this._echarts = echarts
    this.setData({ useEcharts: true })
    this.initEcharts()
  },
  initEcharts() {
    if (!this._latestTrend) return
    const echarts = this._echarts
    const compTrend = this.selectComponent('#trendEC')
    const compPie = this.selectComponent('#pieEC')
    const { xs, ys, pieMap } = this._latestTrend
    const accent = this.data.accentColor || '#07c160'
    const buildTrendOption = () => ({
      backgroundColor: 'transparent',
      grid: { left: 32, right: 12, top: 16, bottom: 24 },
      xAxis: { type: 'category', data: xs, axisLabel: { show: xs.length > 0, color: this.data.theme === 'dark' ? '#aaa' : '#666' }, axisLine: { lineStyle: { color: this.data.theme === 'dark' ? '#333' : '#ddd' } }, axisTick: { show: false } },
      yAxis: { type: 'value', minInterval: 1, axisLabel: { color: this.data.theme === 'dark' ? '#aaa' : '#666' }, splitLine: { lineStyle: { color: this.data.theme === 'dark' ? '#333' : '#eee' } } },
      series: [{ type: 'line', data: ys, smooth: true, symbolSize: 4, itemStyle: { color: accent }, lineStyle: { color: accent }, areaStyle: { opacity: 0.12, color: accent } }]
    })
    const buildPieOption = () => ({
      backgroundColor: 'transparent',
      series: [{
        name: 'share', type: 'pie', radius: ['40%', '70%'], avoidLabelOverlap: false,
        label: { show: false }, labelLine: { show: false },
        data: Object.keys(pieMap).map((m) => ({ name: m, value: pieMap[m] }))
      }]
    })
    if (compTrend && compTrend.init) {
      compTrend.init((canvas, width, height, dpr) => {
        const chart = echarts.init(canvas, null, { width, height, devicePixelRatio: dpr })
        chart.setOption(buildTrendOption())
        this._trendChart = chart
        return chart
      })
    }
    if (compPie && compPie.init) {
      compPie.init((canvas, width, height, dpr) => {
        const chart = echarts.init(canvas, null, { width, height, devicePixelRatio: dpr })
        chart.setOption(buildPieOption())
        this._pieChart = chart
        return chart
      })
    }
  },
  updateEcharts() {
    if (!this._echarts || !this._latestTrend) { this.trySetupEcharts(); return }
    const { xs, ys, pieMap } = this._latestTrend
    if (this._trendChart) {
      this._trendChart.setOption({ xAxis: { data: xs }, series: [{ data: ys }] })
    }
    if (this._pieChart) {
      this._pieChart.setOption({ series: [{ data: Object.keys(pieMap).map((m) => ({ name: m, value: pieMap[m] })) }] })
    }
  },
  buildTrendData(granularity) {
    const range = ensureRange(this.data.rangeStart, this.data.rangeEnd)
    this.setData({ rangeStart: range.startKey, rangeEnd: range.endKey })
    const all = storage.getAllEntries()
    const buckets = []
    const pad = n => (n < 10 ? '0' + n : '' + n)
    if (granularity === 'day') {
      const step = Math.max(1, Math.ceil(range.days / MAX_BUCKETS))
      for (let offset = 0; offset < range.days; offset += step) {
        const startDate = new Date(range.startTs + offset * ONE_DAY)
        startDate.setHours(0, 0, 0, 0)
        const endOffset = Math.min(range.days - 1, offset + step - 1)
        const endDate = new Date(range.startTs + endOffset * ONE_DAY)
        endDate.setHours(23, 59, 59, 999)
        const start = startDate.getTime()
        const end = Math.min(endDate.getTime(), range.endTs)
        const label = step === 1
          ? pad(startDate.getMonth() + 1) + '-' + pad(startDate.getDate())
          : `${pad(startDate.getMonth() + 1)}/${pad(startDate.getDate())}~${pad(endDate.getMonth() + 1)}/${pad(endDate.getDate())}`
        buckets.push({ label, start, end })
      }
    } else if (granularity === 'week') {
      let cursor = new Date(range.startTs)
      cursor.setHours(0, 0, 0, 0)
      let index = 1
      while (cursor.getTime() <= range.endTs) {
        const start = cursor.getTime()
        const end = Math.min(start + 6 * ONE_DAY + (ONE_DAY - 1), range.endTs)
        buckets.push({ label: 'W' + index, start, end })
        cursor = new Date(end + 1)
        cursor.setHours(0, 0, 0, 0)
        index++
        if (buckets.length >= MAX_BUCKETS) break
      }
    } else {
      let cursor = new Date(range.startTs)
      cursor.setDate(1)
      cursor.setHours(0, 0, 0, 0)
      while (cursor.getTime() <= range.endTs) {
        const start = cursor.getTime()
        const endDate = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0)
        endDate.setHours(23, 59, 59, 999)
        const end = Math.min(endDate.getTime(), range.endTs)
        buckets.push({ label: cursor.getFullYear() + '-' + pad(cursor.getMonth() + 1), start, end })
        cursor = new Date(endDate.getFullYear(), endDate.getMonth() + 1, 1)
        cursor.setHours(0, 0, 0, 0)
        if (buckets.length >= MAX_BUCKETS) break
      }
    }

    const xs = []
    const ys = []
    const moodTotals = {}
    let totalEntries = 0
    const dayHasEntry = new Set()

    for (const bucket of buckets) {
      let count = 0
      for (const key in all) {
        const e = all[key]
        const t = e && e.ts ? e.ts : 0
        if (t >= bucket.start && t <= bucket.end && (e.mood || e.note)) {
          count++
          totalEntries++
          if (e.mood) moodTotals[e.mood] = (moodTotals[e.mood] || 0) + 1
          const dayKey = dateUtil.formatDateKey(new Date(t).getFullYear(), new Date(t).getMonth() + 1, new Date(t).getDate())
          dayHasEntry.add(dayKey)
        }
      }
      xs.push(bucket.label)
      ys.push(count)
    }

    const pieMap = {}
    const filteredStart = range.startTs
    const filteredEnd = range.endTs
    for (const key in all) {
      const e = all[key]
      const t = e && e.ts ? e.ts : 0
      if (t < filteredStart || t > filteredEnd) continue
      if (e && e.mood) pieMap[e.mood] = (pieMap[e.mood] || 0) + 1
    }

    const moodArray = Object.keys(moodTotals).map(mood => ({ mood, count: moodTotals[mood] }))
    moodArray.sort((a, b) => b.count - a.count)

    return {
      xs,
      ys,
      pieMap,
      moodTotals,
      sortedMoodTotals: moodArray,
      totalEntries,
      rangeDays: range.days,
      quietDays: Math.max(range.days - dayHasEntry.size, 0)
    }
  },
  drawCharts() {
    if (this.data.dataLocked) return
    if (!this._latestTrend) return
    const { xs, ys, pieMap } = this._latestTrend
    this.drawTrendLine(xs, ys)
    this.drawPieChart(pieMap)
  },
  drawTrendLine(xs, ys) {
    const ctx = wx.createCanvasContext('trendCanvas', this)
    const sys = wx.getSystemInfoSync()
    const W = sys.windowWidth - 32
    const H = 200
    const padL = 40, padR = 16, padT = 20, padB = 32
    const maxY = Math.max(1, ...ys)
    const toX = i => padL + (W - padL - padR) * (i / Math.max(1, xs.length - 1))
    const toY = v => H - padB - (H - padT - padB) * (v / maxY)
    const isDark = (this.data.theme === 'dark')
    const bg = isDark ? '#161616' : '#ffffff'
    const axis = isDark ? '#333333' : '#dddddd'
    const text = isDark ? '#aaaaaa' : '#666666'
    const accent = this.data.accentColor || '#07c160'
    ctx.setFillStyle(bg); ctx.fillRect(0, 0, W, H)
    ctx.setStrokeStyle(axis); ctx.setLineWidth(1)
    ctx.moveTo(padL, padT); ctx.lineTo(padL, H - padB); ctx.lineTo(W - padR, H - padB); ctx.stroke()
    ctx.setStrokeStyle(accent); ctx.setLineWidth(2)
    ys.forEach((v, i) => { if (i === 0) ctx.moveTo(toX(i), toY(v)); else ctx.lineTo(toX(i), toY(v)) })
    ctx.stroke()
    ctx.setFillStyle(accent)
    ys.forEach((v, i) => { ctx.beginPath(); ctx.arc(toX(i), toY(v), 3, 0, Math.PI * 2); ctx.fill() })
    ctx.setFillStyle(text); ctx.setFontSize(10)
    if (xs.length) {
      ctx.fillText(xs[0], padL, H - 8)
      ctx.fillText(xs[xs.length - 1], W - 60, H - 8)
    }
    ctx.draw()
  },
  drawPieChart(map) {
    const ctx = wx.createCanvasContext('pieCanvas', this)
    const sys = wx.getSystemInfoSync()
    const W = sys.windowWidth - 32
    const H = 200
    const cx = W / 2
    const cy = H / 2
    const r = Math.min(W, H) / 3
    const total = Object.values(map).reduce((a, b) => a + b, 0)
    const isDark = (this.data.theme === 'dark')
    const bg = isDark ? '#161616' : '#ffffff'
    const empty = isDark ? '#777777' : '#bbbbbb'
    ctx.setFillStyle(bg); ctx.fillRect(0, 0, W, H)
    if (!total) {
      ctx.setFillStyle(empty); ctx.setFontSize(12); ctx.fillText(this.data.i18n.noDataTitle || 'No data', cx - 30, cy)
      ctx.draw(); return
    }
    let start = -Math.PI / 2
    const colors = ['#07c160', '#5B8FF9', '#F6BD16', '#E8684A', '#6DC8EC', '#9270CA', '#FF99C3']
    let idx = 0
    for (const mood in map) {
      const val = map[mood]
      const angle = (val / total) * Math.PI * 2
      ctx.beginPath()
      ctx.moveTo(cx, cy)
      ctx.setFillStyle(colors[idx % colors.length])
      ctx.arc(cx, cy, r, start, start + angle)
      ctx.closePath(); ctx.fill()
      start += angle; idx++
    }
    ctx.setFillStyle(bg); ctx.beginPath(); ctx.arc(cx, cy, r * 0.5, 0, Math.PI * 2); ctx.fill()
    ctx.draw()
  }
})
