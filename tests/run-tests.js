const path = require('path')
const assert = require('assert')

const projectRoot = path.resolve(__dirname, '..')

const navCalls = []
const clipboardCalls = []

global.__pages = []
global.Page = function (obj) { global.__pages.push(obj) }

function noop() {}

function makeCanvasCtx() {
  return {
    setFillStyle: noop,
    fillRect: noop,
    setStrokeStyle: noop,
    setLineWidth: noop,
    moveTo: noop,
    lineTo: noop,
    stroke: noop,
    beginPath: noop,
    arc: noop,
    closePath: noop,
    fill: noop,
    setFontSize: noop,
    fillText: noop,
    draw: noop
  }
}

global.wx = {
  getStorageSync: (key) => global.__storage[key],
  setStorageSync: (key, val) => { global.__storage[key] = val },
  setNavigationBarColor: noop,
  createCanvasContext: () => makeCanvasCtx(),
  getSystemInfoSync: () => ({ windowWidth: 375 }),
  setClipboardData: ({ data, success, fail }) => { clipboardCalls.push(data); if (success) success() },
  showToast: noop,
  showModal: ({ success }) => { if (success) success({ confirm: true }) },
  cloud: undefined,
  env: { USER_DATA_PATH: projectRoot }
}

global.getApp = () => ({ onLocalDataChange: noop })

// Prepare require cache mocks before loading pages
function mockModule(relPath, exportsObj) {
  const full = path.resolve(projectRoot, relPath)
  const id = require.resolve(full)
  require.cache[id] = { id, filename: id, loaded: true, exports: exportsObj }
}

// Synthetic dataset
const emojiOptions = ['😀', '🙂', '😐']
const sampleData = {
  '2025-10-01': { mood: '😀', note: 'start', ts: new Date('2025-10-01').getTime() },
  '2025-10-02': { mood: '😀', note: '', ts: new Date('2025-10-02').getTime() },
  '2025-10-03': { mood: '🙂', note: 'ok', ts: new Date('2025-10-03').getTime() },
  '2025-10-05': { mood: '', note: 'only note', ts: new Date('2025-10-05').getTime() },
  '2025-10-08': { mood: '😐', note: '', ts: new Date('2025-10-08').getTime() },
  '2025-10-10': { mood: '', note: '', ts: new Date('2025-10-10').getTime() }
}

global.__storage = {
  settings_v1: { emojiOptions, theme: 'light', accentColor: '#07c160', language: 'zh' },
  mood_records_v2: sampleData
}

// Mock utils modules
mockModule('utils/settings.js', require(path.resolve(projectRoot, 'utils/settings.js')))
mockModule('utils/i18n.js', require(path.resolve(projectRoot, 'utils/i18n.js')))
mockModule('utils/date.js', require(path.resolve(projectRoot, 'utils/date.js')))
mockModule('utils/crypto.js', require(path.resolve(projectRoot, 'utils/crypto.js')))
mockModule('utils/storage.js', require(path.resolve(projectRoot, 'utils/storage.js')))

function requirePage(relPath) {
  global.__pages = []
  const full = path.resolve(projectRoot, relPath)
  delete require.cache[require.resolve(full)]
  require(full)
  const page = global.__pages[global.__pages.length - 1]
  // Attach minimal setData implementation
  page.setData = function (partial) { this.data = Object.assign({}, this.data, partial) }
  // Attach selectors
  page.selectComponent = function () { return { init: noop } }
  return page
}

function testI18n() {
  const i18n = require(path.resolve(projectRoot, 'utils/i18n.js'))
  const dict = i18n.getScope('search')
  assert.ok(dict.withMoodOnly && dict.emptyMoodOnly, 'i18n keys for new filters present')
  console.log('i18n: PASS')
}

function testStats() {
  const statsPage = requirePage('pages/stats/index.js')
  statsPage.data.rangeStart = '2025-10-01'
  statsPage.data.rangeEnd = '2025-10-10'
  statsPage.data.granularity = 'day'
  statsPage.computeStats()
  assert.strictEqual(statsPage.data.dataLocked, false, 'stats not locked')
  const byRange = statsPage.data.rangeMoodCounts
  const mMap = {}
  byRange.forEach(it => { mMap[it.mood] = it.count })
  assert.strictEqual(mMap['😀'] >= 2, true, 'range counts include 😀')
  assert.ok(statsPage._trendBuckets && statsPage._trendBuckets.length > 0, 'trend buckets computed')
  // Verify pie arcs after draw
  const trend = statsPage._latestTrend
  assert.ok(trend && trend.pieMap, 'trend pie map ready')
  statsPage.drawPieChart(trend.pieMap)
  assert.ok(statsPage._pieArcs && statsPage._pieArcs.length >= 1, 'pie arcs recorded')
  // Simulate tapping first arc
  const arc = statsPage._pieArcs[0]
  const mid = (arc.start + arc.end) / 2
  const W = global.wx.getSystemInfoSync().windowWidth - 32
  const H = 200
  const cx = W / 2, cy = H / 2, r = Math.min(W, H) / 3
  const x = cx + Math.cos(mid) * (r * 0.75)
  const y = cy + Math.sin(mid) * (r * 0.75)
  global.wx.navigateTo = ({ url }) => { navCalls.push(url) }
  statsPage.onPieTap({ detail: { x, y } })
  assert.ok(navCalls.find(u => u.includes('/pages/search/index?mood=')), 'pie tap navigates to search')
  console.log('stats: PASS')
}

function testSearch() {
  const searchPage = requirePage('pages/search/index.js')
  searchPage.onLoad({ mood: '😀' })
  searchPage.onShow()
  searchPage.setData({ startDate: '2025-10-01', endDate: '2025-10-10' })
  searchPage.doSearch()
  // With emoji param, results should include rows with 😀
  const hasEmojiFilter = Object.keys(searchPage.data.selectedEmojis).some(k => searchPage.data.selectedEmojis[k])
  assert.ok(hasEmojiFilter, 'emoji preselect from stats')
  assert.ok(searchPage.data.results.length >= 1, 'search results present')
  // Apply Only with mood
  searchPage.onWithMoodToggle({ detail: { value: true } })
  searchPage.doSearch()
  assert.ok(searchPage.data.results.every(r => !!r.mood), 'onlyWithMood filter works')
  // Apply Empty mood
  searchPage.onEmptyMoodToggle({ detail: { value: true } })
  searchPage.doSearch()
  assert.ok(searchPage.data.results.every(r => !r.mood), 'onlyEmptyMood filter works')
  console.log('search: PASS')
}

function run() {
  testI18n()
  testStats()
  testSearch()
  console.log('ALL TESTS PASSED')
}

run()