import { describe, expect, it } from 'vitest'
import { commandType } from 'webgal-parser/src/interface/sceneInterface'

import { parseCommandNode, serializeCommandNode } from '~/helper/webgal-script/codec'
import { updateCommandNodeInlineComment } from '~/helper/webgal-script/update'

import { mustParse } from './utils'

describe('命令节点行内注释更新', () => {
  it('更新类型化命令的行内注释', () => {
    const sentence = mustParse('setVar: score=10;')
    const node = parseCommandNode(sentence)
    const updated = updateCommandNodeInlineComment(node, 'edited')
    const serialized = serializeCommandNode(updated)

    expect(serialized.command).toBe(commandType.setVar)
    expect(serialized.inlineComment).toBe('edited')
  })

  it('更新通用命令的行内注释', () => {
    const sentence = mustParse('bgm: bgm.ogg;')
    const node = parseCommandNode(sentence)
    const updated = updateCommandNodeInlineComment(node, 'note')
    const serialized = serializeCommandNode(updated)

    expect(serialized.command).toBe(commandType.bgm)
    expect(serialized.inlineComment).toBe('note')
  })
})
