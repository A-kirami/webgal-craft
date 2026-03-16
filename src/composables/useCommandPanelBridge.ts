import type { InjectionKey } from 'vue'
import type { commandType } from 'webgal-parser/src/interface/sceneInterface'
import type { StatementGroup } from '~/stores/command-panel'

export interface CommandPanelHandler {
  insertCommand: (type: commandType) => void
  insertGroup: (group: StatementGroup) => void
}

export interface CommandPanelBridgeContext {
  activeHandler: ShallowRef<CommandPanelHandler | undefined>
}

export const commandPanelBridgeKey: InjectionKey<CommandPanelBridgeContext> = Symbol('commandPanelBridge')

/**
 * 在 EditorPanel 层创建命令面板桥接上下文，provide 给子编辑器
 */
export function useCommandPanelBridgeProvider(): CommandPanelBridgeContext {
  const context: CommandPanelBridgeContext = {
    activeHandler: shallowRef(),
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

  function register() {
    context!.activeHandler.value = handler
  }

  function unregister() {
    if (context!.activeHandler.value === handler) {
      context!.activeHandler.value = undefined
    }
  }

  onActivated(register)
  onDeactivated(unregister)
  onMounted(register)
  onUnmounted(unregister)
}
