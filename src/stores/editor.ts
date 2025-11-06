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

  const currentState = $computed(() => {
    return states.get(tabsStore.activeTab?.path ?? '')
  })

  const canToggleMode = $computed(() => {
    const state = currentState
    return state !== undefined && isTextualEditor(state) && !!state.visualType
  })

  async function loadEditorState(path: string) {
    if (states.has(path)) {
      return
    }

    const tab = tabsStore.tabs.find(t => t.path === path)
    if (!tab) {
      return
    }

    try {
      tab.isLoading = true
      const mimeType = mime.getType(path) ?? ''

      if (editableFileTypes.has(mimeType)) {
        const preferenceStore = usePreferenceStore()
        const content = await readTextFile(path)

        const baseState: TextModeState | VisualModeState = preferenceStore.editorMode === 'text'
          ? {
              path,
              isDirty: false,
              mode: 'text',
              textContent: content,
            }
          : {
              path,
              isDirty: false,
              mode: 'visual',
              visualData: content,
            }

        let visualType: VisualType | undefined

        if (await isSceneFile(path, mimeType)) {
          visualType = 'scene'
        } else if (await isAnimationFile(path, mimeType)) {
          visualType = 'animation'
        }

        states.set(path, { ...baseState, visualType })
      } else {
        const workspaceStore = useWorkspaceStore()
        // 等待预览服务器启动
        await until(() => !!workspaceStore.currentGamePreviewUrl).toBe(true)

        states.set(path, {
          path,
          mode: 'preview',
          assetUrl: getAssetUrl(path),
          mimeType,
        })
      }
    } catch (error) {
      logger.error(`Failed to load editor state for ${path}: ${error}`)
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
    if (activeTab && !states.has(activeTab.path)) {
      await loadEditorState(activeTab.path)
    }
  }, { immediate: true })

  return $$({
    states,
    currentState,
    canToggleMode,
    toggleTextualMode,
  })
})
