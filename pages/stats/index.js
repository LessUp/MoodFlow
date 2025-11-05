const storage = require('../../utils/storage.js')
const settings = require('../../utils/settings.js')
const dateUtil = require('../../utils/date.js')

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

Page({
  data: {
    theme: 'light',
    emojiOptions: [],
    moodCounts: [],
    monthMoodCounts: [],
    totalCount: 0,
    monthLabel: '',
    streakDays: 0,
    granularity: 'day',
    useEcharts: false
  },
  onShow() {
    try {
      const s = settings.getSettings()
      const theme = s.theme || 'light'
      this.setData({ theme })
      try { wx.setNavigationBarColor({ frontColor: theme === 'dark' ? '#ffffff' : '#000000', backgroundColor: theme === 'dark' ? '#0f0f0f' : '#ffffff' }) } catch(e) {}
    } catch(e) {}
    this.computeStats()
    this.trySetupEcharts()
  },
  computeStats() {
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
    const prefix = y + '-' + (m < 10 ? '0' + m : '' + m)

    const monthCountMap = {}
    for (const k in all) {
      if (k.startsWith(prefix)) {
        const e = all[k]
        if (e && e.mood) monthCountMap[e.mood] = (monthCountMap[e.mood] || 0) + 1
      }
    }

    function orderedList(map) {
      const arr = []
      for (const em of order) {
        if (map[em]) arr.push({ mood: em, count: map[em] })
      }
      for (const key in map) {
        if (order.indexOf(key) === -1) arr.push({ mood: key, count: map[key] })
      }
      return arr
    }

    const moodCounts = orderedList(moodCountMap)
    const monthMoodCounts = orderedList(monthCountMap)
    const monthLabel = dateUtil.monthLabel(y, m)
    const streak = computeStreak(all)

    this.setData({ emojiOptions: order, moodCounts, monthMoodCounts, totalCount: total, monthLabel, streakDays: streak })
  },
  onGranularityTap(e) {
    const g = e.currentTarget.dataset.g
    if (!g) return
    this.setData({ granularity: g })
    if (this.data.useEcharts) {
      this.updateEcharts()
    } else {
      this.drawCharts()
    }
  },
  trySetupEcharts() {
    let echarts = null
    try {
      echarts = require('../../ec-canvas/echarts.js')
    } catch(e) { echarts = null }
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
    const echarts = this._echarts
    const compTrend = this.selectComponent('#trendEC')
    const compPie = this.selectComponent('#pieEC')
    const { xs, ys, pieMap } = this.buildTrendData(this.data.granularity)
    const buildTrendOption = () => ({
      backgroundColor: 'transparent',
      grid: { left: 32, right: 12, top: 16, bottom: 24 },
      xAxis: { type: 'category', data: xs, axisLabel: { show: xs.length > 0, color: this.data.theme==='dark'?'#aaa':'#666' }, axisLine: { lineStyle: { color: this.data.theme==='dark'?'#333':'#ddd' } }, axisTick: { show: false } },
      yAxis: { type: 'value', minInterval: 1, axisLabel: { color: this.data.theme==='dark'?'#aaa':'#666' }, splitLine: { lineStyle: { color: this.data.theme==='dark'?'#333':'#eee' } } },
      series: [{ type: 'line', data: ys, smooth: true, symbolSize: 4, itemStyle: { color: '#07c160' }, lineStyle: { color: '#07c160' }, areaStyle: { opacity: 0.08, color: '#07c160' } }]
    })
    const buildPieOption = () => ({
      backgroundColor: 'transparent',
      series: [{
        name: '占比', type: 'pie', radius: ['40%','70%'], avoidLabelOverlap: false,
        label: { show: false }, labelLine: { show: false },
        data: Object.keys(pieMap).map((m)=>({ name: m, value: pieMap[m] }))
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
    if (!this._echarts) { this.trySetupEcharts(); return }
    const { xs, ys, pieMap } = this.buildTrendData(this.data.granularity)
    if (this._trendChart) {
      this._trendChart.setOption({ xAxis: { data: xs }, series: [{ data: ys }] })
    }
    if (this._pieChart) {
      this._pieChart.setOption({ series: [{ data: Object.keys(pieMap).map((m)=>({ name: m, value: pieMap[m] })) }] })
    }
  },
  buildTrendData(granularity) {
    const all = storage.getAllEntries()
    const now = new Date()
    const buckets = []
    const oneDay = 24*3600*1000
    const pad = n => (n < 10 ? '0' + n : '' + n)
    if (granularity === 'day') {
      for (let i = 29; i >= 0; i--) {
        const d = new Date(now.getTime() - i*oneDay)
        const start = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
        const end = start + oneDay - 1
        buckets.push({ label: pad(d.getMonth()+1)+'-'+pad(d.getDate()), start, end })
      }
    } else if (granularity === 'week') {
      const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() + oneDay - 1
      for (let offset = 11; offset >= 0; offset--) {
        const wEnd = endOfToday - offset*7*oneDay
        const wStart = wEnd - 6*oneDay
        buckets.push({ label: 'W'+(12 - offset), start: wStart, end: wEnd })
      }
    } else {
      for (let offset = 11; offset >= 0; offset--) {
        const firstDay = new Date(now.getFullYear(), now.getMonth() - offset, 1)
        const start = firstDay.getTime()
        const end = new Date(firstDay.getFullYear(), firstDay.getMonth() + 1, 0).getTime() + (oneDay - 1)
        buckets.push({ label: firstDay.getFullYear()+'-'+pad(firstDay.getMonth()+1), start, end })
      }
    }
    // count per bucket
    const xs = []; const ys = []
    for (const b of buckets) {
      let c = 0
      for (const k in all) {
        const e = all[k]
        const t = e && e.ts ? e.ts : 0
        if (t >= b.start && t <= b.end && (e.mood || e.note)) c++
      }
      xs.push(b.label); ys.push(c)
    }
    // pie counts for the same span
    const pieMap = {}
    const spanStart = buckets.length ? Math.min(...buckets.map(b => b.start)) : 0
    const spanEnd = buckets.length ? Math.max(...buckets.map(b => b.end)) : 0
    for (const k in all) {
      const e = all[k]
      const t = e && e.ts ? e.ts : 0
      if (t < spanStart || t > spanEnd) continue
      if (e && e.mood) pieMap[e.mood] = (pieMap[e.mood] || 0) + 1
    }
    return { xs, ys, pieMap }
  },
  drawCharts() {
    try {
      const g = this.data.granularity || 'day'
      const { xs, ys, pieMap } = this.buildTrendData(g)
      this.drawTrendLine(xs, ys)
      this.drawPieChart(pieMap)
    } catch(e) {}
  },
  drawTrendLine(xs, ys) {
    const ctx = wx.createCanvasContext('trendCanvas', this)
    const sys = wx.getSystemInfoSync()
    const W = sys.windowWidth - 32
    const H = 180
    const padL = 30, padR = 10, padT = 10, padB = 24
    const maxY = Math.max(1, ...ys)
    const toX = i => padL + (W - padL - padR) * (i / Math.max(1, xs.length - 1))
    const toY = v => H - padB - (H - padT - padB) * (v / maxY)
    const isDark = (this.data.theme === 'dark')
    const bg = isDark ? '#161616' : '#ffffff'
    const axis = isDark ? '#333333' : '#dddddd'
    const text = isDark ? '#aaaaaa' : '#888888'
    // bg
    ctx.setFillStyle(bg); ctx.fillRect(0,0,W,H)
    // axes
    ctx.setStrokeStyle(axis); ctx.setLineWidth(1)
    ctx.moveTo(padL, padT); ctx.lineTo(padL, H - padB); ctx.lineTo(W - padR, H - padB); ctx.stroke()
    // line
    ctx.setStrokeStyle('#07c160'); ctx.setLineWidth(2)
    ys.forEach((v,i)=>{ if(i===0) ctx.moveTo(toX(i), toY(v)); else ctx.lineTo(toX(i), toY(v)) });
    ctx.stroke()
    // dots
    ctx.setFillStyle('#07c160')
    ys.forEach((v,i)=>{ ctx.beginPath(); ctx.arc(toX(i), toY(v), 2, 0, Math.PI*2); ctx.fill() })
    // labels: only ends to avoid拥挤
    ctx.setFillStyle(text); ctx.setFontSize(10)
    if (xs.length) { ctx.fillText(xs[0], padL, H-6); ctx.fillText(xs[xs.length-1], W-60, H-6) }
    ctx.draw()
  },
  drawPieChart(map) {
    const ctx = wx.createCanvasContext('pieCanvas', this)
    const sys = wx.getSystemInfoSync()
    const W = sys.windowWidth - 32
    const H = 180
    const cx = W/2, cy = H/2, r = Math.min(W,H)/3
    const total = Object.values(map).reduce((a,b)=>a+b,0)
    const isDark = (this.data.theme === 'dark')
    const bg = isDark ? '#161616' : '#ffffff'
    const empty = isDark ? '#777777' : '#bbbbbb'
    ctx.setFillStyle(bg); ctx.fillRect(0,0,W,H)
    if (!total) { ctx.setFillStyle(empty); ctx.setFontSize(12); ctx.fillText('暂无数据', cx-24, cy); ctx.draw(); return }
    let start = -Math.PI/2
    const colors = ['#07c160','#5B8FF9','#F6BD16','#E8684A','#6DC8EC','#9270CA','#FF99C3']
    let idx = 0
    for (const mood in map) {
      const val = map[mood]
      const angle = (val/total) * Math.PI*2
      ctx.beginPath()
      ctx.moveTo(cx, cy)
      ctx.setFillStyle(colors[idx % colors.length])
      ctx.arc(cx, cy, r, start, start + angle)
      ctx.closePath(); ctx.fill()
      start += angle; idx++
    }
    // donut hole
    ctx.setFillStyle(bg); ctx.beginPath(); ctx.arc(cx, cy, r*0.5, 0, Math.PI*2); ctx.fill()
    ctx.draw()
  }
})
