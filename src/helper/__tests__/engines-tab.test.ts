import { describe, expect, it } from 'vitest'

import {
  evaluateDropImportPaths,
  getEngineProgressValue,
  getImportNotificationForResult,
  isEngineProcessing,
  resolveSelectedPath,
} from '~/helper/engines-tab'
import { AppError } from '~/types/errors'

describe('engines tab helper', () => {
  it('rejects import when dropping multiple locations', () => {
    const decision = evaluateDropImportPaths(['one', 'two'])

    expect(decision.shouldImport).toBe(false)
    expect(decision.notification).toEqual({
      key: 'home.engines.importMultipleFolders',
      variant: 'error',
    })
    expect(decision.path).toBeUndefined()
  })

  it('accepts a single location and exposes the path', () => {
    const decision = evaluateDropImportPaths(['/single-path'])

    expect(decision.shouldImport).toBe(true)
    expect(decision.path).toBe('/single-path')
    expect(decision.notification).toBeUndefined()
  })

  it('returns a success notification when no error occurs', () => {
    const notification = getImportNotificationForResult()

    expect(notification).toEqual({
      key: 'home.engines.importSuccess',
      variant: 'success',
    })
  })

  it('maps INVALID_STRUCTURE to the invalid folder notification', () => {
    const notification = getImportNotificationForResult(new AppError('INVALID_STRUCTURE', 'invalid'))

    expect(notification).toEqual({
      key: 'home.engines.importInvalidFolder',
      variant: 'error',
    })
  })

  it('maps unknown errors to the generic error notification', () => {
    const notification = getImportNotificationForResult(new Error('boom'))

    expect(notification).toEqual({
      key: 'home.engines.importUnknownError',
      variant: 'error',
    })
  })

  it('resolves a selected path string', () => {
    expect(resolveSelectedPath('/selected')).toBe('/selected')
  })

  it('ignores empty selections', () => {
    expect(resolveSelectedPath(undefined)).toBeUndefined()
    expect(resolveSelectedPath([])).toBeUndefined()
  })

  it('treats maps with the engine id as processing', () => {
    const activeProgress = new Map<string, number>([['engine-1', 40]])

    expect(isEngineProcessing(activeProgress, 'engine-1')).toBe(true)
    expect(isEngineProcessing(activeProgress, 'engine-2')).toBe(false)
  })

  it('reads the progress value when available', () => {
    const activeProgress = new Map<string, number>([['engine-1', 60]])

    expect(getEngineProgressValue(activeProgress, 'engine-1')).toBe(60)
    expect(getEngineProgressValue(activeProgress, 'missing')).toBeUndefined()
  })
})
