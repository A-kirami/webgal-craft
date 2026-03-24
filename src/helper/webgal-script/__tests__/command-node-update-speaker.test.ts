import { describe, expect, it } from 'vitest'
import { commandType } from 'webgal-parser/src/interface/sceneInterface'

import { parseCommandNode, SAY_CONTINUATION_RAW, serializeCommandNode } from '~/helper/webgal-script/codec'
import { updateCommandNodeSpeaker } from '~/helper/webgal-script/update'

import { mustParse } from './utils'

describe('命令节点说话人更新', () => {
  it('更新 say 命令的说话人', () => {
    const sentence = mustParse('Alice: hello -next;')
    const node = parseCommandNode(sentence)
    const updated = updateCommandNodeSpeaker(node, 'Bob')
    expect(updated).toBeDefined()

    const serialized = serializeCommandNode(updated!)
    expect(serialized.command).toBe(commandType.say)
    expect(serialized.commandRaw).toBe('Bob')
    expect(serialized.content).toBe('hello')
    expect(serialized.args).toEqual([{ key: 'next', value: true }])
  })

  it('清空说话人后序列化为续写形式', () => {
    const sentence = mustParse('Alice: hello -next;')
    const node = parseCommandNode(sentence)
    const updated = updateCommandNodeSpeaker(node, '')
    expect(updated).toBeDefined()

    const serialized = serializeCommandNode(updated!)
    expect(serialized.command).toBe(commandType.say)
    // 续写形式：commandRaw 为 SAY_CONTINUATION_RAW 哨兵值
    expect(serialized.commandRaw).toBe(SAY_CONTINUATION_RAW)
    expect(serialized.args).toEqual([{ key: 'next', value: true }])
  })

  it('非 say 命令返回 undefined', () => {
    const sentence = mustParse('changeBg: bg.jpg;')
    const node = parseCommandNode(sentence)
    const updated = updateCommandNodeSpeaker(node, 'Bob')
    expect(updated).toBeUndefined()
  })
})
