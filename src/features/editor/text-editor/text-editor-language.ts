import { resolveWebgalScriptConfigKey, WEBGAL_SCRIPT_LANGUAGES } from '~/domain/script/parser'

import type { EngineRuntimeCapabilities } from '~/domain/engine/runtime-capabilities'
import type { WebgalScriptConfigKey } from '~/domain/script/parser'

/**
 * 完整命令表的 Monaco 语言 id。它可能已被编辑器持久化状态引用，必须保持字面值不变；
 * 其余档位由档位标识推导，见 resolveWebgalScriptLanguageId。
 */
export const WEBGAL_SCRIPT_LANGUAGE_ID = 'webgalscript'

/**
 * 命令表档位 ↦ Monaco 语言 id：完整表沿用固定 id，其余从档位标识推导。
 * 档位标识里的 `:` 与 `,` 不是合法的语言 id 字符，替换成 `-`；
 * 新增档位（新增受门控命令）时不需要在这里补名字。
 */
export function resolveWebgalScriptLanguageId(configKey: WebgalScriptConfigKey): string {
  return configKey === 'full'
    ? WEBGAL_SCRIPT_LANGUAGE_ID
    : `${WEBGAL_SCRIPT_LANGUAGE_ID}-${configKey.replaceAll(/[:,]/g, '-')}`
}

/** 需要注册到 Monaco 的语言 id，与档位一一对应 */
export const WEBGAL_SCRIPT_LANGUAGE_IDS = WEBGAL_SCRIPT_LANGUAGES
  .map(language => resolveWebgalScriptLanguageId(language.id))

export interface TextEditorLanguageState {
  kind: string
  path: string
  runtimeCapabilities?: Pick<EngineRuntimeCapabilities, 'changeFigureDiff' | 'sceneSemantics'>
}

export interface RegisteredTextEditorLanguage {
  id: string
  extensions?: string[]
}

export function resolveTextEditorLanguage(
  state: TextEditorLanguageState,
  registeredLanguages: RegisteredTextEditorLanguage[],
): string {
  switch (state.kind) {
    case 'scene': {
      // 高亮必须与实际解析该文本的解析器同源，否则命令表与颜色对不上
      return resolveWebgalScriptLanguageId(resolveWebgalScriptConfigKey(state.runtimeCapabilities))
    }
    case 'animation': {
      return 'json'
    }
    default: {
      const fileName = state.path.split(/[/\\]/).pop() ?? ''
      const lastDot = fileName.lastIndexOf('.')
      const extension = lastDot > 0 ? fileName.slice(lastDot + 1).toLowerCase() : undefined

      if (!extension) {
        return 'plaintext'
      }

      const monacoLanguage = registeredLanguages.find(
        language => language.extensions?.includes(`.${extension}`),
      )

      return monacoLanguage?.id ?? 'plaintext'
    }
  }
}
