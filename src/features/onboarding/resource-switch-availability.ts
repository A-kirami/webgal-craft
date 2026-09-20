import { isEngineEditorCompatible } from '~/services/engine-manager'

import type { Engine, Template } from '~/database/model'

interface ResourceSwitchAvailability {
  currentEngineId: string | undefined
  engines: readonly Engine[]
  templates: readonly Template[]
}

/**
 * 「可切换替代项」：点开引擎或模板入口后，能不能选到一个与当前不同的东西。
 *
 * 候选集合与两个弹窗保持一致：引擎取 EngineSelector 的 isEngineEditorCompatible 过滤，
 * 模板取 TemplateSelector 的「status === 'created' 且 availability === 'available'」。
 * 比较时用引擎记录 id（game.engineId 与 EngineSelector 的取值同源），因此换成同一
 * engineId 的另一个版本也算替代项。
 */
export function hasSwitchableResourceAlternative(input: ResourceSwitchAvailability): boolean {
  const { currentEngineId, engines, templates } = input

  // 自带引擎项目既不渲染引擎入口，也无法切换模板
  if (!currentEngineId) {
    return false
  }

  // 引擎有替代项时，模板入口至少也能换成该引擎内置的模板
  if (engines.some(engine => engine.id !== currentEngineId && isEngineEditorCompatible(engine))) {
    return true
  }

  // 存在可用独立模板时，模板入口能切到它，或切回「跟随引擎」
  return templates.some(template => template.status === 'created' && template.availability === 'available')
}
