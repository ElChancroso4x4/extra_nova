/**
 * pdf.js 5.x (modern build) assumes Uint8Array.prototype.toHex / toBase64,
 * which only landed in Chromium ~140+ and recent Safari. Without them,
 * getDocument throws «a.toHex is not a function» and PDF import looks dead.
 *
 * We ship the legacy pdf.js build (polyfills included) AND apply a tiny
 * runtime polyfill so the worker and any residual modern code paths work.
 */

function bytesToHex(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i += 1) {
    out += bytes[i]!.toString(16).padStart(2, '0')
  }
  return out
}

function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64')
  }
  let binary = ''
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]!)
  }
  return btoa(binary)
}

export function ensurePdfJsBinaryPolyfills(): void {
  const proto = Uint8Array.prototype as Uint8Array & {
    toHex?: () => string
    toBase64?: () => string
  }

  if (typeof proto.toHex !== 'function') {
    Object.defineProperty(proto, 'toHex', {
      value: function toHex(this: Uint8Array) {
        return bytesToHex(this)
      },
      writable: true,
      configurable: true,
    })
  }

  if (typeof proto.toBase64 !== 'function') {
    Object.defineProperty(proto, 'toBase64', {
      value: function toBase64(this: Uint8Array) {
        return bytesToBase64(this)
      },
      writable: true,
      configurable: true,
    })
  }
}
