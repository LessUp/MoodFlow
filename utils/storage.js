const KEY_V1 = 'mood_records_v1'
const KEY_V2 = 'mood_records_v2'

const settings = require('./settings.js')
const crypto = require('./crypto.js')

let sessionKey = ''
let encryptionLocked = false

function getEncryptionConfig() {
  const s = settings.getSettings()
  return {
    enabled: !!s.encryptionEnabled,
    salt: s.encryptionSalt || '',
    verifier: s.encryptionVerifier || '',
    hint: s.encryptionHint || ''
  }
}

function hasEncryptionEnabled() {
  const cfg = getEncryptionConfig()
  return cfg.enabled && !!cfg.salt && !!cfg.verifier
}

function readRawV2() {
  try { return wx.getStorageSync(KEY_V2) } catch (e) { return null }
}

function decodeRaw(raw) {
  if (!raw) {
    encryptionLocked = hasEncryptionEnabled() && !sessionKey
    return {}
  }
  if (typeof raw === 'string') {
    try { return decodeRaw(JSON.parse(raw)) } catch (e) { return {} }
  }
  if (raw && typeof raw === 'object' && raw.__encrypted) {
    if (!sessionKey) {
      encryptionLocked = true
      return {}
    }
    try {
      const text = crypto.decrypt(raw.payload || '', sessionKey, raw.iv || '')
      const parsed = text ? JSON.parse(text) : {}
      encryptionLocked = false
      return parsed && typeof parsed === 'object' ? parsed : {}
    } catch (e) {
      encryptionLocked = true
      return {}
    }
  }
  encryptionLocked = false
  return (raw && typeof raw === 'object') ? raw : {}
}

function readV2() {
  const raw = readRawV2()
  return decodeRaw(raw)
}

function writeV2(map) {
  const cfg = getEncryptionConfig()
  if (cfg.enabled) {
    if (!sessionKey) {
      encryptionLocked = true
      return false
    }
    try {
      const enc = crypto.encrypt(JSON.stringify(map || {}), sessionKey)
      const payload = Object.assign({ __encrypted: true }, enc)
      wx.setStorageSync(KEY_V2, payload)
      encryptionLocked = false
      return true
    } catch (e) {
      encryptionLocked = true
      return false
    }
  }
  try {
    wx.setStorageSync(KEY_V2, map || {})
    encryptionLocked = false
    return true
  } catch (e) {
    return false
  }
}

function notifyChange() {
  try {
    const app = (typeof getApp === 'function') ? getApp() : null
    if (app && typeof app.onLocalDataChange === 'function') {
      setTimeout(() => { try { app.onLocalDataChange() } catch (e) {} }, 0)
    }
  } catch (e) {}
}

