import { describe, expect, it } from 'vitest'

import { buildTextEditorOptions } from '~/helper/text-editor-options'

describe('buildTextEditorOptions 配置映射', () => {
  it('会把编辑器设置映射到 Monaco 选项', () => {
    expect(buildTextEditorOptions({
      automaticLayout: true,
    }, {
      fontFamily: 'Fira Code',
      fontSize: 16,
      minimap: true,
      wordWrap: true,
    })).toEqual({
      automaticLayout: true,
      fontFamily: 'Fira Code',
      fontSize: 16,
      minimap: {
        enabled: true,
      },
      wordWrap: 'on',
    })
  })

  it('会在关闭设置时输出 off 和 disabled', () => {
    expect(buildTextEditorOptions({}, {
      fontFamily: 'Mono',
      fontSize: 14,
      minimap: false,
      wordWrap: false,
    })).toMatchObject({
      fontFamily: 'Mono',
      fontSize: 14,
      minimap: {
        enabled: false,
      },
      wordWrap: 'off',
    })
  })

  it('会保留基础 minimap 配置和其他基础选项', () => {
    expect(buildTextEditorOptions({
      autoIndent: 'brackets',
      minimap: {
        renderCharacters: false,
        side: 'right',
      },
    }, {
      fontFamily: 'Mono',
      fontSize: 15,
      minimap: true,
      wordWrap: true,
    })).toEqual({
      autoIndent: 'brackets',
      fontFamily: 'Mono',
      fontSize: 15,
      minimap: {
        enabled: true,
        renderCharacters: false,
        side: 'right',
      },
      wordWrap: 'on',
    })
  })
})
