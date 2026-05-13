import { AbsPath } from '~/domain/path'
import { useModalStore } from '~/stores/modal'

import type {
  PathOperationConfirmDecision,
  PathOperationPlan,
} from '~/services/path-operation'
import type { TranslatePathOperationMessage } from '~/services/path-operation-feedback'

interface ModalStoreAdapter {
  open(
    modal: 'AlertModal',
    props: {
      title: string
      content: string
      confirmText: string
      cancelText: string
      onCancel: () => void
      onConfirm: () => void
    },
    key?: string,
  ): void
  open(
    modal: 'PathOperationRewriteModal',
    props: {
      title: string
      content: string
      defaultText: string
      dangerText: string
      cancelText: string
      onCancel: () => void
      onDanger: () => boolean | Promise<boolean>
      onDefault: () => void
    },
    key?: string,
  ): void
}

export function createPathOperationRewriteConfirm(
  t: TranslatePathOperationMessage,
  modalStore: ModalStoreAdapter = useModalStore(),
): (plan: PathOperationPlan) => Promise<PathOperationConfirmDecision> {
  return async function confirmPathOperationRewrite(plan: PathOperationPlan): Promise<PathOperationConfirmDecision> {
    const resourceName = AbsPath.basename(plan.sourcePath)
    const fileCount = new Set(plan.rewrites.map(rewrite => rewrite.filePath)).size
    const referenceCount = plan.rewrites.reduce((count, rewrite) => count + rewrite.referenceCount, 0)

    return await new Promise((resolve) => {
      modalStore.open('PathOperationRewriteModal', {
        title: t('edit.pathOperation.confirmRewrite.title', {
          name: resourceName,
        }),
        content: plan.kind === 'rename'
          ? t('edit.pathOperation.confirmRewrite.renameContent', {
              fileCount,
              referenceCount,
            })
          : t('edit.pathOperation.confirmRewrite.moveContent', {
              fileCount,
              referenceCount,
            }),
        defaultText: plan.kind === 'rename'
          ? t('edit.pathOperation.confirmRewrite.renameConfirm')
          : t('edit.pathOperation.confirmRewrite.moveConfirm'),
        dangerText: plan.kind === 'rename'
          ? t('edit.pathOperation.confirmRewrite.renameOnly')
          : t('edit.pathOperation.confirmRewrite.moveOnly'),
        cancelText: t('common.cancel'),
        onCancel: () => resolve('cancel'),
        onDanger: async () => {
          const decision = await confirmPathOperationSkipRewrite(t, modalStore, plan, resourceName)
          if (decision) {
            resolve(decision)
            return true
          }
          return false
        },
        onDefault: () => resolve('rewrite'),
      }, `path-operation-confirm-${Date.now()}`)
    })
  }
}

async function confirmPathOperationSkipRewrite(
  t: TranslatePathOperationMessage,
  modalStore: ModalStoreAdapter,
  plan: PathOperationPlan,
  resourceName: string,
): Promise<PathOperationConfirmDecision | undefined> {
  return await new Promise((resolve) => {
    modalStore.open('AlertModal', {
      title: plan.kind === 'rename'
        ? t('edit.pathOperation.confirmSkipRewrite.renameTitle', {
            name: resourceName,
          })
        : t('edit.pathOperation.confirmSkipRewrite.moveTitle', {
            name: resourceName,
          }),
      content: plan.kind === 'rename'
        ? t('edit.pathOperation.confirmSkipRewrite.renameContent')
        : t('edit.pathOperation.confirmSkipRewrite.moveContent'),
      confirmText: plan.kind === 'rename'
        ? t('edit.pathOperation.confirmSkipRewrite.renameConfirm')
        : t('edit.pathOperation.confirmSkipRewrite.moveConfirm'),
      cancelText: t('common.back'),
      onCancel: () => resolve(undefined),
      onConfirm: () => resolve('path-only'),
    }, `path-operation-skip-rewrite-${Date.now()}`)
  })
}
