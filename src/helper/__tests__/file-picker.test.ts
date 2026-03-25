import { describe, expect, it } from 'vitest'

import {
  formatFilePickerModelValueForInput,
  getFilePickerName,
  getFilePickerParentPath,
  insertFilePickerRecentHistoryPath,
  parseFilePickerInput,
  removeFilePickerRecentHistoryPaths,
  resolveFilePickerHistoryStorageKey,
  resolveFilePickerInputFallbackDir,
} from '../file-picker'

describe('file picker helper', () => {
  it('解析空输入时会回到根目录并触发导航', () => {
    expect(parseFilePickerInput('', 'images/bg')).toEqual({
      directoryPath: '',
      keyword: '',
      rejectAbsolutePath: false,
      shouldNavigate: true,
    })
  })

  it('解析普通文件名时会停留在 fallback 目录并只更新过滤关键字', () => {
    expect(parseFilePickerInput('opening.png', 'images/bg')).toEqual({
      directoryPath: 'images/bg',
      keyword: 'opening.png',
      rejectAbsolutePath: false,
      shouldNavigate: false,
    })
  })

  it('解析目录输入和目录内搜索输入时会得到正确的目标目录', () => {
    expect(parseFilePickerInput('images/bg/', '')).toEqual({
      directoryPath: 'images/bg',
      keyword: '',
      rejectAbsolutePath: false,
      shouldNavigate: true,
    })

    expect(parseFilePickerInput('images/bg/opening', '')).toEqual({
      directoryPath: 'images/bg',
      keyword: 'opening',
      rejectAbsolutePath: false,
      shouldNavigate: true,
    })
  })

  it('解析绝对路径输入时会拒绝跳出根目录', () => {
    expect(parseFilePickerInput(String.raw`C:\outside\secret.png`, 'images/bg')).toEqual({
      directoryPath: 'images/bg',
      keyword: '',
      rejectAbsolutePath: true,
      shouldNavigate: false,
    })
  })

  it('处理从当前目录名退格到父目录的 fallback 规则', () => {
    expect(resolveFilePickerInputFallbackDir('chapter', 'scenes/chapter/', 'scenes/chapter')).toBe('scenes')
    expect(resolveFilePickerInputFallbackDir('opening', 'scenes/chapter/', 'scenes/chapter')).toBe('scenes/chapter')
    expect(resolveFilePickerInputFallbackDir('chapter', 'chapter/', 'chapter')).toBe('')
  })

  it('格式化输入值时会在打开当前目录或保留目录语义时补上末尾斜杠', () => {
    expect(formatFilePickerModelValueForInput('images/bg', {
      currentDir: 'images/bg',
      isOpen: true,
    })).toBe('images/bg/')

    expect(formatFilePickerModelValueForInput('images/bg/', {
      currentDir: '',
      isOpen: false,
    })).toBe('images/bg/')

    expect(formatFilePickerModelValueForInput('images/bg/opening.png', {
      currentDir: 'images/bg',
      isOpen: true,
    })).toBe('images/bg/opening.png')
  })

  it('提取父路径和文件名时会统一相对路径格式', () => {
    expect(getFilePickerParentPath('\\images\\bg\\opening.png\\')).toBe('images/bg')
    expect(getFilePickerParentPath('opening.png')).toBe('')
    expect(getFilePickerName('\\images\\bg\\opening.png\\')).toBe('opening.png')
    expect(getFilePickerName('opening.png')).toBe('opening.png')
  })

  it('生成 recent history 存储 key 时会标准化根路径和 scope key', () => {
    expect(resolveFilePickerHistoryStorageKey('', 'shots')).toBe('')
    expect(resolveFilePickerHistoryStorageKey('/Assets/CG/', '  story  ')).toBe('/assets/cg::story')
    expect(resolveFilePickerHistoryStorageKey('/Assets/CG/', '   ')).toBe('/assets/cg::default')
  })

  it('插入 recent history 时会规范路径、去重并限制最大条数', () => {
    expect(insertFilePickerRecentHistoryPath([
      'images/bg/old-2.png',
      'images/bg/opening.png',
      'images/bg/old-1.png',
    ], String.raw` \images\bg\opening.png\ `)).toEqual([
      'images/bg/opening.png',
      'images/bg/old-2.png',
      'images/bg/old-1.png',
    ])

    expect(insertFilePickerRecentHistoryPath(
      Array.from({ length: 20 }, (_, index) => `images/bg/${index}.png`),
      'images/bg/latest.png',
    )).toEqual([
      'images/bg/latest.png',
      ...Array.from({ length: 19 }, (_, index) => `images/bg/${index}.png`),
    ])
  })

  it('移除 recent history 项时会保持剩余顺序不变', () => {
    expect(removeFilePickerRecentHistoryPaths([
      'images/bg/opening.png',
      'images/bg/title.png',
      'images/bg/ending.png',
    ], [
      'images/bg/title.png',
      'images/bg/missing.png',
    ])).toEqual([
      'images/bg/opening.png',
      'images/bg/ending.png',
    ])
  })
})
