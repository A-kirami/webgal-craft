import { describe, expect, it } from 'vitest'

import { applyDiffHunk } from '../diff-hunk'

describe('applyDiffHunk', () => {
  it('用源侧行替换目标侧差异块并保留目标换行符', () => {
    expect(applyDiffHunk({
      sourceContent: 'before\nlocal one\nlocal two\nafter',
      sourceRange: { startLineNumber: 2, endLineNumber: 3 },
      targetContent: 'before\r\nexternal\r\nafter',
      targetRange: { startLineNumber: 2, endLineNumber: 2 },
      targetLineEnding: '\r\n',
    })).toBe('before\r\nlocal one\r\nlocal two\r\nafter')
  })

  it('把源侧新增块插入目标侧的空行范围', () => {
    expect(applyDiffHunk({
      sourceContent: 'first\ninserted\nlast',
      sourceRange: { startLineNumber: 2, endLineNumber: 2 },
      targetContent: 'first\nlast',
      targetRange: { startLineNumber: 1, endLineNumber: 0 },
      targetLineEnding: '\n',
    })).toBe('first\ninserted\nlast')
  })

  it('源侧为空范围时删除目标侧差异块', () => {
    expect(applyDiffHunk({
      sourceContent: 'first\nlast',
      sourceRange: { startLineNumber: 1, endLineNumber: 0 },
      targetContent: 'first\nremoved\nlast',
      targetRange: { startLineNumber: 2, endLineNumber: 2 },
      targetLineEnding: '\n',
    })).toBe('first\nlast')
  })

  it('可用空源内容替换仅有一行的目标内容', () => {
    expect(applyDiffHunk({
      sourceContent: '',
      sourceRange: { startLineNumber: 0, endLineNumber: 0 },
      targetContent: 'removed',
      targetRange: { startLineNumber: 1, endLineNumber: 1 },
      targetLineEnding: '\n',
    })).toBe('')
  })
})
