import { beforeEach, describe, expect, it, vi } from 'vitest'

import { TOUR_PERSISTENCE } from '~/features/onboarding/tour-version'

import { isTourCompleted, publishTourCompletion, registerTourReset, resetAllTourProgress } from '../tour-state'

describe('tour-state', () => {
  const removeItemMock = vi.fn()

  beforeEach(() => {
    removeItemMock.mockReset()
    vi.stubGlobal('localStorage', { removeItem: removeItemMock })
  })

  it('发布后其它引导能读到完成状态', () => {
    expect(isTourCompleted(TOUR_PERSISTENCE.editor)).toBe(false)

    publishTourCompletion(TOUR_PERSISTENCE.editor.storageKey, TOUR_PERSISTENCE.editor.version)
    expect(isTourCompleted(TOUR_PERSISTENCE.editor)).toBe(true)

    publishTourCompletion(TOUR_PERSISTENCE.editor.storageKey, '')
    expect(isTourCompleted(TOUR_PERSISTENCE.editor)).toBe(false)
  })

  it('重置会删除全部完成记录并通知已挂载的引导复位', () => {
    const reset = vi.fn()
    const unregister = registerTourReset(TOUR_PERSISTENCE.editor.storageKey, reset)

    resetAllTourProgress()

    expect(removeItemMock).toHaveBeenCalledTimes(Object.keys(TOUR_PERSISTENCE).length)
    for (const { storageKey } of Object.values(TOUR_PERSISTENCE)) {
      expect(removeItemMock).toHaveBeenCalledWith(storageKey)
    }
    expect(reset).toHaveBeenCalledTimes(1)

    unregister()
    resetAllTourProgress()
    expect(reset).toHaveBeenCalledTimes(1)
  })
})
