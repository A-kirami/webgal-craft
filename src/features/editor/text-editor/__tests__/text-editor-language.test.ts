import { describe, expect, it } from 'vitest'

import { resolveWebgalScriptConfigKey } from '~/domain/script/parser'
import {
  resolveTextEditorLanguage,
  resolveWebgalScriptLanguageId,
  WEBGAL_SCRIPT_LANGUAGE_ID,
} from '~/features/editor/text-editor/text-editor-language'

import type { EngineRuntimeCapabilities } from '~/domain/engine/runtime-capabilities'

const languageIdFor = (capabilities: Pick<EngineRuntimeCapabilities, 'changeFigureDiff' | 'sceneSemantics'>) =>
  resolveWebgalScriptLanguageId(resolveWebgalScriptConfigKey(capabilities))

describe('resolveTextEditorLanguage', () => {
  const registeredLanguages = [
    {
      extensions: ['.md'],
      id: 'markdown',
    },
    {
      extensions: ['.yaml', '.yml'],
      id: 'yaml',
    },
  ]

  it('新运行时场景文件使用完整 WebGAL 语法高亮', () => {
    expect(resolveTextEditorLanguage({
      kind: 'scene',
      path: '/game/scene.txt',
      runtimeCapabilities: { changeFigureDiff: true, sceneSemantics: true },
    }, registeredLanguages)).toBe(WEBGAL_SCRIPT_LANGUAGE_ID)
  })

  it('旧运行时场景文件使用不含 return 命令的语法高亮', () => {
    const capabilities = { changeFigureDiff: false, sceneSemantics: false }

    expect(resolveTextEditorLanguage({
      kind: 'scene',
      path: '/game/scene.txt',
      runtimeCapabilities: capabilities,
    }, registeredLanguages)).toBe(languageIdFor(capabilities))
  })

  it('只缺立绘差分能力的运行时保留 return，只降级该命令的高亮', () => {
    const capabilities = { changeFigureDiff: false, sceneSemantics: true }

    expect(resolveTextEditorLanguage({
      kind: 'scene',
      path: '/game/scene.txt',
      runtimeCapabilities: capabilities,
    }, registeredLanguages)).toBe(languageIdFor(capabilities))
  })

  it('动画文件固定返回 json', () => {
    expect(resolveTextEditorLanguage({
      kind: 'animation',
      path: '/game/effect.anim',
    }, registeredLanguages)).toBe('json')
  })

  it('普通文件会按扩展名匹配注册语言', () => {
    expect(resolveTextEditorLanguage({
      kind: 'template',
      path: '/game/docs/readme.MD',
    }, registeredLanguages)).toBe('markdown')
  })

  it('会处理 Windows 路径并支持多个扩展名', () => {
    expect(resolveTextEditorLanguage({
      kind: 'file',
      path: String.raw`C:\game\config\dialogue.yml`,
    }, registeredLanguages)).toBe('yaml')
  })

  it('未知扩展名或缺失扩展名时回退到 plaintext', () => {
    expect(resolveTextEditorLanguage({
      kind: 'file',
      path: '/game/assets/archive.bin',
    }, registeredLanguages)).toBe('plaintext')

    expect(resolveTextEditorLanguage({
      kind: 'file',
      path: '/game/assets/README',
    }, registeredLanguages)).toBe('plaintext')
  })
})
