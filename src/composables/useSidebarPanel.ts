import type { InjectionKey } from 'vue'

export interface SidebarPanelBinding {
  entry?: Ref<StatementEntry | undefined>
  index?: Ref<number | undefined>
  previousSpeaker?: Ref<string>
  enableFocusStatement: boolean
  onUpdate: (payload: StatementUpdatePayload) => void
  onFocusStatement?: () => void
  isActive?: MaybeRefOrGetter<boolean>
  handleRedo?: () => void
  handleUndo?: () => void
  getEntry?: () => StatementEntry | undefined
  getUpdateTarget?: () => StatementUpdateTarget | undefined
  getIndex?: () => number | undefined
  getPreviousSpeaker?: () => string
}

export interface SidebarPanelContext {
  /** 当前活跃编辑器的 binding，由 activated 的编辑器写入 */
  activeBinding: ShallowRef<SidebarPanelBinding | undefined>
}

export const sidebarPanelKey: InjectionKey<SidebarPanelContext> = Symbol('sidebarPanel')

/**
 * 在 EditorPanel 层创建辅助面板上下文，provide 给子编辑器
 */
export function useSidebarPanelProvider(): SidebarPanelContext {
  const context: SidebarPanelContext = {
    activeBinding: shallowRef(),
  }
  provide(sidebarPanelKey, context)
  return context
}

/**
 * 在子编辑器中注册辅助面板数据源
 *
 * 编辑器 activated 时自动注册为活跃数据源，deactivated 时注销。
 * binding 必须在调用时就提供（reactive refs），内部不做额外包装。
 */
export function useSidebarPanelBinding(binding: SidebarPanelBinding) {
  const context = inject(sidebarPanelKey)
  if (!context) {
    return
  }

  function readIsActive(): boolean {
    return binding.isActive === undefined ? true : toValue(binding.isActive)
  }

  function register() {
    if (!readIsActive()) {
      return
    }
    context!.activeBinding.value = binding
  }

  function unregister() {
    // 仅当当前 binding 仍为自己时才清除，避免覆盖新 activated 编辑器的注册
    if (context!.activeBinding.value === binding) {
      context!.activeBinding.value = undefined
    }
  }

  onActivated(register)
  onDeactivated(unregister)

  // 首次 mount 时也注册（mount 不触发 activated）
  onMounted(register)
  onUnmounted(unregister)

  if (binding.isActive !== undefined) {
    watch(() => toValue(binding.isActive), (isActive) => {
      if (isActive) {
        register()
      } else {
        unregister()
      }
    }, { immediate: true })
  }
}
