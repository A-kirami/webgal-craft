import { AbsPath, normalizePosix, RelPath } from '~/domain/path'
import { useEditSettingsStore } from '~/stores/edit-settings'
import { usePreviewSyncStore } from '~/stores/preview-sync'

import type { Transform } from '~/domain/stage/types'
import type {
  PreviewCommandType,
  RequestPayloadByType,
  SetComponentVisibilityPayload,
} from '~/types/editorPreviewProtocol'

async function sendPreviewCommand<TType extends PreviewCommandType>(
  type: TType,
  payload: RequestPayloadByType[TType],
) {
  const previewSyncStore = usePreviewSyncStore()
  await previewSyncStore.sendPreviewCommand(type, payload)
}

/**
 * 从场景路径中提取场景名称
 * @param scenePath - 完整的场景路径
 * @returns 提取后的场景名称
 */
async function extractSceneName(scenePath: string): Promise<string> {
  const normalizedPath = normalizePosix(scenePath)
  const absoluteScenePath = AbsPath.from(normalizedPath)
  const parts = normalizedPath.split('/')
  const sceneIndex = parts.lastIndexOf('scene')
  if (sceneIndex === -1) {
    return AbsPath.basename(absoluteScenePath)
  }

  return RelPath.from(parts.slice(sceneIndex + 1).join('/'))
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
  const editSettingsStore = useEditSettingsStore()

  const sceneName = await extractSceneName(scenePath)
  if (!editSettingsStore.enableLivePreview && !force) {
    return
  }

  if (isCurrentLineJump(lineCommandString)) {
    await sendPreviewCommand('preview.command.sync-scene', {
      sceneName,
      sentenceId: lineNumber,
    })
  }
}

/**
 * 运行临时场景
 * @param command - 要执行的场景命令
 */
async function runTempScene(command: string) {
  await sendPreviewCommand('preview.command.run-scene-content', {
    sceneContent: command,
  })
}

/**
 * 执行命令
 * @param command - 要执行的命令
 */
async function executeCommand(command: string) {
  await sendPreviewCommand('preview.command.run-snippet', {
    snippet: command,
  })
}

/**
 * 设置效果
 * @param target - 目标对象
 * @param transform - 效果变换参数
 */
async function setEffect(target: string, transform: Transform) {
  await sendPreviewCommand('preview.command.set-effect', {
    target,
    transform,
  })
}

/**
 * 设置组件可见性
 * @param payload - 组件可见性映射
 */
async function setComponentVisibility(payload: SetComponentVisibilityPayload) {
  await sendPreviewCommand('preview.command.set-component-visibility', payload)
}

/**
 * 设置字体优化
 * @param enabled - 是否启用字体优化
 */
async function setFontOptimization(enabled: boolean) {
  await sendPreviewCommand('preview.command.set-font-optimization', {
    enabled,
  })
}

/**
 * 设置文本已读模式
 * @param isRead - 是否将文本标记为已读
 */
async function setTextReadMode(isRead: boolean) {
  await sendPreviewCommand('preview.command.set-text-read-mode', {
    isRead,
  })
}

/**
 * 重新获取模板文件
 */
async function refetchTemplates() {
  await sendPreviewCommand('preview.command.reload-templates', {})
}

export const debugCommander = {
  setComponentVisibility,
  runTempScene,
  syncScene,
  executeCommand,
  refetchTemplates,
  setFontOptimization,
  setTextReadMode,
  setEffect,
}
