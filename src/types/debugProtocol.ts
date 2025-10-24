/**
 * 调试命令枚举
 * 用于定义调试相关的命令类型
 */
export enum DebugCommand {
  JUMP, // 场景跳转
  SYNCFC, // 从客户端同步
  SYNCFE, // 从编辑器同步
  EXE_COMMAND, // 执行指令
  REFETCH_TEMPLATE_FILES, // 重新拉取模板样式文件
  SET_COMPONENT_VISIBILITY, // 设置组件可见性
  TEMP_SCENE, // 临时场景
  FONT_OPTIMIZATION, // 字体优化
}

/**
 * 调试消息基础数据接口
 */
interface IDebugMessageBase<T extends DebugCommand> {
  command: T
}

/**
 * 场景跳转消息数据
 */
interface IJumpMessageData extends IDebugMessageBase<DebugCommand.JUMP> {
  sceneMsg: {
    sentence: number
    scene: string
  }
  message: 'exp' | 'sync'
}

/**
 * 执行命令消息数据
 */
interface IExecuteCommandMessageData extends IDebugMessageBase<DebugCommand.EXE_COMMAND> {
  message: string
}

/**
 * 组件可见性消息数据
 */
interface IComponentVisibilityMessageData extends IDebugMessageBase<DebugCommand.SET_COMPONENT_VISIBILITY> {
  message: string // JSON stringified IComponentVisibilityCommand[]
}

/**
 * 临时场景消息数据
 */
interface ITempSceneMessageData extends IDebugMessageBase<DebugCommand.TEMP_SCENE> {
  message: string
}

/**
 * 字体优化消息数据
 */
interface IFontOptimizationMessageData extends IDebugMessageBase<DebugCommand.FONT_OPTIMIZATION> {
  message: string // 'true' | 'false'
}

/**
 * 重新获取模板文件消息数据
 */
type IRefetchTemplatesMessageData = IDebugMessageBase<DebugCommand.REFETCH_TEMPLATE_FILES>

/**
 * 调试消息数据映射类型
 */
interface DebugMessageDataMap {
  [DebugCommand.JUMP]: IJumpMessageData
  [DebugCommand.EXE_COMMAND]: IExecuteCommandMessageData
  [DebugCommand.SET_COMPONENT_VISIBILITY]: IComponentVisibilityMessageData
  [DebugCommand.TEMP_SCENE]: ITempSceneMessageData
  [DebugCommand.FONT_OPTIMIZATION]: IFontOptimizationMessageData
  [DebugCommand.REFETCH_TEMPLATE_FILES]: IRefetchTemplatesMessageData
}

/**
 * 调试消息接口
 * 用于定义调试通信的消息格式
 */
export interface IDebugMessage<T extends DebugCommand = DebugCommand> {
  event: string
  data: T extends keyof DebugMessageDataMap ? DebugMessageDataMap[T] : never
}

/**
 * 组件可见性接口
 * 用于控制各个 UI 组件的显示状态
 */
export interface IComponentsVisibility {
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

/**
 * 组件可见性命令接口
 * 用于设置特定组件的可见性
 */
export interface IComponentVisibilityCommand {
  component: keyof IComponentsVisibility // 目标组件
  visibility: boolean // 可见性状态
}
