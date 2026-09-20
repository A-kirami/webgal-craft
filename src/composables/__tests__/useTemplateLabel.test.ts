import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, reactive } from 'vue'

import { AbsPath } from '~/domain/path'

import { useFileSystemEvents } from '../useFileSystemEvents'
import { useTemplateLabel } from '../useTemplateLabel'

const {
  engineGetMock,
  engineWhereFirstMock,
  readProjectConfigMock,
  templateFilterFirstMock,
  useWorkspaceStoreMock,
} = vi.hoisted(() => ({
  engineGetMock: vi.fn(),
  engineWhereFirstMock: vi.fn(),
  readProjectConfigMock: vi.fn(),
  templateFilterFirstMock: vi.fn(),
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
      get: engineGetMock,
      where: () => ({
        equals: () => ({
          first: engineWhereFirstMock,
        }),
      }),
    },
    templates: {
      filter: () => ({
        first: templateFilterFirstMock,
      }),
    },
  },
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
    engineGetMock.mockReset()
    engineGetMock.mockResolvedValue(undefined)
    engineWhereFirstMock.mockReset()
    engineWhereFirstMock.mockResolvedValue(undefined)
    templateFilterFirstMock.mockReset()
    templateFilterFirstMock.mockResolvedValue(undefined)
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

  it('跟随引擎且引擎可用时模板可解析', async () => {
    const scope = effectScope()
    currentGameStore.currentGame.engineId = 'engine-1'
    readProjectConfigMock.mockResolvedValue({ version: 1 })
    engineGetMock.mockResolvedValue({
      id: 'engine-1',
      name: 'WebGAL',
      path: '/engines/webgal',
      version: '4.5.0',
    })

    const state = scope.run(() => useTemplateLabel())!
    await flushTemplateTasks()

    expect(state.resolvable.value).toBe(true)

    scope.stop()
  })

  it('跟随引擎但引擎记录缺失时模板不可解析', async () => {
    const scope = effectScope()
    currentGameStore.currentGame.engineId = 'engine-1'
    readProjectConfigMock.mockResolvedValue({ version: 1 })
    engineGetMock.mockResolvedValue(undefined)

    const state = scope.run(() => useTemplateLabel())!
    await flushTemplateTasks()

    expect(state.resolvable.value).toBe(false)
    expect(state.followingEngine.value).toBe(true)

    scope.stop()
  })

  it('引擎内建模板绑定的引擎记录缺失时模板不可解析', async () => {
    const scope = effectScope()
    currentGameStore.currentGame.engineId = 'engine-1'
    readProjectConfigMock.mockResolvedValue({
      template: {
        engine: { id: 'open-webgal.webgal', version: '4.5.0' },
        kind: 'engineBuiltin',
      },
      version: 1,
    })
    engineWhereFirstMock.mockResolvedValue(undefined)

    const state = scope.run(() => useTemplateLabel())!
    await flushTemplateTasks()

    expect(state.resolvable.value).toBe(false)

    scope.stop()
  })

  it('独立模板记录缺失时模板不可解析', async () => {
    const scope = effectScope()

    const state = scope.run(() => useTemplateLabel())!
    await flushTemplateTasks()

    expect(state.resolvable.value).toBe(false)

    scope.stop()
  })

  it('独立模板记录存在时模板可解析', async () => {
    const scope = effectScope()
    templateFilterFirstMock.mockResolvedValue({
      path: '/templates/default',
      status: 'created',
    })

    const state = scope.run(() => useTemplateLabel())!
    await flushTemplateTasks()

    expect(state.resolvable.value).toBe(true)

    scope.stop()
  })
})
