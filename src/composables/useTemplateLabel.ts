import { projectConfigCmds } from '~/commands/project-config'
import { db } from '~/database/db'
import { formatEngineLabel } from '~/lib/engine-label'
import { useWorkspaceStore } from '~/stores/workspace'
import { handleError } from '~/utils/error-handler'
import { joinPath, normalizeFsPath } from '~/utils/path'

import { useFileSystemEvents } from './useFileSystemEvents'

import type { TemplateBinding } from '~/types/project-config'

interface TemplateLabelState {
  label: string | undefined
  followingEngine: boolean
}

const EMPTY_STATE: TemplateLabelState = { label: undefined, followingEngine: false }

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
    const label = engine ? formatEngineLabel(engine) : formatBuiltinFallbackLabel(id, version)
    return { label, followingEngine: false }
  }

  // 缺省 → 跟随当前引擎
  const engine = fallbackEngineId ? await db.engines.get(fallbackEngineId) : undefined
  const label = engine ? formatEngineLabel(engine) : fallbackEngineId
  return { label, followingEngine: !!fallbackEngineId }
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
    const templateRoot = normalizeFsPath(joinPath(gamePath, 'game', 'template'))
    const eventPath = normalizeFsPath(event.path)
    if (eventPath === templateRoot || eventPath.startsWith(`${templateRoot}/`)) {
      refresh()
    }
  })
  onScopeDispose(stopListener)

  return {
    label: $$(label),
    followingEngine: $$(followingEngine),
  }
}
