import { diagnoseEditorDocument } from '~/features/editor/diagnostics/document-diagnostics'
import { useResourceIndex } from '~/services/resource-index/service'
import { useEditorStore } from '~/stores/editor'
import { useEditorDiagnosticsStore } from '~/stores/editor-diagnostics'
import { useResourceStore } from '~/stores/resource'
import { useTabsStore } from '~/stores/tabs'

import type { AbsPath } from '~/domain/path'

interface PublishDiagnosticsOptions {
  /** 资源索引或引擎能力变化时，诊断结论整体失效，必须无视令牌强制重算 */
  force?: boolean
}

export function useEditorDiagnostics(): void {
  const diagnosticsStore = useEditorDiagnosticsStore()
  const editorStore = useEditorStore()
  const resourceIndex = useResourceIndex()
  const resourceStore = useResourceStore()
  const tabsStore = useTabsStore()

  // 各标签页已发布诊断对应的内容令牌；watcher 整体触发时跳过令牌未变的文档
  const publishedTokens = new Map<AbsPath, string>()

  function readDiagnosticsToken(path: AbsPath): { skippable: boolean, token: string } {
    const textProjection = editorStore.getTextProjectionState(path)
    const visualProjection = editorStore.getVisualProjectionState(path)
    const sceneContentToken = editorStore.peekSceneContentChangeToken(path)
    return {
      // 场景文档的内容变更必然替换 model 并推进令牌，可以按令牌跳过；
      // 动画草稿这类内容变化不落事务、令牌反映不了，必须每次触发都重算
      skippable: sceneContentToken !== undefined,
      token: [
        sceneContentToken ?? '',
        textProjection?.kind ?? '',
        textProjection?.syncError ?? '',
        visualProjection?.kind ?? '',
      ].join('|'),
    }
  }

  function publishOpenDocumentDiagnostics(options: PublishDiagnosticsOptions = {}): void {
    const canCheckResources = resourceIndex.status.value === 'ready'
    const openPaths = new Set(tabsStore.tabs.map(tab => tab.path))
    for (const path of publishedTokens.keys()) {
      if (!openPaths.has(path)) {
        publishedTokens.delete(path)
      }
    }

    for (const tab of tabsStore.tabs) {
      const { skippable, token } = readDiagnosticsToken(tab.path)
      if (!options.force && skippable && publishedTokens.get(tab.path) === token) {
        continue
      }
      publishedTokens.set(tab.path, token)

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
        runtimeCapabilities: resourceStore.currentEngineRuntimeCapabilities,
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
        editorStore.peekSceneContentChangeToken(tab.path),
        textProjection?.kind,
        textProjection?.syncError,
        textProjection?.runtimeCapabilities,
        // 草稿内容不落事务（非法动画 JSON），用字符串身份兜底
        textProjection?.textContent,
      ] as const
    }),
    () => publishOpenDocumentDiagnostics(),
    { immediate: true },
  )

  watch(() => resourceIndex.revision.value, () => {
    diagnosticsStore.invalidateSource('resource')
    publishOpenDocumentDiagnostics({ force: true })
  })

  watch(() => [
    resourceStore.currentEngineCapabilities,
    resourceStore.currentEngineRuntimeCapabilities,
  ], () => {
    publishOpenDocumentDiagnostics({ force: true })
  })
}
