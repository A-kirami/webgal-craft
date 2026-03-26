import { describe, expect, it } from 'vitest'

import { AppError } from '~/types/errors'
import { settleBatch } from '~/utils/batch'

describe('settleBatch 批处理收敛', () => {
  it('所有任务成功时，succeeded 包含全部结果，failed 为空', async () => {
    const tasks = [
      () => Promise.resolve('a'),
      () => Promise.resolve('b'),
      () => Promise.resolve('c'),
    ]

    const result = await settleBatch(tasks)

    expect(result.succeeded).toEqual(['a', 'b', 'c'])
    expect(result.failed).toEqual([])
  })

  it('所有任务失败（AppError）时，failed 包含全部错误及正确索引', async () => {
    const tasks = [
      () => Promise.reject(new AppError('FS_ERROR', '读取失败')),
      () => Promise.reject(new AppError('IO_ERROR', '写入失败')),
    ]

    const result = await settleBatch(tasks)

    expect(result.succeeded).toEqual([])
    expect(result.failed).toHaveLength(2)
    expect(result.failed[0].error.code).toBe('FS_ERROR')
    expect(result.failed[0].index).toBe(0)
    expect(result.failed[1].error.code).toBe('IO_ERROR')
    expect(result.failed[1].index).toBe(1)
  })

  it('混合成功与失败时，正确分区结果', async () => {
    const tasks = [
      () => Promise.resolve(1),
      () => Promise.reject(new AppError('UNKNOWN', '失败')),
      () => Promise.resolve(3),
    ]

    const result = await settleBatch(tasks)

    expect(result.succeeded).toEqual([1, 3])
    expect(result.failed).toHaveLength(1)
    expect(result.failed[0].error.code).toBe('UNKNOWN')
    expect(result.failed[0].index).toBe(1)
  })

  it('空数组时，两个结果数组均为空', async () => {
    const result = await settleBatch([])

    expect(result.succeeded).toEqual([])
    expect(result.failed).toEqual([])
  })

  it('非 AppError 的拒绝会被包装为 code 为 UNKNOWN 的 AppError', async () => {
    const tasks = [
      () => Promise.reject(new Error('原生错误')),
      () => Promise.reject('字符串错误'),
    ]

    const result = await settleBatch(tasks)

    expect(result.failed).toHaveLength(2)

    const [first, second] = result.failed
    expect(first.error).toBeInstanceOf(AppError)
    expect(first.error.code).toBe('UNKNOWN')
    expect(first.error.message).toBe('Error: 原生错误')
    expect(first.error.cause).toBeInstanceOf(Error)

    expect(second.error).toBeInstanceOf(AppError)
    expect(second.error.code).toBe('UNKNOWN')
    expect(second.error.message).toBe('字符串错误')
    expect(second.error.cause).toBe('字符串错误')
  })

  it('failed 中保留任务在原始数组中的索引', async () => {
    const tasks = [
      () => Promise.resolve('ok'),
      () => Promise.resolve('ok'),
      () => Promise.reject(new AppError('FS_ERROR', '第三个失败')),
      () => Promise.resolve('ok'),
      () => Promise.reject(new AppError('IO_ERROR', '第五个失败')),
    ]

    const result = await settleBatch(tasks)

    expect(result.succeeded).toHaveLength(3)
    expect(result.failed).toHaveLength(2)
    expect(result.failed[0].index).toBe(2)
    expect(result.failed[1].index).toBe(4)
  })
})
