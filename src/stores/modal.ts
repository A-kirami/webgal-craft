import { defineStore } from 'pinia'

import AboutModal from '~/components/modals/AboutModal.vue'
import AlertModal from '~/components/modals/AlertModal.vue'
import CreateGameModal from '~/components/modals/CreateGameModal.vue'
import DeleteEngineModal from '~/components/modals/DeleteEngineModal.vue'
import DeleteFileModal from '~/components/modals/DeleteFileModal.vue'
import DeleteGameConfirmModal from '~/components/modals/DeleteGameConfirmModal.vue'
import DeleteGameModal from '~/components/modals/DeleteGameModal.vue'
import EffectEditorModal from '~/components/modals/EffectEditorModal.vue'
import GameConfigModal from '~/components/modals/GameConfigModal.vue'
import SettingsModal from '~/components/modals/SettingsModal.vue'
import UpgradeModal from '~/components/modals/UpgradeModal.vue'

const ModalDialog = {
  AboutModal,
  AlertModal,
  CreateGameModal,
  DeleteEngineModal,
  DeleteFileModal,
  DeleteGameModal,
  DeleteGameConfirmModal,
  EffectEditorModal,
  GameConfigModal,
  SettingsModal,
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

  watchDebounced($$(modalStack), () => {
    const hasModalToClean = [...modalStack.entries()].some(
      ([_, modal]) => !modal.keepAlive && !modal.isOpen,
    )

    if (hasModalToClean) {
      const newModalStack = new Map(
        [...modalStack.entries()].filter(
          ([_, modal]) => modal.keepAlive || modal.isOpen,
        ),
      )
      modalStack = newModalStack
    }
  }, {
    debounce: 150, // 等待模态框退出动画结束
    deep: true,
  })

  return $$({
    modalStack,
    open,
  })
})
