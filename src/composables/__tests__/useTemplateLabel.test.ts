import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, reactive } from 'vue'

import { AbsPath } from '~/domain/path'

import { useFileSystemEvents } from '../useFileSystemEvents'
import { useTemplateLabel } from '../useTemplateLabel'

const { readProjectConfigMock, useWorkspaceStoreMock } = vi.hoisted(() => ({
  readProjectConfigMock: vi.fn(),
  useWorkspaceStoreMock: vi.fn(),
}))

vi.mock('~/commands/project-config', () => ({
  projectConfigCmds: {
    readProjectConfig: readProjectConfigMock,
  },
}))

vi.mock('~/database/db', () => ({
  db: {
    engines: {
      get: vi.fn(),
      where: () => ({
        equals: () => ({
          first: vi.fn(),
        }),
      }),
    },
  },
}))

vi.mock('~/lib/engine-label', () => ({
  formatEngineLabel: vi.fn((engine: { name?: string, engineId?: string }) => engine.name ?? engine.engineId ?? ''),
}))

vi.mock('~/services/engine-manager', () => ({
  isEngineUsable: vi.fn(() => true),
}))

vi.mock('~/stores/workspace', () => ({
  useWorkspaceStore: useWorkspaceStoreMock,
}))

vi.mock('~/utils/error-handler', () => ({
  handleError: vi.fn(),
}))

async function flushTemplateTasks() {
  await Promise.resolve()
  await nextTick()
  await Promise.resolve()
  await nextTick()
}

describe('useTemplateLabel', () => {
  let currentGameStore: {
    currentGame: {
      engineId?: string
      path: string
    }
  }

  beforeEach(() => {
    currentGameStore = reactive({
      currentGame: {
        path: '/games/demo',
      },
    })
    useWorkspaceStoreMock.mockReturnValue(currentGameStore)
    readProjectConfigMock.mockReset()
    readProjectConfigMock.mockResolvedValue({
      template: {
        kind: 'standalone',
        name: 'Default Template',
      },
    })
    useFileSystemEvents().reset()
  })

  afterEach(() => {
    useFileSystemEvents().reset()
  })

  it('目录事件在归一化后逃出模板目录时不会触发刷新', async () => {
    const scope = effectScope()

    scope.run(() => useTemplateLabel())
    await flushTemplateTasks()

    expect(readProjectConfigMock).toHaveBeenCalledTimes(1)

    useFileSystemEvents().emit({
      type: 'directory:modified',
      path: AbsPath.from('/games/demo/game/template/../script'),
    })
    await flushTemplateTasks()

    expect(readProjectConfigMock).toHaveBeenCalledTimes(1)

    scope.stop()
  })

  it('模板目录及其子目录变更会触发刷新', async () => {
    const scope = effectScope()

    scope.run(() => useTemplateLabel())
    await flushTemplateTasks()

    expect(readProjectConfigMock).toHaveBeenCalledTimes(1)

    useFileSystemEvents().emit({
      type: 'directory:modified',
      path: AbsPath.from(String.raw`/games/demo\game\template\styles`),
    })
    await flushTemplateTasks()

    expect(readProjectConfigMock).toHaveBeenCalledTimes(2)

    scope.stop()
  })

  it('模板目录事件在大小写不同但语义相同时仍会触发刷新', async () => {
    const scope = effectScope()

    currentGameStore.currentGame.path = 'C:/Games/Demo'

    scope.run(() => useTemplateLabel())
    await flushTemplateTasks()

    expect(readProjectConfigMock).toHaveBeenCalledTimes(1)

    useFileSystemEvents().emit({
      type: 'directory:modified',
      path: AbsPath.from(String.raw`c:\games\demo\GAME\TEMPLATE\styles`),
    })
    await flushTemplateTasks()

    expect(readProjectConfigMock).toHaveBeenCalledTimes(2)

    scope.stop()
  })
})
