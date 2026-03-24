import '~/__tests__/mocks/i18n'
import '~/__tests__/mocks/modal-store'
/* eslint-disable vue/one-component-per-file */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, inject, reactive } from 'vue'
import { commandType } from 'webgal-parser/src/interface/sceneInterface'

import { useStatementAnimationDialog } from '../useStatementAnimationDialog'
import { STATEMENT_ANIMATION_EDITOR_OPEN_OVERRIDE_KEY } from '../useStatementAnimationEditorBridge'
import { createTestRenderer } from './utils/createTestRenderer'

import type { TestNode } from './utils/createTestRenderer'
import type { ISentence } from 'webgal-parser/src/interface/sceneInterface'
import type { AnimationFrame } from '~/types/stage'

const { loggerWarnMock, toastErrorMock } = vi.hoisted(() => ({
  loggerWarnMock: vi.fn(),
  toastErrorMock: vi.fn(),
}))

vi.mock('@tauri-apps/plugin-log', () => ({
  warn: loggerWarnMock,
}))

vi.mock('vue-sonner', () => ({
  toast: {
    error: toastErrorMock,
  },
}))

const mountedApps: { unmount: () => void }[] = []
const renderer = createTestRenderer()

function createSentence(content: string): ISentence {
  return {
    command: commandType.setTempAnimation,
    commandRaw: 'setTempAnimation',
    content,
    args: [],
    sentenceAssets: [],
    subScene: [],
    inlineComment: '',
  }
}

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
  while (mountedApps.length > 0) {
    mountedApps.pop()?.unmount()
  }
})

describe('useStatementAnimationDialog', () => {
  it('非法动画 JSON 会阻止打开并弹出错误 toast', () => {
    const { dialog, openDialog } = mountDialogHarness()
    const handleApply = vi.fn()

    openDialog(createSentence('{invalid json'), handleApply)

    expect(dialog.isOpen).toBe(false)
    expect(dialog.draftFrames).toEqual([])
    expect(toastErrorMock).toHaveBeenCalledWith('edit.visualEditor.animation.invalidJson')
    expect(handleApply).not.toHaveBeenCalled()
  })

  it('保存时可以处理来自编辑器的 reactive frames', () => {
    const { dialog, openDialog } = mountDialogHarness()
    const handleApply = vi.fn()

    openDialog(createSentence('[{"duration":120}]'), handleApply)

    const nextFrames = reactive<AnimationFrame[]>([
      {
        duration: 120,
        position: {
          x: 32,
        },
      },
      {
        duration: 240,
        alpha: 0.5,
      },
    ])

    dialog.updateFrames(nextFrames)
    expect(() => dialog.handleApply()).not.toThrow()
    expect(handleApply).toHaveBeenCalledWith([
      {
        duration: 120,
        position: {
          x: 32,
        },
      },
      {
        duration: 240,
        alpha: 0.5,
      },
    ])
  })
})
