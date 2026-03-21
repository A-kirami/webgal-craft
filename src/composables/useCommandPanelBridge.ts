import type { InjectionKey } from 'vue'
import type { commandType } from 'webgal-parser/src/interface/sceneInterface'
import type { StatementGroup } from '~/stores/command-panel'

export interface CommandPanelHandler {
  isActive?: MaybeRefOrGetter<boolean>
  insertCommand: (type: commandType) => void
  insertGroup: (group: StatementGroup) => void
}

export interface CommandPanelBridgeContext {
  activeHandler: ShallowRef<CommandPanelHandler | undefined>
  activeBinding: ShallowRef<CommandPanelHandler | undefined>
}

export const commandPanelBridgeKey: InjectionKey<CommandPanelBridgeContext> = Symbol('commandPanelBridge')

/**
 * 在 EditorPanel 层创建命令面板桥接上下文，provide 给子编辑器
 */
export function useCommandPanelBridgeProvider(): CommandPanelBridgeContext {
  const activeBinding = shallowRef<CommandPanelHandler>()
  const context: CommandPanelBridgeContext = {
    activeHandler: activeBinding,
    activeBinding,
  }
  provide(commandPanelBridgeKey, context)
  return context
}

/**
 * 在子编辑器中注册命令面板处理器
 *
 * 编辑器 activated 时自动注册，deactivated 时注销。
 */
export function useCommandPanelBridgeBinding(handler: CommandPanelHandler) {
  const context = inject(commandPanelBridgeKey)
  if (!context) {
    return
  }
  const isComponentActive = ref(false)

  function readIsActive(): boolean {
    return handler.isActive === undefined ? true : toValue(handler.isActive)
  }

  function register() {
    if (!readIsActive()) {
      return
    }
    context!.activeHandler.value = handler
  }

  function unregister() {
    if (context!.activeHandler.value === handler) {
      context!.activeHandler.value = undefined
    }
  }

  onActivated(() => {
    isComponentActive.value = true
    register()
  })
  onDeactivated(() => {
    isComponentActive.value = false
    unregister()
  })
  onMounted(() => {
    isComponentActive.value = true
    register()
  })
  onUnmounted(() => {
    isComponentActive.value = false
    unregister()
  })

  if (handler.isActive !== undefined) {
    watch(() => toValue(handler.isActive), (isActive) => {
      if (isActive && isComponentActive.value) {
        register()
      } else {
        unregister()
      }
    }, { immediate: true })
  }
}
