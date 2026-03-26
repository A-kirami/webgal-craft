import { createTextMetadata, normalizeTextLineEnding } from './document-model'

import type { TextMetadata } from './document-model'

const UTF8_BOM = new Uint8Array([0xEF, 0xBB, 0xBF])
const UTF16LE_BOM = new Uint8Array([0xFF, 0xFE])
const UTF16BE_BOM = new Uint8Array([0xFE, 0xFF])
// eslint-disable-next-line unicorn/text-encoding-identifier-case -- 持久化元数据沿用文件编码标识
const UTF8_ENCODING = 'utf-8' as const satisfies TextMetadata['encoding']
const UTF8_BOM_ENCODING = 'utf-8-bom' as const satisfies TextMetadata['encoding']

export interface DecodedTextFile {
  ok: true
  content: string
  metadata: TextMetadata
}

export interface UnsupportedTextEncodingResult {
  ok: false
}

export type DecodeTextFileResult = DecodedTextFile | UnsupportedTextEncodingResult

export function decodeTextFile(bytes: Uint8Array): DecodeTextFileResult {
  if (startsWith(bytes, UTF8_BOM)) {
    const content = decodeUtf8(bytes.slice(UTF8_BOM.length))
    if (content === undefined) {
      return { ok: false }
    }

    return {
      ok: true,
      content,
      metadata: createTextMetadata(content, { encoding: UTF8_BOM_ENCODING }),
    }
  }

  if (startsWith(bytes, UTF16LE_BOM)) {
    return { ok: false }
  }

  if (startsWith(bytes, UTF16BE_BOM)) {
    return { ok: false }
  }

  const content = decodeUtf8(bytes)
  if (content === undefined) {
    return { ok: false }
  }

  return {
    ok: true,
    content,
    metadata: createTextMetadata(content, { encoding: UTF8_ENCODING }),
  }
}

export function encodeTextFile(content: string, metadata: TextMetadata): Uint8Array {
  const normalizedContent = normalizeTextLineEnding(content, metadata.lineEnding)

  switch (metadata.encoding) {
    case UTF8_ENCODING: {
      return new TextEncoder().encode(normalizedContent)
    }
    case UTF8_BOM_ENCODING: {
      return concatBytes(UTF8_BOM, new TextEncoder().encode(normalizedContent))
    }
    default: {
      throw new Error(`未知的文本编码: ${metadata.encoding satisfies never}`)
    }
  }
}

function decodeUtf8(bytes: Uint8Array): string | undefined {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return undefined
  }
}

function startsWith(bytes: Uint8Array, prefix: Uint8Array): boolean {
  return bytes.length >= prefix.length && prefix.every((value, index) => bytes[index] === value)
}

function concatBytes(left: Uint8Array, right: Uint8Array): Uint8Array {
  const result = new Uint8Array(left.length + right.length)
  result.set(left, 0)
  result.set(right, left.length)
  return result
}
