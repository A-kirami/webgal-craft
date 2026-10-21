import { shallowRef } from 'vue'
import { commandType } from 'webgal-parser/src/interface/sceneInterface'

import { useFileSystemEvents } from '~/composables/useFileSystemEvents'
import {
  detectAnimationDocumentFormat,
  parseAnimationDocument,
  serializeAnimationFrames,
} from '~/domain/document/animation-document-codec'
import { isAnimationFrameEqual } from '~/domain/document/transaction-apply'
import { AbsPath, RelPath } from '~/domain/path'
import { cloneAnimationFrames } from '~/domain/stage/animation-frame'
import { createAssetKeyForType } from '~/services/resource-index/keys'
import { useResourceIndex } from '~/services/resource-index/service'
import { isEditableEditor, useEditorStore } from '~/stores/editor'
import { useModalStore } from '~/stores/modal'
import { useTabsStore } from '~/stores/tabs'
import { useWorkspaceStore } from '~/stores/workspace'
import { handleError } from '~/utils/error-handler'

import { saveAnimationFile } from './animation-file'
import {
  ANIMATION_FILE_SUFFIX,
  resolveAnimationNameFromPath,
  resolveAnimationReference,
} from './animation-reference'
import { REFERENCED_ANIMATION_EDITOR_OPEN_KEY } from './referenced-animation-editor-context'

import type { AnimationReferenceError } from './animation-reference'
import type { ReferencedAnimationEditorOpenContext } from './referenced-animation-editor-context'
import type { AnimationFramePreviewContext } from './useAnimationFramePreview'
import type { ISentence } from 'webgal-parser/src/interface/sceneInterface'
import type { TextMetadata } from '~/domain/document/document-model'
import type { AnimationFrame } from '~/domain/stage/types'

interface ReferencedAnimationEditorBinding {
  animationName: string
  filePath: AbsPath
  framePreview?: AnimationFramePreviewContext
  scenePath: AbsPath
  statementId: number
}

type ReferencedAnimationEditorStatus =
  | 'closed'
  | 'loading'
  | 'ready'
  | 'v2-read-only'
  | 'invalid-json'
  | 'load-failed'
  | 'unresolved'

type OpeningPhase = 'idle' | 'opening' | 'opened' | 'load-failed' | 'unresolved'

type AnimationFileFormat = 'v1-frames' | 'v2-object' | 'invalid'

function areFramesEqual(left: readonly AnimationFrame[], right: readonly AnimationFrame[]): boolean {
  return left.length === right.length && left.every((frame, index) => {
    const other = right[index]
    return other !== undefined && isAnimationFrameEqual(frame, other)
  })
}

/**
 * 引用动画抽屉的草稿会话。
 *
 * 抽屉只读写一份内存草稿：帧编辑、撤销/重做和预览都不触碰文档会话，也不参与自动保存；
 * 保存时才写回文件，关闭时未保存的草稿直接丢弃。文件已在标签页打开时，保存把草稿应用回
 * 标签页会话再落盘；标签页有未保存修改时拒绝保存，避免覆盖用户正在编辑的内容。
 */
