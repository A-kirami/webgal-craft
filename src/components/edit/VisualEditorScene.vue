<script setup lang="ts">
import { useVirtualizer } from '@tanstack/vue-virtual'

import type { ISentence } from 'webgal-parser/src/interface/sceneInterface'
import type { ScrollArea } from '~/components/ui/scroll-area'

const state = defineModel<VisualModeSceneState>('state', { required: true })

const editorStore = useEditorStore()
const tabsStore = useTabsStore()
const editSettings = useEditSettingsStore()
const preferenceStore = usePreferenceStore()

const tabIndex = $computed(() => tabsStore.findTabIndex(state.value.path))

// ─── 撤销/重做 ───

const statementsRef = computed({
  get: () => state.value.statements,
  set: (val) => {
    state.value.statements = val
  },
})

const { undo, redo, canUndo, canRedo, commit, clear: clearHistory } = useManualRefHistory(statementsRef, {
  capacity: 100,
  dump: (entries: StatementEntry[]) => [...entries],
  parse: (snapshot): StatementEntry[] => snapshot.map(s => markRaw({ ...s, parsed: undefined, parseError: false })),
})

// 连续编辑（如打字）合并为一个 undo 条目
const { start: startCommitTimer, stop: stopCommitTimer, isPending: hasPendingCommit } = useTimeoutFn(() => {
  commit()
}, 300, { immediate: false })

function scheduleCommit() {
  stopCommitTimer()
  startCommitTimer()
}

function flushCommit() {
  if (hasPendingCommit.value) {
    stopCommitTimer()
    commit()
  }
}

// 切换标签页时重置历史
watch(() => state.value.path, () => {
  clearHistory()
})

function afterUndoRedo() {
  state.value.isDirty = joinStatements(state.value.statements) !== state.value.savedSnapshot
  if (tabIndex !== -1) {
    tabsStore.updateTabModified(tabIndex, state.value.isDirty)
  }
  if (editSettings.autoSave && state.value.isDirty) {
    debouncedSave()
  }
}

function performUndo() {
  flushCommit()
  if (!canUndo.value) {
    return
  }
  undo()
  afterUndoRedo()
}

function performRedo() {
  flushCommit()
  if (!canRedo.value) {
    return
  }
  redo()
  afterUndoRedo()
}

// ─── 剪贴板 ───

let statementClipboard = $ref<string>()

function isEditingText() {
  const el = document.activeElement
  if (!el) {
    return false
  }
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || (el as HTMLElement).isContentEditable
}

function copyStatement() {
  const entry = state.value.statements.find(e => e.id === selectedStatementId)
  if (entry) {
    statementClipboard = entry.rawText
  }
}

function cutStatement() {
  if (selectedStatementId === undefined) {
    return
  }
  copyStatement()
  handleStatementDelete(selectedStatementId)
}

function pasteStatement() {
  if (!statementClipboard) {
    return
  }
  const newEntry = buildStatements(statementClipboard)[0]
  const idx = state.value.statements.findIndex(e => e.id === selectedStatementId)
  const insertAt = idx === -1 ? state.value.statements.length : idx + 1
  state.value.statements.splice(insertAt, 0, newEntry)
  commit()
  state.value.isDirty = true
  selectedStatementId = newEntry.id
  if (editSettings.autoSave) {
    debouncedSave()
  }
}

// ─── 键盘快捷键 ───

useEventListener('keydown', (e: KeyboardEvent) => {
  if (!(e.ctrlKey || e.metaKey)) {
    return
  }
  if (editorStore.currentState?.mode === 'text') {
    return
  }

  const key = e.key.toLowerCase()

  if (key === 'z') {
    e.preventDefault()
    if (e.shiftKey) {
      performRedo()
    } else {
      performUndo()
    }
    return
  }

  // 文本输入中时不拦截剪贴板快捷键，交由浏览器原生处理
  if (isEditingText()) {
    return
  }

  switch (key) {
    case 'c': {
      e.preventDefault()
      copyStatement()
      break
    }
    case 'x': {
      e.preventDefault()
      cutStatement()
      break
    }
    case 'v': {
      e.preventDefault()
      pasteStatement()
      break
    }
    // No default
  }
})

