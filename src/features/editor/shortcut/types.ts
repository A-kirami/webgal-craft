import type { SystemPlatform } from '~/utils/platform'

export type ShortcutContextValue = string | boolean | undefined

export type ShortcutContext = Record<string, ShortcutContextValue>

export type ShortcutWhen = Record<string, string | boolean>

export interface ShortcutDefinition<TExecuteContext = void> {
  allowInInput?: boolean
  /**
   * 编辑器抽屉（效果 / 动画编辑器）打开期间是否仍然执行。
   *
   * 抽屉是独占键盘的编辑会话，打开期间未声明该字段的绑定（全局快捷键、抽屉外各面板的快捷键）
   * 无论焦点在哪都不再派发；模态框压在抽屉之上时键盘归模态，抽屉锁让位。
   */
  allowInEditorDrawer?: boolean
  allowInModal?: boolean
  execute: (context: TExecuteContext) => void | Promise<void>
  i18nKey: string
  id: string
  keys: string | string[]
  overrideMonaco?: boolean
  when?: ShortcutWhen
}

export type ShortcutPlatform = SystemPlatform
