import { describe, expect, it } from 'vitest'
import { commandType } from 'webgal-parser/src/interface/sceneInterface'

import { buildStatementPreviewParams } from '~/helper/statement-editor/preview'

import type { ISentence } from 'webgal-parser/src/interface/sceneInterface'
import type { ArgField, EditorField } from '~/helper/command-registry/schema'

const identityTranslate = (key: string): string => key

function createSentence(overrides?: Partial<ISentence>): ISentence {
  return {
    command: commandType.say,
    commandRaw: '',
    content: '',
    args: [],
    sentenceAssets: [],
    subScene: [],
    inlineComment: '',
    ...overrides,
  }
}

function createArgField(
  key: string,
  type: ArgField['field']['type'],
  extra?: {
    field?: Partial<ArgField['field']>
    jsonMeta?: ArgField['jsonMeta']
    storageKey?: string
  },
): ArgField {
  return {
    storageKey: extra?.storageKey ?? key,
    field: {
      key,
      type,
      label: () => key,
      ...extra?.field,
    } as ArgField['field'],
    jsonMeta: extra?.jsonMeta,
  }
}

function createContentField(
  type: EditorField['field']['type'],
  extra?: Partial<EditorField['field']>,
): EditorField {
  return {
    key: 'content',
    storage: 'content',
    field: {
      key: 'content',
      label: () => 'content',
      type,
      ...extra,
    } as EditorField['field'],
  }
}

describe('语句编辑器预览', () => {
  it('unsupported 语句展示原始文本', () => {
    const result = buildStatementPreviewParams({
      parsed: createSentence({ content: 'hello' }),
      statementType: 'unsupported',
      entryRawText: '  @unknown hello  ',
      previousSpeaker: '',
      contentField: undefined,
      argFields: [],
      fileMissingKeys: new Set(),
      t: identityTranslate,
    })

    expect(result).toEqual([{ label: '', value: '@unknown hello' }])
  })

  it('say 语句根据冒号决定说话人来源', () => {
    const parsed = createSentence({
      command: commandType.say,
      commandRaw: 'Alice',
      content: 'Hi',
    })

    const withColon = buildStatementPreviewParams({
      parsed,
      statementType: 'say',
      entryRawText: 'Alice:Hi',
      previousSpeaker: 'Bob',
      contentField: createContentField('text'),
      argFields: [],
      fileMissingKeys: new Set(),
      t: identityTranslate,
    })
    const withoutColon = buildStatementPreviewParams({
      parsed,
      statementType: 'say',
      entryRawText: 'Hi',
      previousSpeaker: 'Bob',
      contentField: createContentField('text'),
      argFields: [],
      fileMissingKeys: new Set(),
      t: identityTranslate,
    })

    expect(withColon[0]).toMatchObject({ label: 'Alice', value: 'Hi', truncate: true })
    expect(withoutColon[0]).toMatchObject({ label: 'Bob', value: 'Hi', truncate: true })
  })

  it('content select/file 分支可正确展示匹配值与缺失状态', () => {
    const selectResult = buildStatementPreviewParams({
      parsed: createSentence({ command: commandType.playEffect, content: 'rain' }),
      statementType: 'command',
      entryRawText: 'playEffect:rain',
      previousSpeaker: '',
      contentField: createContentField('choice', {
        options: [{ value: 'rain', label: () => '雨' }],
      }),
      argFields: [],
      fileMissingKeys: new Set(),
      t: identityTranslate,
    })
    const fileResult = buildStatementPreviewParams({
      parsed: createSentence({ command: commandType.changeBg, content: 'bg.jpg' }),
      statementType: 'command',
      entryRawText: 'changeBg:bg.jpg',
      previousSpeaker: '',
      contentField: createContentField('file', {
        fileConfig: { assetType: 'bgm', extensions: ['.jpg'], title: () => 'file' },
      }),
      argFields: [],
      fileMissingKeys: new Set(['__content__']),
      t: identityTranslate,
    })

    expect(selectResult[0]).toMatchObject({ value: '雨' })
    expect(fileResult[0]).toMatchObject({ isFile: true, fileMissing: true, value: 'bg.jpg' })
  })

  it('args 分支会过滤默认值并支持 flag-choice/switch/file/color 展示', () => {
    const argFields: ArgField[] = [
      createArgField('mode', 'choice', {
        field: {
          label: () => '模式',
          mode: 'flag',
          options: [
            { value: 'rain', label: () => '雨' },
            { value: 'snow', label: () => '雪' },
          ],
        },
      }),
      createArgField('auto', 'switch', {
        field: {
          label: () => '自动',
        },
      }),
      createArgField('speed', 'number', {
        field: {
          label: () => '速度',
          defaultValue: 1,
        },
      }),
      createArgField('sprite', 'file', {
        field: {
          label: () => '立绘',
          fileConfig: { assetType: 'figure', extensions: ['.png'], title: () => 'figure' },
        },
      }),
      createArgField('fontColor', 'color', {
        field: {
          label: () => '颜色',
        },
      }),
    ]

    const result = buildStatementPreviewParams({
      parsed: createSentence({
        command: commandType.changeFigure,
        content: 'figureA',
        args: [
          { key: 'next', value: true },
          { key: 'continue', value: true },
          { key: 'rain', value: true },
          { key: 'auto', value: true },
          { key: 'speed', value: '1' },
          { key: 'sprite', value: 'hero.png' },
          { key: 'fontColor', value: '#ffffff' },
        ],
      }),
      statementType: 'command',
      entryRawText: '',
      previousSpeaker: '',
      contentField: createContentField('text'),
      argFields,
      fileMissingKeys: new Set(['sprite']),
      t: identityTranslate,
    })

    expect(result.some(item => item.label === '模式' && item.value === '雨')).toBe(true)
    expect(result.some(item => item.label === '自动' && item.value === '')).toBe(true)
    expect(result.some(item => item.label === '速度')).toBe(false)
    expect(result.some(item => item.label === '立绘' && item.fileMissing)).toBe(true)
    expect(result.some(item => item.label === '颜色' && item.color === '#ffffff')).toBe(true)
  })

  it('flattened json 参数会按子字段展开并应用 select 标签映射', () => {
    const argFields: ArgField[] = [
      createArgField('transform.x', 'number', {
        storageKey: 'transform',
        field: {
          label: () => 'X',
        },
        jsonMeta: {
          argKey: 'transform',
          fieldKey: 'x',
        },
      }),
      createArgField('transform.ease', 'choice', {
        storageKey: 'transform',
        field: {
          label: () => '缓动',
          options: [{ value: 'linear', label: () => '线性' }],
        },
        jsonMeta: {
          argKey: 'transform',
          fieldKey: 'ease',
        },
      }),
    ]

    const result = buildStatementPreviewParams({
      parsed: createSentence({
        command: commandType.changeFigure,
        content: 'figureA',
        args: [{ key: 'transform', value: '{"x":10,"ease":"linear"}' }],
      }),
      statementType: 'command',
      entryRawText: '',
      previousSpeaker: '',
      contentField: createContentField('text'),
      argFields,
      fileMissingKeys: new Set(),
      t: identityTranslate,
    })

    expect(result).toEqual([
      { label: '', value: 'figureA', isFile: false, fileMissing: false },
      { label: 'X', value: '10' },
      { label: '缓动', value: '线性' },
    ])
  })
})
