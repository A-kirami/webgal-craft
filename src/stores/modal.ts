import { defineStore } from 'pinia'

import AboutModal from '~/components/modals/AboutModal.vue'
import AlertModal from '~/components/modals/AlertModal.vue'
import CommandDefaultsModal from '~/components/modals/CommandDefaultsModal.vue'
import CreateFileModal from '~/components/modals/CreateFileModal.vue'
import CreateGameModal from '~/components/modals/CreateGameModal.vue'
import DeleteEngineModal from '~/components/modals/DeleteEngineModal.vue'
import DeleteFileModal from '~/components/modals/DeleteFileModal.vue'
import DeleteGameConfirmModal from '~/components/modals/DeleteGameConfirmModal.vue'
import DeleteGameModal from '~/components/modals/DeleteGameModal.vue'
import DiscardEffectChangesModal from '~/components/modals/DiscardEffectChangesModal.vue'
import DiscoveredResourcesModal from '~/components/modals/DiscoveredResourcesModal.vue'
import GameConfigModal from '~/components/modals/GameConfigModal.vue'
import SaveChangesModal from '~/components/modals/SaveChangesModal.vue'
import SettingsModal from '~/components/modals/SettingsModal.vue'
import StatementGroupModal from '~/components/modals/StatementGroupModal.vue'
import UpgradeModal from '~/components/modals/UpgradeModal.vue'

const ModalDialog = {
  AboutModal,
  AlertModal,
  CommandDefaultsModal,
  CreateFileModal,
  CreateGameModal,
  DiscardEffectChangesModal,
  DeleteEngineModal,
  DeleteFileModal,
  DeleteGameModal,
  DeleteGameConfirmModal,
  DiscoveredResourcesModal,
  GameConfigModal,
  SaveChangesModal,
  SettingsModal,
  StatementGroupModal,
  UpgradeModal,
} as const satisfies Record<string, Component>

type ModalComponent = keyof typeof ModalDialog

type ModalProps = {
  [K in ModalComponent]: ComponentProps<(typeof ModalDialog)[K]>;
}

interface ModalState {
  component: Component
  props?: object
  isOpen: boolean
  key?: string
  keepAlive: boolean
}

export const useModalStore = defineStore('modal', () => {
  let modalStack = $ref(new Map<string, ModalState>())

  function open<M extends ModalComponent>(modal: M, props?: ModalProps[M], key?: string, keepAlive: boolean = false) {
    const modalKey = key ? `${modal}-${key}` : modal
    const modalState = {
      component: markRaw(ModalDialog[modal]),
      props,
      isOpen: true,
      key: modalKey,
      keepAlive,
    }
    modalStack.set(modalKey, modalState)
  }

  // 等待模态框退出动画结束后清理已关闭的非 keepAlive 模态框
  watchDebounced($$(modalStack), () => {
    let cleaned = false
    for (const [key, modal] of modalStack) {
      if (!modal.keepAlive && !modal.isOpen) {
        modalStack.delete(key)
        cleaned = true
      }
    }
    if (cleaned) {
      modalStack = new Map(modalStack)
    }
  }, {
    debounce: 150,
    deep: true,
  })

  return $$({
    modalStack,
    open,
  })
})