// ─── 虚拟列表 ───

const scrollAreaRef = useTemplateRef<InstanceType<typeof ScrollArea>>('scrollAreaRef')

const rowVirtualizer = useVirtualizer(
  computed(() => ({
    count: state.value.statements.length,
    // eslint-disable-next-line unicorn/no-null
    getScrollElement: () => scrollAreaRef.value?.viewport?.viewportElement ?? null,
    estimateSize: () => 100,
    overscan: 5,
    paddingStart: 8,
    paddingEnd: 8,
    getItemKey: (index: number) => state.value.statements[index]?.id ?? index,
  })),
)

const virtualRows = $computed(() => rowVirtualizer.value.getVirtualItems())
const totalSize = $computed(() => rowVirtualizer.value.getTotalSize())

/** 滚动修正期间隐藏列表，避免用户看到渐进跳动 */
let isPositioning = $ref(false)

onMounted(() => restoreSelectionAndScroll())

/* 恢复选中状态并滚动到对应语句 */
function restoreSelectionAndScroll() {
  autoSelectFromLineNumber()
  isPositioning = true
  rowVirtualizer.value.measure()
  nextTick(() => scrollToSelectedStatement())
}

onActivated(() => restoreSelectionAndScroll())

watch(() => state.value.path, () => restoreSelectionAndScroll())

/**
 * 预计算每条语句的上一个说话人（响应式数组）
 * 支持标准写法（say: -speaker=xxx / -clear）和简写（角色名:对话）
 */
const previousSpeakers = $computed(() => {
  const result: string[] = []
  let lastSpeaker = ''
  for (const entry of state.value.statements) {
    result.push(lastSpeaker)
    const change = extractSpeakerChange(entry.rawText)
    if (change !== undefined) {
      lastSpeaker = change
    }
  }
  return result
})

/* 辅助面板中当前选中的语句 ID */
let selectedStatementId = $ref<number>()

/* 辅助面板中选中的语句 entry */
const selectedEntry = $computed(() =>
  selectedStatementId === undefined
    ? undefined
    : state.value.statements.find(e => e.id === selectedStatementId),
)

const selectedIndex = $computed(() => {
  if (selectedStatementId === undefined) {
    return -1
  }
  return state.value.statements.findIndex(e => e.id === selectedStatementId)
})

/* 辅助面板中选中语句的上一条 say 说话人 */
const selectedPreviousSpeaker = $computed(() => {
  if (selectedIndex <= 0) {
    return ''
  }
  return previousSpeakers[selectedIndex] ?? ''
})

// 注册辅助面板数据源（EditorPanel 统一渲染单实例 StatementEditorPanel）
useSidebarPanelBinding({
  entry: computed(() => selectedEntry),
  index: computed(() => selectedIndex === -1 ? undefined : selectedIndex),
  previousSpeaker: computed(() => selectedPreviousSpeaker),
  enableFocusStatement: true,
  onUpdate: payload => handleStatementUpdate(payload),
  onFocusStatement: () => scrollToSelectedStatement(),
})

// ─── 命令面板桥接 ───

const commandPanelStore = useCommandPanelStore()

function insertRawTexts(rawTexts: string[]) {
  if (rawTexts.length === 0) {
    return
  }
  flushCommit()
  const newEntries = rawTexts.flatMap(text => buildStatements(text))
  const insertAt = editSettings.commandInsertPosition === 'end'
    ? state.value.statements.length
    : (() => {
        const idx = state.value.statements.findIndex(e => e.id === selectedStatementId)
        return idx === -1 ? state.value.statements.length : idx + 1
      })()
  state.value.statements.splice(insertAt, 0, ...newEntries)
  commit()
  state.value.isDirty = true

  // 选中最后一条插入的语句
  const lastInserted = newEntries.at(-1)
  if (lastInserted) {
    selectedStatementId = lastInserted.id
    nextTick(() => scrollToSelectedStatement('auto'))
  }

  if (tabIndex !== -1) {
    tabsStore.updateTabModified(tabIndex, true)
  }
  if (editSettings.autoSave) {
    debouncedSave()
  }
}

