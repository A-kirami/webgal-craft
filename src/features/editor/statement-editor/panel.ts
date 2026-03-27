import { mime } from '~/plugins/mime'
import { resolveAssetUrl } from '~/services/platform/asset-url'

import type { EditorField } from '~/features/editor/command-registry/schema'

const STATEMENT_PANEL_PREVIEW_MIME_PREFIXES = ['image/', 'video/', 'audio/'] as const

export interface StatementPanelPreviewMedia {
  mimeType: string
  url: string
}

export interface ResolveStatementPanelPreviewMediaOptions {
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

export function resolveStatementPanelPreviewMedia(
  options: ResolveStatementPanelPreviewMediaOptions,
): StatementPanelPreviewMedia | undefined {
  const {
    content,
    contentField,
    cwd,
    fileRootPaths,
    previewBaseUrl,
    showSidebarAssetPreview,
  } = options

  if (!showSidebarAssetPreview || !content) {
    return undefined
  }

  const mimeType = mime.getType(content)
  if (!mimeType || !STATEMENT_PANEL_PREVIEW_MIME_PREFIXES.some(prefix => mimeType.startsWith(prefix))) {
    return undefined
  }

  const assetType = contentField?.field.type === 'file'
    ? contentField.field.fileConfig.assetType
    : undefined
  const rootPath = assetType ? fileRootPaths[assetType] : undefined
  if (!rootPath || !cwd || !previewBaseUrl) {
    return undefined
  }

  return {
    mimeType,
    url: resolveAssetUrl(`${rootPath}/${content}`, {
      cwd,
      previewBaseUrl,
    }),
  }
}
