import { StatementEntry } from '~/domain/script/sentence'
import { StatementUpdatePayload, StatementUpdateTarget } from '~/features/editor/statement-editor/useStatementEditor'
import { StatementGroup } from '~/stores/command-panel'

import type { InjectionKey, ShallowRef } from 'vue'
import type { commandType } from 'webgal-parser/src/interface/sceneInterface'

interface ActivatableBinding {
  isActive?: () => boolean
}

interface ActiveBindingContext<TBinding> {
  activeBinding: ShallowRef<TBinding | undefined>
}

function createActiveBindingProvider<TBinding>(
  key: InjectionKey<ActiveBindingContext<TBinding>>,
): ActiveBindingContext<TBinding> {
  const context: ActiveBindingContext<TBinding> = {
    activeBinding: shallowRef<TBinding>(),
  }
  provide(key, context)
  return context
}

function isBindingActive(binding: ActivatableBinding): boolean {
  return binding.isActive?.() ?? true
}

function useActiveBinding<TBinding extends ActivatableBinding>(
  key: InjectionKey<ActiveBindingContext<TBinding>>,
  binding: TBinding,
): void {
  const context = inject(key)
  if (!context) {
    return
  }
  const activeBinding = context.activeBinding

  let isRegistered = false

  function registerBinding(): void {
    if (isRegistered) {
      return
    }

    isRegistered = true
    activeBinding.value = binding
  }

  function unregisterBinding(): void {
    if (!isRegistered) {
      return
    }

    isRegistered = false
    queueMicrotask(() => {
      // 仅在当前活跃 binding 仍是自己时清空，避免模式切换期间出现短暂空窗。
      if (activeBinding.value === binding) {
        activeBinding.value = undefined
      }
    })
  }

  function syncBindingRegistration(isActive: boolean): void {
    if (isActive) {
      registerBinding()
      return
    }

    unregisterBinding()
  }

  watch(
    () => isBindingActive(binding),
    function handleActiveChange(isActive): void {
      syncBindingRegistration(isActive)
    },
    { immediate: true },
  )

  tryOnUnmounted(unregisterBinding)
}

export interface SidebarPanelBinding extends ActivatableBinding {
  enableFocusStatement: boolean
  onUpdate: (payload: StatementUpdatePayload) => void
  handleRedo?: () => void
  handleUndo?: () => void
  getEntry: () => StatementEntry | undefined
  getEmptyState?: () => SidebarPanelEmptyState | undefined
  getUpdateTarget?: () => StatementUpdateTarget | undefined
  getIndex?: () => number | undefined
  getPreviousSpeaker?: () => string
  onFocusStatement?: () => void
}

export type SidebarPanelEmptyState = 'multiple-edit-targets'

export type SidebarPanelContext = ActiveBindingContext<SidebarPanelBinding>

export const sidebarPanelKey: InjectionKey<SidebarPanelContext> = Symbol('sidebarPanel')

export function useSidebarPanelProvider(): SidebarPanelContext {
  return createActiveBindingProvider(sidebarPanelKey)
}

export function useSidebarPanelBinding(binding: SidebarPanelBinding): void {
  useActiveBinding(sidebarPanelKey, binding)
}

export interface CommandPanelHandler extends ActivatableBinding {
  insertCommand: (type: commandType) => void
  insertGroup: (group: StatementGroup) => void
}

export type CommandPanelBridgeContext = ActiveBindingContext<CommandPanelHandler>

export const commandPanelBridgeKey: InjectionKey<CommandPanelBridgeContext> = Symbol('commandPanelBridge')

export function useCommandPanelBridgeProvider(): CommandPanelBridgeContext {
  return createActiveBindingProvider(commandPanelBridgeKey)
}

export function useCommandPanelBridgeBinding(handler: CommandPanelHandler): void {
  useActiveBinding(commandPanelBridgeKey, handler)
}
