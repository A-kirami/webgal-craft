import { describe, expect, it } from 'vitest'

import { formatFileSize } from '~/utils/format'

describe('formatFileSize', () => {
  it('字节级大小会直接输出整数 B', () => {
    expect(formatFileSize(0)).toBe('0 B')
    expect(formatFileSize(999)).toBe('999 B')
    expect(formatFileSize(-12)).toBe('-12 B')
  })

  it('在 KiB 和 MiB 边界会保留合适精度', () => {
    expect(formatFileSize(1024)).toBe('1.0 KiB')
    expect(formatFileSize(1536)).toBe('1.5 KiB')
    expect(formatFileSize(10 * 1024)).toBe('10 KiB')
    expect(formatFileSize(1024 * 1024)).toBe('1.0 MiB')
  })

  it('超过 1 GiB 时会继续按最高单位格式化', () => {
    expect(formatFileSize(5 * 1024 ** 3)).toBe('5.0 GiB')
    expect(formatFileSize(12.4 * 1024 ** 3)).toBe('12 GiB')
  })
})
