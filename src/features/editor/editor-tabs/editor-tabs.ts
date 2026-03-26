import type { Tab } from '~/stores/tabs'

interface ErrorLogger {
  error(message: string): void
}

export interface CloseTabDecisionParams {
  tab: Tab
  tabIndex: number
  modalTitle: string
  logger: ErrorLogger
  saveFile: (path: string) => Promise<void>
  findTabIndex: (path: string) => number
  closeTab: (index: number) => void
}

interface SaveChangesModalOptions {
  title: string
  onSave: () => Promise<void>
  onDontSave: () => void
}

export type CloseTabDecision =
  | { type: 'close', index: number }
  | { type: 'prompt', modal: SaveChangesModalOptions }

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
