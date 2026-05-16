export interface DragPosition {
  x: number
  y: number
}

export type DragEntityType =
  | 'editor-tab'
  | 'file-system-item'
  | 'scene-statement'

export type DragSourceType =
  | 'editor-tabs'
  | 'file-tree'
  | 'file-viewer'
  | 'visual-editor'

export type DragMode = 'sort' | 'transfer'

export interface DragPayloadBase {
  source: DragSourceType
  type: DragEntityType
}

export interface FileSystemDragPayload extends DragPayloadBase {
  isDir: boolean
  mimeType?: string
  path: string
  type: 'file-system-item'
}

export interface EditorTabDragPayload extends DragPayloadBase {
  path: string
  type: 'editor-tab'
}

export interface SceneStatementDragPayload extends DragPayloadBase {
  statementId: number
  type: 'scene-statement'
}

export type DragPayload =
  | EditorTabDragPayload
  | FileSystemDragPayload
  | SceneStatementDragPayload
