import { describe, expect, it } from 'vitest'

import {
  getHomeResourceProgress,
  hasHomeResourceProgress,
  resolveHomeResourceDropPath,
  resolveHomeResourceImportNotification,
} from '~/features/home/shared/home-resource-import'
import { AppError } from '~/types/errors'

describe('首页共享导入纯逻辑', () => {
  it('拖入多个目录时返回多目录错误通知', () => {
    const decision = resolveHomeResourceDropPath(['/resources/one', '/resources/two'])

    expect(decision).toEqual({
      notification: {
        kind: 'multiple-folders',
        level: 'error',
      },
      shouldImport: false,
    })
  })

  it('拖入单个目录时允许导入并暴露路径', () => {
    const decision = resolveHomeResourceDropPath(['/resources/one'])

    expect(decision).toEqual({
      path: '/resources/one',
      shouldImport: true,
    })
  })

  it('INVALID_STRUCTURE 会映射为无效目录通知', () => {
    expect(resolveHomeResourceImportNotification(new AppError('INVALID_STRUCTURE', 'invalid'))).toEqual({
      kind: 'invalid-folder',
      level: 'error',
    })
  })

  it('未知错误会映射为通用失败通知', () => {
    expect(resolveHomeResourceImportNotification(new Error('boom'))).toEqual({
      kind: 'unknown-error',
      level: 'error',
    })
  })

  it('无错误时返回成功通知', () => {
    expect(resolveHomeResourceImportNotification()).toEqual({
      kind: 'success',
      level: 'success',
    })
  })

  it('能从活动进度映射中读取当前资源状态', () => {
    const activeProgress = new Map<string, number>([['resource-1', 42]])

    expect(hasHomeResourceProgress(activeProgress, 'resource-1')).toBe(true)
    expect(hasHomeResourceProgress(activeProgress, 'missing')).toBe(false)
    expect(getHomeResourceProgress(activeProgress, 'resource-1')).toBe(42)
    expect(getHomeResourceProgress(activeProgress, 'missing')).toBe(0)
  })
})
