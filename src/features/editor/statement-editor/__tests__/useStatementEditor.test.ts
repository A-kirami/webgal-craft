import '~/__tests__/mocks/i18n'
import '~/__tests__/mocks/router'
import '~/__tests__/mocks/tauri-fs'
import '~/__tests__/mocks/modal-store'

import { beforeEach, describe, expect, it } from 'vitest'
import { commandType } from 'webgal-parser/src/interface/sceneInterface'

import { SAY_CONTINUATION_RAW } from '~/domain/script/codec'
import {
  createEntry,
  createHarness,
  createReactiveHarness,
  flushMicrotasks,
  gameAssetDirMock,
  requireArgField,
  resetStatementEditorRuntime,
  workspaceStoreState,
} from '~/features/editor/__tests__/statement-editor-test-utils'
import { CUSTOM_CONTENT, UNSPECIFIED } from '~/features/editor/command-registry/schema'
import { registerDynamicOptions } from '~/features/editor/dynamic-options/dynamic-options'

import type { ArgField } from '~/features/editor/command-registry/schema'

beforeEach(() => {
  resetStatementEditorRuntime()
})

describe('useStatementEditor 行为', () => {
  it('setTempAnimation 语句显示动画编辑器按钮并隐藏原始 content 字段', () => {
    const { editor } = createHarness('setTempAnimation: [{"duration":0}] -target=fig-left;')

    expect(editor.view.showAnimationEditorButton.value).toBe(true)
    expect(editor.view.basicRenderFields.value.some(field => field.storage === 'content')).toBe(false)
    expect(editor.view.commandRenderFields.value.some(field => field.storage === 'content')).toBe(false)
  })

  it('flag-choice 写回优先走 typed 路径，并清理隐藏依赖参数', () => {
    const { editor, updates } = createHarness('Alice: hello -id -figureId=hero;')
    const figurePositionField = requireArgField(editor, 'figurePosition')

    editor.params.handleArgFieldChange(figurePositionField, 'left')

    const latest = updates.at(-1)
    expect(latest).toBeDefined()
    expect(latest!.parsed.command).toBe(commandType.say)
    expect(latest!.parsed.args).toEqual([
      { key: 'speaker', value: 'Alice' },
      { key: 'left', value: true },
    ])
  })

  it('visibleWhen 变更后会裁剪已隐藏参数（typed 写回场景）', () => {
    const { editor, updates } = createHarness('changeBg: bg.jpg -enter=fadeIn -enterDuration=200;')
    const enterField = requireArgField(editor, 'enter')

    editor.params.handleArgFieldChange(enterField, 'zoomIn')

    const latest = updates.at(-1)
    expect(latest).toBeDefined()
    expect(latest!.parsed.command).toBe(commandType.changeBg)
    expect(latest!.parsed.args).toEqual([{ key: 'enter', value: 'zoomIn' }])
  })

  it('连续修改 typed 参数时应以本地 draft 为准，不依赖外层 entry 回写时序', () => {
    const { editor, updates } = createHarness('changeBg: bg.jpg;')
    const enterField = requireArgField(editor, 'enter')
    const enterDurationField = requireArgField(editor, 'enterDuration')

    editor.params.handleArgFieldChange(enterField, 'fadeIn')
    editor.params.handleArgFieldChange(enterDurationField, '200')

    const latest = updates.at(-1)
    expect(latest).toBeDefined()
    expect(latest!.parsed.command).toBe(commandType.changeBg)
    expect(latest!.parsed.args).toEqual([
      { key: 'enter', value: 'fadeIn' },
      { key: 'enterDuration', value: 200 },
    ])
  })

  it('customizable select 在已有自定义值时能识别 custom token', () => {
    const customHarness = createHarness('setAnimation: bounce -target=node-custom;')
    const customTargetField = requireArgField(customHarness.editor, 'target')
    expect(customHarness.editor.params.getArgSelectValue(customTargetField)).toBe(CUSTOM_CONTENT)
  })

  it('customizable select 切换到 custom token 时不应立即改写参数', () => {
    const { editor, updates } = createHarness('setAnimation: bounce -target=fig-left;')
    const targetField = requireArgField(editor, 'target')

    editor.params.handleArgSelectChange(targetField, CUSTOM_CONTENT)

    expect(updates.length).toBe(0)
  })

  it('静态选项与动态选项分离读取，且 selectable 判定基于合并结果', () => {
    registerDynamicOptions('animationTableEntries', () => ({
      options: [{ label: 'flash (dynamic)', value: 'flash' }],
      loading: false,
    }))

    const { editor } = createHarness('setAnimation: bounce -enter=flash;')
    const enterField: ArgField = {
      storageKey: 'enter',
      field: {
        key: 'enter',
        type: 'choice',
        label: () => 'enter',
        customizable: true,
        dynamicOptionsKey: 'animationTableEntries',
        options: [{ label: () => 'fade (static)', value: 'fade' }],
      },
    }

    expect(editor.params.getArgSelectOptions(enterField)).toEqual([
      { label: 'fade (static)', value: 'fade' },
    ])
    expect(editor.params.getArgDynamicOptions(enterField)).toEqual([
      { label: 'flash (dynamic)', value: 'flash' },
    ])
    expect(editor.params.getArgSelectValue(enterField)).toBe('flash')
  })

  it('可视化编辑标准参数时应保留文本中已有的 extraArgs', () => {
    const { editor, updates } = createHarness('setAnimation: bounce -target=fig-left -x=1;')
    const targetField = requireArgField(editor, 'target')

    editor.params.handleArgFieldChange(targetField, 'fig-right')

    const latest = updates.at(-1)
    expect(latest).toBeDefined()
    expect(latest!.parsed.command).toBe(commandType.setAnimation)
    expect(latest!.parsed.args).toEqual([
      { key: 'target', value: 'fig-right' },
      { key: 'x', value: 1 },
    ])
  })

  it('flattened json combobox 支持动态选项读取与 selectable 判定', () => {
    registerDynamicOptions('animationTableEntries', () => ({
      options: [{ label: 'flash (dynamic)', value: 'flash' }],
      loading: false,
    }))

    const { editor } = createHarness('changeFigure: figure.json -focus={"instant":"flash"};')
    const jsonComboboxField: ArgField = {
      storageKey: 'focus',
      field: {
        key: 'focus.instant',
        type: 'choice',
        label: () => 'focus.instant',
        customizable: true,
        dynamicOptionsKey: 'animationTableEntries',
        options: [],
      },
      jsonMeta: {
        argKey: 'focus',
        fieldKey: 'instant',
      },
    }

    expect(editor.params.getArgDynamicOptions(jsonComboboxField)).toEqual([
      { label: 'flash (dynamic)', value: 'flash' },
    ])
    expect(editor.params.getArgSelectValue(jsonComboboxField)).toBe('flash')
  })

  it('flattened json customizable combobox 未命中选项时返回 CUSTOM_CONTENT', () => {
    registerDynamicOptions('animationTableEntries', () => ({
      options: [{ label: 'flash (dynamic)', value: 'flash' }],
      loading: false,
    }))

    const { editor } = createHarness('changeFigure: figure.json -focus={"instant":"unknown-motion"};')
    const jsonComboboxField: ArgField = {
      storageKey: 'focus',
      field: {
        key: 'focus.instant',
        type: 'choice',
        label: () => 'focus.instant',
        customizable: true,
        dynamicOptionsKey: 'animationTableEntries',
        options: [],
      },
      jsonMeta: {
        argKey: 'focus',
        fieldKey: 'instant',
      },
    }

    expect(editor.params.getArgSelectValue(jsonComboboxField)).toBe(CUSTOM_CONTENT)
  })

  it('flattened json choice 含 UNSPECIFIED 选项时，缺省值应回显为 UNSPECIFIED', () => {
    const { editor } = createHarness('changeFigure: figure.json;')
    const focusInstantField = requireArgField(editor, 'focus.instant')

    expect(editor.params.getArgSelectValue(focusInstantField)).toBe(UNSPECIFIED)
  })

  it('flattened json slider 写回时使用父参数 key 并按 number 存储', () => {
    const { editor, updates } = createHarness('changeFigure: figure.json;')
    const jsonSliderField = requireArgField(editor, 'focus.x')

    editor.params.handleArgFieldChange(jsonSliderField, '0.25')

    const latest = updates.at(-1)
    expect(latest).toBeDefined()
    expect(latest!.parsed.command).toBe(commandType.changeFigure)
    expect(latest!.parsed.args).toEqual([{ key: 'focus', value: '{"x":0.25}' }])
  })

  it('flattened json 连续写入不同子字段时不应互相覆盖', () => {
    const { editor, updates } = createHarness('changeFigure: figure.json;')
    const focusXField = requireArgField(editor, 'focus.x')
    const focusYField = requireArgField(editor, 'focus.y')

    editor.params.handleArgFieldChange(focusXField, '0.2')
    editor.params.handleArgFieldChange(focusYField, '-0.3')

    const latest = updates.at(-1)
    expect(latest).toBeDefined()
    expect(latest!.parsed.command).toBe(commandType.changeFigure)
    expect(latest!.parsed.args).toEqual([{ key: 'focus', value: '{"x":0.2,"y":-0.3}' }])
  })

  it('flattened json file 子字段写回会复用并合并父参数对象', () => {
    const { editor, updates } = createHarness('changeFigure: figure.json -focus={"x":0.5};')
    const jsonFileField: ArgField = {
      storageKey: 'focus',
      field: {
        key: 'focus.asset',
        type: 'file',
        label: () => 'focus.asset',
        fileConfig: {
          assetType: 'figure',
          extensions: ['.png'],
          title: () => 'focus.asset',
        },
      },
      jsonMeta: {
        argKey: 'focus',
        fieldKey: 'asset',
      },
    }

    editor.params.handleArgFieldChange(jsonFileField, 'figure/hero.png')

    const latest = updates.at(-1)
    expect(latest).toBeDefined()
    expect(latest!.parsed.command).toBe(commandType.changeFigure)
    expect(latest!.parsed.args).toEqual([{ key: 'focus', value: '{"x":0.5,"asset":"figure/hero.png"}' }])
  })

  it('编辑命令行内注释时应写回完整语句', () => {
    const { editor, updates } = createHarness('changeBg:bg.jpg;')

    editor.misc.handleInlineCommentChange('after')

    const latest = updates.at(-1)
    expect(latest).toBeDefined()
    expect(latest!.parsed.command).toBe(commandType.changeBg)
    expect(latest!.parsed.inlineComment).toBe('after')
    expect(latest!.rawText).toBe('changeBg:bg.jpg;after')
  })

  it('编辑 say 续写语句的行内注释时应保留续写简写形式', () => {
    const { editor, updates } = createHarness('continued text;')

    editor.misc.handleInlineCommentChange('note')

    const latest = updates.at(-1)
    expect(latest).toBeDefined()
    expect(latest!.parsed.command).toBe(commandType.say)
    expect(latest!.parsed.commandRaw).toBe(SAY_CONTINUATION_RAW)
    expect(latest!.parsed.inlineComment).toBe('note')
    expect(latest!.rawText).toBe('continued text;note')
  })

  // ─── say 命令：标准形式与简写形式 ───

  describe('say 标准形式（say:内容 -speaker=角色）', () => {
    it('命令面板默认 say 语句连续编辑 speaker 和内容时应保留 speaker', () => {
      const { editor, updates } = createHarness('say:;')

      editor.say.handleSpeakerChange('角色A')
      editor.content.handleChange('你好')

      const latest = updates.at(-1)!
      expect(latest.parsed.command).toBe(commandType.say)
      expect(latest.parsed.commandRaw).toBe('角色A')
      expect(latest.rawText).toBe('角色A:你好;')
    })

    it('有 speaker：编辑内容后强制转换为简写形式', () => {
      const { editor, updates } = createHarness('say:你好，世界！ -speaker=角色A;')

      editor.content.handleChange('你好')

      const latest = updates.at(-1)!
      expect(latest.parsed.command).toBe(commandType.say)
      expect(latest.parsed.commandRaw).toBe('角色A')
      expect(latest.rawText).toBe('角色A:你好;')
    })

    it('接续对话（无 speaker）：不应被判定为旁白模式', () => {
      const { editor } = createHarness('say:世界，你好！;')

      expect(editor.say.narrationMode.value).toBe(false)
      expect(editor.say.effectiveSpeaker.value).toBe('')
    })

    it('接续对话（无 speaker）：编辑内容后转为续写简写', () => {
      const { editor, updates } = createHarness('say:世界，你好！;')

      editor.content.handleChange('再见')

      const latest = updates.at(-1)!
      expect(latest.parsed.command).toBe(commandType.say)
      // 续写简写：commandRaw 等于 content
      expect(latest.rawText).toBe('再见;')
    })

    it('旁白（-clear）：编辑内容后转为旁白简写', () => {
      const { editor, updates } = createHarness('say:这是一个旁白。 -clear;')

      editor.content.handleChange('新旁白')

      const latest = updates.at(-1)!
      expect(latest.parsed.command).toBe(commandType.say)
      expect(latest.rawText).toBe(':新旁白;')
    })

    it('切换旁白模式后转为旁白简写', () => {
      const { editor, updates } = createHarness('say:你好 -speaker=角色A;')

      editor.say.toggleNarrationMode()

      const latest = updates.at(-1)!
      expect(latest.parsed.command).toBe(commandType.say)
      expect(latest.rawText).toBe(':你好;')
    })

    it('旁白模式退出后转为续写简写', () => {
      const { editor, updates } = createHarness('say:这是一个旁白。 -clear;')

      // 初始应为旁白模式
      expect(editor.say.narrationMode.value).toBe(true)

      editor.say.toggleNarrationMode()

      const latest = updates.at(-1)!
      expect(latest.parsed.command).toBe(commandType.say)
      expect(latest.rawText).toBe('这是一个旁白。;')
    })
  })

  describe('say 简写形式（角色:内容 / 无冒号 / :旁白）', () => {
    it('有 speaker：编辑内容后保留简写形式和 speaker', () => {
      const { editor, updates } = createHarness('角色A:你好，世界！;')

      editor.content.handleChange('你好')

      const latest = updates.at(-1)!
      expect(latest.parsed.command).toBe(commandType.say)
      expect(latest.parsed.commandRaw).toBe('角色A')
      expect(latest.rawText).toBe('角色A:你好;')
    })

    it('接续对话（无冒号）：编辑内容后不应回写 speaker 前缀', () => {
      const { editor, updates } = createHarness('世界，你好！;')

      editor.content.handleChange('再见')

      const latest = updates.at(-1)!
      expect(latest.parsed.command).toBe(commandType.say)
      expect(latest.parsed.commandRaw).toBe(SAY_CONTINUATION_RAW)
      expect(latest.rawText).toBe('再见;')
    })

    it('接续对话（无冒号，带参数）：编辑内容后不应回写 speaker 前缀', () => {
      const { editor, updates } = createHarness('xxxxxxxxx -concat -notend;')

      editor.content.handleChange('yyyyyyyyy')

      const latest = updates.at(-1)!
      expect(latest.parsed.command).toBe(commandType.say)
      expect(latest.parsed.commandRaw).toBe(SAY_CONTINUATION_RAW)
      expect(latest.parsed.args).toEqual([
        { key: 'concat', value: true },
        { key: 'notend', value: true },
      ])
      expect(latest.rawText).toBe('yyyyyyyyy -concat -notend;')
    })

    it('接续对话（无冒号）：编辑参数后不应回写 speaker 前缀', () => {
      const { editor, updates } = createHarness('xxxxxxxxx -concat -notend;')
      const concatField = requireArgField(editor, 'concat')

      editor.params.handleArgFieldChange(concatField, false)

      const latest = updates.at(-1)!
      expect(latest.parsed.command).toBe(commandType.say)
      expect(latest.parsed.commandRaw).toBe(SAY_CONTINUATION_RAW)
      expect(latest.parsed.args).toEqual([{ key: 'notend', value: true }])
      expect(latest.rawText).toBe('xxxxxxxxx -notend;')
    })

    it('接续对话（无冒号，内容为空）：编辑参数不应丢失 args 前的空格', () => {
      const { editor, updates } = createHarness(' -concat -notend;')
      const concatField = requireArgField(editor, 'concat')

      editor.params.handleArgFieldChange(concatField, false)

      const latest = updates.at(-1)!
      expect(latest.parsed.command).toBe(commandType.say)
      expect(latest.rawText).toBe(' -notend;')
      expect(latest.rawText.startsWith(' -')).toBe(true)
    })

    it('旁白（冒号前缀）：编辑内容后保留旁白形式', () => {
      const { editor, updates } = createHarness(':这是一句旁白。;')

      editor.content.handleChange('新旁白')

      const latest = updates.at(-1)!
      expect(latest.parsed.command).toBe(commandType.say)
      expect(latest.parsed.commandRaw).toBe('')
      expect(latest.rawText).toBe(':新旁白;')
    })
  })

  it('say 清空 speaker 时不应自动切换为旁白模式', async () => {
    const { editor } = createReactiveHarness('Alice: hello;')

    expect(editor.say.narrationMode.value).toBe(false)

    editor.say.handleSpeakerChange('')
    await flushMicrotasks(3)

    expect(editor.say.narrationMode.value).toBe(false)
  })

  it('fileRootPaths 在异步竞态下不应被旧请求结果覆盖', async () => {
    workspaceStoreState.CWD = '/mock/game'

    let resolveBackgroundPath: ((path: string) => void) | undefined
    const backgroundPathPromise = new Promise<string>((resolve) => {
      resolveBackgroundPath = resolve
    })

    gameAssetDirMock.mockImplementation(async (_cwd: string, assetType: string): Promise<string> => {
      if (assetType === 'background') {
        return backgroundPathPromise
      }
      return `/mock/${assetType}`
    })

    const { editor, entry } = createReactiveHarness('changeBg: bg.jpg;')
    await flushMicrotasks(3)

    entry.value = createEntry('wait: 100;')
    await flushMicrotasks(3)

    resolveBackgroundPath?.('/mock/background')
    await flushMicrotasks(3)

    expect(editor.resource.fileRootPaths.value).toEqual({})
  })
})
