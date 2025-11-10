const settings = require('../../utils/settings.js')
const storage = require('../../utils/storage.js')
const cloud = require('../../utils/cloud.js')
const sync = require('../../utils/sync.js')
const i18n = require('../../utils/i18n.js')

function updateNav(theme) {
  try {
    wx.setNavigationBarColor({
      frontColor: theme === 'dark' ? '#ffffff' : '#000000',
      backgroundColor: theme === 'dark' ? '#0f0f0f' : '#ffffff'
    })
  } catch (e) {}
}

function formatBackupTime(ts, lang) {
  if (!ts) return ''
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return ''
  const pad = n => (n < 10 ? '0' + n : '' + n)
  if (lang === 'en') {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
  }
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

Page({
  data: {
    i18n: {},
    weekStart: 1,
    emojiText: '',
    colorItems: [],
    cloudEnabled: false,
    cloudEnvId: '',
    syncStatus: '',
    theme: 'light',
    accentColor: '#07c160',
    language: 'zh',
    languages: [],
    languageIndex: 0,
    importText: '',
    backupNote: '',
    backups: [],
    encryptionEnabled: false,
    encryptionLocked: false,
    encryptionHint: '',
    passwordInput: '',
    passwordConfirm: '',
    unlockPassword: '',
    hintText: '',
    accentDraft: '',
    isLoadingBackups: false
  },
  onShow() {
    this.refreshTexts()
    this.refreshSettings()
  },
  refreshTexts() {
    const dict = i18n.getScope('settings')
    const languages = i18n.getLanguages()
    const lang = i18n.getCurrentLang()
    const idx = languages.findIndex(item => item.value === lang)
    this.setData({ i18n: dict, languages, language: lang, languageIndex: idx >= 0 ? idx : 0 })
  },
  refreshSettings() {
    const s = settings.getSettings()
    const emojiOptions = s.emojiOptions || []
    const emojiText = emojiOptions.join('')
    const cm = s.colorMap || {}
    const colorItems = emojiOptions.map(em => ({ em, color: cm[em] || '' }))
    const theme = s.theme || 'light'
    const accentColor = s.accentColor || '#07c160'
    const accentDraft = accentColor
    const encryptionEnabled = !!s.encryptionEnabled
    const encryptionLocked = storage.isLocked()
    const encryptionHint = storage.getEncryptionHint()
    const language = s.language || 'zh'
    const langIdx = (this.data.languages || []).findIndex(item => item.value === language)
    this.setData({
      weekStart: s.weekStart,
      emojiText,
      colorItems,
      cloudEnabled: !!s.cloudEnabled,
      cloudEnvId: s.cloudEnvId || '',
      theme,
      accentColor,
      accentDraft,
      language,
      languageIndex: langIdx >= 0 ? langIdx : 0,
      encryptionEnabled,
      encryptionLocked,
      encryptionHint
    }, () => {
      if (this.data.cloudEnabled) {
        this.loadBackups()
      } else {
        this.setData({ backups: [] })
      }
    })
    updateNav(theme)
  },
  onThemeTap(e) {
    const val = e.currentTarget.dataset.val === 'dark' ? 'dark' : 'light'
    this.setData({ theme: val })
    settings.setTheme(val)
    updateNav(val)
    wx.showToast({ title: this.data.i18n.save, icon: 'success', duration: 500 })
  },
  onWeekTap(e) {
    const val = Number(e.currentTarget.dataset.val)
    const target = (val === 0 ? 0 : 1)
    this.setData({ weekStart: target })
    settings.setWeekStart(target)
    wx.showToast({ title: this.data.i18n.save, icon: 'success', duration: 500 })
  },
  onCloudSwitch(e) {
    const v = !!e.detail.value
    this.setData({ cloudEnabled: v })
    settings.setCloudEnabled(v)
    wx.showToast({ title: this.data.i18n.cloud, icon: 'success', duration: 600 })
  },
  onEnvIdInput(e) {
    this.setData({ cloudEnvId: e.detail.value })
  },
  onSaveCloud() {
    settings.setCloudEnvId((this.data.cloudEnvId || '').trim())
    const ok = cloud.initCloud()
    wx.showToast({ title: ok ? this.data.i18n.saveCloud : this.data.i18n.saveCloud, icon: 'success', duration: 700 })
  },
  async onSyncNow() {
    this.setData({ syncStatus: this.data.i18n.syncStart || '' })
    try {
      const ok = cloud.initCloud()
      if (!ok) {
        this.setData({ syncStatus: '' })
        wx.showToast({ title: this.data.i18n.cloudNotReady, icon: 'none' })
        return
      }
      const r = await sync.syncAll()
      const msg = i18n.t('settings.syncStatus', { local: r.updatedLocal, remote: r.updatedRemote })
      this.setData({ syncStatus: msg })
      wx.showToast({ title: this.data.i18n.syncSuccess, icon: 'success' })
    } catch (e) {
      this.setData({ syncStatus: '' })
      wx.showToast({ title: this.data.i18n.syncFailed, icon: 'none' })
    }
  },
  onEmojiInput(e) {
    this.setData({ emojiText: e.detail.value })
  },
  onSaveEmoji() {
    const arr = Array.from(this.data.emojiText).filter(x => x && x.trim())
    settings.setEmojiOptions(arr)
    const cm = settings.getSettings().colorMap || {}
    const colorItems = arr.map(em => ({ em, color: cm[em] || '' }))
    this.setData({ colorItems })
    wx.showToast({ title: this.data.i18n.save, icon: 'success', duration: 700 })
  },
  onColorInput(e) {
    const idx = Number(e.currentTarget.dataset.idx)
    const val = e.detail.value
    const list = this.data.colorItems.slice()
    if (!isNaN(idx) && list[idx]) {
      list[idx].color = val
      this.setData({ colorItems: list })
    }
  },
  onSaveColors() {
    const list = this.data.colorItems || []
    const map = {}
    const hex = /^#?[0-9a-fA-F]{6}$/
    for (const it of list) {
    if (it && it.em) {
      let c = (it.color || '').trim()
      if (c) {
        if (!hex.test(c)) {
          wx.showToast({ title: this.data.i18n.invalidColor, icon: 'none' })
          return
        }
        if (c[0] !== '#') c = '#' + c
      }
        map[it.em] = c
      }
    }
    settings.setColorMap(map)
    wx.showToast({ title: this.data.i18n.saveColors, icon: 'success', duration: 700 })
  },
  onReset() {
    const d = settings.getDefaults()
    settings.saveSettings(d)
    const emojiText = d.emojiOptions.join('')
    const colorItems = d.emojiOptions.map(em => ({ em, color: d.colorMap[em] || '' }))
    this.setData({ weekStart: d.weekStart, emojiText, colorItems, accentColor: d.accentColor, accentDraft: d.accentColor })
    wx.showToast({ title: this.data.i18n.reset, icon: 'success', duration: 700 })
  },
  onExport() {
    if (storage.isLocked()) {
      wx.showToast({ title: this.data.i18n.unlockFirst, icon: 'none' })
      return
    }
    const data = storage.getAllEntries()
    const text = JSON.stringify(data)
    wx.setClipboardData({ data: text, success: () => wx.showToast({ title: this.data.i18n.copySuccess, icon: 'success' }) })
  },
  onClearAll() {
    if (storage.isLocked()) {
      wx.showToast({ title: this.data.i18n.unlockFirst, icon: 'none' })
      return
    }
    wx.showModal({
      title: this.data.i18n.clearConfirmTitle || 'Confirm',
      content: this.data.i18n.clearConfirmContent,
      success: (res) => {
        if (res.confirm) {
          try {
            wx.removeStorageSync('mood_records_v1')
            wx.removeStorageSync('mood_records_v2')
          } catch (e) {}
          wx.showToast({ title: this.data.i18n.clearDone, icon: 'success' })
        }
      }
    })
  },
  goPrivacy() {
    wx.navigateTo({ url: '/pages/privacy/index' })
  },
  onImportInput(e) {
    this.setData({ importText: e.detail.value })
  },
  onImportApply() {
    if (storage.isLocked()) {
      wx.showToast({ title: this.data.i18n.unlockFirst, icon: 'none' })
      return
    }
    const t = (this.data.importText || '').trim()
    if (!t) { wx.showToast({ title: this.data.i18n.jsonRequired, icon: 'none' }); return }
    try {
      const obj = JSON.parse(t)
      if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
        wx.showToast({ title: this.data.i18n.invalidMapping, icon: 'none' })
        return
      }
      const records = {}
      for (const key in obj) {
        if (!Object.prototype.hasOwnProperty.call(obj, key)) continue
        if (typeof key === 'string' && key.startsWith('__')) continue
        records[key] = obj[key]
      }
      if (!Object.keys(records).length) {
        wx.showToast({ title: this.data.i18n.noValidRecords, icon: 'none' })
        return
      }
      for (const key in records) {
        const item = records[key]
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
          wx.showToast({ title: i18n.t('settings.invalidRecord', { key }), icon: 'none' })
          return
        }
        if (!Object.prototype.hasOwnProperty.call(item, 'ts')) {
          wx.showToast({ title: i18n.t('settings.missingTs', { key }), icon: 'none' })
          return
        }
        if (typeof item.ts !== 'number' || !Number.isFinite(item.ts)) {
          wx.showToast({ title: i18n.t('settings.invalidTs', { key }), icon: 'none' })
          return
        }
        const hasMood = Object.prototype.hasOwnProperty.call(item, 'mood')
        const hasNote = Object.prototype.hasOwnProperty.call(item, 'note')
        if (!hasMood && !hasNote) {
          wx.showToast({ title: i18n.t('settings.missingMoodNote', { key }), icon: 'none' })
          return
        }
        if (hasMood && item.mood !== undefined && item.mood !== null && typeof item.mood !== 'string') {
          wx.showToast({ title: i18n.t('settings.invalidMoodType', { key }), icon: 'none' })
          return
        }
        if (hasNote && item.note !== undefined && item.note !== null && typeof item.note !== 'string') {
          wx.showToast({ title: i18n.t('settings.invalidNoteType', { key }), icon: 'none' })
          return
        }
      }

      const diff = storage.getMergeDiff(records)
      const { added = 0, updated = 0, deleted = 0 } = diff || {}
      if (!added && !updated && !deleted) {
        wx.showToast({ title: this.data.i18n.importNone, icon: 'none' })
        return
      }

      wx.showModal({
        title: this.data.i18n.importPreview,
        content: i18n.t('settings.importSummary', { added, updated, deleted }),
        success: (res) => {
          if (res.confirm) {
            const r = storage.mergeEntries(records)
            if (r && r.locked) {
              wx.showToast({ title: this.data.i18n.unlockFirst, icon: 'none' })
              return
            }
            wx.showToast({ title: this.data.i18n.importDone, icon: 'success' })
            this.setData({ importText: '' })
          }
        }
      })
    } catch (e) {
      wx.showToast({ title: this.data.i18n.importError, icon: 'none' })
    }
  },
  onAccentInput(e) {
    this.setData({ accentDraft: e.detail.value })
  },
  onBackupNoteInput(e) {
    this.setData({ backupNote: e.detail.value })
  },
  onSaveAccent() {
    const color = (this.data.accentDraft || '').trim()
    const before = this.data.accentColor
    const res = settings.setAccentColor(color)
    const newColor = res.accentColor || before
    this.setData({ accentColor: newColor, accentDraft: newColor })
    wx.showToast({ title: this.data.i18n.save, icon: 'success' })
  },
  onLanguageChange(e) {
    const idx = Number(e.detail.value)
    const options = this.data.languages || []
    if (!isNaN(idx) && options[idx]) {
      const lang = options[idx].value
      settings.setLanguage(lang)
      this.setData({ languageIndex: idx })
      this.refreshTexts()
      this.refreshSettings()
    }
  },
  onPasswordInput(e) {
    this.setData({ passwordInput: e.detail.value })
  },
  onPasswordConfirmInput(e) {
    this.setData({ passwordConfirm: e.detail.value })
  },
  onHintInput(e) {
    this.setData({ hintText: e.detail.value })
  },
  onUnlockPasswordInput(e) {
    this.setData({ unlockPassword: e.detail.value })
  },
  onEnableEncryption() {
    const { passwordInput, passwordConfirm, hintText } = this.data
    if (!passwordInput || passwordInput !== passwordConfirm) {
      wx.showToast({ title: this.data.i18n.encryptionMismatch, icon: 'none' })
      return
    }
    if (passwordInput.length < 6) {
      wx.showToast({ title: this.data.i18n.encryptionWeak, icon: 'none' })
      return
    }
    const r = storage.enableEncryption(passwordInput, hintText || '')
    if (r && r.ok) {
      this.setData({ encryptionEnabled: true, encryptionLocked: false, passwordInput: '', passwordConfirm: '', hintText: '', encryptionHint: storage.getEncryptionHint() })
      wx.showToast({ title: this.data.i18n.encryptionSet, icon: 'success' })
    } else {
      wx.showToast({ title: this.data.i18n.encryptionEnableFail, icon: 'none' })
    }
  },
  onDisableEncryption() {
    const res = storage.disableEncryption()
    if (res && res.ok) {
      this.setData({ encryptionEnabled: false, encryptionLocked: false, encryptionHint: '', unlockPassword: '' })
      wx.showToast({ title: this.data.i18n.encryptionDisabled, icon: 'success' })
    } else {
      wx.showToast({ title: this.data.i18n.encryptionDisableFail, icon: 'none' })
    }
  },
  onUnlockEncryption() {
    const pwd = this.data.unlockPassword || ''
    const res = storage.unlock(pwd)
    if (res && res.ok) {
      this.setData({ encryptionLocked: false, unlockPassword: '', encryptionHint: storage.getEncryptionHint() })
      wx.showToast({ title: this.data.i18n.encryptionUnlocked, icon: 'success' })
    } else {
      wx.showToast({ title: this.data.i18n.encryptionUnlockFail, icon: 'none' })
    }
  },
  onLockEncryption() {
    storage.lock()
    this.setData({ encryptionLocked: true, unlockPassword: '' })
    wx.showToast({ title: this.data.i18n.encryptionLocked, icon: 'success' })
  },
  async onCreateBackup() {
    if (storage.isLocked()) {
      wx.showToast({ title: this.data.i18n.unlockFirst, icon: 'none' })
      return
    }
    if (this.data.isLoadingBackups) return
    this.setData({ isLoadingBackups: true })
    try {
      await sync.createBackup(this.data.backupNote || '')
      wx.showToast({ title: this.data.i18n.backupCreated, icon: 'success' })
      this.setData({ backupNote: '' })
      await this.loadBackups({ keepLoading: true })
    } catch (e) {
      wx.showToast({ title: this.data.i18n.backupFailed, icon: 'none' })
    }
    this.setData({ isLoadingBackups: false })
  },
  async loadBackups(options = {}) {
    const keepLoading = !!options.keepLoading
    let result = null
    if (!keepLoading) {
      this.setData({ isLoadingBackups: true })
    }
    try {
      const list = await sync.listBackups(5)
      const lang = this.data.language || i18n.getCurrentLang()
      const formatted = (list || []).map(item => ({
        id: item.id,
        note: item.note || '',
        total: item.total || 0,
        displayTime: formatBackupTime(item.createdAt, lang),
        countLabel: i18n.t('settings.backupCount', { count: item.total || 0 })
      }))
      this.setData({ backups: formatted })
      result = formatted
    } catch (e) {
      wx.showToast({ title: this.data.i18n.loadFailed, icon: 'none' })
    }
    if (!keepLoading) {
      this.setData({ isLoadingBackups: false })
    }
    return result
  },
  async onRefreshBackups() {
    await this.loadBackups()
  },
  async onRestoreBackup(e) {
    if (storage.isLocked()) {
      wx.showToast({ title: this.data.i18n.unlockFirst, icon: 'none' })
      return
    }
    const id = e.currentTarget.dataset.id
    if (!id) return
    const confirm = await new Promise(resolve => {
      wx.showModal({
        title: this.data.i18n.backup,
        content: this.data.i18n.restoreConfirm,
        confirmText: this.data.i18n.restore,
        cancelText: this.data.i18n.cancelText || 'Cancel',
        success: res => resolve(res.confirm)
      })
    })
    if (!confirm) return
    try {
      const res = await sync.restoreBackup(id)
      if (res && res.mergeRes && res.mergeRes.locked) {
        wx.showToast({ title: this.data.i18n.unlockFirst, icon: 'none' })
        return
      }
      wx.showToast({ title: this.data.i18n.importDone, icon: 'success' })
    } catch (err) {
      wx.showToast({ title: this.data.i18n.restoreFailed, icon: 'none' })
    }
  }
})
