export type ShortcutContextValue = string | boolean | undefined

export type ShortcutContext = Record<string, ShortcutContextValue>

export type ShortcutWhen = Record<string, string | boolean>

export interface ShortcutDefinition<TExecuteContext = void> {
  allowInInput?: boolean
  allowInModal?: boolean
  execute: (context: TExecuteContext) => void | Promise<void>
  i18nKey: string
  id: string
  keys: string | string[]
  overrideMonaco?: boolean
  when?: ShortcutWhen
}

export type ShortcutPlatform = 'linux' | 'mac' | 'windows'
