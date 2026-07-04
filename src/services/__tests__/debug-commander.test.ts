import '~/__tests__/setup'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { debugCommander } from '../debug-commander'

const {
  editSettingsStoreMock,
  previewSyncStoreMock,
  sendPreviewCommandRequestMock,
} = vi.hoisted(() => ({
  editSettingsStoreMock: {
    enableLivePreview: true,
  },
  previewSyncStoreMock: {
    sendPreviewCommand: vi.fn(),
  },
  sendPreviewCommandRequestMock: vi.fn(),
}))

vi.mock('~/stores/edit-settings', () => ({
  useEditSettingsStore: () => editSettingsStoreMock,
}))

vi.mock('~/services/preview-protocol-client', () => ({
  sendPreviewCommandRequest: sendPreviewCommandRequestMock,
}))

vi.mock('~/stores/preview-sync', () => ({
  usePreviewSyncStore: () => previewSyncStoreMock,
}))

describe('debugCommander', () => {
  beforeEach(() => {
    editSettingsStoreMock.enableLivePreview = true
    previewSyncStoreMock.sendPreviewCommand.mockReset()
    previewSyncStoreMock.sendPreviewCommand.mockResolvedValue(undefined)
    sendPreviewCommandRequestMock.mockReset()
  })

  it('同步场景时会归一化场景路径并保留效果编辑器同步参数', async () => {
    await debugCommander.syncScene(
      '/games/demo/game/scene/chapter/start.txt',
      7,
      'setTransform:',
      {
        transformBaselineRevision: 'rev-effect-1',
        settleMode: 'immediate',
      },
    )

    expect(sendPreviewCommandRequestMock).toHaveBeenCalledTimes(1)
    expect(sendPreviewCommandRequestMock).toHaveBeenCalledWith(
      'preview.command.sync-scene',
      {
        sceneName: 'chapter/start.txt',
        sentenceId: 7,
        transformBaselineRevision: 'rev-effect-1',
        settleMode: 'immediate',
      },
    )
  })

  it('实时预览关闭且未强制发送时不会发送效果编辑器同步', async () => {
    editSettingsStoreMock.enableLivePreview = false

    await debugCommander.syncScene(
      '/games/demo/game/scene/chapter/start.txt',
      7,
      'setTransform:',
      {
        transformBaselineRevision: 'rev-effect-1',
        settleMode: 'immediate',
      },
    )

    expect(sendPreviewCommandRequestMock).not.toHaveBeenCalled()
  })

  it('强制发送场景同步时会忽略实时预览开关', async () => {
    editSettingsStoreMock.enableLivePreview = false

    await debugCommander.syncScene(
      '/games/demo/game/scene/chapter/start.txt',
      7,
      'say:hello',
      {
        force: true,
      },
    )

    expect(sendPreviewCommandRequestMock).toHaveBeenCalledTimes(1)
    expect(sendPreviewCommandRequestMock).toHaveBeenCalledWith(
      'preview.command.sync-scene',
      {
        sceneName: 'chapter/start.txt',
        sentenceId: 7,
      },
    )
  })

  it('发送效果预览时未指定阶段会省略 phase 字段', async () => {
    await debugCommander.setEffect('fig-center', {
      position: { x: 24 },
    })

    expect(previewSyncStoreMock.sendPreviewCommand).toHaveBeenCalledTimes(1)
    expect(previewSyncStoreMock.sendPreviewCommand).toHaveBeenCalledWith(
      'preview.command.set-effect',
      {
        target: 'fig-center',
        transform: {
          position: { x: 24 },
        },
      },
    )
  })

  it('发送效果预览时支持显式 preview phase', async () => {
    await debugCommander.setEffect('fig-center', {
      position: { x: 24 },
    }, { phase: 'preview' })

    expect(previewSyncStoreMock.sendPreviewCommand).toHaveBeenCalledTimes(1)
    expect(previewSyncStoreMock.sendPreviewCommand).toHaveBeenCalledWith(
      'preview.command.set-effect',
      {
        target: 'fig-center',
        transform: {
          position: { x: 24 },
        },
        phase: 'preview',
      },
    )
  })
})