function migrateIfNeeded() {
  const raw = readRawV2()
  const decoded = decodeRaw(raw)
  if (raw && typeof raw === 'object' && raw.__encrypted) {
    return decoded
  }
  if (raw && typeof raw === 'object' && Object.keys(raw).length > 0) {
    return decoded
  }
  if (raw && typeof raw === 'string') {
    if (Object.keys(decoded).length > 0) return decoded
  }

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

  if (!raw && !hasEncryptionEnabled()) {
    writeV2({})
  }
  return decoded || {}
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

function ensureWrite(map) {
  const ok = writeV2(map)
  if (!ok) {
    const err = new Error('ENCRYPTION_LOCKED')
    err.code = 'ENCRYPTION_LOCKED'
    throw err
  }
}

function setMood(dateKey, mood) {
  const m = getAllEntries()
  if (mood) {
    m[dateKey] = Object.assign({}, m[dateKey] || {}, { mood, ts: Date.now() })
  } else if (m[dateKey]) {
    const note = m[dateKey].note
    if (note) {
      delete m[dateKey].mood
      m[dateKey].ts = Date.now()
    } else {
      delete m[dateKey]
    }
  }
  ensureWrite(m)
  notifyChange()
  return m
}

function setNote(dateKey, note) {
  const m = getAllEntries()
  const has = m[dateKey]
  const text = typeof note === 'string' ? note : ''
  if (text) {
    m[dateKey] = Object.assign({}, has || {}, { note: text, ts: Date.now() })
  } else if (has) {
    if (has.mood) {
      delete m[dateKey].note
      m[dateKey].ts = Date.now()
    } else {
      delete m[dateKey]
    }
  }
  ensureWrite(m)
  notifyChange()
  return m
}

function clearEntry(dateKey) {
  const m = getAllEntries()
  if (m[dateKey]) delete m[dateKey]
  ensureWrite(m)
  notifyChange()
  return m
}

function getMergeDiff(entries) {
  const current = getAllEntries()
  const res = { added: 0, updated: 0, deleted: 0 }
  if (!entries || typeof entries !== 'object') return res
  for (const k in entries) {
    if (typeof k === 'string' && k.startsWith('__')) continue
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
    if (typeof k === 'string' && k.startsWith('__')) continue
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
  try {
    ensureWrite(m)
    notifyChange()
    return { updated }
  } catch (e) {
    if (e && e.code === 'ENCRYPTION_LOCKED') {
      return { updated: 0, locked: true }
    }
    throw e
  }
}

function unlock(passphrase) {
  const cfg = getEncryptionConfig()
  if (!cfg.enabled) {
    sessionKey = ''
    encryptionLocked = false
    return { ok: true }
  }
  const pwd = typeof passphrase === 'string' ? passphrase : ''
  if (!pwd) return { ok: false, reason: 'EMPTY' }
  const hash = crypto.sha256(pwd + '|' + cfg.salt)
  if (hash !== cfg.verifier) {
    return { ok: false, reason: 'MISMATCH' }
  }
  const key = crypto.deriveKey(pwd, cfg.salt)
  const raw = readRawV2()
  if (raw && raw.__encrypted) {
    try {
      crypto.decrypt(raw.payload || '', key, raw.iv || '')
    } catch (e) {
      return { ok: false, reason: 'DECRYPT_FAIL' }
    }
  }
  sessionKey = key
  encryptionLocked = false
  return { ok: true }
}

function lock() {
  sessionKey = ''
  encryptionLocked = hasEncryptionEnabled()
}

function enableEncryption(passphrase, hint = '') {
  const pwd = typeof passphrase === 'string' ? passphrase : ''
  if (pwd.length < 6) {
    return { ok: false, reason: 'WEAK' }
  }
  const salt = crypto.randomSalt(16)
  const key = crypto.deriveKey(pwd, salt)
  const verifier = crypto.sha256(pwd + '|' + salt)
  const data = getAllEntries()
  try {
    const enc = crypto.encrypt(JSON.stringify(data || {}), key)
    wx.setStorageSync(KEY_V2, Object.assign({ __encrypted: true }, enc))
    sessionKey = key
    encryptionLocked = false
    settings.setEncryptionSettings({ enabled: true, salt, verifier, hint })
    return { ok: true }
  } catch (e) {
    sessionKey = ''
    encryptionLocked = false
    return { ok: false, reason: 'WRITE_FAILED' }
  }
}

function disableEncryption() {
  const data = readV2()
  try {
    wx.setStorageSync(KEY_V2, data || {})
    sessionKey = ''
    encryptionLocked = false
    settings.setEncryptionSettings({ enabled: false })
    return { ok: true }
  } catch (e) {
    return { ok: false, reason: 'WRITE_FAILED' }
  }
}

function isLocked() {
  return hasEncryptionEnabled() && (!!encryptionLocked || !sessionKey)
}

function getEncryptionHint() {
  return getEncryptionConfig().hint || ''
}

module.exports = {
  migrateIfNeeded,
  getAllEntries,
  getEntry,
  getMap,
  getMood,
  getNote,
  setMood,
  setNote,
  clearEntry,
  mergeEntries,
  getMergeDiff,
  unlock,
  lock,
  enableEncryption,
  disableEncryption,
  isLocked,
  hasEncryptionEnabled,
  getEncryptionHint
}
