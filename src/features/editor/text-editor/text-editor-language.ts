export interface TextEditorLanguageState {
  kind: string
  path: string
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
      return 'webgalscript'
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
