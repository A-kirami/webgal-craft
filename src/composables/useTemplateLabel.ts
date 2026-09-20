import { projectConfigCmds } from '~/commands/project-config'
import { db } from '~/database/db'
import { AbsPath, RelPath } from '~/domain/path'
import { isEngineUsable } from '~/services/engine-manager'
import { caseFoldedEquals, toLookupPathKey } from '~/services/resource-path/lookup'
import { useWorkspaceStore } from '~/stores/workspace'
import { handleError } from '~/utils/error-handler'
import { formatNameWithVersion } from '~/utils/format'

import { useFileSystemEvents } from './useFileSystemEvents'

import type { TemplateBinding } from '~/types/project-config'

interface TemplateLabelState {
  label: string | undefined
  followingEngine: boolean
  /** 模板层能否真的解析出来；undefined 表示尚未解析完成，调用方不应据此判定不可用 */
  resolvable: boolean | undefined
}

const EMPTY_STATE: TemplateLabelState = { label: undefined, followingEngine: false, resolvable: undefined }

/** 与 templateSwitch.resolveTemplatePath 的 standalone 分支保持同一判定 */
async function isStandaloneTemplateResolvable(name: string): Promise<boolean> {
  const template = await db.templates
    .filter(template => template.metadata.name === name && template.status === 'created')
    .first()
  return Boolean(template?.path)
}

function isPathWithinOrEqual(path: AbsPath, root: AbsPath): boolean {
  if (caseFoldedEquals(path, root)) {
    return true
  }

  return toLookupPathKey(path).startsWith(`${toLookupPathKey(root)}/`)
}

async function resolveBindingLabel(
  binding: TemplateBinding | undefined,
  fallbackEngineId: string | undefined,
): Promise<TemplateLabelState> {
  if (binding?.kind === 'standalone') {
    return {
      label: binding.name,
      followingEngine: false,
      resolvable: await isStandaloneTemplateResolvable(binding.name),
    }
  }

  if (binding?.kind === 'engineBuiltin') {
    const { id, version } = binding.engine
    const engine = version === undefined
      ? undefined
      : await db.engines.where('[engineId+version]').equals([id, version]).first()
    if (!engine) {
      return { label: formatNameWithVersion(id, version), followingEngine: false, resolvable: false }
    }
    const isUsable = isEngineUsable(engine)
    return {
      label: isUsable ? formatNameWithVersion(engine.name, engine.version) : undefined,
      followingEngine: false,
      resolvable: isUsable,
    }
  }

  // 缺省 → 跟随当前引擎；引擎记录缺失或不可用时不暴露 UUID/旧名，由调用方按 followingEngine + label undefined 决定占位文案
  if (!fallbackEngineId) {
    return EMPTY_STATE
  }
  const engine = await db.engines.get(fallbackEngineId)
  const isUsable = Boolean(engine && isEngineUsable(engine))
  return {
    label: engine && isUsable ? formatNameWithVersion(engine.name, engine.version) : undefined,
    followingEngine: true,
    resolvable: isUsable,
  }
}

export function useTemplateLabel() {
  const workspaceStore = useWorkspaceStore()
  const fileSystemEvents = useFileSystemEvents()

  let label = $ref<string>()
  let followingEngine = $ref(false)
  let resolvable = $ref<boolean>()

  function applyState(state: TemplateLabelState) {
    label = state.label
    followingEngine = state.followingEngine
    resolvable = state.resolvable
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
    resolvable: $$(resolvable),
  }
}
