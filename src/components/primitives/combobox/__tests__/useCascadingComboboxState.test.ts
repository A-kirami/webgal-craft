import { describe, expect, it } from 'vitest'

import { buildCascadingComboboxData } from '../cascading-combobox-data'
import { useCascadingComboboxState } from '../useCascadingComboboxState'

import type { CascadingComboboxNode } from '../cascading-combobox-data'

const groupedData = buildCascadingComboboxData([
  { label: 'chara/variant01', value: 'chara/variant01' },
  { label: 'chara/variant02', value: 'chara/variant02' },
  { label: 'charc/group01/item01', value: 'charc/group01/item01' },
  { label: 'charc/default', value: 'charc/default' },
], {
  grouping: { mode: 'path' },
  resolvedDelimiter: '/',
})

function findGroupNodeId(nodes: CascadingComboboxNode[], labels: string[]): string {
  let layerNodes = nodes
  let matchedNode: CascadingComboboxNode | undefined

  for (const label of labels) {
    matchedNode = layerNodes.find(node => node.kind === 'group' && node.label === label)
    if (!matchedNode || matchedNode.kind !== 'group') {
      throw new Error(`Group not found: ${labels.join('/')}`)
    }
    layerNodes = matchedNode.children
  }

  if (!matchedNode || matchedNode.kind !== 'group') {
    throw new Error(`Group not found: ${labels.join('/')}`)
  }

  return matchedNode.id
}

function findItemNodeId(nodes: CascadingComboboxNode[], value: string): string {
  const pendingNodes = [...nodes]

  while (pendingNodes.length > 0) {
    const node = pendingNodes.shift()
    if (!node) {
      continue
    }

    if (node.kind === 'item' && node.value === value) {
      return node.id
    }

    if (node.kind === 'group') {
      pendingNodes.unshift(...node.children)
    }
  }

  throw new Error(`Item not found: ${value}`)
}

describe('useCascadingComboboxState', () => {
  it('会从已选叶子节点恢复展开路径与高亮路径', () => {
    const modelValue = ref('charc/group01/item01')
    const state = useCascadingComboboxState({
      browseNodes: () => groupedData.browseNodes,
      modelValue: () => modelValue.value,
    })

    state.restoreSelectionPath(modelValue.value)

    expect(state.expandedGroupPath.value).toEqual([
      findGroupNodeId(groupedData.browseNodes, ['charc']),
      findGroupNodeId(groupedData.browseNodes, ['charc', 'group01']),
    ])
    expect(state.highlightedPath.value).toEqual([
      findGroupNodeId(groupedData.browseNodes, ['charc']),
      findGroupNodeId(groupedData.browseNodes, ['charc', 'group01']),
      findItemNodeId(groupedData.browseNodes, 'charc/group01/item01'),
    ])
  })

  it('向右移动时会进入当前高亮分组的第一个子项', () => {
    const state = useCascadingComboboxState({
      browseNodes: () => groupedData.browseNodes,
      modelValue: () => undefined,
    })
    const charaGroupId = findGroupNodeId(groupedData.browseNodes, ['chara'])

    state.setHighlightedNode(charaGroupId)
    state.moveRight()

    expect(state.expandedGroupPath.value).toEqual([charaGroupId])
    expect(state.highlightedPath.value).toEqual([
      charaGroupId,
      findItemNodeId(groupedData.browseNodes, 'chara/variant01'),
    ])
  })

  it('搜索激活时会清空子菜单状态，并在清空搜索后恢复上次浏览路径', () => {
    const modelValue = ref('charc/group01/item01')
    const state = useCascadingComboboxState({
      browseNodes: () => groupedData.browseNodes,
      modelValue: () => modelValue.value,
    })

    state.restoreSelectionPath(modelValue.value)
    const expandedBeforeSearch = [...state.expandedGroupPath.value]
    const highlightedBeforeSearch = [...state.highlightedPath.value]

    state.suspendBrowseForSearch()

    expect(state.expandedGroupPath.value).toEqual([])
    expect(state.highlightedPath.value).toEqual([])

    state.resumeBrowseAfterSearch()

    expect(state.expandedGroupPath.value).toEqual(expandedBeforeSearch)
    expect(state.highlightedPath.value).toEqual(highlightedBeforeSearch)
  })
})
