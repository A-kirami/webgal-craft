import { describe, expect, it } from 'vitest'

import { buildCascadingComboboxData } from '~/lib/cascading-combobox'

import { useCascadingComboboxState } from '../useCascadingComboboxState'

import type { CascadingComboboxNode } from '~/lib/cascading-combobox'

const groupedData = buildCascadingComboboxData([
  { label: 'anon/cry01', value: 'anon/cry01' },
  { label: 'anon/cry02', value: 'anon/cry02' },
  { label: 'sakiko/maskon/kime01', value: 'sakiko/maskon/kime01' },
  { label: 'sakiko/default', value: 'sakiko/default' },
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
  it('restores expanded and highlighted paths from the selected leaf', () => {
    const modelValue = ref('sakiko/maskon/kime01')
    const state = useCascadingComboboxState({
      browseNodes: () => groupedData.browseNodes,
      modelValue: () => modelValue.value,
    })

    state.restoreSelectionPath(modelValue.value)

    expect(state.expandedGroupPath.value).toEqual([
      findGroupNodeId(groupedData.browseNodes, ['sakiko']),
      findGroupNodeId(groupedData.browseNodes, ['sakiko', 'maskon']),
    ])
    expect(state.highlightedPath.value).toEqual([
      findGroupNodeId(groupedData.browseNodes, ['sakiko']),
      findGroupNodeId(groupedData.browseNodes, ['sakiko', 'maskon']),
      findItemNodeId(groupedData.browseNodes, 'sakiko/maskon/kime01'),
    ])
  })

  it('moves right into the first child of a highlighted group', () => {
    const state = useCascadingComboboxState({
      browseNodes: () => groupedData.browseNodes,
      modelValue: () => undefined,
    })
    const anonGroupId = findGroupNodeId(groupedData.browseNodes, ['anon'])

    state.setHighlightedNode(anonGroupId)
    state.moveRight()

    expect(state.expandedGroupPath.value).toEqual([anonGroupId])
    expect(state.highlightedPath.value).toEqual([
      anonGroupId,
      findItemNodeId(groupedData.browseNodes, 'anon/cry01'),
    ])
  })

  it('clears submenu state while search is active and restores the last browse path when search clears', () => {
    const modelValue = ref('sakiko/maskon/kime01')
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
