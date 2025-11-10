const storage = require('../../utils/storage.js')
const settings = require('../../utils/settings.js')
const i18n = require('../../utils/i18n.js')

Page({
  data: {
    dateKey: '',
    mood: '',
    note: '',
    emojiOptions: ['😀','🙂','😐','🙁','😭','😡','🤩','😴','🧘','🤒','🤗','🤯','🤤'],
    theme: 'light',
    accentColor: '#07c160',
    i18n: {},
    dataLocked: false
  },
  onLoad(options) {
    this.refreshTexts()
    const dateKey = (options && options.dateKey) ? options.dateKey : ''
    const locked = storage.isLocked()
    const mood = !locked && dateKey ? storage.getMood(dateKey) : ''
    const note = !locked && dateKey ? storage.getNote(dateKey) : ''
    let s
    try { s = settings.getSettings() } catch(e) { s = null }
    const emojiOptions = s && s.emojiOptions && s.emojiOptions.length ? s.emojiOptions : this.data.emojiOptions
    const theme = s && s.theme ? s.theme : 'light'
    const accentColor = s && s.accentColor ? s.accentColor : '#07c160'
    this.setData({ dateKey, mood, note, emojiOptions, theme, accentColor, dataLocked: locked })
  },
  onShow() {
    this.refreshTexts()
    try {
      const s = settings.getSettings()
      const theme = s.theme || 'light'
      const accentColor = s.accentColor || '#07c160'
      const locked = storage.isLocked()
      const update = { theme, accentColor, dataLocked: locked }
      if (!locked && this.data.dateKey) {
        try {
          update.mood = storage.getMood(this.data.dateKey) || ''
          update.note = storage.getNote(this.data.dateKey) || ''
        } catch (e) {}
      }
      this.setData(update)
      try { wx.setNavigationBarColor({ frontColor: theme === 'dark' ? '#ffffff' : '#000000', backgroundColor: theme === 'dark' ? '#0f0f0f' : '#ffffff' }) } catch(e) {}
    } catch(e) {}
  },
  refreshTexts() {
    this.setData({ i18n: i18n.getScope('detail') })
  },
  onChooseEmoji(e) {
    const mood = e.currentTarget.dataset.mood
    this.setData({ mood })
  },
  onNoteInput(e) {
    this.setData({ note: e.detail.value })
  },
  onSave() {
    const { dateKey, mood, note } = this.data
    if (!dateKey) return
    try {
      storage.setMood(dateKey, mood || '')
      storage.setNote(dateKey, note || '')
      wx.showToast({ title: this.data.i18n.save, icon: 'success', duration: 600 })
      setTimeout(() => { wx.navigateBack({ delta: 1 }) }, 350)
    } catch (err) {
      this.handleStorageError(err)
    }
  },
  onClear() {
    const { dateKey } = this.data
    if (!dateKey) return
    try {
      storage.clearEntry(dateKey)
      wx.showToast({ title: this.data.i18n.clear, icon: 'success', duration: 600 })
      setTimeout(() => { wx.navigateBack({ delta: 1 }) }, 350)
    } catch (err) {
      this.handleStorageError(err)
    }
  },
  handleStorageError(err) {
    const code = err && err.code
    if (code === 'ENCRYPTION_LOCKED') {
      wx.showToast({ title: this.data.i18n.lockedMessage, icon: 'none' })
      this.setData({ dataLocked: true })
    } else {
      wx.showToast({ title: 'Error', icon: 'none' })
    }
  }
})
