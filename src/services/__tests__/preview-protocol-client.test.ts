import '~/__tests__/setup'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createPreviewRequestEnvelope,
  sendPreviewCommandRequest,
  sendPreviewRequestEnvelope,
} from '~/services/preview-protocol-client'
import { usePreferenceStore } from '~/stores/preference'

const { sendPreviewCommandMock } = vi.hoisted(() => ({
  sendPreviewCommandMock: vi.fn(async (_request: string) => undefined),
}))

vi.mock('~/commands/server', () => ({
  serverCmds: {
    sendPreviewCommand: sendPreviewCommandMock,
  },
}))

describe('sendPreviewCommandRequest', () => {
  beforeEach(() => {
    sendPreviewCommandMock.mockClear()
  })

  it('预览面板打开时发送命令请求', async () => {
    await sendPreviewCommandRequest('preview.command.sync-scene', {
      sceneName: 'start.txt',
      sentenceId: 3,
    })

    expect(sendPreviewCommandMock).toHaveBeenCalledTimes(1)
    const request = JSON.parse(sendPreviewCommandMock.mock.calls[0][0])
    expect(request).toMatchObject({
      kind: 'request',
      type: 'preview.command.sync-scene',
      payload: {
        sceneName: 'start.txt',
        sentenceId: 3,
      },
    })
    expect(request.requestId).toBeTruthy()
  })

  it('预览面板关闭时依然发送命令请求', async () => {
    usePreferenceStore().showPreviewPanel = false

    await sendPreviewCommandRequest('preview.command.sync-scene', {
      sceneName: 'start.txt',
      sentenceId: 3,
    })

    expect(sendPreviewCommandMock).toHaveBeenCalledTimes(1)
  })

  it('预览面板关闭时发送请求信封不再抛出预览重置错误', async () => {
    usePreferenceStore().showPreviewPanel = false

    const request = createPreviewRequestEnvelope('preview.command.run-snippet', { snippet: 'say:hi' })
    await expect(sendPreviewRequestEnvelope(request)).resolves.toBeUndefined()
    expect(sendPreviewCommandMock).toHaveBeenCalledTimes(1)
  })

  it('发送失败时错误向调用方传播', async () => {
    sendPreviewCommandMock.mockRejectedValueOnce(new Error('ipc down'))

    await expect(
      sendPreviewCommandRequest('preview.command.run-snippet', { snippet: 'say:hi' }),
    ).rejects.toThrow('ipc down')
  })
})
