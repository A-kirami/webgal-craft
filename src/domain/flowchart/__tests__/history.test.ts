import { describe, expect, it } from 'vitest'

import { createDefaultFlowchartDocument } from '../codec'
import {
  createFlowchartHistory,
  recordFlowchartChange,
  redoFlowchartChange,
  undoFlowchartChange,
} from '../history'

const defaults = {
  mainFlowchartName: '主线剧情',
  nodeTitle: '节点',
  rootNodeTitle: '起点',
}

const first = createDefaultFlowchartDocument(defaults)
const second = { ...first, flowcharts: [{ ...first.flowcharts[0]!, name: '改名后' }] }
const third = { ...first, flowcharts: [{ ...first.flowcharts[0]!, name: '再改一次' }] }

describe('流程图撤销与重做', () => {
  it('撤销回到上一次提交的文档，重做回到最新文档', () => {
    let history = createFlowchartHistory()
    history = recordFlowchartChange(history, first)
    history = recordFlowchartChange(history, second)

    const undone = undoFlowchartChange(history, third)
    expect(undone?.document).toEqual(second)

    const redone = redoFlowchartChange(undone!.history, undone!.document)
    expect(redone?.document).toEqual(third)
  })

  it('没有历史时撤销与重做返回 undefined', () => {
    const history = createFlowchartHistory()
    expect(undoFlowchartChange(history, first)).toBeUndefined()
    expect(redoFlowchartChange(history, first)).toBeUndefined()
  })

  it('新提交清空重做栈', () => {
    const history = recordFlowchartChange(createFlowchartHistory(), first)
    const undone = undoFlowchartChange(history, second)!
    expect(undone.history.redoStack).toHaveLength(1)

    const next = recordFlowchartChange(undone.history, first)
    expect(next.redoStack).toEqual([])
  })

  it('撤销栈超出容量时丢弃最早的快照', () => {
    let history = createFlowchartHistory()
    for (let index = 0; index < 120; index += 1) {
      history = recordFlowchartChange(history, {
        flowcharts: [{ ...first.flowcharts[0]!, name: `快照 ${index}` }],
      })
    }
    expect(history.undoStack).toHaveLength(100)
    expect(history.undoStack[0]!.flowcharts[0]!.name).toBe('快照 20')
    expect(history.undoStack.at(-1)!.flowcharts[0]!.name).toBe('快照 119')
  })
})
