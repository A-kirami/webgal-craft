export enum DebugCommand {
  JUMP, // 场景跳转
  SYNCFC, // 从客户端同步
  SYNCFE, // 从编辑器同步
  EXE_COMMAND, // 执行指令
  REFETCH_TEMPLATE_FILES, // 重新拉取模板样式文件
  SET_COMPONENT_VISIBILITY, // 设置组件可见性
  TEMP_SCENE, // 临时场景
  FONT_OPTIMIZATION, // 字体优化
  SET_EFFECT, // 设置效果
}

interface DebugMessageBase<T extends DebugCommand> {
  command: T
}

interface JumpMessageData extends DebugMessageBase<DebugCommand.JUMP> {
  sceneMsg: {
    sentence: number
    scene: string
  }
  message: 'exp' | 'sync'
}

interface ExecuteCommandMessageData extends DebugMessageBase<DebugCommand.EXE_COMMAND> {
  message: string
}

interface ComponentVisibilityMessageData extends DebugMessageBase<DebugCommand.SET_COMPONENT_VISIBILITY> {
  message: string // JSON stringified ComponentVisibilityCommand[]
}

interface TempSceneMessageData extends DebugMessageBase<DebugCommand.TEMP_SCENE> {
  message: string
}

interface FontOptimizationMessageData extends DebugMessageBase<DebugCommand.FONT_OPTIMIZATION> {
  message: string // 'true' | 'false'
}

type RefetchTemplatesMessageData = DebugMessageBase<DebugCommand.REFETCH_TEMPLATE_FILES>

interface SetEffectMessageData extends DebugMessageBase<DebugCommand.SET_EFFECT> {
  message: string // JSON stringified effect configuration
}

interface DebugMessageDataMap {
  [DebugCommand.JUMP]: JumpMessageData
  [DebugCommand.EXE_COMMAND]: ExecuteCommandMessageData
  [DebugCommand.SET_COMPONENT_VISIBILITY]: ComponentVisibilityMessageData
  [DebugCommand.TEMP_SCENE]: TempSceneMessageData
  [DebugCommand.FONT_OPTIMIZATION]: FontOptimizationMessageData
  [DebugCommand.REFETCH_TEMPLATE_FILES]: RefetchTemplatesMessageData
  [DebugCommand.SET_EFFECT]: SetEffectMessageData
}

export interface DebugMessage<T extends DebugCommand = DebugCommand> {
  event: string
  data: T extends keyof DebugMessageDataMap ? DebugMessageDataMap[T] : never
}

export interface ComponentsVisibility {
  showStarter: boolean // 是否显示初始界面（用于使得 bgm 可以播放)
  showTitle: boolean // 是否显示标题界面
  showMenuPanel: boolean // 是否显示Menu界面
  showTextBox: boolean // 是否显示文本框
  showControls: boolean // 是否显示控制栏
  controlsVisibility: boolean // 控制栏可见性
  showBacklog: boolean // 是否显示回想
  showExtra: boolean // 是否显示鉴赏模式
  showGlobalDialog: boolean // 是否显示全局对话框
  showPanicOverlay: boolean // 是否显示紧急回避
  isEnterGame: boolean // 是否进入游戏
  isShowLogo: boolean // 是否显示Logo
}

export interface ComponentVisibilityCommand {
  component: keyof ComponentsVisibility // 目标组件
  visibility: boolean // 可见性状态
}
