import { commandType } from 'webgal-parser/src/interface/sceneInterface'

import { resolveAssetUrl } from '~/helper/asset-url'

import type { EditorField } from '~/helper/command-registry/schema'

const STATEMENT_PANEL_IMAGE_PREVIEW_COMMANDS = new Set([
  commandType.changeBg,
  commandType.changeFigure,
  commandType.miniAvatar,
  commandType.unlockCg,
])

const STATEMENT_PANEL_NON_IMAGE_EXTENSIONS = new Set(['.json', '.skel'])

export interface ResolveStatementPanelPreviewImageUrlOptions {
  command?: commandType
  content?: string
  contentField?: EditorField
  cwd?: string
  fileRootPaths: Record<string, string | undefined>
  previewBaseUrl?: string
  showSidebarAssetPreview: boolean
}

export function normalizeStatementPanelSingleLineValue(value: string): string {
  return value.replaceAll(/\r?\n/g, ' ')
}

export function resolveStatementPanelPreviewImageUrl(
  options: ResolveStatementPanelPreviewImageUrlOptions,
): string {
  const {
    command,
    content,
    contentField,
    cwd,
    fileRootPaths,
    previewBaseUrl,
    showSidebarAssetPreview,
  } = options

  if (!showSidebarAssetPreview || !command || !STATEMENT_PANEL_IMAGE_PREVIEW_COMMANDS.has(command) || !content) {
    return ''
  }

  const extensionStartIndex = content.lastIndexOf('.')
  const extension = extensionStartIndex === -1
    ? ''
    : content.slice(extensionStartIndex).toLowerCase()
  if (STATEMENT_PANEL_NON_IMAGE_EXTENSIONS.has(extension)) {
    return ''
  }

  const assetType = contentField?.field.type === 'file'
    ? contentField.field.fileConfig.assetType
    : undefined
  const rootPath = assetType ? fileRootPaths[assetType] : undefined
  if (!rootPath || !cwd || !previewBaseUrl) {
    return ''
  }

  return resolveAssetUrl(`${rootPath}/${content}`, {
    cwd,
    previewBaseUrl,
  })
}
