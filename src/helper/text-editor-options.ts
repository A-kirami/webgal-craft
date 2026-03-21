export interface TextEditorSettingsSnapshot {
  fontFamily: string
  fontSize: number
  minimap: boolean
  wordWrap: boolean
}

export interface TextEditorOptions {
  fontFamily?: string
  fontSize?: number
  minimap?: {
    enabled?: boolean
    [key: string]: unknown
  }
  wordWrap?: 'on' | 'off'
  [key: string]: unknown
}

export function buildTextEditorOptions(
  baseOptions: TextEditorOptions,
  settings: TextEditorSettingsSnapshot,
): TextEditorOptions {
  return {
    ...baseOptions,
    fontFamily: settings.fontFamily,
    fontSize: settings.fontSize,
    wordWrap: settings.wordWrap ? 'on' : 'off',
    minimap: {
      ...baseOptions.minimap,
      enabled: settings.minimap,
    },
  }
}
