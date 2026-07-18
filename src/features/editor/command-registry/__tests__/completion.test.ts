import { describe, expect, it } from 'vitest'
import { commandType } from 'webgal-parser/src/interface/sceneInterface'

import { buildArgumentCompletionInfo } from '~/features/editor/command-registry/completion'

const t = (key: string) => key

describe('buildArgumentCompletionInfo', () => {
  function keysFor(command: commandType): string[] {
    return buildArgumentCompletionInfo(command, t).map(item => item.key)
  }

  it('从命令注册表派生参数键、插入形式和说明', () => {
    const input = buildArgumentCompletionInfo(commandType.getUserInput, t)

    expect(input).toContainEqual({
      key: 'ruleButtonText',
      detail: 'edit.visualEditor.params.ruleButtonText',
      simplified: false,
    })
    expect(buildArgumentCompletionInfo(commandType.wait, t)).toContainEqual({
      key: 'nobreak',
      detail: 'edit.visualEditor.params.nobreak',
      simplified: true,
    })
  })

  it('只向适用的命令推荐新增参数', () => {
    expect(keysFor(commandType.changeBg)).toEqual(expect.arrayContaining(['continue', 'order', 'ignoreDefault']))
    expect(keysFor(commandType.changeBg)).not.toContain('parallel')
    expect(keysFor(commandType.unlockCg)).toContain('order')
    expect(keysFor(commandType.unlockBgm)).not.toContain('order')
    expect(keysFor(commandType.setAnimation)).toEqual(expect.arrayContaining(['continue', 'parallel', 'ignoreDefault']))
  })

  it('保留只属于文本语法的既有补全', () => {
    expect(keysFor(commandType.say)).toEqual(expect.arrayContaining(['when', 'left', 'right', 'center']))
  })
})
