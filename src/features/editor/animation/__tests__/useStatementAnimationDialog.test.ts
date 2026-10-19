import '~/__tests__/mocks/i18n'
import '~/__tests__/mocks/modal-store'

import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, inject } from 'vue'
import { commandType } from 'webgal-parser/src/interface/sceneInterface'

import { createSentence } from '~/features/editor/__tests__/statement-editor-test-utils'
import { createTestRenderer } from '~/features/editor/__tests__/utils/createTestRenderer'

import { useStatementAnimationDialog } from '../useStatementAnimationDialog'
import { STATEMENT_ANIMATION_EDITOR_OPEN_OVERRIDE_KEY } from '../useStatementAnimationEditorBridge'

import type { ISentence } from 'webgal-parser/src/interface/sceneInterface'
import type { AnimationFrame } from '~/domain/stage/types'
import type { TestNode } from '~/features/editor/__tests__/utils/createTestRenderer'

const { loggerWarnMock, toastErrorMock, toastWarningMock } = vi.hoisted(() => ({
  loggerWarnMock: vi.fn(),
  toastErrorMock: vi.fn(),
  toastWarningMock: vi.fn(),
}))

vi.mock('@tauri-apps/plugin-log', () => ({
  warn: loggerWarnMock,
}))

vi.mock('vue-sonner', () => ({
  toast: {
    error: toastErrorMock,
    warning: toastWarningMock,
  },
}))

const mountedApps: { unmount: () => void }[] = []
const renderer = createTestRenderer()

function mountDialogHarness() {
  let dialog: ReturnType<typeof useStatementAnimationDialog> | undefined
  let openDialog: ((sentence: ISentence, onApply: (frames: AnimationFrame[]) => void) => void) | undefined

  const Consumer = defineComponent({
    setup() {
      openDialog = inject(STATEMENT_ANIMATION_EDITOR_OPEN_OVERRIDE_KEY)
      return () => undefined
    },
  })

  const Root = defineComponent({
    setup() {
      dialog = useStatementAnimationDialog()
      return () => h(Consumer)
    },
  })

  const container: TestNode = { type: 'root', children: [] }
  const app = renderer.createApp(Root)
  app.mount(container)
  mountedApps.push(app)

  if (!dialog || !openDialog) {
    throw new TypeError('expected statement animation dialog harness')
  }

  return {
    dialog,
    openDialog,
  }
}

afterEach(() => {
  loggerWarnMock.mockReset()
  toastErrorMock.mockReset()
  toastWarningMock.mockReset()
  while (mountedApps.length > 0) {
    mountedApps.pop()?.unmount()
  }
})

describe('useStatementAnimationDialog', () => {
  it('非法动画 JSON 会阻止打开并弹出错误 toast', () => {
    const { dialog, openDialog } = mountDialogHarness()
    const handleApply = vi.fn()

    openDialog(createSentence({
      command: commandType.setTempAnimation,
      commandRaw: 'setTempAnimation',
      content: '{invalid json',
    }), handleApply)

    expect(dialog.isOpen).toBe(false)
    expect(dialog.draftFrames).toEqual([])
    expect(toastErrorMock).toHaveBeenCalledWith('edit.visualEditor.animation.invalidJson')
    expect(handleApply).not.toHaveBeenCalled()
  })

  it('v2 动画内容不会进入帧编辑器并提示改用文本编辑', () => {
    const { dialog, openDialog } = mountDialogHarness()
    const handleApply = vi.fn()

    openDialog(createSentence({
      command: commandType.setTempAnimation,
      commandRaw: 'setTempAnimation',
      content: '{"version":2,"relative":true,"keyframes":[{"time":0,"alpha":0}]}',
    }), handleApply)

    expect(dialog.isOpen).toBe(false)
    expect(dialog.draftFrames).toEqual([])
    expect(toastWarningMock).toHaveBeenCalledWith('edit.visualEditor.animation.v2ReadOnly')
    expect(toastErrorMock).not.toHaveBeenCalled()
    expect(loggerWarnMock).not.toHaveBeenCalled()
    expect(handleApply).not.toHaveBeenCalled()
  })

  it('应用时保存 controller 提交的帧', () => {
    const { dialog, openDialog } = mountDialogHarness()
    const handleApply = vi.fn()

    openDialog(createSentence({
      command: commandType.setTempAnimation,
      commandRaw: 'setTempAnimation',
      content: '[{"duration":120}]',
    }), handleApply)

    dialog.controller.handleAddFrame()
    dialog.controller.handleTransformUpdate({
      flush: true,
      value: { alpha: 0.5 },
    })
    expect(() => dialog.handleApply()).not.toThrow()
    expect(handleApply).toHaveBeenCalledWith([
      { duration: 120 },
      { duration: 500, alpha: 0.5 },
    ])
  })

  it('打开时默认选中最后一帧以匹配语句执行后的终态', () => {
    const { dialog, openDialog } = mountDialogHarness()

    openDialog(createSentence({
      command: commandType.setTempAnimation,
      commandRaw: 'setTempAnimation',
      content: '[{"duration":120},{"duration":240},{"duration":360}]',
    }), vi.fn())

    expect(dialog.controller.session.selectedFrameId).toBe(3)
    expect(dialog.controller.session.selectedFrameState?.id).toBe(3)
  })

  it('重新打开会重置帧选择与撤销历史', () => {
    const { dialog, openDialog } = mountDialogHarness()

    openDialog(createSentence({
      command: commandType.setTempAnimation,
      commandRaw: 'setTempAnimation',
      content: '[{"duration":120},{"duration":240}]',
    }), vi.fn())

    dialog.controller.handleAddFrame()
    expect(dialog.draftFrames).toHaveLength(3)

    openDialog(createSentence({
      command: commandType.setTempAnimation,
      commandRaw: 'setTempAnimation',
      content: '[{"duration":60}]',
    }), vi.fn())

    expect(dialog.controller.session.selectedFrameId).toBe(1)
    expect(dialog.draftFrames).toHaveLength(1)
    dialog.controller.handleUndo()
    expect(dialog.draftFrames).toHaveLength(1)
  })

  it('每次打开都新建会话标识，同一会话内改动草稿不会改变它', () => {
    const { dialog, openDialog } = mountDialogHarness()

    openDialog(createSentence({
      command: commandType.setTempAnimation,
      commandRaw: 'setTempAnimation',
      content: '[{"duration":120}]',
    }), vi.fn())
    const firstSessionId = dialog.sessionId

    dialog.controller.handleAddFrame()
    expect(dialog.sessionId).toBe(firstSessionId)

    openDialog(createSentence({
      command: commandType.setTempAnimation,
      commandRaw: 'setTempAnimation',
      content: '[{"duration":60}]',
    }), vi.fn())

    // 会话标识用于让宿主重建面板，避免上一份草稿的撤销历史落进新草稿
    expect(dialog.sessionId).not.toBe(firstSessionId)
  })
})
