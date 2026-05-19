export interface DragPosition {
  x: number
  y: number
}

export type DragEntityType =
  | 'command-panel-statement'
  | 'editor-tab'
  | 'file-system-item'
  | 'scene-statement'

export type DragSourceType =
  | 'command-panel'
  | 'editor-tabs'
  | 'file-tree'
  | 'file-viewer'
  | 'visual-editor'

export type DragMode = 'sort' | 'transfer'

export type DragTransferOperation = 'copy' | 'move'

export interface DragPayloadBase {
  source: DragSourceType
  type: DragEntityType
}

export interface FileSystemDragPayload extends DragPayloadBase {
  isDir: boolean
  items?: FileSystemDragPayloadItem[]
  name?: string
  mimeType?: string
  path: string
  type: 'file-system-item'
}

export interface FileSystemDragPayloadItem {
  isDir: boolean
  name?: string
  path: string
}

export interface EditorTabDragPayload extends DragPayloadBase {
  path: string
  type: 'editor-tab'
}

export interface SceneStatementDragPayload extends DragPayloadBase {
  statementId: number
  type: 'scene-statement'
}

export interface CommandPanelStatementDragPayload extends DragPayloadBase {
  label: string
  rawTexts: string[]
  type: 'command-panel-statement'
}

export type DragPayload =
  | CommandPanelStatementDragPayload
  | EditorTabDragPayload
  | FileSystemDragPayload
  | SceneStatementDragPayload
