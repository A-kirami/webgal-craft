import '~/__tests__/mocks/i18n'
import '~/__tests__/mocks/modal-store'
/* eslint-disable vue/one-component-per-file */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRenderer, defineComponent, h, inject, reactive } from 'vue'
import { commandType } from 'webgal-parser/src/interface/sceneInterface'

import { useStatementAnimationDialog } from '../useStatementAnimationDialog'
import { STATEMENT_ANIMATION_EDITOR_OPEN_OVERRIDE_KEY } from '../useStatementAnimationEditorBridge'

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

interface TestNode {
  children?: TestNode[]
  text?: string
  type: string
}

const mountedApps: { unmount: () => void }[] = []

function getMissingNode(): TestNode | null {
  // eslint-disable-next-line unicorn/no-null -- Vue 自定义 renderer 的宿主接口要求缺失节点返回 null。
  return null
}

const renderer = createRenderer<TestNode, TestNode>({
  patchProp() { /* noop */ },
  insert(child, parent) {
    parent.children ??= []
    parent.children.push(child)
  },
  remove() { /* noop */ },
  createElement(type) {
    return { type, children: [] }
  },
  createText(text) {
    return { type: 'text', text }
  },
  createComment(text) {
    return { type: 'comment', text }
  },
  setText(node, text) {
    node.text = text
  },
  setElementText(node, text) {
    node.text = text
  },
  parentNode: getMissingNode,
  nextSibling: getMissingNode,
})

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
