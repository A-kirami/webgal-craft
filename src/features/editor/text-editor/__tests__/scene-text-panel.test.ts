import { describe, expect, it } from 'vitest'

import { LEGACY_ENGINE_RUNTIME_CAPABILITIES } from '~/domain/engine/runtime-capabilities'
import { buildSceneStatements } from '~/domain/script/sentence'
import {
  createEmptySceneTextPanelSnapshot,
  createSceneTextPanelTextModel,
  resolveSceneTextPanelSnapshot,
  resolveSceneTextPanelSnapshotFromContent,
} from '~/features/editor/text-editor/scene-text-panel'

function createLineSource(lines: string[]) {
  return {
    getLineCount() {
      return lines.length
    },
    getLineContent(lineNumber: number) {
      return lines[lineNumber - 1] ?? ''
    },
  }
}

describe('sceneTextPanel', () => {
  it('空快照保持空 entry 和空 previous speaker', () => {
    expect(createEmptySceneTextPanelSnapshot()).toEqual({
      endLineNumber: undefined,
      entry: undefined,
      lineNumber: undefined,
      previousSpeaker: '',
      startLineNumber: undefined,
      statementIndex: undefined,
    })
  })

  it('可根据当前行构建临时 StatementEntry 快照', () => {
    const snapshot = resolveSceneTextPanelSnapshot(2, createLineSource([
      'Alice:第一句;',
      '接续第二句;',
    ]))

    expect(snapshot.entry).toMatchObject({
      id: 2,
      rawText: '接续第二句;',
      parseError: false,
    })
    expect(snapshot.lineNumber).toBe(2)
    expect(snapshot.startLineNumber).toBe(2)
    expect(snapshot.endLineNumber).toBe(2)
    expect(snapshot.statementIndex).toBe(1)
    expect(snapshot.previousSpeaker).toBe('Alice')
  })

  it('遇到空白行时返回空快照', () => {
    const snapshot = resolveSceneTextPanelSnapshot(2, createLineSource([
      'Alice:第一句;',
      ' '.repeat(3),
      'Bob:第三句;',
    ]))

    expect(snapshot).toEqual({
      endLineNumber: undefined,
      entry: undefined,
      lineNumber: undefined,
      previousSpeaker: '',
      startLineNumber: undefined,
      statementIndex: undefined,
    })
  })

  it('行号越界时返回空快照', () => {
    expect(resolveSceneTextPanelSnapshot(0, createLineSource(['Alice:第一句;']))).toEqual({
      endLineNumber: undefined,
      entry: undefined,
      lineNumber: undefined,
      previousSpeaker: '',
      startLineNumber: undefined,
      statementIndex: undefined,
    })
    expect(resolveSceneTextPanelSnapshot(3, createLineSource(['Alice:第一句;']))).toEqual({
      endLineNumber: undefined,
      entry: undefined,
      lineNumber: undefined,
      previousSpeaker: '',
      startLineNumber: undefined,
      statementIndex: undefined,
    })
  })

  it('可处理旁白清除后的 speaker 继承', () => {
    const snapshot = resolveSceneTextPanelSnapshot(4, createLineSource([
      'Alice:第一句;',
      'say:旁白。 -clear;',
      '继续旁白;',
      'Bob:切回角色;',
    ]))

    expect(snapshot.previousSpeaker).toBe('')
    expect(snapshot.entry?.id).toBe(4)
  })

  it('构建文本侧边栏临时快照不会污染全局语句 id 分配器', () => {
    const beforeId = buildSceneStatements('alpha')[0]?.id
    resolveSceneTextPanelSnapshot(100, createLineSource(Array.from({ length: 100 }, () => 'noop;')))
    const afterId = buildSceneStatements('beta')[0]?.id

    expect(beforeId).toBeTypeOf('number')
    expect(afterId).toBe((beforeId ?? -1) + 1)
  })

  it('可直接从文本投影内容构建快照而不依赖 Monaco model', () => {
    const snapshot = resolveSceneTextPanelSnapshotFromContent(2, 'Alice:第一句;\n接续第二句;')

    expect(snapshot.entry).toMatchObject({
      id: 2,
      rawText: '接续第二句;',
    })
    expect(snapshot.previousSpeaker).toBe('Alice')
  })

  it('文本投影内容为 CRLF 时应去除行尾回车', () => {
    const snapshot = resolveSceneTextPanelSnapshot(2, createSceneTextPanelTextModel('Alice:第一句;\r\n接续第二句;\r\n'))

    expect(snapshot.entry?.rawText).toBe('接续第二句;')
    expect(snapshot.previousSpeaker).toBe('Alice')
  })

  it('光标位于续行时返回完整逻辑语句及其范围', () => {
    const snapshot = resolveSceneTextPanelSnapshotFromContent(2, [
      'say:第一句',
      '  -speaker=Alice;',
      '第二句;',
    ].join('\n'))

    expect(snapshot.entry).toMatchObject({
      id: 1,
      rawText: 'say:第一句\n  -speaker=Alice;',
      parsed: expect.objectContaining({
        content: '第一句',
      }),
    })
    expect(snapshot.startLineNumber).toBe(1)
    expect(snapshot.endLineNumber).toBe(2)
    expect(snapshot.statementIndex).toBe(0)
    expect(snapshot.previousSpeaker).toBe('')
  })

  it('续行中的 speaker 变更会被后续语句继承', () => {
    const snapshot = resolveSceneTextPanelSnapshotFromContent(3, [
      'say:第一句',
      '  -speaker=Alice;',
      '第二句;',
    ].join('\n'))

    expect(snapshot.previousSpeaker).toBe('Alice')
  })

  it('旧运行时在续行上只返回当前物理行', () => {
    const snapshot = resolveSceneTextPanelSnapshotFromContent(2, [
      'say:第一句',
      '  -speaker=Alice;',
      '第二句;',
    ].join('\n'), LEGACY_ENGINE_RUNTIME_CAPABILITIES)

    expect(snapshot.entry?.rawText).toBe('  -speaker=Alice;')
    expect(snapshot.startLineNumber).toBe(2)
    expect(snapshot.endLineNumber).toBe(2)
    expect(snapshot.statementIndex).toBe(1)
  })
})
