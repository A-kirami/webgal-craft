import { describe, expect, it } from 'vitest'

import {
  computeLineNumberFromStatementId,
  computeStatementIdFromLineNumber,
  getSelectedSceneStatementPreviousSpeaker,
  resolveSceneSelectionState,
} from '~/domain/document/scene-selection'

import type { StatementEntry } from '~/domain/script/sentence'

function createStatement(id: number, rawText: string): StatementEntry {
  return {
    id,
    rawText,
    parsed: undefined,
    parseError: false,
  }
}

describe('场景选区', () => {
  it('可根据 lastLineNumber 回退解析选中语句', () => {
    const statements = [
      createStatement(101, 'Alice:第一句;'),
      createStatement(102, '接续第二句;'),
      createStatement(103, 'Bob:第三句;'),
    ]

    expect(resolveSceneSelectionState(statements, { lastLineNumber: 2 })).toMatchObject({
      index: 1,
      selectedStatementId: 102,
    })
  })

  it('可返回选中语句继承到的上一位说话人', () => {
    const statements = [
      createStatement(201, 'Alice:第一句;'),
      createStatement(202, '接续第二句;'),
      createStatement(203, 'say:旁白。 -clear;'),
      createStatement(204, '继续旁白;'),
    ]

    expect(getSelectedSceneStatementPreviousSpeaker(statements, { selectedStatementId: 202 })).toBe('Alice')
    expect(getSelectedSceneStatementPreviousSpeaker(statements, { selectedStatementId: 204 })).toBe('')
  })

  it('多行语句也能正确映射行号与 statement id', () => {
    const statements = [
      createStatement(301, 'Alice:第一行\n第二行;'),
      createStatement(302, 'Bob:第三行;'),
    ]

    expect(computeLineNumberFromStatementId(statements, 301)).toBe(1)
    expect(computeLineNumberFromStatementId(statements, 302)).toBe(3)
    expect(computeLineNumberFromStatementId(statements, 999)).toBeUndefined()
    expect(computeStatementIdFromLineNumber(statements, 2)).toBe(301)
    expect(computeStatementIdFromLineNumber(statements, 3)).toBe(302)
    expect(computeStatementIdFromLineNumber(statements, 999)).toBe(302)
  })
})
