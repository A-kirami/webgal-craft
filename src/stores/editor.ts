import { join } from '@tauri-apps/api/path'
import { readTextFile } from '@tauri-apps/plugin-fs'
import mime from 'mime/lite'
import { defineStore } from 'pinia'

interface CoreEditorState {
  path: string
}

type VisualType = 'scene' | 'animation'

interface TextualEditorBase extends CoreEditorState {
  isDirty: boolean
  visualType?: VisualType
  lastLineNumber?: number
}

export interface TextModeState extends TextualEditorBase {
  mode: 'text'
  textContent: string
}

export interface VisualModeState extends TextualEditorBase {
  mode: 'visual'
  visualData: string
}

type TextualEditorState = TextModeState | VisualModeState

export interface AssetPreviewState extends CoreEditorState {
  mode: 'preview'
  assetUrl: string
  mimeType: string
}

type EditorState = TextualEditorState | AssetPreviewState

function isTextualEditor(state: EditorState): state is TextualEditorState {
  return state.mode === 'text' || state.mode === 'visual'
}

async function checkFileType(path: string, subPath: string, mimeType: string, expectedMimeType: string) {
  if (mimeType !== expectedMimeType) {
    return false
  }
  const workspaceStore = useWorkspaceStore()

  // 等待 CWD 加载完成，最多等待 100 ms
  try {
    await until(() => !!workspaceStore.CWD).toBe(true, { timeout: 100, throwOnTimeout: true })
  } catch {
    logger.error('Workspace 未初始化，无法检查文件类型')
  }

  if (!workspaceStore.CWD) {
    return false
  }

  const targetPath = await join(workspaceStore.CWD, 'game', subPath)
  return path.startsWith(targetPath)
}

async function isSceneFile(path: string, mimeType: string) {
  return await checkFileType(path, 'scene', mimeType, 'text/plain')
}

async function isAnimationFile(path: string, mimeType: string) {
  return await checkFileType(path, 'animation', mimeType, 'application/json')
}

const editableFileTypes = new Set(['text/plain', 'application/json'])

export const useEditorStore = defineStore('editor', () => {
  const states = $ref(new Map<string, EditorState>())

  const tabsStore = useTabsStore()
  const fileSystemEvents = useFileSystemEvents()

  const currentState = $computed(() => {
    return states.get(tabsStore.activeTab?.path ?? '')
  })

  const canToggleMode = $computed(() => {
    const state = currentState
    return state !== undefined && isTextualEditor(state) && !!state.visualType
  })

  async function loadEditorState(tab: Tab) {
    if (states.has(tab.path)) {
      return
    }

    try {
      tab.isLoading = true
      const mimeType = mime.getType(tab.path) ?? ''

      if (editableFileTypes.has(mimeType)) {
        const preferenceStore = usePreferenceStore()
        const content = await readTextFile(tab.path)

        const baseState: TextModeState | VisualModeState = preferenceStore.editorMode === 'text'
          ? {
              path: tab.path,
              isDirty: false,
              mode: 'text',
              textContent: content,
            }
          : {
              path: tab.path,
              isDirty: false,
              mode: 'visual',
              visualData: content,
            }

        let visualType: VisualType | undefined

        if (await isSceneFile(tab.path, mimeType)) {
          visualType = 'scene'
        } else if (await isAnimationFile(tab.path, mimeType)) {
          visualType = 'animation'
        }

        states.set(tab.path, { ...baseState, visualType })
      } else {
        const workspaceStore = useWorkspaceStore()
        // 等待预览服务器启动
        await until(() => !!workspaceStore.currentGameServeUrl).toBe(true)

        states.set(tab.path, {
          path: tab.path,
          mode: 'preview',
          assetUrl: getAssetUrl(tab.path),
          mimeType,
        })
      }
    } catch (error) {
      logger.error(`无法加载编辑器状态 ${tab.path}: ${error}`)
      tab.error = error instanceof Error ? error.message : 'Unknown error'
    } finally {
      tab.isLoading = false
    }
  }

  function toggleTextualMode(mode: 'text' | 'visual') {
    const state = currentState
    if (!state || !isTextualEditor(state) || !state.visualType) {
      return
    }

    if (state.mode === mode) {
      return
    }

    if (mode === 'text') {
      const { visualData, ...rest } = state as VisualModeState
      states.set(state.path, {
        ...rest,
        mode: 'text',
        textContent: visualData, // TODO: 将 visualData 转换为 textContent
      })
    } else {
      const { textContent, ...rest } = state as TextModeState
      states.set(state.path, {
        ...rest,
        mode: 'visual',
        visualData: textContent, // TODO: 将 textContent 转换为 visualData
      })
    }
  }

  watch(() => tabsStore.activeTab, async (activeTab) => {
    if (!activeTab || states.has(activeTab.path)) {
      return
    }
    await loadEditorState(activeTab)
  }, { immediate: true })

  // 监听标签页关闭，清理编辑器状态
  useTabsWatcher((closedPath) => {
    states.delete(closedPath)
  })

  // 监听文件重命名事件，更新编辑器状态
  fileSystemEvents.on('file:renamed', (event) => {
    const oldState = states.get(event.oldPath)
    if (oldState) {
      oldState.path = event.newPath
      states.delete(event.oldPath)
      states.set(event.newPath, oldState)
    }
  })

  // 监听文件修改事件，如果文件未编辑，同步新文件内容
  fileSystemEvents.on('file:modified', async (event) => {
    const state = states.get(event.path)
    if (!state || !isTextualEditor(state)) {
      return
    }

    // 如果文件已编辑，则不处理（避免覆盖用户的编辑）
    if (state.isDirty) {
      return
    }

    try {
      const content = await readTextFile(event.path)

      if (state.mode === 'text') {
        states.set(event.path, {
          ...state,
          textContent: content,
        })
      } else {
        states.set(event.path, {
          ...state,
          visualData: content,
        })
      }
    } catch (error) {
      logger.error(`同步文件内容失败 ${event.path}: ${error}`)
    }
  })

  /**
   * 保存文件
   * @param path 文件路径
   * @throws 如果文件不存在或不可编辑
   */
  async function saveFile(path: string) {
    const state = states.get(path)

    if (!state) {
      throw new Error(`文件状态不存在: ${path}`)
    }

    if (!isTextualEditor(state)) {
      throw new Error(`文件不可编辑: ${path}`)
    }

    const content = state.mode === 'text' ? state.textContent : state.visualData
    await gameFs.writeFile(path, content)
    state.isDirty = false

    const tabIndex = tabsStore.findTabIndex(path)
    if (tabIndex !== -1) {
      tabsStore.updateTabModified(tabIndex, false)
    }
  }

  return $$({
    states,
    currentState,
    canToggleMode,
    toggleTextualMode,
    saveFile,
  })
})
