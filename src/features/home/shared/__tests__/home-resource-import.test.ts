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

  it('DUPLICATE_RESOURCE 会映射为重复资源通知', () => {
    expect(resolveHomeResourceImportNotification(new AppError('DUPLICATE_RESOURCE', 'duplicate'))).toEqual({
      kind: 'duplicate-resource',
      level: 'error',
    })
  })

  it('旧版引擎导入错误会映射为专用通知', () => {
    expect(resolveHomeResourceImportNotification(new AppError('IO_ERROR', 'legacy', {
      details: { reason: 'UNSUPPORTED_LEGACY_ENGINE' },
    }))).toEqual({
      kind: 'unsupported-legacy-engine',
      level: 'error',
    })
  })

  it('无效引擎清单错误会映射为无效目录通知', () => {
    expect(resolveHomeResourceImportNotification(new AppError('IO_ERROR', 'broken manifest', {
      details: {
        reason: 'INVALID_ENGINE_MANIFEST',
        manifestReason: '缺少必填字段',
      },
    }))).toEqual({
      kind: 'invalid-folder',
      level: 'error',
    })
  })

  it('重复引擎导入错误会映射为专用通知', () => {
    expect(resolveHomeResourceImportNotification(new AppError('IO_ERROR', 'duplicate', {
      details: { reason: 'DUPLICATE_ENGINE' },
    }))).toEqual({
      kind: 'duplicate-engine',
      level: 'error',
    })
  })

  it('配置损坏错误会映射为专用通知', () => {
    expect(resolveHomeResourceImportNotification(new AppError('INVALID_PROJECT_CONFIG', 'broken', {
      details: { reason: 'CONFIG_CORRUPTED' },
    }))).toEqual({
      kind: 'game-config-corrupted',
      level: 'error',
    })
  })

  it('schema 版本过新错误会映射为专用通知', () => {
    expect(resolveHomeResourceImportNotification(new AppError('SCHEMA_VERSION_TOO_NEW', 'too new', {
      details: { found: 2, maxSupported: 1 },
    }))).toEqual({
      kind: 'game-schema-too-new',
      level: 'error',
    })
  })

  it('manifest schema 不受支持错误会映射为专用通知', () => {
    expect(resolveHomeResourceImportNotification(new AppError('UNKNOWN', 'unsupported manifest schema', {
      details: { reason: 'UNSUPPORTED_MANIFEST_SCHEMA', found: 2, maxSupported: 1 },
    }))).toEqual({
      kind: 'game-schema-too-new',
      level: 'error',
    })
  })

  it('引擎不可用错误会映射为专用通知', () => {
    expect(resolveHomeResourceImportNotification(new AppError('IO_ERROR', 'unavailable', {
      details: { reason: 'ENGINE_UNAVAILABLE' },
    }))).toEqual({
      kind: 'engine-unavailable',
      level: 'error',
    })
  })

  it('导入取消错误会映射为静默通知', () => {
    expect(resolveHomeResourceImportNotification(new AppError('IO_ERROR', 'cancelled', {
      details: { reason: 'IMPORT_CANCELLED' },
    }))).toEqual({
      kind: 'import-cancelled',
      level: 'silent',
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
