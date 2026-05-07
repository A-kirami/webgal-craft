import { projectConfigCmds } from '~/commands/project-config'
import { db } from '~/database/db'
import { AbsPath, RelPath } from '~/domain/path'
import { formatEngineLabel } from '~/lib/engine-label'
import { isEngineUsable } from '~/services/engine-manager'
import { caseFoldedEquals, toLookupPathKey } from '~/services/resource-path/lookup'
import { useWorkspaceStore } from '~/stores/workspace'
import { handleError } from '~/utils/error-handler'

import { useFileSystemEvents } from './useFileSystemEvents'

import type { TemplateBinding } from '~/types/project-config'

interface TemplateLabelState {
  label: string | undefined
  followingEngine: boolean
}

const EMPTY_STATE: TemplateLabelState = { label: undefined, followingEngine: false }

function isPathWithinOrEqual(path: AbsPath, root: AbsPath): boolean {
  if (caseFoldedEquals(path, root)) {
    return true
  }

  return toLookupPathKey(path).startsWith(`${toLookupPathKey(root)}/`)
}

function formatBuiltinFallbackLabel(id: string, version: string | undefined): string {
  return version ? `${id} ${version}` : id
}

async function resolveBindingLabel(
  binding: TemplateBinding | undefined,
  fallbackEngineId: string | undefined,
): Promise<TemplateLabelState> {
  if (binding?.kind === 'standalone') {
    return { label: binding.name, followingEngine: false }
  }

  if (binding?.kind === 'engineBuiltin') {
    const { id, version } = binding.engine
    const engine = version === undefined
      ? undefined
      : await db.engines.where('[engineId+version]').equals([id, version]).first()
    if (!engine) {
      return { label: formatBuiltinFallbackLabel(id, version), followingEngine: false }
    }
    return { label: isEngineUsable(engine) ? formatEngineLabel(engine) : undefined, followingEngine: false }
  }

  // 缺省 → 跟随当前引擎；引擎记录缺失或不可用时不暴露 UUID/旧名，由调用方按 followingEngine + label undefined 决定占位文案
  if (!fallbackEngineId) {
    return EMPTY_STATE
  }
  const engine = await db.engines.get(fallbackEngineId)
  const label = engine && isEngineUsable(engine) ? formatEngineLabel(engine) : undefined
  return { label, followingEngine: true }
}

export function useTemplateLabel() {
  const workspaceStore = useWorkspaceStore()
  const fileSystemEvents = useFileSystemEvents()

  let label = $ref<string>()
  let followingEngine = $ref(false)

  function applyState(state: TemplateLabelState) {
    label = state.label
    followingEngine = state.followingEngine
  }

  async function refresh() {
    const gamePath = workspaceStore.currentGame?.path
    if (!gamePath) {
      applyState(EMPTY_STATE)
      return
    }

    const engineId = workspaceStore.currentGame?.engineId
    try {
      const config = await projectConfigCmds.readProjectConfig(gamePath)
      const next = await resolveBindingLabel(config.template, engineId)
      // 异步过程中工程或引擎可能切换，丢弃过时结果
      if (
        workspaceStore.currentGame?.path !== gamePath
        || workspaceStore.currentGame?.engineId !== engineId
      ) {
        return
      }
      applyState(next)
    } catch (error) {
      handleError(error, { silent: true })
      applyState(EMPTY_STATE)
    }
  }

  watch(() => workspaceStore.currentGame?.path, refresh, { immediate: true })
  // 引擎切换会改变 followEngine / engineBuiltin 的解析结果
  watch(() => workspaceStore.currentGame?.engineId, refresh)

  // 模板切换通过 directory:modified 事件广播
  const stopListener = fileSystemEvents.on('directory:modified', (event) => {
    const gamePath = workspaceStore.currentGame?.path
    if (!gamePath) {
      return
    }

    const templateRoot = AbsPath.join(AbsPath.from(gamePath), RelPath.from('game/template'))
    if (isPathWithinOrEqual(event.path, templateRoot)) {
      refresh()
    }
  })
  onScopeDispose(stopListener)

  return {
    label: $$(label),
    followingEngine: $$(followingEngine),
  }
}
