import { normalize, sep } from '@tauri-apps/api/path'

/**
 * 发送调试命令到游戏
 * @param data - 要发送的命令数据
 * @param event - 可选的事件类型，默认为 'message'
 */
async function sendCommand<T extends DebugCommand>(
  data: IDebugMessage<T>['data'],
  event?: IDebugMessage<T>['event'],
) {
  const message: IDebugMessage<T> = {
    event: event ?? 'message',
    data,
  }
  await serverCmds.broadcastMessage(JSON.stringify(message))
}

/**
 * 从场景路径中提取场景名称
 * @param scenePath - 完整的场景路径
 * @returns 提取后的场景名称
 */
async function extractSceneName(scenePath: string): Promise<string> {
  const normalizedPath = await normalize(scenePath)
  const pathSeparator = sep()
  const parts = normalizedPath.split(pathSeparator)
  const sceneIndex = parts.indexOf('scene')
  const afterSceneParts = parts.slice(sceneIndex + 1)
  return afterSceneParts.join(pathSeparator)
}

/**
 * 检查当前行是否为跳转命令
 * @param currentLineValue - 当前行的值
 * @returns 是否为跳转命令
 */
function isCurrentLineJump(currentLineValue: string | null): boolean {
  if (!currentLineValue) {
    return false
  }

  const [command] = currentLineValue.split(':')
  const isSpecialCommand = command === 'unlockCg' || command === 'unlockBgm'
  const hasNoSemicolon = !currentLineValue.includes(';')

  return !(isSpecialCommand && hasNoSemicolon)
}

/**
 * 同步场景
 * @param scenePath - 场景文件路径
 * @param lineNumber - 行号
 * @param lineCommandString - 行命令字符串
 * @param force - 是否强制发送，忽略实时预览设置
 */
async function syncScene(scenePath: string, lineNumber: number, lineCommandString: string, force?: boolean) {
  const isEnableLivePreview = true
  const isUseExpFastSync = false

  const sceneName = await extractSceneName(scenePath)
  if (!isEnableLivePreview && !force) {
    return
  }

  if (isCurrentLineJump(lineCommandString)) {
    await sendCommand({
      command: DebugCommand.JUMP,
      sceneMsg: {
        scene: sceneName,
        sentence: lineNumber,
      },
      message: isUseExpFastSync ? 'exp' : 'sync',
    })
  }
}

/**
 * 运行临时场景
 * @param command - 要执行的场景命令
 */
async function runTempScene(command: string) {
  await sendCommand({
    command: DebugCommand.TEMP_SCENE,
    message: command,
  })
}

/**
 * 执行命令
 * @param command - 要执行的命令
 */
async function executeCommand(command: string) {
  await sendCommand({
    command: DebugCommand.EXE_COMMAND,
    message: command,
  })
}

/**
 * 设置组件可见性
 * @param message - 组件可见性命令数组
 */
async function setComponentVisibility(message: IComponentVisibilityCommand[]) {
  await sendCommand({
    command: DebugCommand.SET_COMPONENT_VISIBILITY,
    message: JSON.stringify(message),
  })
}

/**
 * 设置字体优化
 * @param enabled - 是否启用字体优化
 */
async function setFontOptimization(enabled: boolean) {
  await sendCommand({
    command: DebugCommand.FONT_OPTIMIZATION,
    message: enabled.toString(),
  })
}

/**
 * 重新获取模板文件
 */
async function refetchTemplates() {
  await sendCommand({
    command: DebugCommand.REFETCH_TEMPLATE_FILES,
  })
}

export const debugCommander = {
  sendCommand,
  setComponentVisibility,
  runTempScene,
  syncScene,
  executeCommand,
  refetchTemplates,
  setFontOptimization,
}
