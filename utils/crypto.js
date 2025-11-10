function rightRotate(value, amount) {
  return (value >>> amount) | (value << (32 - amount))
}

function sha256(ascii) {
  const mathPow = Math.pow
  const maxWord = mathPow(2, 32)
  let result = ''
  const words = []
  const asciiBitLength = ascii.length * 8

  const hash = sha256.h || []
  const k = sha256.k || []
  let primeCounter = k.length

  if (!hash.length) {
    let candidate = 2
    while (primeCounter < 64) {
      let isPrime = true
      for (let factor = 2; factor * factor <= candidate; factor++) {
        if (candidate % factor === 0) { isPrime = false; break }
      }
      if (isPrime) {
        if (primeCounter < 8) {
          hash[primeCounter] = (mathPow(candidate, 0.5) * maxWord) | 0
        }
        k[primeCounter] = (mathPow(candidate, 1 / 3) * maxWord) | 0
        primeCounter++
      }
      candidate++
    }
    sha256.h = hash
    sha256.k = k
  }

  ascii += '\u0080'
  while (ascii.length % 64 - 56) ascii += '\u0000'
  for (let i = 0; i < ascii.length; i++) {
    const j = ascii.charCodeAt(i)
    if (j >> 8) return null
    words[i >> 2] |= j << ((3 - i) % 4) * 8
  }
  words[words.length] = ((asciiBitLength / maxWord) | 0)
  words[words.length] = asciiBitLength

  for (let j = 0; j < words.length;) {
    const w = words.slice(j, j += 16)
    const oldHash = hash.slice(0)
    for (let i = 0; i < 64; i++) {
      const w15 = w[i - 15], w2 = w[i - 2]
      const a = hash[0], e = hash[4]
      const temp1 = hash[7]
        + (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25))
        + ((e & hash[5]) ^ ((~e) & hash[6]))
        + k[i]
        + (w[i] = (i < 16) ? w[i] : (
          w[i - 16]
          + (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3))
          + w[i - 7]
          + (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10))
        ) | 0)
      const temp2 = (rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22))
        + ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]))

      hash.unshift((temp1 + temp2) | 0)
      hash[4] = (hash[4] + temp1) | 0
      hash.pop()
    }
    for (let i = 0; i < 8; i++) {
      hash[i] = (hash[i] + oldHash[i]) | 0
    }
  }

  for (let i = 0; i < 8; i++) {
    for (let j = 3; j + 1; j--) {
      const b = (hash[i] >> (j * 8)) & 255
      result += ((b < 16) ? '0' : '') + b.toString(16)
    }
  }
  return result
}

function randomSalt(len = 16) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let out = ''
  for (let i = 0; i < len; i++) {
    out += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return out
}

function utf8Encode(str) {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(str)
  }
  const encoded = []
  for (let i = 0; i < str.length; i++) {
    let codePoint = str.charCodeAt(i)
    if (codePoint < 0x80) {
      encoded.push(codePoint)
    } else if (codePoint < 0x800) {
      encoded.push(0xc0 | (codePoint >> 6))
      encoded.push(0x80 | (codePoint & 0x3f))
    } else if (codePoint < 0xd800 || codePoint >= 0xe000) {
      encoded.push(0xe0 | (codePoint >> 12))
      encoded.push(0x80 | ((codePoint >> 6) & 0x3f))
      encoded.push(0x80 | (codePoint & 0x3f))
    } else {
      i++
      codePoint = 0x10000 + (((codePoint & 0x3ff) << 10) | (str.charCodeAt(i) & 0x3ff))
      encoded.push(0xf0 | (codePoint >> 18))
      encoded.push(0x80 | ((codePoint >> 12) & 0x3f))
      encoded.push(0x80 | ((codePoint >> 6) & 0x3f))
      encoded.push(0x80 | (codePoint & 0x3f))
    }
  }
  return new Uint8Array(encoded)
}

function utf8Decode(bytes) {
  if (typeof TextDecoder !== 'undefined') {
    return new TextDecoder().decode(bytes)
  }
  let out = ''
  for (let i = 0; i < bytes.length;) {
    const byte1 = bytes[i++]
    if (byte1 < 0x80) {
      out += String.fromCharCode(byte1)
    } else if (byte1 >= 0xc0 && byte1 < 0xe0) {
      const byte2 = bytes[i++]
      out += String.fromCharCode(((byte1 & 0x1f) << 6) | (byte2 & 0x3f))
    } else if (byte1 >= 0xe0 && byte1 < 0xf0) {
      const byte2 = bytes[i++]
      const byte3 = bytes[i++]
      out += String.fromCharCode(((byte1 & 0x0f) << 12) | ((byte2 & 0x3f) << 6) | (byte3 & 0x3f))
    } else {
      const byte2 = bytes[i++]
      const byte3 = bytes[i++]
      const byte4 = bytes[i++]
      let codePoint = ((byte1 & 0x07) << 18)
      codePoint |= ((byte2 & 0x3f) << 12)
      codePoint |= ((byte3 & 0x3f) << 6)
      codePoint |= (byte4 & 0x3f)
      codePoint -= 0x10000
      out += String.fromCharCode(0xd800 + (codePoint >> 10))
      out += String.fromCharCode(0xdc00 + (codePoint & 0x3ff))
    }
  }
  return out
}

function hexToBytes(hex) {
  const bytes = []
  for (let c = 0; c < hex.length; c += 2) {
    bytes.push(parseInt(hex.substr(c, 2), 16))
  }
  return new Uint8Array(bytes)
}

function base64Encode(bytes) {
  if (typeof wx !== 'undefined' && wx.arrayBufferToBase64) {
    return wx.arrayBufferToBase64(bytes.buffer)
  }
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64')
  }
  let binary = ''
  const len = bytes.byteLength
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

function base64Decode(str) {
  if (typeof wx !== 'undefined' && wx.base64ToArrayBuffer) {
    return new Uint8Array(wx.base64ToArrayBuffer(str))
  }
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(str, 'base64'))
  }
  const binary = atob(str)
  const len = binary.length
  const bytes = new Uint8Array(len)
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

function deriveKey(passphrase, salt) {
  return sha256(passphrase + '|' + salt)
}

function generateStream(key, iv, length) {
  const stream = new Uint8Array(length)
  let offset = 0
  let counter = 0
  while (offset < length) {
    const blockHex = sha256(key + '|' + iv + '|' + counter)
    const block = hexToBytes(blockHex)
    const sliceLen = Math.min(block.length, length - offset)
    stream.set(block.slice(0, sliceLen), offset)
    offset += sliceLen
    counter++
  }
  return stream
}

function encrypt(text, key, ivParam) {
  const iv = ivParam || randomSalt(12)
  const dataBytes = utf8Encode(text)
  const stream = generateStream(key, iv, dataBytes.length)
  const cipher = new Uint8Array(dataBytes.length)
  for (let i = 0; i < dataBytes.length; i++) {
    cipher[i] = dataBytes[i] ^ stream[i]
  }
  return { payload: base64Encode(cipher), iv }
}

function decrypt(payload, key, iv) {
  const cipherBytes = base64Decode(payload)
  const stream = generateStream(key, iv, cipherBytes.length)
  const plain = new Uint8Array(cipherBytes.length)
  for (let i = 0; i < cipherBytes.length; i++) {
    plain[i] = cipherBytes[i] ^ stream[i]
  }
  return utf8Decode(plain)
}

module.exports = {
  sha256,
  randomSalt,
  deriveKey,
  encrypt,
  decrypt
}
