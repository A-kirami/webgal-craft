import { describe, expect, it } from 'vitest'

import { parseCommandNode, serializeCommandNode } from '~/domain/script/codec'
import { readCallSceneCustomArgs, readTypedCommandNodeExtraArgs, updateCallSceneCustomArgs, updateTypedCommandNodeExtraArgs } from '~/domain/script/update'

import { mustParse } from './utils'

describe('类型化命令节点额外参数更新', () => {
  it('读取并更新类型化命令的额外参数', () => {
    const sentence = mustParse('setVar: score=10 -global -x=1 -y=2;')
    const node = parseCommandNode(sentence)
    if (!('extraArgs' in node)) {
      throw new Error('expected typed command node')
    }

    expect(readTypedCommandNodeExtraArgs(node)).toEqual([
      { key: 'x', value: 1 },
      { key: 'y', value: 2 },
    ])

    const updated = updateTypedCommandNodeExtraArgs(node, [
      { key: 'speed', value: 'fast' },
    ])
    const serialized = serializeCommandNode(updated)
    expect(serialized.args).toEqual([
      { key: 'global', value: true },
      { key: 'speed', value: 'fast' },
    ])
  })

  it('更新 callScene 动态参数时保留受管参数', () => {
    const node = parseCommandNode(mustParse('callScene:battle.txt -when=hp>0 -writeReturnTo=result -enemy=slime;'))
    const updated = updateCallSceneCustomArgs(node, [
      { key: 'when', value: 'hp>0' },
      { key: 'difficulty', value: 'hard' },
      { key: '', value: 'discarded' },
    ])

    expect(updated).toBeDefined()
    expect(readCallSceneCustomArgs(updated!)).toEqual([
      { key: 'when', value: 'hp>0' },
      { key: 'difficulty', value: 'hard' },
    ])
    expect(serializeCommandNode(updated!).args).toEqual([
      { key: 'writeReturnTo', value: 'result' },
      { key: 'when', value: 'hp>0' },
      { key: 'difficulty', value: 'hard' },
    ])
  })
})