export function useReferencedAnimationEditor() {
  const editorStore = useEditorStore()
  const modalStore = useModalStore()
  const tabsStore = useTabsStore()
  const fileSystemEvents = useFileSystemEvents()
  const resourceIndex = useResourceIndex()
  const { t } = useI18n()

  let isOpen = $ref(false)
  let phase = $ref<OpeningPhase>('idle')
  let binding = $ref<ReferencedAnimationEditorBinding>()
  let unresolvedReason = $ref<AnimationReferenceError>()
  let fileFormat = $ref<AnimationFileFormat>()
  let draftFrames = $ref<AnimationFrame[]>()
  let fileMetadata = $ref<TextMetadata>()
  const savedFrames = shallowRef<AnimationFrame[]>()
  // 每次打开/加载/关闭递增：异步读取完成时据此判断草稿是否已被新的打开/加载替代
  let sessionToken = 0

  // 延迟创建 workspace store：抽屉未打开时不应因为渲染标题而触发工作区初始化
  function readGamePath(): AbsPath | undefined {
    const cwd = useWorkspaceStore().CWD
    return cwd ? AbsPath.from(cwd) : undefined
  }

  const status = $computed<ReferencedAnimationEditorStatus>(() => {
    if (!isOpen) {
      return 'closed'
    }

    switch (phase) {
      case 'opening': {
        return 'loading'
      }
      case 'load-failed': {
        return 'load-failed'
      }
      case 'unresolved': {
        return 'unresolved'
      }
      case 'opened': {
        if (fileFormat === 'v2-object') {
          return 'v2-read-only'
        }
        if (fileFormat === 'invalid') {
          return 'invalid-json'
        }
        return draftFrames ? 'ready' : 'load-failed'
      }
      default: {
        return 'closed'
      }
    }
  })

  // 动画名跟随绑定的文件：重命名处理会重新计算这个名字，渲染路径因此不依赖工作区 store
  const animationName = $computed(() => binding?.animationName)

  const isDirty = $computed(() => {
    const saved = savedFrames.value
    if (!draftFrames || !saved) {
      return false
    }
    return !areFramesEqual(draftFrames, saved)
  })

  const referenceCount = $computed(() => {
    const name = animationName
    if (!name) {
      return 0
    }

    return resourceIndex.getReferencesTo(
      createAssetKeyForType('animation', RelPath.from(`${name}${ANIMATION_FILE_SUFFIX}`)),
    ).length
  })

  function setPhase(nextPhase: OpeningPhase): void {
    phase = nextPhase
  }

  function resetDraft(): void {
    draftFrames = undefined
    savedFrames.value = undefined
    fileFormat = undefined
    fileMetadata = undefined
  }

  async function loadDraft(token: number): Promise<void> {
    const current = binding
    if (!current || token !== sessionToken) {
      return
    }

    resetDraft()
    setPhase('opening')

    try {
      const result = await editorStore.readTextDocumentFile(current.filePath)
      if (token !== sessionToken) {
        return
      }
      if (!result.ok) {
        setPhase('load-failed')
        return
      }

      fileMetadata = result.metadata

      try {
        fileFormat = detectAnimationDocumentFormat(result.content)
        if (fileFormat === 'v2-object') {
          setPhase('opened')
          return
        }

        const frames = parseAnimationDocument(result.content)
        draftFrames = frames
        savedFrames.value = cloneAnimationFrames(frames)
        setPhase('opened')
      } catch {
        fileFormat = 'invalid'
        setPhase('opened')
      }
    } catch (error) {
      if (token !== sessionToken) {
        return
      }
      handleError(error, { context: t('edit.visualEditor.animation.referenced.loadFailedTitle') })
      setPhase('load-failed')
    }
  }

  function editableTabState(path: AbsPath) {
    const state = editorStore.getState(path)
    return state && isEditableEditor(state) ? state : undefined
  }

  /** 标签页里的未保存修改与草稿互斥：两者都改同一文件时先让用户处理标签页，避免静默覆盖 */
  function hasDirtyTab(path: AbsPath): boolean {
    return tabsStore.findTabIndex(path) !== -1 && editableTabState(path)?.isDirty === true
  }

  async function openInternal(parsed: ISentence, context: ReferencedAnimationEditorOpenContext): Promise<void> {
    if (isOpen || parsed.command !== commandType.setAnimation) {
      return
    }

    const token = ++sessionToken
    isOpen = true
    unresolvedReason = undefined
    binding = undefined
    resetDraft()
    setPhase('opening')

    const gamePath = readGamePath()
    if (!gamePath) {
      setPhase('load-failed')
      return
    }

    const resolution = resolveAnimationReference(gamePath, parsed.content)
    if (!resolution.ok) {
      unresolvedReason = resolution.error
      setPhase('unresolved')
      return
    }

    const nextBinding: ReferencedAnimationEditorBinding = {
      ...resolution.reference,
      framePreview: context.framePreview,
      scenePath: context.scenePath,
      statementId: context.statementId,
    }

    if (hasDirtyTab(nextBinding.filePath)) {
      toast.warning(t('edit.visualEditor.animation.referenced.tabDirty'))
      isOpen = false
      setPhase('idle')
      return
    }

    binding = nextBinding
    await loadDraft(token)
  }

  function open(parsed: ISentence, context: ReferencedAnimationEditorOpenContext): void {
    void openInternal(parsed, context)
  }

  function close(): void {
    if (!isOpen) {
      return
    }

    isOpen = false
    setPhase('idle')
    binding = undefined
    unresolvedReason = undefined
    resetDraft()
    sessionToken += 1
  }

  function updateDraftFrames(frames: AnimationFrame[]): void {
    draftFrames = frames
  }

  async function save(): Promise<boolean> {
    const current = binding
    const frames = draftFrames
    if (!current || !frames || !isDirty) {
      return true
    }

    if (hasDirtyTab(current.filePath)) {
      toast.warning(t('edit.visualEditor.animation.referenced.tabDirty'))
      return false
    }

    try {
      const tabOpen = tabsStore.findTabIndex(current.filePath) >= 0
      const tabState = tabOpen ? editableTabState(current.filePath) : undefined
      if (tabState) {
        // 标签页持有时把草稿作为一次替换事务写回，保存仍由该会话完成，历史与脏状态留在标签页
        const replaced = editorStore.replaceTextDocumentContent(
          current.filePath,
          serializeAnimationFrames(frames),
        )
        if (!replaced) {
          toast.error(t('edit.visualEditor.animation.referenced.saveFailed'))
          return false
        }
        await editorStore.saveFile(current.filePath)
      } else {
        const gamePath = readGamePath()
        if (!gamePath) {
          return false
        }
        await saveAnimationFile(gamePath, {
          animationName: current.animationName,
          filePath: current.filePath,
        }, frames, fileMetadata)
      }
      savedFrames.value = cloneAnimationFrames(frames)
      return true
    } catch (error) {
      handleError(error, { context: t('edit.visualEditor.animation.referenced.saveFailed') })
      return false
    }
  }

  function requestClose(afterClose?: () => void): void {
    if (!isOpen) {
      afterClose?.()
      return
    }

    if (!isDirty) {
      close()
      afterClose?.()
      return
    }

    modalStore.open('SaveChangesModal', {
      title: t('modals.saveChanges.title', { name: animationName }),
      onSave: async () => {
        if (!await save()) {
          return
        }
        close()
        afterClose?.()
      },
      onDontSave: () => {
        close()
        afterClose?.()
      },
    })
  }

  async function retry(): Promise<void> {
    if (!binding || phase === 'opened') {
      return
    }

    await loadDraft(++sessionToken)
  }

  /** 只读态（v2 / 非法 JSON）的出口：显式在标签页里以文本方式修复 */
  function openInTextMode(): void {
    const path = binding?.filePath
    if (!path) {
      return
    }

    requestClose(() => {
      tabsStore.openTab(AbsPath.basename(path), path, { forceNormal: true })
    })
  }

  function handleBoundFileRemoved(): void {
    if (!binding) {
      return
    }

    toast.warning(t('edit.visualEditor.animation.referenced.removed'))
    // 草稿还在：脏草稿交给保存确认，保存即可按原路径重建文件；干净草稿直接关闭
    requestClose()
  }

  function handleFileRenamed(oldPath: AbsPath, newPath: AbsPath): void {
    const current = binding
    const gamePath = readGamePath()
    if (!current || current.filePath !== oldPath || !gamePath) {
      return
    }

    binding = {
      ...current,
      animationName: resolveAnimationNameFromPath(gamePath, newPath) ?? current.animationName,
      filePath: newPath,
    }
    toast.info(t('edit.visualEditor.animation.referenced.renamed'))
  }

  const stopFileRemoved = fileSystemEvents.on('file:removed', (event) => {
    if (event.path === binding?.filePath) {
      handleBoundFileRemoved()
    }
  })

  const stopFileRenamed = fileSystemEvents.on('file:renamed', (event) => {
    handleFileRenamed(event.oldPath, event.newPath)
  })

  const stopDirectoryRemoved = fileSystemEvents.on('directory:removed', (event) => {
    const path = binding?.filePath
    if (path?.startsWith(`${event.path}/`)) {
      handleBoundFileRemoved()
    }
  })

  const stopDirectoryRenamed = fileSystemEvents.on('directory:renamed', (event) => {
    const path = binding?.filePath
    if (!path?.startsWith(`${event.oldPath}/`)) {
      return
    }

    try {
      handleFileRenamed(
        path,
        AbsPath.join(event.newPath, AbsPath.relativize(path, event.oldPath)),
      )
    } catch {
      // 目录外的新路径不可表示时保持原绑定，下一次打开会重新解析
    }
  })

  tryOnScopeDispose(() => {
    stopFileRemoved()
    stopFileRenamed()
    stopDirectoryRemoved()
    stopDirectoryRenamed()
    // 视图卸载没有交互机会；草稿不落盘，显式保存语义下由用户承担未保存的编辑
    close()
  })

  provide(REFERENCED_ANIMATION_EDITOR_OPEN_KEY, open)

  return reactive({
    ...$$({
      animationName,
      binding,
      draftFrames,
      isDirty,
      isOpen,
      referenceCount,
      status,
      unresolvedReason,
    }),
    close,
    open,
    openInTextMode,
    requestClose,
    retry,
    save,
    updateDraftFrames,
  })
}

export type ReferencedAnimationEditorController = ReturnType<typeof useReferencedAnimationEditor>
