import { beforeEach, describe, expect, it, vi } from 'vitest'

const { channels, invokeMock } = vi.hoisted(() => ({
  channels: [] as { emit: (value: unknown) => void }[],
  invokeMock: vi.fn(),
}))

vi.mock('@tauri-apps/api/core', () => ({
  Channel: class Channel<T> {
    constructor(handler: (value: T) => void) {
      channels.push({ emit: value => handler(value as T) })
    }
  },
  invoke: invokeMock,
}))

import { createAndroidDirectoryMaterializer } from '../android-directory-materializer'

describe('androidDirectoryMaterializer', () => {
  beforeEach(() => {
    channels.length = 0
    invokeMock.mockReset()
  })

  it('stages through the native bridge and forwards progress', async () => {
    invokeMock.mockResolvedValue({
      kind: 'staged',
      sessionId: 'session-1',
      stagingPath: '/data/user/0/app/files/documents/WebGALCraft/games/.import-staging/session-1',
    })
    const onProgress = vi.fn()
    const materializer = createAndroidDirectoryMaterializer()

    const promise = materializer.selectAndStage('game', {
      operation: { kind: 'import' },
      onProgress,
    })
    channels[0]!.emit({ sessionId: 'session-1', phase: 'copying' })

    await expect(promise).resolves.toEqual({
      kind: 'staged',
      sessionId: 'session-1',
      stagingPath: '/data/user/0/app/files/documents/WebGALCraft/games/.import-staging/session-1',
    })
    expect(invokeMock).toHaveBeenCalledWith('android_resource_import_select_and_stage', {
      kind: 'game',
      operation: { kind: 'import' },
      onProgress: expect.any(Object),
    })
    expect(onProgress).toHaveBeenCalledWith({ sessionId: 'session-1', phase: 'copying' })
  })

  it('publishes, commits and rolls back only by session identity', async () => {
    invokeMock.mockResolvedValueOnce({ finalPath: '/data/user/0/app/files/documents/WebGALCraft/engines/WebGAL/4.6.2' })
    invokeMock.mockResolvedValue(undefined)
    const materializer = createAndroidDirectoryMaterializer()

    await expect(materializer.publish('session-1', 'WebGAL/4.6.2')).resolves.toEqual({
      finalPath: '/data/user/0/app/files/documents/WebGALCraft/engines/WebGAL/4.6.2',
    })
    await materializer.commit('session-1', 'engine-1')
    await materializer.rollback('session-2')

    expect(invokeMock).toHaveBeenNthCalledWith(1, 'android_resource_import_publish', {
      sessionId: 'session-1',
      finalRelativePath: 'WebGAL/4.6.2',
    })
    expect(invokeMock).toHaveBeenNthCalledWith(2, 'android_resource_import_commit', {
      sessionId: 'session-1',
      resourceId: 'engine-1',
    })
    expect(invokeMock).toHaveBeenNthCalledWith(3, 'android_resource_import_rollback', {
      sessionId: 'session-2',
    })
  })

  it('maps picker cancellation without exposing a URI', async () => {
    invokeMock.mockResolvedValue({ kind: 'cancelled' })

    await expect(createAndroidDirectoryMaterializer().selectAndStage('template'))
      .resolves.toEqual({ kind: 'cancelled' })
  })
})
