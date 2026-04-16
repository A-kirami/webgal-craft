import { describe, expect, it } from 'vitest'

import { buildCascadingComboboxData } from '../cascading-combobox'

describe('buildCascadingComboboxData', () => {
  it('会把同一路径前缀的候选项聚合成级联树，并保留搜索文档', () => {
    const result = buildCascadingComboboxData([
      { label: 'anon/cry01', value: 'anon/cry01' },
      { label: 'anon/cry02', value: 'anon/cry02' },
      { label: 'saki/cry01', value: 'saki/cry01' },
    ], {
      grouping: { mode: 'path' },
      resolvedDelimiter: '/',
    })

    expect(result.browseNodes).toMatchObject([
      {
        kind: 'group',
        label: 'anon',
        children: [
          { kind: 'item', label: 'cry01', rawLabel: 'anon/cry01', value: 'anon/cry01' },
          { kind: 'item', label: 'cry02', rawLabel: 'anon/cry02', value: 'anon/cry02' },
        ],
      },
      {
        kind: 'group',
        label: 'saki',
        children: [
          { kind: 'item', label: 'cry01', rawLabel: 'saki/cry01', value: 'saki/cry01' },
        ],
      },
    ])
    expect(result.searchDocuments).toEqual([
      { rawLabel: 'anon/cry01', pathText: 'anon/cry01', value: 'anon/cry01' },
      { rawLabel: 'anon/cry02', pathText: 'anon/cry02', value: 'anon/cry02' },
      { rawLabel: 'saki/cry01', pathText: 'saki/cry01', value: 'saki/cry01' },
    ])
  })

  it('支持任意深度路径', () => {
    const result = buildCascadingComboboxData([
      { label: 'sakiko/maskon/kime01', value: 'sakiko/maskon/kime01' },
    ], {
      grouping: { mode: 'path' },
      resolvedDelimiter: '/',
    })

    expect(result.browseNodes).toMatchObject([
      {
        kind: 'group',
        label: 'sakiko',
        children: [
          {
            kind: 'group',
            label: 'maskon',
            children: [
              { kind: 'item', label: 'kime01', rawLabel: 'sakiko/maskon/kime01' },
            ],
          },
        ],
      },
    ])
  })

  it('允许根层叶子和组混排，并稳定处理前缀冲突', () => {
    const result = buildCascadingComboboxData([
      { label: 'sakiko', value: 'sakiko' },
      { label: 'sakiko/maskon', value: 'sakiko/maskon' },
      { label: 'sakiko/maskon/kime01', value: 'sakiko/maskon/kime01' },
    ], {
      grouping: { mode: 'path' },
      resolvedDelimiter: '/',
    })

    expect(result.browseNodes).toMatchObject([
      {
        kind: 'item',
        label: 'sakiko',
        rawLabel: 'sakiko',
        value: 'sakiko',
      },
      {
        kind: 'group',
        label: 'sakiko',
        children: [
          {
            kind: 'item',
            label: 'maskon',
            rawLabel: 'sakiko/maskon',
            value: 'sakiko/maskon',
          },
          {
            kind: 'group',
            label: 'maskon',
            children: [
              {
                kind: 'item',
                label: 'kime01',
                rawLabel: 'sakiko/maskon/kime01',
                value: 'sakiko/maskon/kime01',
              },
            ],
          },
        ],
      },
    ])
  })

  it('未启用路径分组时保持扁平浏览节点，但仍生成搜索文档', () => {
    const result = buildCascadingComboboxData([
      { label: 'sakiko/maskon/kime01', value: 'sakiko/maskon/kime01' },
      { label: 'plain', value: 'plain' },
    ], {
      resolvedDelimiter: '/',
    })

    expect(result.browseNodes).toMatchObject([
      { kind: 'item', label: 'sakiko/maskon/kime01', rawLabel: 'sakiko/maskon/kime01', value: 'sakiko/maskon/kime01' },
      { kind: 'item', label: 'plain', rawLabel: 'plain', value: 'plain' },
    ])
    expect(result.searchDocuments).toEqual([
      { rawLabel: 'sakiko/maskon/kime01', pathText: 'sakiko/maskon/kime01', value: 'sakiko/maskon/kime01' },
      { rawLabel: 'plain', pathText: 'plain', value: 'plain' },
    ])
  })
})
