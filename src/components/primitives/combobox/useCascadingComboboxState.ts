import type { ShallowRef } from 'vue'
import type { CascadingComboboxNode } from '~/lib/cascading-combobox'

interface IndexedNodeRecord {
  ancestorGroupIds: string[]
  focusPath: string[]
  node: CascadingComboboxNode
  parentGroupId?: string
}

interface IndexedBrowseTree {
  leafRecordsByValue: Map<string, IndexedNodeRecord>
  nodeRecords: Map<string, IndexedNodeRecord>
  nodesByParentGroupId: Map<string, CascadingComboboxNode[]>
}

interface BrowseStateSnapshot {
  expandedGroupPath: string[]
  highlightedPath: string[]
}

export interface CascadingComboboxEnterResult {
  kind: 'open-group' | 'select-item' | 'noop'
  value?: string
}

export interface CascadingComboboxStateApi {
  enterGroup(nodeId?: string): void
  expandGroup(nodeId?: string): number | undefined
  focusGroup(nodeId?: string): void
  expandedGroupPath: ShallowRef<string[]>
  highlightedPath: ShallowRef<string[]>
  enterHighlighted(): CascadingComboboxEnterResult
  getNodeRecord(nodeId?: string): IndexedNodeRecord | undefined
  moveDown(): void
  moveLeft(): void
  moveRight(): void
  moveUp(): void
  previewGroup(nodeId?: string): void
  restoreSelectionPath(value?: string): void
  resumeBrowseAfterSearch(): void
  setHighlightedNode(nodeId?: string): void
  suspendBrowseForSearch(): void
}

export interface UseCascadingComboboxStateOptions {
  browseNodes: () => CascadingComboboxNode[]
  modelValue: () => string | undefined
}

const ROOT_LAYER_ID = '__root__'

function indexBrowseTree(nodes: CascadingComboboxNode[]): IndexedBrowseTree {
  const nodeRecords = new Map<string, IndexedNodeRecord>()
  const leafRecordsByValue = new Map<string, IndexedNodeRecord>()
  const nodesByParentGroupId = new Map<string, CascadingComboboxNode[]>()

  function visit(
    layerNodes: CascadingComboboxNode[],
    parentGroupId: string | undefined,
    ancestorGroupIds: string[],
  ) {
    nodesByParentGroupId.set(parentGroupId ?? ROOT_LAYER_ID, layerNodes)

    for (const node of layerNodes) {
      const record: IndexedNodeRecord = {
        ancestorGroupIds,
        focusPath: [...ancestorGroupIds, node.id],
        node,
        parentGroupId,
      }

      nodeRecords.set(node.id, record)

      if (node.kind === 'item') {
        leafRecordsByValue.set(node.value, record)
        continue
      }

      visit(node.children, node.id, [...ancestorGroupIds, node.id])
    }
  }

  visit(nodes, undefined, [])

  return {
    leafRecordsByValue,
    nodeRecords,
    nodesByParentGroupId,
  }
}

function createBrowseStateSnapshot(
  expandedGroupPath: string[],
  highlightedPath: string[],
): BrowseStateSnapshot {
  return {
    expandedGroupPath: [...expandedGroupPath],
    highlightedPath: [...highlightedPath],
  }
}

