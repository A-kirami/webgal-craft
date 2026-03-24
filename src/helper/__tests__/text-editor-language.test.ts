import { describe, expect, it } from 'vitest'

import { resolveTextEditorLanguage } from '~/helper/text-editor-language'

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

  it('场景文件固定返回 webgalscript', () => {
    expect(resolveTextEditorLanguage({
      kind: 'scene',
      path: '/game/scene.txt',
    }, registeredLanguages)).toBe('webgalscript')
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
