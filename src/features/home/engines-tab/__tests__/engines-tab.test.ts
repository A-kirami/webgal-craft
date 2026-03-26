import { describe, expect, it } from 'vitest'

import {
  evaluateDropImportPaths,
  getEngineProgressValue,
  getImportNotificationForResult,
  isEngineProcessing,
  resolveSelectedPath,
} from '~/features/home/engines-tab/engines-tab'
import { AppError } from '~/types/errors'

describe('引擎标签页辅助函数', () => {
  it('拖入多个路径时拒绝导入并返回提示', () => {
    const decision = evaluateDropImportPaths(['one', 'two'])

    expect(decision.shouldImport).toBe(false)
    expect(decision.notification).toEqual({
      key: 'home.engines.importMultipleFolders',
      variant: 'error',
    })
    expect(decision.path).toBeUndefined()
  })

  it('仅有单个路径时允许导入并暴露路径', () => {
    const decision = evaluateDropImportPaths(['/single-path'])

    expect(decision.shouldImport).toBe(true)
    expect(decision.path).toBe('/single-path')
    expect(decision.notification).toBeUndefined()
  })

  it('无错误时返回成功通知', () => {
    const notification = getImportNotificationForResult()

    expect(notification).toEqual({
      key: 'home.engines.importSuccess',
      variant: 'success',
    })
  })

  it('INVALID_STRUCTURE 映射为无效文件夹通知', () => {
    const notification = getImportNotificationForResult(new AppError('INVALID_STRUCTURE', 'invalid'))

    expect(notification).toEqual({
      key: 'home.engines.importInvalidFolder',
      variant: 'error',
    })
  })

  it('未知错误映射为通用失败通知', () => {
    const notification = getImportNotificationForResult(new Error('boom'))

    expect(notification).toEqual({
      key: 'home.engines.importUnknownError',
      variant: 'error',
    })
  })

  it('选择路径字符串时返回该路径', () => {
    expect(resolveSelectedPath('/selected')).toBe('/selected')
  })

  it('空选择时忽略导入', () => {
    expect(resolveSelectedPath(undefined)).toBeUndefined()
    expect(resolveSelectedPath([])).toBeUndefined()
  })

  it('进度映射包含引擎 id 时判定为处理中', () => {
    const activeProgress = new Map<string, number>([['engine-1', 40]])

    expect(isEngineProcessing(activeProgress, 'engine-1')).toBe(true)
    expect(isEngineProcessing(activeProgress, 'engine-2')).toBe(false)
  })

  it('进度存在时返回对应值', () => {
    const activeProgress = new Map<string, number>([['engine-1', 60]])

    expect(getEngineProgressValue(activeProgress, 'engine-1')).toBe(60)
    expect(getEngineProgressValue(activeProgress, 'missing')).toBeUndefined()
  })
})
