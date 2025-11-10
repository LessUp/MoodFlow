const KEY = 'settings_v1'

const DEFAULTS = {
  emojiOptions: ['😀','🙂','😐','🙁','😭','😡','🤩','😴','🧘','🤒','🤗','🤯','🤤'],
  colorMap: {
    '😀': '#FFF3BF', '🙂': '#FFE8A3', '😐': '#E9EDF1', '🙁': '#FFD6D6', '😭': '#FFC7DB', '😡': '#FFB3B3',
    '🤩': '#E6D4FF', '😴': '#DDECFD', '🧘': '#DFF6EA', '🤒': '#E0F0F0', '🤗': '#FFE3CF', '🤯': '#EAD6FF', '🤤': '#E5F7D7'
  },
  weekStart: 1,
  theme: 'light',
  accentColor: '#07c160',
  cloudEnabled: false,
  cloudEnvId: '',
  language: 'zh',
  encryptionEnabled: false,
  encryptionSalt: '',
  encryptionVerifier: '',
  encryptionHint: ''
}

function cloneDefaults() { return JSON.parse(JSON.stringify(DEFAULTS)) }

function getDefaults() { return cloneDefaults() }

function getSettings() {
  try {
    const stored = wx.getStorageSync(KEY)
    if (stored && typeof stored === 'object') {
      return Object.assign(cloneDefaults(), stored)
    }
  } catch (e) {}
  return cloneDefaults()
}

function saveSettings(partial) {
  const current = getSettings()
  const merged = Object.assign({}, current, partial || {})
  try { wx.setStorageSync(KEY, merged) } catch (e) {}
  return merged
}

function setEmojiOptions(arr) {
  const options = Array.isArray(arr) ? arr : cloneDefaults().emojiOptions
  return saveSettings({ emojiOptions: options })
}

function setColorMap(map) {
  const merged = Object.assign({}, cloneDefaults().colorMap, map || {})
  return saveSettings({ colorMap: merged })
}

function setWeekStart(weekStart) {
  return saveSettings({ weekStart: (weekStart === 0 ? 0 : 1) })
}

function setTheme(theme) {
  return saveSettings({ theme: (theme === 'dark' ? 'dark' : 'light') })
}

function setAccentColor(color) {
  let val = typeof color === 'string' ? color.trim() : ''
  if (val && val[0] !== '#') val = '#' + val
  const hex = /^#?[0-9a-fA-F]{6}$/
  if (val && !hex.test(val)) {
    return getSettings()
  }
  if (!val) val = cloneDefaults().accentColor
  return saveSettings({ accentColor: val })
}

function setCloudEnabled(enabled) { return saveSettings({ cloudEnabled: !!enabled }) }

function setCloudEnvId(envId) { return saveSettings({ cloudEnvId: typeof envId === 'string' ? envId.trim() : '' }) }

function setLanguage(language) {
  const supported = ['zh', 'en']
  const lang = supported.indexOf(language) >= 0 ? language : cloneDefaults().language
  return saveSettings({ language: lang })
}

function setEncryptionSettings({ enabled, salt, verifier, hint }) {
  if (!enabled) {
    return saveSettings({
      encryptionEnabled: false,
      encryptionSalt: '',
      encryptionVerifier: '',
      encryptionHint: ''
    })
  }
  return saveSettings({
    encryptionEnabled: true,
    encryptionSalt: salt || '',
    encryptionVerifier: verifier || '',
    encryptionHint: hint || ''
  })
}

module.exports = {
  KEY,
  getDefaults,
  getSettings,
  saveSettings,
  setEmojiOptions,
  setColorMap,
  setWeekStart,
  setTheme,
  setAccentColor,
  setCloudEnabled,
  setCloudEnvId,
  setLanguage,
  setEncryptionSettings
}
