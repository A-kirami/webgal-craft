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

describe('games-tab helper', () => {
  describe('resolveGamesTabImportDecision', () => {
    it('flags multiple paths and surfaces a notification', () => {
      const decision = resolveGamesTabImportDecision(['/games/a', '/games/b'])

      expect(decision).toEqual({
        kind: 'notify',
        level: 'error',
        messageKey: 'home.games.importMultipleFolders',
      })
    })

    it('allows import when exactly one path is provided', () => {
      const decision = resolveGamesTabImportDecision(['/games/demo'])

      expect(decision).toEqual({
        kind: 'import',
        path: '/games/demo',
      })
    })
  })

  describe('resolveGamesTabImportResult', () => {
    it('returns success metadata when no error is thrown', () => {
      const decision = resolveGamesTabImportResult()

      expect(decision).toEqual({
        kind: 'notify',
        level: 'success',
        messageKey: 'home.games.importSuccess',
      })
    })

    it('maps INVALID_STRUCTURE AppError to the invalid folder notification', () => {
      const decision = resolveGamesTabImportResult(new AppError('INVALID_STRUCTURE', 'invalid folder'))

      expect(decision).toEqual({
        kind: 'notify',
        level: 'error',
        messageKey: 'home.games.importInvalidFolder',
      })
    })

    it('treats other errors as unknown import failures', () => {
      const decision = resolveGamesTabImportResult(new Error('boom'))

      expect(decision).toEqual({
        kind: 'notify',
        level: 'error',
        messageKey: 'home.games.importUnknownError',
      })
    })
  })

  describe('resolveGamesTabGameClickDecision', () => {
    const activeProgress = new Map<string, number>([['game-1', 70]])

    it('warns and prevents navigation while a game is being created', () => {
      const decision = resolveGamesTabGameClickDecision('game-1', activeProgress)

      expect(decision).toEqual({
        kind: 'notify',
        level: 'warning',
        messageKey: 'home.games.importCreating',
      })
    })

    it('opens the editor when there is no active progress', () => {
      const decision = resolveGamesTabGameClickDecision('game-2', activeProgress)

      expect(decision).toEqual({
        kind: 'open-editor',
        gameId: 'game-2',
      })
    })
  })

  describe('resolveGamesTabCreateGameDecision', () => {
    it('returns none when engine availability is unknown', () => {
      const decision = resolveGamesTabCreateGameDecision(undefined)

      expect(decision).toEqual({
        kind: 'none',
      })
    })

    it('prompts the no-engine alert when the list is empty', () => {
      const decision = resolveGamesTabCreateGameDecision([])

      expect(decision).toEqual({
        kind: 'open-no-engine-alert',
        titleKey: 'home.engines.noEngineTitle',
        contentKey: 'home.engines.noEngineContent',
        confirmTextKey: 'home.engines.goToInstall',
        cancelTextKey: 'home.engines.later',
      })
    })

    it('opens the create game modal when engines exist', () => {
      const engine = { id: 'engine-1', path: '/engines/1', createdAt: 0, status: 'created', metadata: { description: '', icon: '/icon.png', name: 'Engine One' } } as Engine
      const decision = resolveGamesTabCreateGameDecision([engine])

      expect(decision).toEqual({
        kind: 'open-create-game-modal',
      })
    })
  })

  describe('progress helpers', () => {
    const activeProgress = new Map<string, number>([['game-1', 45]])

    it('correctly reports whether progress exists', () => {
      expect(hasGamesTabProgress('game-1', activeProgress)).toBe(true)
      expect(hasGamesTabProgress('game-2', activeProgress)).toBe(false)
    })

    it('returns zero for missing progress entries', () => {
      expect(getGamesTabProgress('game-2', activeProgress)).toBe(0)
    })
  })
})