export function useCascadingComboboxState(
  options: UseCascadingComboboxStateOptions,
): CascadingComboboxStateApi {
  const browseTree = computed(() => indexBrowseTree(options.browseNodes()))
  const highlightedPath = shallowRef<string[]>([])
  const expandedGroupPath = shallowRef<string[]>([])
  const highlightedNodeId = computed(() => highlightedPath.value.at(-1))
  let suspendedBrowseState: BrowseStateSnapshot | undefined

  function getNodeRecord(nodeId: string | undefined = highlightedNodeId.value) {
    if (!nodeId) {
      return
    }

    return browseTree.value.nodeRecords.get(nodeId)
  }

  function getLayerNodes(record: IndexedNodeRecord | undefined): CascadingComboboxNode[] {
    const parentGroupId = record?.parentGroupId ?? ROOT_LAYER_ID

    return browseTree.value.nodesByParentGroupId.get(parentGroupId) ?? []
  }

  function getSelectedLeafRecordWithinGroup(groupId: string): IndexedNodeRecord | undefined {
    const modelValue = options.modelValue()
    if (!modelValue) {
      return
    }

    const selectedRecord = browseTree.value.leafRecordsByValue.get(modelValue)
    if (!selectedRecord?.ancestorGroupIds.includes(groupId)) {
      return
    }

    return selectedRecord
  }

  function updatePathsFromRecord(record: IndexedNodeRecord | undefined) {
    if (!record) {
      highlightedPath.value = []
      expandedGroupPath.value = []
      return
    }

    highlightedPath.value = [...record.focusPath]
    expandedGroupPath.value = [...record.ancestorGroupIds]
  }

  function restoreSelectionPath(value: string | undefined = options.modelValue()) {
    if (!value) {
      highlightedPath.value = []
      expandedGroupPath.value = []
      return
    }

    const selectedRecord = browseTree.value.leafRecordsByValue.get(value)
    updatePathsFromRecord(selectedRecord)
  }

  function setHighlightedNode(nodeId?: string) {
    updatePathsFromRecord(getNodeRecord(nodeId))
  }

  function previewGroup(nodeId: string | undefined = highlightedNodeId.value) {
    const record = getNodeRecord(nodeId)
    if (!record || record.node.kind !== 'group') {
      return
    }

    const selectedRecord = getSelectedLeafRecordWithinGroup(record.node.id)
    if (selectedRecord) {
      highlightedPath.value = [...selectedRecord.focusPath]
      return
    }

    highlightedPath.value = [...record.focusPath]
  }

  function moveWithinCurrentLayer(step: 1 | -1) {
    const record = getNodeRecord()
    const currentLayerNodes = getLayerNodes(record)

    if (currentLayerNodes.length === 0) {
      return
    }

    const currentIndex = record
      ? currentLayerNodes.findIndex(node => node.id === record.node.id)
      : -1
    const nextIndex = currentIndex === -1
      ? (step > 0 ? 0 : currentLayerNodes.length - 1)
      : Math.min(Math.max(currentIndex + step, 0), currentLayerNodes.length - 1)

    setHighlightedNode(currentLayerNodes[nextIndex]?.id)
  }

  function moveUp() {
    moveWithinCurrentLayer(-1)
  }

  function moveDown() {
    moveWithinCurrentLayer(1)
  }

  function expandGroup(nodeId: string | undefined = highlightedNodeId.value): number | undefined {
    const record = getNodeRecord(nodeId)
    if (!record || record.node.kind !== 'group') {
      return
    }

    const selectedRecord = getSelectedLeafRecordWithinGroup(record.node.id)
    if (selectedRecord) {
      highlightedPath.value = [...selectedRecord.focusPath]
      expandedGroupPath.value = [...selectedRecord.ancestorGroupIds]
      return record.focusPath.length
    }

    highlightedPath.value = [...record.focusPath]
    expandedGroupPath.value = [...record.focusPath]
  }

  function focusGroup(nodeId: string | undefined = highlightedNodeId.value) {
    const record = getNodeRecord(nodeId)
    if (!record || record.node.kind !== 'group') {
      return
    }

    highlightedPath.value = [...record.focusPath]
    expandedGroupPath.value = [...record.focusPath]
  }

  function enterGroup(nodeId: string | undefined = highlightedNodeId.value) {
    const record = getNodeRecord(nodeId)
    if (!record || record.node.kind !== 'group') {
      return
    }

    const selectedRecord = getSelectedLeafRecordWithinGroup(record.node.id)
    if (selectedRecord) {
      updatePathsFromRecord(selectedRecord)
      return
    }

    const firstChild = record.node.children[0]
    if (!firstChild) {
      return
    }

    expandedGroupPath.value = [...record.focusPath]
    highlightedPath.value = [...record.focusPath, firstChild.id]
  }

  function moveRight() {
    enterGroup()
  }

  function moveLeft() {
    const record = getNodeRecord()
    if (!record?.parentGroupId) {
      return
    }

    const parentRecord = browseTree.value.nodeRecords.get(record.parentGroupId)
    if (!parentRecord || parentRecord.node.kind !== 'group') {
      return
    }

    focusGroup(parentRecord.node.id)
  }

  function enterHighlighted(): CascadingComboboxEnterResult {
    const record = getNodeRecord()
    if (!record) {
      return { kind: 'noop' }
    }

    if (record.node.kind === 'item') {
      return {
        kind: 'select-item',
        value: record.node.value,
      }
    }

    moveRight()

    return { kind: 'open-group' }
  }

  function suspendBrowseForSearch() {
    suspendedBrowseState = createBrowseStateSnapshot(
      expandedGroupPath.value,
      highlightedPath.value,
    )
    expandedGroupPath.value = []
    highlightedPath.value = []
  }

  function resumeBrowseAfterSearch() {
    if (!suspendedBrowseState) {
      restoreSelectionPath()
      return
    }

    expandedGroupPath.value = [...suspendedBrowseState.expandedGroupPath]
    highlightedPath.value = [...suspendedBrowseState.highlightedPath]
    suspendedBrowseState = undefined
  }

  return {
    enterGroup,
    expandGroup,
    focusGroup,
    expandedGroupPath,
    highlightedPath,
    enterHighlighted,
    getNodeRecord,
    moveDown,
    moveLeft,
    moveRight,
    moveUp,
    previewGroup,
    restoreSelectionPath,
    resumeBrowseAfterSearch,
    setHighlightedNode,
    suspendBrowseForSearch,
  }
}
