import { describe, expect, it } from 'vitest'
import { commandType } from 'webgal-parser/src/interface/sceneInterface'

import { categoryTheme, commandEntries, commandPanelCategories, getCommandConfig } from '../index'
import { readArgFields, readContentField, readEditorFields, resolveI18n } from '../schema'

describe('命令注册表完整性', () => {
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
})
