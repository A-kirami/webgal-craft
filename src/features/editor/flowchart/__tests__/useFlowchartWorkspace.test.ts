import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'

import { AbsPath } from '~/domain/path'
import { configManager } from '~/services/config-manager'

import { useFlowchartWorkspace } from '../useFlowchartWorkspace'

import type { EffectScope } from 'vue'
import type { gameCmds, GameConfigReadResult } from '~/commands/game'

const { getGameConfig, readFlowchartFile, setGameConfig, writeFlowchartFile } = vi.hoisted(() => ({
  getGameConfig: vi.fn<typeof gameCmds.getGameConfig>(),
  readFlowchartFile: vi.fn<() => Promise<string | undefined>>(),
  setGameConfig: vi.fn(),
  writeFlowchartFile: vi.fn(),
}))

vi.mock(import('~/commands/game'), async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, gameCmds: { ...actual.gameCmds, getGameConfig, setGameConfig } }
})
vi.mock(import('~/services/game-manager'))
vi.mock(import('../flowchart-file'), () => ({ readFlowchartFile, writeFlowchartFile }))
vi.mock(import('~/utils/error-handler'), () => ({ handleError: vi.fn() }))
vi.mock(import('vue-i18n'), async (importOriginal) => {
  const actual = await importOriginal()
  const i18n = actual.createI18n({ legacy: false, missingWarn: false, fallbackWarn: false })
  return { ...actual, useI18n: () => i18n.global }
})

const gamePath = AbsPath.from('/games/demo')
let scope: EffectScope

function config(enabled: boolean): GameConfigReadResult & Record<string, unknown> {
  return { entries: [{ key: 'Enable_flowchart', value: String(enabled) }], unmanagedLineCount: 0 }
}

function startWorkspace(path: MaybeRefOrGetter<AbsPath | undefined> = gamePath) {
  scope = effectScope()
  return scope.run(() => useFlowchartWorkspace({ gamePath: path }))!
}

