import { describe, expect, it } from 'vitest'
import { ensurePdfJsBinaryPolyfills } from './pdfCompat'

describe('ensurePdfJsBinaryPolyfills', () => {
  it('provides Uint8Array.toHex when missing', () => {
    const proto = Uint8Array.prototype as Uint8Array & { toHex?: () => string }
    const original = proto.toHex
    // Force-remove to simulate older browsers / Playwright Chromium <140
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete (proto as { toHex?: () => string }).toHex

    ensurePdfJsBinaryPolyfills()
    expect(typeof proto.toHex).toBe('function')
    expect(proto.toHex!.call(new Uint8Array([0xca, 0xfe]))).toBe('cafe')

    if (original) {
      Object.defineProperty(proto, 'toHex', {
        value: original,
        writable: true,
        configurable: true,
      })
    }
  })
})
