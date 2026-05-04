import { describe, expect, it } from 'vitest'

import { createSearchOptionDocuments, filterSearchOptionDocuments } from '../search'

describe('createSearchOptionDocuments', () => {
  it('会保留原始顺序并为每个选项附加 originalIndex', () => {
    const documents = createSearchOptionDocuments([
      { label: 'Joy', value: 'joy' },
      { label: 'Sad', value: 'sad' },
    ])

    expect(documents).toEqual([
      { label: 'Joy', originalIndex: 0, pathText: 'Joy', value: 'joy' },
      { label: 'Sad', originalIndex: 1, pathText: 'Sad', value: 'sad' },
    ])
  })

  it('会在 label 为空时回退到 value', () => {
    const documents = createSearchOptionDocuments([
      { label: '', value: 'joy' },
    ])

    expect(documents).toEqual([
      { label: 'joy', originalIndex: 0, pathText: 'joy', value: 'joy' },
    ])
  })
})

describe('filterSearchOptionDocuments', () => {
  const documents = createSearchOptionDocuments([
    { label: 'charc/default', value: 'charc/default' },
    { label: 'charc/group01/item01', value: 'charc/group01/item01' },
    { label: 'chara/variant01', value: 'chara/variant01' },
  ])

  it('空查询时返回全部结果', () => {
    expect(filterSearchOptionDocuments(documents, '')).toEqual(documents)
  })

  it('会按空格拆分关键词并要求全部命中', () => {
    expect(filterSearchOptionDocuments(documents, 'charc item01')).toEqual([
      documents[1],
    ])
  })

  it('会忽略多余空格并做大小写无关匹配', () => {
    expect(filterSearchOptionDocuments(documents, '  CHARC   DEFAULT  ')).toEqual([
      documents[0],
    ])
  })
})
