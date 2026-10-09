import '~/__tests__/setup'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick } from 'vue'

import { useExternalPreviewReadySync } from '~/features/editor/preview/useExternalPreviewReadySync'
import { usePreferenceStore } from '~/stores/preference'
import { usePreviewSyncStore } from '~/stores/preview-sync'

import type { EffectScope } from 'vue'

const { syncSceneMock } = vi.hoisted(() => ({
  syncSceneMock: vi.fn(async () => undefined),
}))

const editorStoreMock = vi.hoisted(() => ({
  currentState: undefined as { kind: string, path: string } | undefined,
  currentSceneSelection: undefined as { lastLineNumber: number } | undefined,
  currentTextProjection: undefined as { path: string, textContent: string } | undefined,
}))

vi.mock('~/services/debug-commander', () => ({
  debugCommander: {
    syncScene: syncSceneMock,
  },
}))

vi.mock('~/stores/editor', () => ({
  useEditorStore: () => editorStoreMock,
}))

vi.mock('~/commands/server', () => ({
  serverCmds: {
    sendPreviewCommand: vi.fn(),
  },
}))

vi.mock('@tauri-apps/plugin-log', () => ({
  debug: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
}))

function emitPreviewReady() {
  usePreviewSyncStore().consumeHostEvent(JSON.stringify({
    kind: 'event',
    type: 'preview.ready.updated',
    payload: { ready: true },
  }))
}

describe('useExternalPreviewReadySync', () => {
  let scope: EffectScope | undefined

  function bootstrap() {
    scope = effectScope()
    scope.run(() => useExternalPreviewReadySync())
  }

  beforeEach(() => {
    syncSceneMock.mockClear()
    editorStoreMock.currentState = { kind: 'scene', path: '/games/demo/game/scene/start.txt' }
    editorStoreMock.currentSceneSelection = { lastLineNumber: 3 }
    editorStoreMock.currentTextProjection = {
      path: '/games/demo/game/scene/start.txt',
      textContent: 'line1\nline2\nline3',
    }
  })

  afterEach(() => {
    scope?.stop()
    scope = undefined
  })

  it('预览面板关闭时外部预览就绪会触发一次强制场景同步', async () => {
    usePreferenceStore().showPreviewPanel = false
    bootstrap()

    emitPreviewReady()
    await nextTick()

    expect(syncSceneMock).toHaveBeenCalledTimes(1)
    expect(syncSceneMock).toHaveBeenCalledWith(
      '/games/demo/game/scene/start.txt',
      3,
      'line3',
      { force: true },
    )

    // 已就绪状态下重复的就绪事件不形成上升沿，不重复同步
    emitPreviewReady()
    await nextTick()
    expect(syncSceneMock).toHaveBeenCalledTimes(1)
  })

  it('预览面板打开时不接管就绪初始化', async () => {
    bootstrap()

    emitPreviewReady()
    await nextTick()

    expect(syncSceneMock).not.toHaveBeenCalled()
  })

  it('当前文档不是场景时不同步', async () => {
    usePreferenceStore().showPreviewPanel = false
    editorStoreMock.currentState = { kind: 'template', path: '/games/demo/game/template/main.txt' }
    bootstrap()

    emitPreviewReady()
    await nextTick()

    expect(syncSceneMock).not.toHaveBeenCalled()
  })
})
