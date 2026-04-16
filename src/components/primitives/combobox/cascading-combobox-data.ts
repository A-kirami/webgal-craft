import { createSearchOptionDocuments } from './search'

import type { SearchOptionDocument, SearchOptionItem } from './search'

interface CascadingComboboxBaseNode {
  id: string
  label: string
  pathSegments: string[]
}

export interface CascadingComboboxLeafNode extends CascadingComboboxBaseNode {
  kind: 'item'
  rawLabel: string
  value: string
}

export interface CascadingComboboxGroupNode extends CascadingComboboxBaseNode {
  kind: 'group'
  children: CascadingComboboxNode[]
}

export type CascadingComboboxNode = CascadingComboboxGroupNode | CascadingComboboxLeafNode

export interface BuildCascadingComboboxDataOptions {
  grouping?: {
    mode: 'path'
  }
  resolvedDelimiter?: string
}

export interface CascadingComboboxData {
  browseNodes: CascadingComboboxNode[]
  searchDocuments: SearchOptionDocument[]
}

function createGroupId(pathSegments: string[]): string {
  return `group:${pathSegments.join('\u0000')}`
}

function createItemId(value: string): string {
  return `item:${value}`
}

function normalizeOptionLabel(option: SearchOptionItem): string {
  return option.label || option.value
}

function createLeafNode(
  option: SearchOptionItem,
  label: string,
  pathSegments: string[],
): CascadingComboboxLeafNode {
  const rawLabel = normalizeOptionLabel(option)

  return {
    id: createItemId(option.value),
    kind: 'item',
    label,
    pathSegments,
    rawLabel,
    value: option.value,
  }
}

function shouldUsePathGrouping(options: BuildCascadingComboboxDataOptions): boolean {
  return options.grouping?.mode === 'path'
    && Boolean(options.resolvedDelimiter)
}

function buildFlatNodes(options: SearchOptionItem[]): CascadingComboboxLeafNode[] {
  return options.map((option) => {
    const rawLabel = normalizeOptionLabel(option)
    return createLeafNode(option, rawLabel, [rawLabel])
  })
}

function splitPathSegments(label: string, delimiter: string): string[] {
  return label
    .split(delimiter)
    .map(segment => segment.trim())
    .filter(Boolean)
}

function buildGroupedNodes(
  options: SearchOptionItem[],
  delimiter: string,
): CascadingComboboxNode[] {
  const rootNodes: CascadingComboboxNode[] = []
  const groupIndex = new Map<string, CascadingComboboxGroupNode>()

  for (const option of options) {
    const rawLabel = normalizeOptionLabel(option)
    const pathSegments = splitPathSegments(rawLabel, delimiter)

    if (pathSegments.length <= 1) {
      rootNodes.push(createLeafNode(option, rawLabel, [rawLabel]))
      continue
    }

    let currentNodes = rootNodes
    const groupPath: string[] = []

    for (const segment of pathSegments.slice(0, -1)) {
      groupPath.push(segment)
      const groupId = createGroupId(groupPath)
      let groupNode = groupIndex.get(groupId)

      if (!groupNode) {
        groupNode = {
          id: groupId,
          kind: 'group',
          label: segment,
          pathSegments: [...groupPath],
          children: [],
        }
        groupIndex.set(groupId, groupNode)
        currentNodes.push(groupNode)
      }

      currentNodes = groupNode.children
    }

    const leafLabel = pathSegments.at(-1) ?? rawLabel
    currentNodes.push(createLeafNode(option, leafLabel, pathSegments))
  }

  return rootNodes
}

export function buildCascadingComboboxData(
  options: SearchOptionItem[],
  config: BuildCascadingComboboxDataOptions = {},
): CascadingComboboxData {
  const browseNodes = shouldUsePathGrouping(config)
    ? buildGroupedNodes(options, config.resolvedDelimiter!)
    : buildFlatNodes(options)

  return {
    browseNodes,
    searchDocuments: createSearchOptionDocuments(options),
  }
}
