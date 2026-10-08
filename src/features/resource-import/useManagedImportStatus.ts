import { storeToRefs } from 'pinia'

import { engineManager } from '~/services/engine-manager'
import { useManagedImportStore } from '~/stores/managed-import'

import { androidDirectoryMaterializer } from './android-directory-materializer'

const CANCELLABLE_OFFICIAL_ENGINE_PHASES = new Set(['downloading', 'extracting'])

export function useManagedImportStatus() {
  const store = useManagedImportStore()
  const { activeActivity, activeKind, activeSessionId, isBusy, progress } = storeToRefs(store)
  const canCancel = computed(() => {
    if (activeActivity.value?.kind === 'official-engine-install') {
      // 进度尚未到达时也允许取消（前置的版本查询阶段同样可中止），避免取消按钮中途出现造成布局抖动
      const phase = progress.value?.phase
      return phase === undefined || CANCELLABLE_OFFICIAL_ENGINE_PHASES.has(phase)
    }
    return progress.value?.phase === 'copying' && !!activeSessionId.value
  })

  async function cancel(): Promise<void> {
    if (!canCancel.value) {
      return
    }

    const activity = activeActivity.value
    if (activity?.kind === 'official-engine-install') {
      await engineManager.cancelOfficialEngineInstall(activity.engineVersion)
      return
    }
    if (activeSessionId.value) {
      await androidDirectoryMaterializer.cancel(activeSessionId.value)
    }
  }

  return {
    activeActivity,
    activeKind,
    canCancel,
    isBusy,
    progress,
    cancel,
  }
}
