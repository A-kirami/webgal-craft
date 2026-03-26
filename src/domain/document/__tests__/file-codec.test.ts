import { describe, expect, it } from 'vitest'

import { decodeTextFile, encodeTextFile } from '../file-codec'

describe('文件编解码', () => {
  it('解码与编码时保留 UTF-8 BOM 元数据', () => {
    const bytes = new Uint8Array([0xEF, 0xBB, 0xBF, 0x66, 0x6F, 0x6F, 0x0D, 0x0A, 0x62, 0x61, 0x72])

    const decoded = decodeTextFile(bytes)
    expect(decoded.ok).toBe(true)
    if (!decoded.ok) {
      throw new TypeError('expected utf-8 bom document')
    }

    expect(decoded.content).toBe('foo\r\nbar')
    expect(decoded.metadata).toEqual({
      lineEnding: '\r\n',
      encoding: 'utf-8-bom',
    })

    expect([...encodeTextFile(decoded.content, decoded.metadata)]).toEqual([...bytes])
  })

  it('拒绝 UTF-16LE 文件', () => {
    const bytes = new Uint8Array([0xFF, 0xFE, 0x66, 0x00, 0x6F, 0x00, 0x6F, 0x00, 0x0A, 0x00])

    expect(decodeTextFile(bytes)).toEqual({ ok: false })
  })

  it('拒绝非法 UTF-8 字节而不是静默乱码', () => {
    const bytes = new Uint8Array([0xFF, 0x61, 0x62])

    expect(decodeTextFile(bytes)).toEqual({ ok: false })
  })

  it('编码时遇到未知编码会立即抛错', () => {
    expect(() => encodeTextFile('hello', {
      lineEnding: '\n',
      encoding: 'utf-16le' as never,
    })).toThrow('未知的文本编码')
  })
})
