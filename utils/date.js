const pad = n => (n < 10 ? '0' + n : '' + n)

function formatDateKey(year, month, day) {
  return year + '-' + pad(month) + '-' + pad(day)
}

function buildMonthGrid(year, month, weekStart = 1) {
  const firstDate = new Date(year, month - 1, 1)
  const firstWeekDay = firstDate.getDay()
  const offset = ((firstWeekDay - (weekStart === 0 ? 0 : 1)) + 7) % 7
  const daysInMonth = new Date(year, month, 0).getDate()
  const prevMonthDays = new Date(year, month - 1, 0).getDate()
  const total = 42
  const now = new Date()
  const todayKey = formatDateKey(now.getFullYear(), now.getMonth() + 1, now.getDate())
  const arr = []
  for (let i = 0; i < total; i++) {
    let y = year
    let m = month
    let d
    let inMonth = true
    if (i < offset) {
      inMonth = false
      d = prevMonthDays - offset + 1 + i
      m = month - 1
      if (m <= 0) { m = 12; y = year - 1 }
    } else if (i >= offset + daysInMonth) {
      inMonth = false
      d = i - offset - daysInMonth + 1
      m = month + 1
      if (m > 12) { m = 1; y = year + 1 }
    } else {
      d = i - offset + 1
    }
    const key = formatDateKey(y, m, d)
    arr.push({ day: d, dateKey: key, inMonth, isToday: key === todayKey, mood: '' })
  }
  return arr
}

function monthLabel(year, month, lang) {
  if (lang === 'en') {
    return year + '-' + pad(month)
  }
  return year + '年' + month + '月'
}

function prevMonth(year, month) {
  if (month === 1) return { year: year - 1, month: 12 }
  return { year, month: month - 1 }
}

function nextMonth(year, month) {
  if (month === 12) return { year: year + 1, month: 1 }
  return { year, month: month + 1 }
}

function weekHeaders(weekStart = 1, lang = 'zh') {
  const zhMonToSun = ['一','二','三','四','五','六','日']
  const enMonToSun = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']
  const monToSun = lang === 'en' ? enMonToSun : zhMonToSun
  if (weekStart === 0) {
    return lang === 'en' ? ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'] : ['日','一','二','三','四','五','六']
  }
  return monToSun
}

module.exports = { pad, formatDateKey, buildMonthGrid, monthLabel, prevMonth, nextMonth, weekHeaders }
