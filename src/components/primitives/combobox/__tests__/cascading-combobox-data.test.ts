import { describe, expect, it } from 'vitest'

import { buildCascadingComboboxData } from '../cascading-combobox-data'

describe('buildCascadingComboboxData', () => {
  it('会把同一路径前缀的候选项聚合成级联树，并保留搜索文档', () => {
    const result = buildCascadingComboboxData([
      { label: 'chara/variant01', value: 'chara/variant01' },
      { label: 'chara/variant02', value: 'chara/variant02' },
      { label: 'charb/variant01', value: 'charb/variant01' },
    ], {
      grouping: { mode: 'path' },
      resolvedDelimiter: '/',
    })

    expect(result.browseNodes).toMatchObject([
      {
        kind: 'group',
        label: 'chara',
        children: [
          { kind: 'item', label: 'variant01', rawLabel: 'chara/variant01', value: 'chara/variant01' },
          { kind: 'item', label: 'variant02', rawLabel: 'chara/variant02', value: 'chara/variant02' },
        ],
      },
      {
        kind: 'group',
        label: 'charb',
        children: [
          { kind: 'item', label: 'variant01', rawLabel: 'charb/variant01', value: 'charb/variant01' },
        ],
      },
    ])
    expect(result.searchDocuments).toEqual([
      { label: 'chara/variant01', originalIndex: 0, pathText: 'chara/variant01', value: 'chara/variant01' },
      { label: 'chara/variant02', originalIndex: 1, pathText: 'chara/variant02', value: 'chara/variant02' },
      { label: 'charb/variant01', originalIndex: 2, pathText: 'charb/variant01', value: 'charb/variant01' },
    ])
  })

  it('支持任意深度路径', () => {
    const result = buildCascadingComboboxData([
      { label: 'charc/group01/item01', value: 'charc/group01/item01' },
    ], {
      grouping: { mode: 'path' },
      resolvedDelimiter: '/',
    })

    expect(result.browseNodes).toMatchObject([
      {
        kind: 'group',
        label: 'charc',
        children: [
          {
            kind: 'group',
            label: 'group01',
            children: [
              { kind: 'item', label: 'item01', rawLabel: 'charc/group01/item01' },
            ],
          },
        ],
      },
    ])
  })

  it('允许根层叶子和组混排，并稳定处理前缀冲突', () => {
    const result = buildCascadingComboboxData([
      { label: 'charc', value: 'charc' },
      { label: 'charc/group01', value: 'charc/group01' },
      { label: 'charc/group01/item01', value: 'charc/group01/item01' },
    ], {
      grouping: { mode: 'path' },
      resolvedDelimiter: '/',
    })

    expect(result.browseNodes).toMatchObject([
      {
        kind: 'item',
        label: 'charc',
        rawLabel: 'charc',
        value: 'charc',
      },
      {
        kind: 'group',
        label: 'charc',
        children: [
          {
            kind: 'item',
            label: 'group01',
            rawLabel: 'charc/group01',
            value: 'charc/group01',
          },
          {
            kind: 'group',
            label: 'group01',
            children: [
              {
                kind: 'item',
                label: 'item01',
                rawLabel: 'charc/group01/item01',
                value: 'charc/group01/item01',
              },
            ],
          },
        ],
      },
    ])
  })

  it('未启用路径分组时保持扁平浏览节点，但仍生成搜索文档', () => {
    const result = buildCascadingComboboxData([
      { label: 'charc/group01/item01', value: 'charc/group01/item01' },
      { label: 'plain', value: 'plain' },
    ], {
      resolvedDelimiter: '/',
    })

    expect(result.browseNodes).toMatchObject([
      { kind: 'item', label: 'charc/group01/item01', rawLabel: 'charc/group01/item01', value: 'charc/group01/item01' },
      { kind: 'item', label: 'plain', rawLabel: 'plain', value: 'plain' },
    ])
    expect(result.searchDocuments).toEqual([
      { label: 'charc/group01/item01', originalIndex: 0, pathText: 'charc/group01/item01', value: 'charc/group01/item01' },
      { label: 'plain', originalIndex: 1, pathText: 'plain', value: 'plain' },
    ])
  })
})
