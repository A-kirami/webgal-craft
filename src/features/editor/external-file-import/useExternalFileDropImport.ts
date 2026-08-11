import { useTauriDropZone } from '~/composables/useTauriDropZone'
import { AbsPath } from '~/domain/path'
import {
  importExternalFiles,
  resolveExternalFileDropTargetDirectory,
} from '~/features/editor/external-file-import/external-file-import'

import type {
  ExternalFileImportFailure,
  ExternalFileImportSuccess,
} from '~/features/editor/external-file-import/external-file-import'

export interface UseExternalFileDropImportOptions {
  dropZone: MaybeRefOrGetter<HTMLElement | null | undefined>
  rootDirectory: MaybeRefOrGetter<AbsPath | undefined>
}

function getFailureName(failure: ExternalFileImportFailure): string {
  try {
    return AbsPath.basename(AbsPath.from(failure.sourcePath)) || failure.sourcePath
  } catch {
    return failure.sourcePath
  }
}

export function useExternalFileDropImport(options: UseExternalFileDropImportOptions) {
  const { t } = useI18n()
  const targetDirectory = shallowRef<AbsPath>()
  const isImporting = shallowRef(false)

  function getRootDirectory(): AbsPath | undefined {
    return toValue(options.rootDirectory)
  }

  function updateTargetDirectory(element: Element | undefined): AbsPath | undefined {
    const rootDirectory = getRootDirectory()
    targetDirectory.value = rootDirectory
      ? resolveExternalFileDropTargetDirectory(element, rootDirectory)
      : undefined
    return targetDirectory.value
  }

  function formatFailureDescription(failures: readonly ExternalFileImportFailure[]): string {
    const visibleNames = failures.slice(0, 3).map(failure => getFailureName(failure))
    const remainingCount = failures.length - visibleNames.length
    const names = remainingCount > 0
      ? `${visibleNames.join(', ')} (+${remainingCount})`
      : visibleNames.join(', ')
    return t('edit.externalFileImport.failedItems', { names })
  }

  function formatConflictDescription(successes: readonly ExternalFileImportSuccess[]): string {
    const renamedCount = successes.filter(success =>
      AbsPath.basename(success.sourcePath) !== AbsPath.basename(success.targetPath),
    ).length
    return renamedCount > 0
      ? t('edit.externalFileImport.renamedConflicts', { count: renamedCount })
      : ''
  }

  async function runImport(paths: string[], importTarget: AbsPath): Promise<void> {
    if (isImporting.value) {
      toast.warning(t('edit.externalFileImport.busy'))
      return
    }

    isImporting.value = true
    try {
      const result = await importExternalFiles(paths, importTarget)
      const successCount = result.successes.length
      const failedCount = result.failures.length

      if (failedCount === 0) {
        return
      }

      if (successCount > 0) {
        const conflictDescription = formatConflictDescription(result.successes)
        toast.warning(t('edit.externalFileImport.partial', { failedCount, successCount }), {
          description: [formatFailureDescription(result.failures), conflictDescription].filter(Boolean).join('\n'),
        })
        return
      }

      toast.error(t('edit.externalFileImport.failed', { count: failedCount }), {
        description: formatFailureDescription(result.failures),
      })
    } finally {
      isImporting.value = false
    }
  }

  const dropZone = useTauriDropZone(options.dropZone, {
    onEnter() {
      updateTargetDirectory(dropZone.targetElement.value)
    },
    onOver() {
      updateTargetDirectory(dropZone.targetElement.value)
    },
    onDrop(paths) {
      const importTarget = updateTargetDirectory(dropZone.targetElement.value)
      if (importTarget) {
        void runImport(paths, importTarget)
      }
      targetDirectory.value = undefined
    },
    onLeave() {
      targetDirectory.value = undefined
    },
  })

  return {
    targetDirectory: readonly(targetDirectory),
  }
}
