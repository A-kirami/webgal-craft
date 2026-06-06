import { useEditorStore } from '~/stores/editor'
import { useRuntimeTaskStore } from '~/stores/runtime-task'

export function hasUpdateInstallBlockers(): boolean {
  const editorStore = useEditorStore()
  const runtimeTaskStore = useRuntimeTaskStore()

  return editorStore.hasUnsavedDocuments || runtimeTaskStore.hasBlockingTasks
}
