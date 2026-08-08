import type { EngineRuntimeCapabilities } from '~/domain/engine/runtime-capabilities'

export const WEBGAL_SCRIPT_LANGUAGE_ID = 'webgalscript'
export const LEGACY_WEBGAL_SCRIPT_LANGUAGE_ID = 'webgalscript-legacy'
export const WEBGAL_SCRIPT_LANGUAGE_IDS = [
  WEBGAL_SCRIPT_LANGUAGE_ID,
  LEGACY_WEBGAL_SCRIPT_LANGUAGE_ID,
] as const

export interface TextEditorLanguageState {
  kind: string
  path: string
  runtimeCapabilities?: Pick<EngineRuntimeCapabilities, 'sceneSemantics'>
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
      return state.runtimeCapabilities?.sceneSemantics === false
        ? LEGACY_WEBGAL_SCRIPT_LANGUAGE_ID
        : WEBGAL_SCRIPT_LANGUAGE_ID
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
