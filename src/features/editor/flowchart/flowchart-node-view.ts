import type { InjectionKey } from 'vue'
import type { FlowchartSceneRef } from '~/domain/flowchart/model'

/** 画布节点尺寸；拖入创建节点时用于把释放点换算成节点左上角坐标 */
export const FLOWCHART_NODE_WIDTH = 224
export const FLOWCHART_NODE_HEIGHT = 96

export interface FlowchartNodeViewData {
  isRoot: boolean
  scene: string | undefined
  title: string
}

/** 节点内部交互回到编辑会话的唯一通道；节点组件不直接读写持久化模型 */
export interface FlowchartNodeContext {
  beginTitleEdit: (nodeId: string) => void
  cancelTitleEdit: () => void
  commitTitle: (nodeId: string, title: string) => void
  deleteNode: (nodeId: string) => void
  isOnlySelectedNode: (nodeId: string) => boolean
  isSceneDropTarget: (nodeId: string) => boolean
  isTitleEditing: (nodeId: string) => boolean
  sceneRootPath: string
  selectScene: (nodeId: string, scene: FlowchartSceneRef) => void
}

export const FLOWCHART_NODE_CONTEXT_KEY: InjectionKey<FlowchartNodeContext> = Symbol('flowchart-node-context')
