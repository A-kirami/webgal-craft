import type { AbsPath } from '~/domain/path'
import type { Tab } from '~/stores/tabs'

interface ErrorLogger {
  error(message: string): void
}

export interface CloseTabDecisionParams {
  tab: Tab
  tabIndex: number
  modalTitle: string
  logger: ErrorLogger
  saveFile: (path: AbsPath) => Promise<void>
  findTabIndex: (path: AbsPath) => number
  closeTab: (index: number) => void
}

export type EditorTabBatchCloseAction = 'closeOthers' | 'closeSaved' | 'closeAll' | 'closeRight'

export type EditorTabContextMenuAction = 'close' | EditorTabBatchCloseAction | 'viewHistory' | 'revealInExplorer'

interface SaveChangesModalOptions {
  title: string
  onSave: () => Promise<void>
  onDontSave: () => void
}

export type CloseTabDecision =
  | { type: 'close', index: number }
  | { type: 'prompt', modal: SaveChangesModalOptions }

export function getEditorTabCloseTargets(
  tabs: readonly Tab[],
  targetPath: AbsPath,
  action: EditorTabBatchCloseAction,
): Tab[] {
  const targetIndex = tabs.findIndex(tab => tab.path === targetPath)
  if (targetIndex === -1) {
    return []
  }

  if (action === 'closeOthers') {
    return tabs.filter((_, index) => index !== targetIndex)
  }

  if (action === 'closeSaved') {
    return tabs.filter(tab => !tab.isModified)
  }

  if (action === 'closeAll') {
    return [...tabs]
  }

  return tabs.slice(targetIndex + 1)
}

function closeCurrentTab(params: CloseTabDecisionParams) {
  const currentIndex = params.findTabIndex(params.tab.path)
  if (currentIndex !== -1) {
    params.closeTab(currentIndex)
  }
}

export function getCloseTabDecision(params: CloseTabDecisionParams): CloseTabDecision {
  if (!params.tab.isModified) {
    return {
      type: 'close',
      index: params.tabIndex,
    }
  }

  return {
    type: 'prompt',
    modal: {
      title: params.modalTitle,
      onSave: async () => {
        try {
          await params.saveFile(params.tab.path)
          closeCurrentTab(params)
        } catch (error) {
          params.logger.error(`保存文件失败: ${error}`)
        }
      },
      onDontSave: () => {
        closeCurrentTab(params)
      },
    },
  }
}

export function shouldFixPreviewTab(tab?: Tab): boolean {
  return Boolean(tab?.isPreview)
}
