import { describe, expect, it, vi } from 'vitest'

import { getCloseTabDecision, shouldFixPreviewTab } from '~/helper/editor-tabs'

import type { Tab } from '~/stores/tabs'

const createTab = (overrides: Partial<Tab> = {}): Tab => ({
  name: 'demo.txt',
  path: '/project/demo.txt',
  activeAt: 1,
  isPreview: false,
  isModified: false,
  ...overrides,
})

describe('editor tabs helper', () => {
  it('decides to close clean tabs directly without touching the modal', () => {
    const closeTab = vi.fn()
    const decision = getCloseTabDecision({
      tab: createTab(),
      tabIndex: 0,
      modalTitle: 'anything',
      logger: { error: vi.fn() },
      saveFile: vi.fn(),
      findTabIndex: vi.fn(),
      closeTab,
    })

    expect(decision.type).toBe('close')
    if (decision.type !== 'close') {
      throw new TypeError('expected close decision')
    }

    expect(decision.index).toBe(0)
    expect(closeTab).not.toHaveBeenCalled()
  })

  it('prompts and closes the tab after a successful save', async () => {
    const closeTab = vi.fn()
    const saveFile = vi.fn(() => Promise.resolve())
    const findTabIndex = vi.fn(() => 2)
    const decision = getCloseTabDecision({
      tab: createTab({ isModified: true }),
      tabIndex: 1,
      modalTitle: 'save it',
      logger: { error: vi.fn() },
      saveFile,
      findTabIndex,
      closeTab,
    })

    expect(decision.type).toBe('prompt')
    if (decision.type !== 'prompt') {
      throw new TypeError('expected prompt decision')
    }

    expect(decision.modal.title).toBe('save it')
    await decision.modal.onSave()

    expect(saveFile).toHaveBeenCalledWith('/project/demo.txt')
    expect(closeTab).toHaveBeenCalledWith(2)
    decision.modal.onDontSave()
    expect(closeTab).toHaveBeenCalledWith(2)
  })

  it('logs errors and never closes the tab when save fails', async () => {
    const closeTab = vi.fn()
    const error = new Error('boom')
    const saveFile = vi.fn(() => Promise.reject(error))
    const findTabIndex = vi.fn(() => 0)
    const logger = { error: vi.fn() }

    const decision = getCloseTabDecision({
      tab: createTab({ isModified: true }),
      tabIndex: 0,
      modalTitle: 'save it',
      logger,
      saveFile,
      findTabIndex,
      closeTab,
    })

    if (decision.type !== 'prompt') {
      throw new TypeError('expected prompt decision')
    }

    await decision.modal.onSave()
    expect(logger.error).toHaveBeenCalledWith(`保存文件失败: ${error}`)
    expect(closeTab).not.toHaveBeenCalled()
  })

  it('only fixes preview tabs when double-clicked', () => {
    expect(shouldFixPreviewTab(createTab({ isPreview: true }))).toBe(true)
    expect(shouldFixPreviewTab(createTab({ isPreview: false }))).toBe(false)
    expect(shouldFixPreviewTab(undefined)).toBe(false)
  })
})
