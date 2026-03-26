import { describe, expect, it } from 'vitest'

import {
  getGamesTabProgress,
  hasGamesTabProgress,
  resolveGamesTabCreateGameDecision,
  resolveGamesTabGameClickDecision,
  resolveGamesTabImportDecision,
  resolveGamesTabImportResult,
} from '~/helper/games-tab'
import { AppError } from '~/types/errors'

import type { Engine } from '~/database/model'

describe('游戏标签页辅助函数', () => {
  describe('resolveGamesTabImportDecision 导入决策', () => {
    it('多路径时标记错误并返回通知', () => {
      const decision = resolveGamesTabImportDecision(['/games/a', '/games/b'])

      expect(decision).toEqual({
        kind: 'notify',
        level: 'error',
        messageKey: 'home.games.importMultipleFolders',
      })
    })

    it('单一路径时允许导入', () => {
      const decision = resolveGamesTabImportDecision(['/games/demo'])

      expect(decision).toEqual({
        kind: 'import',
        path: '/games/demo',
      })
    })
  })

  describe('resolveGamesTabImportResult 导入结果', () => {
    it('无异常时返回成功元数据', () => {
      const decision = resolveGamesTabImportResult()

      expect(decision).toEqual({
        kind: 'notify',
        level: 'success',
        messageKey: 'home.games.importSuccess',
      })
    })

    it('INVALID_STRUCTURE AppError 映射为无效文件夹通知', () => {
      const decision = resolveGamesTabImportResult(new AppError('INVALID_STRUCTURE', 'invalid folder'))

      expect(decision).toEqual({
        kind: 'notify',
        level: 'error',
        messageKey: 'home.games.importInvalidFolder',
      })
    })

    it('其他错误映射为未知导入失败', () => {
      const decision = resolveGamesTabImportResult(new Error('boom'))

      expect(decision).toEqual({
        kind: 'notify',
        level: 'error',
        messageKey: 'home.games.importUnknownError',
      })
    })
  })

  describe('resolveGamesTabGameClickDecision 游戏点击决策', () => {
    const activeProgress = new Map<string, number>([['game-1', 70]])

    it('游戏创建中时告警并阻止跳转', () => {
      const decision = resolveGamesTabGameClickDecision('game-1', activeProgress)

      expect(decision).toEqual({
        kind: 'notify',
        level: 'warning',
        messageKey: 'home.games.importCreating',
      })
    })

    it('无进行中任务时打开编辑器', () => {
      const decision = resolveGamesTabGameClickDecision('game-2', activeProgress)

      expect(decision).toEqual({
        kind: 'open-editor',
        gameId: 'game-2',
      })
    })
  })

  describe('resolveGamesTabCreateGameDecision 新建游戏决策', () => {
    it('引擎可用性未知时返回 none', () => {
      const decision = resolveGamesTabCreateGameDecision(undefined)

      expect(decision).toEqual({
        kind: 'none',
      })
    })

    it('引擎列表为空时提示无引擎告警', () => {
      const decision = resolveGamesTabCreateGameDecision([])

      expect(decision).toEqual({
        kind: 'open-no-engine-alert',
        titleKey: 'home.engines.noEngineTitle',
        contentKey: 'home.engines.noEngineContent',
        confirmTextKey: 'home.engines.goToInstall',
        cancelTextKey: 'home.engines.later',
      })
    })

    it('存在引擎时打开新建游戏弹窗', () => {
      const engine = { id: 'engine-1', path: '/engines/1', createdAt: 0, status: 'created', metadata: { description: '', icon: '/icon.png', name: 'Engine One' } } as Engine
      const decision = resolveGamesTabCreateGameDecision([engine])

      expect(decision).toEqual({
        kind: 'open-create-game-modal',
      })
    })
  })

  describe('进度辅助函数', () => {
    const activeProgress = new Map<string, number>([['game-1', 45]])

    it('正确判断进度是否存在', () => {
      expect(hasGamesTabProgress('game-1', activeProgress)).toBe(true)
      expect(hasGamesTabProgress('game-2', activeProgress)).toBe(false)
    })

    it('缺失进度项时返回 0', () => {
      expect(getGamesTabProgress('game-2', activeProgress)).toBe(0)
    })
  })
})
