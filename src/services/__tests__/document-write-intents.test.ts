import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { consumePendingDocumentWrite, registerPendingDocumentWrite } from '../document-write-intents'

// eslint-disable-next-line unicorn/text-encoding-identifier-case -- 测试需覆盖持久化元数据协议值
const UTF8_ENCODING = 'utf-8' as const

describe('文档写入意图', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-17T09:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('仅在内容和元数据完全匹配时消费写入意图', () => {
    const path = '/game/scene/example.txt'
    const metadata = { encoding: UTF8_ENCODING, lineEnding: '\n' as const }

    registerPendingDocumentWrite(path, 'hello', metadata)

    expect(consumePendingDocumentWrite(path, 'hello', metadata)).toBe(true)
    expect(consumePendingDocumentWrite(path, 'hello', metadata)).toBe(false)
  })

  it('元数据不匹配时不消费写入意图', () => {
    const path = '/game/scene/example.txt'

    registerPendingDocumentWrite(path, 'hello', {
      encoding: UTF8_ENCODING,
      lineEnding: '\n',
    })

    expect(consumePendingDocumentWrite(path, 'hello', {
      encoding: UTF8_ENCODING,
      lineEnding: '\r\n',
    })).toBe(false)

    expect(consumePendingDocumentWrite(path, 'hello', {
      encoding: UTF8_ENCODING,
      lineEnding: '\n',
    })).toBe(true)
  })

  it('过期的待写入意图会失效，但时间不参与匹配条件', () => {
    const path = '/game/scene/example.txt'
    const metadata = { encoding: UTF8_ENCODING, lineEnding: '\n' as const }

    registerPendingDocumentWrite(path, 'hello', metadata)
    vi.advanceTimersByTime(30 * 1000 + 1)

    expect(consumePendingDocumentWrite(path, 'hello', metadata)).toBe(false)
  })
})
