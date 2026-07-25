import { useModalStore } from '~/stores/modal'

interface ConfirmExportOverwriteModalStore {
  open(
    modal: 'AlertModal',
    props: {
      cancelText: string
      confirmText: string
      content: string
      onCancel: () => void
      onConfirm: () => void
      title: string
      type: 'danger'
    },
    key?: string,
  ): void
}

type TranslateExportOverwrite = (key: string, values?: Record<string, unknown>) => string

export async function confirmExportOverwrite(
  outputPath: string,
  t: TranslateExportOverwrite,
  modalStore: ConfirmExportOverwriteModalStore = useModalStore(),
): Promise<boolean> {
  return new Promise((resolve) => {
    modalStore.open('AlertModal', {
      cancelText: t('common.cancel'),
      confirmText: t('export.overwrite.confirm'),
      content: t('export.overwrite.description', { path: outputPath }),
      onCancel: () => resolve(false),
      onConfirm: () => resolve(true),
      title: t('export.overwrite.title'),
      type: 'danger',
    }, `export-overwrite-${Date.now()}`)
  })
}