useCommandPanelBridgeBinding({
  insertCommand: (type) => {
    const rawText = commandPanelStore.getInsertText(type)
    insertRawTexts([rawText])
  },
  insertGroup: (group) => {
    insertRawTexts(group.rawTexts)
  },
})

/* 自动保存的 debounce 函数 */
const debouncedSave = useDebounceFn(() => {
  editorStore.saveFile(state.value.path)
}, 500)

/**
 * 处理折叠状态变更：markRaw 的 entry 需要 splice 替换才能触发 Vue 更新
 */
function handleCollapsedUpdate(index: number, collapsed: boolean) {
  const entry = state.value.statements[index]
  if (!entry || entry.collapsed === collapsed) {
    return
  }
  state.value.statements.splice(index, 1, markRaw({ ...entry, collapsed }))
}

/**
 * 处理语句更新事件：
 * 更新对应 entry 的 rawText 和 parsed，标记 isDirty，
 * 同时记录 lastEditedStatementId 用于光标同步
 */
function handleStatementUpdate(payload: { id: number, rawText: string, parsed: ISentence }) {
  const statements = state.value.statements
  const idx = statements.findIndex(e => e.id === payload.id)
  if (idx === -1) {
    return
  }

  const entry = statements[idx]
  // 浏览器原生 undo 恢复 input 文本时 rawText 不变，跳过以避免创建无意义的 undo 条目
  if (entry.rawText === payload.rawText) {
    return
  }
  // entry 被 markRaw，直接修改属性不触发 Vue 更新，需要 splice 替换
  const updated = markRaw({ ...entry, rawText: payload.rawText, parsed: payload.parsed, parseError: false })
  statements.splice(idx, 1, updated)
  scheduleCommit()
  state.value.isDirty = joinStatements(statements) !== state.value.savedSnapshot
  state.value.lastEditedStatementId = payload.id

  const updatedLineNumber = computeLineNumberFromStatementId(statements, payload.id)
  if (updatedLineNumber !== undefined) {
    state.value.lastLineNumber = updatedLineNumber
  }

  if (editSettings.autoSave) {
    debouncedSave()
  }
}

/**
 * 辅助面板中选中语句，同时同步到 store 以便模式切换时定位光标
 */
function handleSelect(id: number) {
  const wasAlreadySelected = selectedStatementId === id
  selectedStatementId = id
  state.value.lastEditedStatementId = id

  const lineNumber = computeLineNumberFromStatementId(state.value.statements, id)
  if (lineNumber !== undefined) {
    state.value.lastLineNumber = lineNumber
  }

  // 选中新卡片时同步预览到对应语句
  if (!wasAlreadySelected) {
    const entry = state.value.statements.find(s => s.id === id)
    if (entry && lineNumber !== undefined) {
      editorStore.syncScenePreview(state.value.path, lineNumber, entry.rawText)
    }
  }
}

/**
 * 执行到此句：同步预览到指定语句
 */
function handlePlayTo(id: number) {
  const entry = state.value.statements.find(s => s.id === id)
  if (!entry) {
    return
  }
  const lineNumber = computeLineNumberFromStatementId(state.value.statements, id)
  if (lineNumber !== undefined) {
    editorStore.syncScenePreview(state.value.path, lineNumber, entry.rawText, true)
  }
}

/**
 * 删除语句
 */
function handleStatementDelete(id: number) {
  const idx = state.value.statements.findIndex(e => e.id === id)
  if (idx === -1) {
    return
  }
  flushCommit()
  state.value.statements.splice(idx, 1)
  commit()
  state.value.isDirty = true

  // 如果删除的是辅助面板中选中的语句，重新选中
  if (selectedStatementId === id) {
    const next = state.value.statements[idx] ?? state.value.statements[idx - 1]
    selectedStatementId = next?.id
  }

  if (editSettings.autoSave) {
    debouncedSave()
  }
}

