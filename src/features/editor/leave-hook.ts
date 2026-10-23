import type { InjectionKey } from 'vue'

/**
 * 离开编辑页前需要收尾的编辑工作（例如流程图的待写入内容）。
 *
 * 页面在卸载时才落盘会赶不上工作区切换，因此离开动作必须先等待这些工作完成。
 */
export interface EditorLeaveHook {
  flush: () => Promise<void>
}

export const EDITOR_LEAVE_HOOK_KEY: InjectionKey<EditorLeaveHook> = Symbol('editor-leave-hook')
