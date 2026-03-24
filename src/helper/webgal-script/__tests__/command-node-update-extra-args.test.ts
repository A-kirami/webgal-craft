import { describe, expect, it } from 'vitest'

import { parseCommandNode, serializeCommandNode } from '~/helper/webgal-script/codec'
import {
  readTypedCommandNodeExtraArgs,
  updateTypedCommandNodeExtraArgs,
} from '~/helper/webgal-script/update'

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
})