/**
 * 同步 isDirty 状态到 tabsStore
 */
watch(() => state.value.isDirty, (isDirty) => {
  if (tabIndex !== -1) {
    tabsStore.updateTabModified(tabIndex, isDirty)
  }
})

/**
 * 打开辅助面板时，根据 lastLineNumber 自动选中对应语句
 */
watch(() => preferenceStore.showSidebar, (show) => {
  if (show && selectedStatementId === undefined) {
    autoSelectFromLineNumber()
  }
})

/**
 * 自动选中语句：根据 lastLineNumber 定位，最后回退到第一条
 */
function autoSelectFromLineNumber() {
  if (state.value.statements.length === 0) {
    return
  }

  // 根据 lastLineNumber 定位（当前 splitStatements 按行拆分，行号即索引 + 1）
  const lineNumber = state.value.lastLineNumber
  if (lineNumber) {
    const index = lineNumber - 1
    const entry = state.value.statements[index] ?? state.value.statements.at(-1)
    if (entry) {
      selectedStatementId = entry.id
    }
    return
  }

  // 默认选中第一条
  selectedStatementId = state.value.statements[0].id
}

/**
 * 滚动虚拟列表到当前选中的语句
 *
 * 虚拟列表的 estimateSize 与实际高度存在偏差，首次滚动不精确。
 * 每帧调用 scrollToIndex 触发新项渲染和 ResizeObserver 测量，
 * 等连续两帧偏移量不再变化后才揭示列表，确保用户只看到最终位置。
 */
function scrollToSelectedStatement(align: 'center' | 'auto' = 'center') {
  if (selectedStatementId === undefined) {
    isPositioning = false
    return
  }
  const index = state.value.statements.findIndex(e => e.id === selectedStatementId)
  if (index === -1) {
    isPositioning = false
    return
  }

  let lastOffset = -1
  let stableFrames = 0
  let remainingFrames = 10

  function settle() {
    remainingFrames--
    rowVirtualizer.value.scrollToIndex(index, { align })
    const offset = rowVirtualizer.value.scrollOffset ?? 0
    if (Math.abs(offset - lastOffset) <= 1) {
      stableFrames++
    } else {
      stableFrames = 0
    }
    lastOffset = offset
    if (stableFrames >= 2 || remainingFrames <= 0) {
      isPositioning = false
      return
    }
    requestAnimationFrame(settle)
  }

  settle()
}

</script>

<template>
  <ScrollArea ref="scrollAreaRef" class="h-full" :style="{ opacity: isPositioning ? 0 : 1 }">
    <div role="listbox" :aria-label="$t('edit.visualEditor.statementList')" :style="{ height: `${totalSize}px`, width: '100%', position: 'relative' }">
      <div
        v-for="row in virtualRows"
        :key="(row.key as number)"
        :ref="el => rowVirtualizer.measureElement(el as Element)"
        :data-index="row.index"
        class="px-2"
        :class="editSettings.collapseStatementsOnSidebarOpen ? 'pb-1' : 'pb-1.5'"
        :style="{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          transform: `translateY(${row.start}px)`,
        }"
      >
        <VisualEditorStatementCard
          :collapsed="state.statements[row.index].collapsed"
          :entry="state.statements[row.index]"
          :index="row.index"
          :selected="state.statements[row.index].id === selectedStatementId"
          :readonly="preferenceStore.showSidebar && editSettings.collapseStatementsOnSidebarOpen"
          :previous-speaker="previousSpeakers[row.index]"
          @update="handleStatementUpdate"
          @update:collapsed="val => handleCollapsedUpdate(row.index, val)"
          @select="handleSelect"
          @delete="handleStatementDelete"
          @play-to="handlePlayTo"
        />
      </div>
    </div>
  </ScrollArea>
</template>
