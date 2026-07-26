import { diagnoseEditorDocument } from '~/features/editor/diagnostics/document-diagnostics'
import { useResourceIndex } from '~/services/resource-index/service'
import { useEditorStore } from '~/stores/editor'
import { useEditorDiagnosticsStore } from '~/stores/editor-diagnostics'
import { useResourceStore } from '~/stores/resource'
import { useTabsStore } from '~/stores/tabs'

export function useEditorDiagnostics(): void {
  const diagnosticsStore = useEditorDiagnosticsStore()
  const editorStore = useEditorStore()
  const resourceIndex = useResourceIndex()
  const resourceStore = useResourceStore()
  const tabsStore = useTabsStore()

  function publishOpenDocumentDiagnostics(): void {
    const canCheckResources = resourceIndex.status.value === 'ready'

    for (const tab of tabsStore.tabs) {
      const textProjection = editorStore.getTextProjectionState(tab.path)
      const visualProjection = editorStore.getVisualProjectionState(tab.path)
      const canDiagnose = visualProjection?.kind === 'scene' || textProjection?.kind === 'animation'
      if (!canDiagnose) {
        diagnosticsStore.publish(tab.path, [])
        continue
      }

      diagnosticsStore.publish(tab.path, diagnoseEditorDocument({
        engineCapabilities: resourceStore.currentEngineCapabilities,
        hasAssetKey: canCheckResources
          ? key => resourceIndex.hasAssetKey(key)
          : undefined,
        textProjection,
        visualProjection,
      }))
    }
  }

  watch(
    () => tabsStore.tabs.map((tab) => {
      const textProjection = editorStore.getTextProjectionState(tab.path)
      return [
        tab.path,
        editorStore.peekSceneRevision(tab.path),
        textProjection?.kind,
        textProjection?.syncError,
      ] as const
    }),
    publishOpenDocumentDiagnostics,
    { deep: true, immediate: true },
  )

  watch(() => resourceIndex.revision.value, () => {
    diagnosticsStore.invalidateSource('resource')
    publishOpenDocumentDiagnostics()
  })

  watch(() => resourceStore.currentEngineCapabilities, () => {
    publishOpenDocumentDiagnostics()
  })
}
