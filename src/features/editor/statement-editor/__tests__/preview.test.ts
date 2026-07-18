import { describe, expect, it } from 'vitest'
import { commandType } from 'webgal-parser/src/interface/sceneInterface'

import { getCommandConfig } from '~/features/editor/command-registry'
import { readArgFields } from '~/features/editor/command-registry/schema'
import { buildStatementPreviewParams } from '~/features/editor/statement-editor/preview'
import { EMPTY_SCENE_AUTOCOMPLETE_OPTIONS } from '~/features/editor/statement-editor/scene-autocomplete'

import type { ISentence } from 'webgal-parser/src/interface/sceneInterface'
import type { ArgField, EditorField } from '~/features/editor/command-registry/schema'

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

describe('buildStatementPreviewParams', () => {
  it('unsupported 语句展示原始文本', () => {
    const result = buildStatementPreviewParams({
      autocompleteOptions: EMPTY_SCENE_AUTOCOMPLETE_OPTIONS,
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
      autocompleteOptions: EMPTY_SCENE_AUTOCOMPLETE_OPTIONS,
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
      autocompleteOptions: EMPTY_SCENE_AUTOCOMPLETE_OPTIONS,
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

  it('say 关联位置立绘显示语义名称', () => {
    const result = buildStatementPreviewParams({
      autocompleteOptions: EMPTY_SCENE_AUTOCOMPLETE_OPTIONS,
      parsed: createSentence({
        commandRaw: 'Alice',
        content: 'Hi',
        args: [{ key: 'left', value: true }],
      }),
      statementType: 'say',
      entryRawText: 'Alice:Hi -left;',
      previousSpeaker: '',
      contentField: createContentField('text'),
      argFields: readArgFields(getCommandConfig(commandType.say)),
      fileMissingKeys: new Set(),
      t: identityTranslate,
    })

    expect(result).toEqual([
      { label: 'Alice', value: 'Hi', truncate: true },
      {
        color: undefined,
        fileMissing: false,
        isFile: false,
        label: 'edit.visualEditor.params.associatedFigure',
        value: 'edit.visualEditor.options.figureLeft',
      },
    ])
  })

  it('say 自由立绘 ID 显示原始值', () => {
    const result = buildStatementPreviewParams({
      autocompleteOptions: EMPTY_SCENE_AUTOCOMPLETE_OPTIONS,
      parsed: createSentence({
        commandRaw: 'Alice',
        content: 'Hi',
        args: [{ key: 'figureId', value: 'hero' }],
      }),
      statementType: 'say',
      entryRawText: 'Alice:Hi -figureId=hero;',
      previousSpeaker: '',
      contentField: createContentField('text'),
      argFields: readArgFields(getCommandConfig(commandType.say)),
      fileMissingKeys: new Set(),
      t: identityTranslate,
    })

    expect(result).toEqual([
      { label: 'Alice', value: 'Hi', truncate: true },
      {
        color: undefined,
        fileMissing: false,
        isFile: false,
        label: 'edit.visualEditor.params.associatedFigure',
        value: 'hero',
      },
    ])
  })

  it('content select/file 分支可正确展示匹配值与缺失状态', () => {
    const selectResult = buildStatementPreviewParams({
      autocompleteOptions: EMPTY_SCENE_AUTOCOMPLETE_OPTIONS,
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
      autocompleteOptions: EMPTY_SCENE_AUTOCOMPLETE_OPTIONS,
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

  it('choose 默认分支显示选项文本而不是存储序号', () => {
    const result = buildStatementPreviewParams({
      autocompleteOptions: EMPTY_SCENE_AUTOCOMPLETE_OPTIONS,
      parsed: createSentence({
        command: commandType.choose,
        commandRaw: 'choose',
        content: '继续:next.txt|返回:back.txt',
        args: [{ key: 'defaultChoose', value: 2 }],
      }),
      statementType: 'command',
      entryRawText: 'choose:继续:next.txt|返回:back.txt -defaultChoose=2;',
      previousSpeaker: '',
      contentField: createContentField('file'),
      argFields: readArgFields(getCommandConfig(commandType.choose)),
      fileMissingKeys: new Set(),
      t: identityTranslate,
    })

    expect(result).toContainEqual({
      label: 'edit.visualEditor.params.defaultChoose',
      value: '返回',
    })
  })

  it('choose 默认分支未命名或索引非法时不回退显示存储序号', () => {
    const buildChoosePreview = (content: string, defaultChoose: number) => buildStatementPreviewParams({
      autocompleteOptions: EMPTY_SCENE_AUTOCOMPLETE_OPTIONS,
      parsed: createSentence({
        command: commandType.choose,
        commandRaw: 'choose',
        content,
        args: [{ key: 'defaultChoose', value: defaultChoose }],
      }),
      statementType: 'command',
      entryRawText: '',
      previousSpeaker: '',
      contentField: createContentField('file'),
      argFields: readArgFields(getCommandConfig(commandType.choose)),
      fileMissingKeys: new Set(),
      t: identityTranslate,
    })

    const unnamedResult = buildChoosePreview(':next.txt|返回:back.txt', 1)
    const invalidResult = buildChoosePreview('继续:next.txt|返回:back.txt', 3)

    expect(unnamedResult).toContainEqual({
      label: 'edit.visualEditor.params.defaultChoose',
      value: 'edit.visualEditor.unnamedChoice',
    })
    expect(invalidResult.some(item => item.label === 'edit.visualEditor.params.defaultChoose')).toBe(false)
  })

  it('text autocomplete 参数使用统一解析后的候选名称', () => {
    const result = buildStatementPreviewParams({
      autocompleteOptions: {
        ...EMPTY_SCENE_AUTOCOMPLETE_OPTIONS,
        sceneLabels: [{ label: '开始', value: 'start' }],
      },
      parsed: createSentence({
        command: commandType.changeFigure,
        content: 'start',
        args: [{ key: 'target', value: 'fig-left' }],
      }),
      statementType: 'command',
      entryRawText: '',
      previousSpeaker: '',
      contentField: createContentField('text', {
        variant: 'autocomplete',
        autocomplete: [{ type: 'scene', collection: 'sceneLabels' }],
      }),
      argFields: [
        createArgField('target', 'text', {
          field: {
            variant: 'autocomplete',
            autocomplete: [{
              type: 'static',
              options: [{ value: 'fig-left', label: () => '左侧立绘' }],
            }],
          },
        }),
      ],
      fileMissingKeys: new Set(),
      t: identityTranslate,
    })

    expect(result).toEqual([
      { label: '', value: '开始', isFile: false, fileMissing: false },
      { label: 'target', value: '左侧立绘', color: undefined, isFile: false, fileMissing: false },
    ])
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
      autocompleteOptions: EMPTY_SCENE_AUTOCOMPLETE_OPTIONS,
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
      autocompleteOptions: EMPTY_SCENE_AUTOCOMPLETE_OPTIONS,
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
