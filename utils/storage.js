const KEY_V1 = 'mood_records_v1'
const KEY_V2 = 'mood_records_v2'

function readV2() {
  try {
    const r = wx.getStorageSync(KEY_V2)
    if (r && typeof r === 'object') return r
    return {}
  } catch (e) {
    return {}
  }
}

function writeV2(map) {
  try { wx.setStorageSync(KEY_V2, map || {}) } catch (e) {}
}

function notifyChange() {
  try {
    const app = (typeof getApp === 'function') ? getApp() : null
    if (app && typeof app.onLocalDataChange === 'function') {
      setTimeout(() => { try { app.onLocalDataChange() } catch(e) {} }, 0)
    }
  } catch (e) {}
}

function migrateIfNeeded() {
  let v2 = null
  try { v2 = wx.getStorageSync(KEY_V2) } catch (e) { v2 = null }
  if (v2 && typeof v2 === 'object' && Object.keys(v2).length > 0) return v2

  let v1 = null
  try { v1 = wx.getStorageSync(KEY_V1) } catch (e) { v1 = null }
  if (v1 && typeof v1 === 'object' && Object.keys(v1).length > 0) {
    const now = Date.now()
    const out = {}
    for (const k in v1) {
      const mood = v1[k]
      if (typeof mood === 'string' && mood) out[k] = { mood, ts: now }
    }
    writeV2(out)
    return out
  }

  if (!v2) { writeV2({}) }
  return v2 || {}
}

function getAllEntries() {
  const m = migrateIfNeeded()
  return (m && typeof m === 'object') ? m : {}
}

function getEntry(dateKey) {
  const m = getAllEntries()
  return m[dateKey] || null
}

function getMap() {
  const m = getAllEntries()
  const res = {}
  for (const k in m) {
    const o = m[k]
    if (o && typeof o === 'object' && o.mood) res[k] = o.mood
  }
  return res
}

function getMood(dateKey) {
  const e = getEntry(dateKey)
  return e && e.mood ? e.mood : ''
}

function getNote(dateKey) {
  const e = getEntry(dateKey)
  return e && e.note ? e.note : ''
}

function setMood(dateKey, mood) {
  const m = getAllEntries()
  if (mood) {
    m[dateKey] = Object.assign({}, m[dateKey] || {}, { mood, ts: Date.now() })
  } else {
    if (m[dateKey]) {
      const note = m[dateKey].note
      if (note) {
        delete m[dateKey].mood
        m[dateKey].ts = Date.now()
      } else {
        delete m[dateKey]
      }
    }
  }
  writeV2(m)
  notifyChange()
  return m
}

function setNote(dateKey, note) {
  const m = getAllEntries()
  const has = m[dateKey]
  const text = typeof note === 'string' ? note : ''
  if (text) {
    m[dateKey] = Object.assign({}, has || {}, { note: text, ts: Date.now() })
  } else {
    if (has) {
      if (has.mood) {
        delete m[dateKey].note
        m[dateKey].ts = Date.now()
      } else {
        delete m[dateKey]
      }
    }
  }
  writeV2(m)
  notifyChange()
  return m
}

function clearEntry(dateKey) {
  const m = getAllEntries()
  if (m[dateKey]) delete m[dateKey]
  writeV2(m)
  notifyChange()
  return m
}

function getMergeDiff(entries) {
  const current = getAllEntries()
  const res = { added: 0, updated: 0, deleted: 0 }
  if (!entries || typeof entries !== 'object') return res
  for (const k in entries) {
    const incoming = entries[k]
    if (!incoming || typeof incoming !== 'object') continue
    const mood = incoming.mood || ''
    const note = incoming.note || ''
    const ts = incoming.ts || 0
    const cur = current[k]
    const curTs = cur && cur.ts ? cur.ts : 0
    if (ts <= curTs) continue
    if (!cur || typeof cur !== 'object') {
      if (mood || note) res.added++
      continue
    }
    if (mood || note) res.updated++
    else res.deleted++
  }
  return res
}

function mergeEntries(entries) {
  if (!entries || typeof entries !== 'object') return { updated: 0 }
  const m = getAllEntries()
  let updated = 0
  for (const k in entries) {
    const e = entries[k]
    if (!e || typeof e !== 'object') continue
    const mood = e.mood || ''
    const note = e.note || ''
    const ts = e.ts || 0
    const cur = m[k]
    const curTs = cur && cur.ts ? cur.ts : 0
    if (ts > curTs) {
      if (mood || note) m[k] = { mood, note, ts }
      else delete m[k]
      updated++
    }
  }
  writeV2(m)
  notifyChange()
  return { updated }
}

module.exports = { migrateIfNeeded, getAllEntries, getEntry, getMap, getMood, getNote, setMood, setNote, clearEntry, mergeEntries, getMergeDiff }
