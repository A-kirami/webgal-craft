import { describe, expect, it } from 'vitest'
import { commandType } from 'webgal-parser/src/interface/sceneInterface'

import { LATEST_ENGINE_RUNTIME_CAPABILITIES, LEGACY_ENGINE_RUNTIME_CAPABILITIES } from '~/domain/engine/runtime-capabilities'
import { parseSentence } from '~/domain/script/parser'
import { serializeSentence } from '~/domain/script/serialize'

import { IMAGE_EXTENSIONS } from '../common-params'
import { categoryTheme, commandEntries, commandPanelCategories, getCommandConfig, getCommandId, getFactoryDefaultCommandText } from '../index'
import { isRuntimeCapabilitySupported, readArgFields, readContentField, readEditorFields, resolveI18n } from '../schema'

describe('命令注册表完整性', () => {
  it('所有命令注册项都有唯一稳定标识', () => {
    const commandIds = commandEntries.map(entry => getCommandId(entry.type))

    expect(commandIds).not.toContain(undefined)
    expect(new Set(commandIds).size).toBe(commandEntries.length)
  })

  it('源条目的命令类型应唯一', () => {
    const seen = new Set<commandType>()
    for (const entry of commandEntries) {
      expect(seen.has(entry.type)).toBe(false)
      seen.add(entry.type)
    }
  })

  it('每个条目应包含 fields 数组', () => {
    for (const entry of commandEntries) {
      expect(Array.isArray(entry.fields)).toBe(true)
    }
  })

  it('每个开关字段均提供开启和关闭状态说明', () => {
    let switchFieldCount = 0
    for (const entry of commandEntries) {
      for (const { field } of readEditorFields(entry)) {
        if (field.type !== 'switch') {
          continue
        }

        switchFieldCount++
        expect(field.tooltip).toMatchObject({
          on: expect.anything(),
          off: expect.anything(),
        })
      }
    }

    expect(switchFieldCount).toBeGreaterThan(0)
  })

  it('字段存储类型应有效且每个命令的 arg key 唯一', () => {
    for (const entry of commandEntries) {
      const argKeys = new Set<string>()
      let contentCount = 0
      let commandRawCount = 0

      for (const { storage } of entry.fields) {
        if (storage === 'content') {
          contentCount++
        } else if (storage === 'commandRaw') {
          commandRawCount++
        } else {
          expect(argKeys.has(storage.arg)).toBe(false)
          argKeys.add(storage.arg)
        }
      }

      expect(contentCount).toBeLessThanOrEqual(1)
      expect(commandRawCount).toBeLessThanOrEqual(1)
    }
  })

  it('file 类型字段应包含 fileConfig', () => {
    for (const entry of commandEntries) {
      for (const { field } of entry.fields) {
        if (field.type === 'file') {
          expect(field.fileConfig).toBeDefined()
        }
      }
    }
  })

  it('readEditorFields/readArgFields 应保持 key 唯一性', () => {
    for (const entry of commandEntries) {
      const editorFields = readEditorFields(entry)
      const argFields = readArgFields(entry)

      // content 字段数量应与 schema 一致
      const hasContent = entry.fields.some(f => f.storage === 'content')
      if (hasContent) {
        expect(editorFields.some(field => field.storage === 'content')).toBe(true)
      }

      // argFields 的 key 应唯一（json-object 展平后）
      const keys = argFields.map(field => field.field.key)
      expect(new Set(keys).size).toBe(keys.length)
    }
  })

  it('json-object 配对元数据在展平后应被规范化', () => {
    const entry = commandEntries.find(item => item.type === commandType.changeFigure)
    expect(entry).toBeDefined()

    const argFields = readArgFields(entry!)
    const focusX = argFields.find(field => field.field.key === 'focus.x')
    const focusY = argFields.find(field => field.field.key === 'focus.y')

    expect(focusX?.field.type).toBe('number')
    expect(focusY?.field.type).toBe('number')

    if (focusX?.field.type === 'number') {
      expect(focusX.field.panelPairKey).toBe('focus.y')
      expect(focusX.field.panelWidget).toBe('xy-pad')
    }

    if (focusY?.field.type === 'number') {
      expect(focusY.field.panelPairKey).toBe('focus.x')
      expect(focusY.field.panelWidget).toBe('xy-pad')
    }
  })

  it('comment 命令保留内部分类与主题映射，但不出现在命令面板 tabs 中', () => {
    const sourceEntry = commandEntries.find(entry => entry.type === commandType.comment)
    expect(sourceEntry).toBeDefined()
    expect(sourceEntry?.category).toBe('comment')
    expect(resolveI18n(sourceEntry?.label, (key: string) => key)).toBe('edit.visualEditor.commands.comment')
    expect(resolveI18n(sourceEntry?.description, (key: string) => key)).toBe('edit.visualEditor.commandDescriptions.comment')
    expect(readEditorFields(sourceEntry!).some(field => field.storage === 'content')).toBe(true)

    const config = getCommandConfig(commandType.comment)
    expect(config).toBe(sourceEntry)
    expect(categoryTheme.comment).toBeDefined()
    expect(commandPanelCategories).not.toContain('comment')
  })

  it('未知命令应返回兜底配置', () => {
    const unknown = getCommandConfig(999 as commandType)
    expect(resolveI18n(unknown.label, (key: string) => key)).toBe('edit.visualEditor.commands.unknown')
    expect(unknown.fields).toEqual([])
  })

  it('路径型动态 combobox 字段显式声明 path grouping', () => {
    const setAnimation = commandEntries.find(entry => entry.type === commandType.setAnimation)
    const changeFigure = commandEntries.find(entry => entry.type === commandType.changeFigure)

    expect(setAnimation).toBeDefined()
    expect(changeFigure).toBeDefined()

    const setAnimationContent = setAnimation?.fields.find(field => field.storage === 'content')?.field
    const changeFigureFields = readEditorFields(changeFigure!)
    const motionField = changeFigureFields.find(field => field.key === 'motion')?.field
    const expressionField = changeFigureFields.find(field => field.key === 'expression')?.field

    expect(setAnimationContent).toMatchObject({
      type: 'choice',
      variant: 'combobox',
      grouping: { mode: 'path' },
    })
    expect(motionField).toMatchObject({
      type: 'choice',
      variant: 'combobox',
      grouping: { mode: 'path' },
    })
    expect(expressionField).toMatchObject({
      type: 'choice',
      variant: 'combobox',
      grouping: { mode: 'path' },
    })
  })

  it('changeFigure 位置字段为面板声明图标位置控件', () => {
    const fields = readEditorFields(getCommandConfig(commandType.changeFigure))
    const positionField = fields.find(field => field.key === 'position')?.field

    expect(positionField).toMatchObject({
      type: 'choice',
      variant: { panel: 'figure-position' },
    })
  })

  it('changeFigureDiff 复用图片立绘的位置与口型眨眼图字段', () => {
    const changeFigureFields = readEditorFields(getCommandConfig(commandType.changeFigure))
    const diffFields = readEditorFields(getCommandConfig(commandType.changeFigureDiff))

    // 先钉住字段集合本身：只比较两边相等的话，两边同步丢失同一个字段仍然是绿的
    const sharedKeys = ['position', 'animationFlag', 'mouthOpen', 'mouthHalfOpen', 'mouthClose', 'eyesOpen', 'eyesClose']
    expect(diffFields.map(field => field.key).filter(key => sharedKeys.includes(key))).toEqual(sharedKeys)

    expect(diffFields.find(field => field.key === 'position')?.field).toMatchObject({
      type: 'choice',
      mode: 'flag',
      variant: { panel: 'figure-position' },
    })

    // 位置与口型眨眼图两处逐字段同形，避免长期漂移
    for (const key of sharedKeys) {
      expect(diffFields.find(field => field.key === key)?.field)
        .toEqual(changeFigureFields.find(field => field.key === key)?.field)
    }
  })

  it('changeFigureDiff 对模型内容隐藏口型眨眼图字段', () => {
    const diffFields = readEditorFields(getCommandConfig(commandType.changeFigureDiff))
    const mouthOpen = diffFields.find(field => field.key === 'mouthOpen')?.field

    expect(diffFields.find(field => field.key === 'animationFlag')?.field.visibleWhenContent?.('live2d/hero.json')).toBe(false)
    expect(diffFields.find(field => field.key === 'animationFlag')?.field.visibleWhenContent?.('smile.png')).toBe(true)
    expect(mouthOpen?.visibleWhenContent?.('spine/hero.skel')).toBe(false)
  })

  it('changeFigureDiff 按 4.6.5 能力门控且不提供效果编辑器', () => {
    const entry = commandEntries.find(item => item.type === commandType.changeFigureDiff)
    expect(entry).toBeDefined()
    expect(entry?.requiredCapability).toBe('changeFigureDiff')
    expect(entry?.hasEffectEditor).toBeUndefined()

    expect(isRuntimeCapabilitySupported(entry!, LATEST_ENGINE_RUNTIME_CAPABILITIES)).toBe(true)
    expect(isRuntimeCapabilitySupported(entry!, LEGACY_ENGINE_RUNTIME_CAPABILITIES)).toBe(false)

    // 引擎忽略变换与入退场参数，面板不能提供写入入口
    const keys = readArgFields(getCommandConfig(commandType.changeFigureDiff))
      .map(item => item.field.key)
    expect(keys).not.toContain('transform')
    expect(keys).not.toContain('duration')
    expect(keys).not.toContain('enter')
    expect(keys).not.toContain('exit')
    expect(keys).not.toContain('motion')
    expect(keys).not.toContain('expression')
    expect(keys).not.toContain('blendMode')
  })

  it('changeFigureDiff 的内容只接受图片扩展名', () => {
    const content = readContentField(getCommandConfig(commandType.changeFigureDiff))

    expect(content).toMatchObject({
      type: 'file',
      fileConfig: { assetType: 'figure', extensions: IMAGE_EXTENSIONS },
    })
  })

  it('changeFigureDiff 的工厂默认语句可稳定往返', () => {
    const text = getFactoryDefaultCommandText(commandType.changeFigureDiff)

    expect(text).toBe('changeFigureDiff:;')
    expect(parseSentence(text)).toMatchObject({
      command: commandType.changeFigureDiff,
      args: [],
    })
    expect(serializeSentence(parseSentence(text)!)).toBe(text)
  })

  it('立绘引用和标签名称字段声明对应 autocomplete 来源', () => {
    const sayFields = readEditorFields(getCommandConfig(commandType.say))
    const associatedFigureField = sayFields.find(field => field.key === 'figureId')?.field
    expect(associatedFigureField).toMatchObject({
      type: 'text',
      variant: 'autocomplete',
      autocomplete: expect.arrayContaining([{ type: 'scene', collection: 'figureIds', groupLabel: expect.any(Function) }]),
    })
    expect(sayFields.some(field => field.key === 'figurePosition')).toBe(false)

    const argCases = [
      { type: commandType.changeFigure, key: 'id', collection: 'figureIds' },
      { type: commandType.playEffect, key: 'id', collection: 'soundEffectIds' },
    ] as const
    for (const { type, key, collection } of argCases) {
      const field = readEditorFields(getCommandConfig(type)).find(item => item.key === key)?.field
      expect(field).toMatchObject({
        type: 'text',
        variant: 'autocomplete',
        autocomplete: [{ type: 'scene', collection }],
      })
    }

    const contentCommands = [commandType.label, commandType.jumpLabel]
    for (const type of contentCommands) {
      expect(readContentField(getCommandConfig(type))).toMatchObject({
        type: 'text',
        variant: 'autocomplete',
        autocomplete: [{ type: 'scene', collection: 'sceneLabels' }],
      })
    }
  })

  it('pixi 特效名使用带内置候选的 autocomplete 文本字段', () => {
    const pixiContent = readContentField(getCommandConfig(commandType.pixi))

    if (pixiContent?.type !== 'text' || pixiContent.variant !== 'autocomplete') {
      throw new TypeError('pixi content field must be an autocomplete text field')
    }

    const [source] = pixiContent.autocomplete
    if (source?.type !== 'static') {
      throw new TypeError('pixi autocomplete must use a static source')
    }
    expect(source.options.map(option => option.value)).toEqual([
      'rain',
      'snow',
      'heavySnow',
      'cherryBlossoms',
    ])
  })

  it('变换写入模式控件只按引擎能力切换', () => {
    // 控件列表由注册表静态派生、与语句 args 无关，所以新引擎上旧参数残余不会改变控件数量
    const writeModeKeys = (type: commandType, capabilities: typeof LATEST_ENGINE_RUNTIME_CAPABILITIES) =>
      readArgFields(getCommandConfig(type), capabilities)
        .map(item => item.field.key)
        .filter(key => ['transformFrom', 'writeDefault', 'ignoreDefault'].includes(key))

    for (const type of [commandType.setTransform, commandType.setAnimation, commandType.setTempAnimation]) {
      expect(writeModeKeys(type, LATEST_ENGINE_RUNTIME_CAPABILITIES)).toEqual(['transformFrom'])
      expect(writeModeKeys(type, LEGACY_ENGINE_RUNTIME_CAPABILITIES)).toEqual(['writeDefault', 'ignoreDefault'])
    }
  })

  it('setTransition 的 ignoreDefault 语义独立于变换写入模式', () => {
    const keys = readArgFields(getCommandConfig(commandType.setTransition), LATEST_ENGINE_RUNTIME_CAPABILITIES)
      .map(item => item.field.key)

    expect(keys).toContain('ignoreDefault')
  })

  it('filmMode 开关关闭时写入空内容以恢复普通画面', () => {
    const filmMode = readContentField(getCommandConfig(commandType.filmMode))

    expect(filmMode).toMatchObject({
      type: 'switch',
      onValue: 'on',
      offValue: '',
    })
  })
})
