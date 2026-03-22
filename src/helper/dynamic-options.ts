import { DynamicOptionsContext, DynamicOptionsResult, EditorDynamicOptionsKey } from '~/helper/command-registry/schema'

/**
 * 动态选项解析器注册表
 * 用于 choice 控件（select / segmented / combobox）在运行时根据上下文动态获取选项列表
 */

type DynamicOptionsResolver = (ctx: DynamicOptionsContext) => DynamicOptionsResult

const resolvers = new Map<EditorDynamicOptionsKey, DynamicOptionsResolver>()

export function registerDynamicOptions(key: EditorDynamicOptionsKey, resolver: DynamicOptionsResolver) {
  resolvers.set(key, resolver)
}

export function resolveDynamicOptions(key: EditorDynamicOptionsKey, ctx: DynamicOptionsContext): DynamicOptionsResult | undefined {
  return resolvers.get(key)?.(ctx)
}
