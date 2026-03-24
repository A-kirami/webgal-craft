import { describe, expect, it } from 'vitest'

import {
  compareOptionalNumber,
  createItemComparator,
  isValidPositiveNumber,
  normalizeNumber,
} from '~/utils/sort'

import type { SortableItemAccessor } from '~/utils/sort'

// --- 测试用数据结构 ---

interface TestItem {
  name: string
  isDir: boolean
  size?: number
  modified?: number
  created?: number
}

const accessor: SortableItemAccessor<TestItem> = {
  isDirectory: i => i.isDir,
  name: i => i.name,
  size: i => i.size,
  modifiedAt: i => i.modified,
  createdAt: i => i.created,
}

function sorted(items: TestItem[], sortBy: 'name' | 'modifiedTime' | 'createdTime' | 'size', sortOrder: 'asc' | 'desc') {
  return [...items].sort(createItemComparator(sortBy, sortOrder, accessor))
}

// --- normalizeNumber ---

describe('normalizeNumber', () => {
  it('保留有限数值', () => {
    expect(normalizeNumber(42)).toBe(42)
    expect(normalizeNumber(0)).toBe(0)
    expect(normalizeNumber(-3.14)).toBe(-3.14)
  })

  it('非有限数值返回 undefined', () => {
    expect(normalizeNumber(undefined)).toBeUndefined()
    expect(normalizeNumber(Number.NaN)).toBeUndefined()
    expect(normalizeNumber(Number.POSITIVE_INFINITY)).toBeUndefined()
    expect(normalizeNumber(Number.NEGATIVE_INFINITY)).toBeUndefined()
  })
})

// --- compareOptionalNumber ---

describe('compareOptionalNumber', () => {
  it('两个 undefined 相等', () => {
    expect(compareOptionalNumber(undefined, undefined, 'asc')).toBe(0)
  })

  it('undefined 始终排在末尾（无论排序方向）', () => {
    expect(compareOptionalNumber(undefined, 5, 'asc')).toBe(1)
    expect(compareOptionalNumber(5, undefined, 'asc')).toBe(-1)
    expect(compareOptionalNumber(undefined, 5, 'desc')).toBe(1)
    expect(compareOptionalNumber(5, undefined, 'desc')).toBe(-1)
  })

  it('asc 升序比较', () => {
    expect(compareOptionalNumber(1, 2, 'asc')).toBeLessThan(0)
    expect(compareOptionalNumber(2, 1, 'asc')).toBeGreaterThan(0)
    expect(compareOptionalNumber(3, 3, 'asc')).toBe(0)
  })

  it('desc 降序比较', () => {
    expect(compareOptionalNumber(1, 2, 'desc')).toBeGreaterThan(0)
    expect(compareOptionalNumber(2, 1, 'desc')).toBeLessThan(0)
  })
})

// --- isValidPositiveNumber ---

describe('isValidPositiveNumber', () => {
  it('有效非负有限数值返回 true', () => {
    expect(isValidPositiveNumber(0)).toBe(true)
    expect(isValidPositiveNumber(100)).toBe(true)
  })

  it('负数、非有限值、undefined 返回 false', () => {
    expect(isValidPositiveNumber(-1)).toBe(false)
    expect(isValidPositiveNumber(undefined)).toBe(false)
    expect(isValidPositiveNumber(Number.NaN)).toBe(false)
    expect(isValidPositiveNumber(Number.POSITIVE_INFINITY)).toBe(false)
  })
})

// --- createItemComparator ---

describe('createItemComparator', () => {
  const dirA: TestItem = { name: 'alpha', isDir: true }
  const dirB: TestItem = { name: 'beta', isDir: true }
  const fileA: TestItem = { name: 'apple.txt', isDir: false, size: 200, modified: 1000, created: 500 }
  const fileB: TestItem = { name: 'banana.txt', isDir: false, size: 100, modified: 2000, created: 400 }
  const fileC: TestItem = { name: 'cherry.txt', isDir: false, size: undefined, modified: 1500, created: 600 }

  it('目录始终排在文件前面', () => {
    const items = [fileA, dirA, fileB, dirB]
    const result = sorted(items, 'name', 'asc')
    expect(result[0].isDir).toBe(true)
    expect(result[1].isDir).toBe(true)
    expect(result[2].isDir).toBe(false)
    expect(result[3].isDir).toBe(false)
  })

  it('name asc 按名称升序', () => {
    const result = sorted([fileB, fileA], 'name', 'asc')
    expect(result.map(i => i.name)).toEqual(['apple.txt', 'banana.txt'])
  })

  it('name desc 按名称降序', () => {
    const result = sorted([fileA, fileB], 'name', 'desc')
    expect(result.map(i => i.name)).toEqual(['banana.txt', 'apple.txt'])
  })

  it('size asc 按大小升序，undefined 排末尾', () => {
    const result = sorted([fileA, fileC, fileB], 'size', 'asc')
    expect(result.map(i => i.name)).toEqual(['banana.txt', 'apple.txt', 'cherry.txt'])
  })

  it('size desc 按大小降序，undefined 仍排末尾', () => {
    const result = sorted([fileB, fileC, fileA], 'size', 'desc')
    expect(result.map(i => i.name)).toEqual(['apple.txt', 'banana.txt', 'cherry.txt'])
  })

  it('目录的 size 视为 undefined', () => {
    const dir: TestItem = { name: 'docs', isDir: true, size: 999 }
    const file: TestItem = { name: 'z.txt', isDir: false, size: 10 }
    const result = sorted([file, dir], 'size', 'asc')
    // 目录优先，即使按 size 排序
    expect(result[0].name).toBe('docs')
  })

  it('modifiedTime 排序', () => {
    const result = sorted([fileA, fileB, fileC], 'modifiedTime', 'asc')
    expect(result.map(i => i.name)).toEqual(['apple.txt', 'cherry.txt', 'banana.txt'])
  })

  it('createdTime desc 排序', () => {
    const result = sorted([fileA, fileB, fileC], 'createdTime', 'desc')
    expect(result.map(i => i.name)).toEqual(['cherry.txt', 'apple.txt', 'banana.txt'])
  })

  it('数值相同时按 name 回退保证稳定序', () => {
    const x: TestItem = { name: 'beta.txt', isDir: false, modified: 1000 }
    const y: TestItem = { name: 'alpha.txt', isDir: false, modified: 1000 }
    const result = sorted([x, y], 'modifiedTime', 'asc')
    expect(result.map(i => i.name)).toEqual(['alpha.txt', 'beta.txt'])
  })

  it('数值相同时 desc 方向 name 回退也反转', () => {
    const x: TestItem = { name: 'beta.txt', isDir: false, modified: 1000 }
    const y: TestItem = { name: 'alpha.txt', isDir: false, modified: 1000 }
    const result = sorted([x, y], 'modifiedTime', 'desc')
    expect(result.map(i => i.name)).toEqual(['beta.txt', 'alpha.txt'])
  })
})
