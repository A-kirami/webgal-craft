import { useHomeResourceImportActions } from '~/features/home/shared/useHomeResourceImportActions'
import { resourceReconcile } from '~/services/resource-reconcile'
import { templateManager } from '~/services/template-manager'

import type { Template } from '~/database/model'
import type { TemplateGroupSourceItem, TemplateGroupViewModel } from '~/features/home/templates-tab/template-groups'
import type { I18nT } from '~/utils/i18n-like'

interface UseTemplatesTabControllerOptions {
  activeProgress: ReadonlyMap<string, number>
  openDeleteTemplateModal: (template: Template) => void
  t: I18nT
}

function findStandaloneSource(
  group: TemplateGroupViewModel,
): Extract<TemplateGroupSourceItem, { kind: 'standalone' }> | undefined {
  return group.sources.find((item): item is Extract<TemplateGroupSourceItem, { kind: 'standalone' }> =>
    item.kind === 'standalone',
  )
}

export function useTemplatesTabController(options: UseTemplatesTabControllerOptions) {
  const importActions = useHomeResourceImportActions<Template>({
    activeProgress: options.activeProgress,
    importResource: path => templateManager.importTemplate(path),
    messages: {
      duplicateResource: t => t('home.templates.importDuplicate'),
      invalidFolder: t => t('home.templates.importInvalidFolder'),
      multipleFolders: t => t('home.templates.importMultipleFolders'),
      selectFolderTitle: t => t('common.dialogs.selectTemplateFolder'),
      unknownError: t => t('home.templates.importUnknownError'),
    },
    t: options.t,
  })

  async function handleDelete(group: TemplateGroupViewModel, templates: readonly Template[]) {
    const source = findStandaloneSource(group)
    if (!source) {
      return
    }

    const template = templates.find(t => t.id === source.templateId)
    if (!template) {
      return
    }

    // 删除入口即时校验：失效模板由 DeleteTemplateModal 走"只删记录"分支
    const availability = await resourceReconcile.reconcileTemplateRecord(template)
    options.openDeleteTemplateModal({ ...template, availability })
  }

  function getTemplateGroupProgress(group: TemplateGroupViewModel): number {
    const source = findStandaloneSource(group)
    return source ? importActions.getProgress({ id: source.templateId }) : 0
  }

  function hasTemplateGroupProgress(group: TemplateGroupViewModel): boolean {
    const source = findStandaloneSource(group)
    return source ? importActions.hasProgress({ id: source.templateId }) : false
  }

  function handleOpenSourceFolder(source: TemplateGroupSourceItem) {
    return importActions.handleOpenFolder({
      path: source.kind === 'standalone' ? source.path : source.enginePath,
    })
  }

  return {
    getTemplateGroupProgress,
    handleDelete,
    handleDrop: importActions.handleDrop,
    handleOpenSourceFolder,
    hasTemplateGroupProgress,
    selectTemplateFolder: importActions.selectFolder,
  }
}