describe('useFlowchartWorkspace', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getGameConfig.mockResolvedValue(config(false))
    readFlowchartFile.mockResolvedValue(undefined)
    setGameConfig.mockResolvedValue(undefined)
    writeFlowchartFile.mockResolvedValue(undefined)
  })

  afterEach(() => {
    scope.stop()
  })

  it('设置保存开关后立即启用或禁用流程图，不必重新进入编辑页', async () => {
    const workspace = startWorkspace()
    await vi.waitFor(() => expect(workspace.status.value).toBe('idle'))

    await configManager.setConfig(gamePath, config(true))
    await vi.waitFor(() => expect(workspace.flowchartEnabled.value).toBe(true))
    expect(workspace.status.value).toBe('ready')
    expect(workspace.activeFlowchart.value?.id).toBe('main')

    await configManager.setConfig(gamePath, config(false))
    expect(workspace.flowchartEnabled.value).toBe(false)
    expect(workspace.status.value).toBe('idle')
  })

  it('临时关闭再启用时保留节点、未保存内容和撤销记录', async () => {
    getGameConfig.mockResolvedValue(config(true))
    const workspace = startWorkspace()
    await vi.waitFor(() => expect(workspace.status.value).toBe('ready'))
    workspace.addNode({ x: 400, y: 200 })
    expect(workspace.dirty.value).toBe(true)

    await configManager.setConfig(gamePath, config(false))
    expect(workspace.flowchartEnabled.value).toBe(false)
    await configManager.setConfig(gamePath, config(true))
    expect(workspace.flowchartEnabled.value).toBe(true)

    expect(workspace.activeFlowchart.value?.nodes).toHaveLength(2)
    expect(workspace.dirty.value).toBe(true)
    expect(workspace.canUndo.value).toBe(true)
    expect(readFlowchartFile).toHaveBeenCalledTimes(1)
    workspace.undo()
    expect(workspace.activeFlowchart.value?.nodes).toHaveLength(1)
    expect(workspace.dirty.value).toBe(false)
    await workspace.flush()
  })

  it('其他游戏的配置修改不会影响当前流程图', async () => {
    const workspace = startWorkspace()
    await vi.waitFor(() => expect(workspace.status.value).toBe('idle'))

    await configManager.setConfig(AbsPath.from('/games/other'), config(true))

    expect(workspace.flowchartEnabled.value).toBe(false)
    expect(readFlowchartFile).not.toHaveBeenCalled()
  })

  it('配置写入失败时维持原有开关状态', async () => {
    const workspace = startWorkspace()
    await vi.waitFor(() => expect(workspace.status.value).toBe('idle'))
    setGameConfig.mockRejectedValueOnce(new Error('write failed'))

    await expect(configManager.setConfig(gamePath, config(true))).rejects.toThrow('write failed')
    expect(workspace.flowchartEnabled.value).toBe(false)
    expect(readFlowchartFile).not.toHaveBeenCalled()
  })

  it('加载期间关闭流程图后，迟到的读取结果不会重新启用画布', async () => {
    let finishRead!: (value: string | undefined) => void
    const pendingRead = new Promise<string | undefined>((resolve) => {
      finishRead = resolve
    })
    getGameConfig.mockResolvedValue(config(true))
    readFlowchartFile.mockReturnValueOnce(pendingRead)
    const workspace = startWorkspace()
    await vi.waitFor(() => expect(workspace.flowchartEnabled.value).toBe(true))
    expect(workspace.status.value).toBe('loading')

    await configManager.setConfig(gamePath, config(false))
    finishRead(undefined)
    await pendingRead
    await nextTick()

    expect(workspace.flowchartEnabled.value).toBe(false)
    expect(workspace.status.value).toBe('idle')
    expect(workspace.flowcharts.value).toHaveLength(0)
  })

  it('遮罩内启用流程图也通过配置通知更新，且只加载一次', async () => {
    const workspace = startWorkspace()
    await vi.waitFor(() => expect(workspace.status.value).toBe('idle'))

    await workspace.enableFlowchart()

    expect(setGameConfig).toHaveBeenCalledWith(gamePath, { entries: config(true).entries })
    expect(workspace.flowchartEnabled.value).toBe(true)
    expect(workspace.status.value).toBe('ready')
    expect(readFlowchartFile).toHaveBeenCalledTimes(1)
  })

  it('编辑会话销毁后不再响应配置通知', async () => {
    const workspace = startWorkspace()
    await vi.waitFor(() => expect(workspace.status.value).toBe('idle'))
    scope.stop()

    await configManager.setConfig(gamePath, config(true))

    expect(workspace.flowchartEnabled.value).toBe(false)
    expect(readFlowchartFile).not.toHaveBeenCalled()
  })

  it('保存失败保留编辑与撤销记录，flush 重试成功后清除脏标记', async () => {
    getGameConfig.mockResolvedValue(config(true))
    const workspace = startWorkspace()
    await vi.waitFor(() => expect(workspace.status.value).toBe('ready'))
    workspace.addNode({ x: 400, y: 200 })
    writeFlowchartFile.mockRejectedValueOnce(new Error('写盘失败'))

    await expect(workspace.flush()).rejects.toThrow('写盘失败')
    expect(workspace.dirty.value).toBe(true)
    expect(workspace.canUndo.value).toBe(true)
    expect(workspace.activeFlowchart.value?.nodes).toHaveLength(2)

    await workspace.flush()
    expect(workspace.dirty.value).toBe(false)
    expect(writeFlowchartFile).toHaveBeenLastCalledWith(gamePath, expect.any(String))
    workspace.undo()
    expect(workspace.activeFlowchart.value?.nodes).toHaveLength(1)
    await workspace.flush()
  })

  it('切换游戏时丢弃上一游戏迟到的读取结果', async () => {
    getGameConfig.mockResolvedValue(config(true))
    let finishRead!: (content: string) => void
    const pendingRead = new Promise<string>((resolve) => {
      finishRead = resolve
    })
    readFlowchartFile.mockReturnValueOnce(pendingRead)
    const path = ref<AbsPath | undefined>(gamePath)
    const workspace = startWorkspace(path)
    await vi.waitFor(() => expect(readFlowchartFile).toHaveBeenCalledOnce())

    path.value = AbsPath.from('/games/other')
    await vi.waitFor(() => expect(workspace.status.value).toBe('ready'))
    const activeFlowchart = workspace.activeFlowchart.value
    finishRead('{')
    await pendingRead
    await nextTick()

    expect(workspace.status.value).toBe('ready')
    expect(workspace.errorMessage.value).toBeUndefined()
    expect(workspace.activeFlowchart.value).toBe(activeFlowchart)
    expect(readFlowchartFile).toHaveBeenLastCalledWith(path.value)
  })

  it('等待旧游戏保存时到达的旧配置通知不会阻断切换', async () => {
    getGameConfig.mockResolvedValue(config(true))
    const path = ref<AbsPath | undefined>(gamePath)
    const workspace = startWorkspace(path)
    await vi.waitFor(() => expect(workspace.status.value).toBe('ready'))
    workspace.addNode({ x: 400, y: 200 })
    let finishSave!: () => void
    writeFlowchartFile.mockReturnValueOnce(new Promise<void>((resolve) => {
      finishSave = resolve
    }))
    const otherPath = AbsPath.from('/games/other')
    path.value = otherPath
    await nextTick()
    await vi.waitFor(() => expect(writeFlowchartFile).toHaveBeenCalledOnce())

    await configManager.setConfig(gamePath, config(false))
    finishSave()
    await vi.waitFor(() => expect(readFlowchartFile).toHaveBeenLastCalledWith(otherPath))
    expect(workspace.status.value).toBe('ready')
    expect(workspace.flowchartEnabled.value).toBe(true)
    expect(workspace.activeFlowchart.value?.nodes).toHaveLength(1)
  })
})
