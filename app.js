const storage = require('./utils/storage.js')
const cloud = require('./utils/cloud.js')
const sync = require('./utils/sync.js')
const settings = require('./utils/settings.js')

App({
  onLaunch() {
    try { storage.migrateIfNeeded() } catch (e) {}
    try {
      const ok = cloud.initCloud()
      if (ok) {
        setTimeout(() => { try { sync.syncAll() } catch(e) {} }, 0)
      }
    } catch (e) {}
    try {
      const s = settings.getSettings()
      this.globalData = Object.assign({}, this.globalData || {}, {
        accentColor: s.accentColor || '#07c160',
        language: s.language || 'zh'
      })
    } catch (e) {}
  },
  onLocalDataChange() {
    try {
      const s = settings.getSettings()
      if (!s.cloudEnabled) return
      const ok = cloud.initCloud()
      if (!ok) return
      setTimeout(() => { try { sync.syncAll() } catch(e) {} }, 0)
    } catch (e) {}
  },
  onHide() {
    try {
      if (storage.hasEncryptionEnabled()) {
        storage.lock()
      }
    } catch (e) {}
  }
})
