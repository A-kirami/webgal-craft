import { describe, expect, it } from 'vitest'

import {
  createDefaultFlowchartDocument,
  FlowchartParseError,
  normalizeFlowchartDocument,
  parseFlowchartDocument,
  serializeFlowchartDocument,
} from '../codec'
import { MAIN_FLOWCHART_ID } from '../model'

const defaults = {
  mainFlowchartName: '主线剧情',
  nodeTitle: '节点',
  rootNodeTitle: '起点',
}

const WEBGAL_SAMPLE = JSON.stringify({
  flowcharts: [
    {
      id: 'main',
      name: '主线剧情',
      type: 'main',
      nodes: [
        { id: 'start', position: { x: 250, y: 0 }, data: { label: '序章', sceneName: 'start.txt' } },
        { id: 'chapter1', position: { x: 250, y: 100 }, data: { label: '第一章', sceneName: 'chapter1.txt', isRoot: true } },
      ],
      edges: [{ id: 'e1', source: 'start', target: 'chapter1' }],
    },
    {
      id: 'alice',
      name: 'Alice线',
      type: 'character',
      nodes: [{ id: 'alice_start', position: { x: 200, y: 0 }, data: { label: 'Alice线开始', sceneName: 'alice/start.txt', isRoot: true } }],
      edges: [],
    },
  ],
})

describe('parseFlowchartDocument', () => {
  it('解析 WebGAL 格式的流程图文件', () => {
    const { document, warnings } = parseFlowchartDocument(WEBGAL_SAMPLE)

    expect(warnings).toEqual([])
    expect(document.flowcharts.map(flowchart => [flowchart.id, flowchart.kind])).toEqual([
      ['main', 'main'],
      ['alice', 'character'],
    ])
    expect(document.flowcharts[0]!.nodes[1]).toMatchObject({
      id: 'chapter1',
      title: '第一章',
      scene: 'chapter1.txt',
      isRoot: true,
    })
    expect(document.flowcharts[0]!.edges).toEqual([{ id: 'e1', source: 'start', target: 'chapter1' }])
  })

  it('非法 JSON 抛出可恢复错误', () => {
    expect(() => parseFlowchartDocument('{')).toThrow(FlowchartParseError)
  })

  it('结构不合法时抛出可恢复错误', () => {
    expect(() => parseFlowchartDocument(JSON.stringify({ flowcharts: [{ name: '缺 id' }] }))).toThrow(FlowchartParseError)
    expect(() => parseFlowchartDocument(JSON.stringify({ flowcharts: [{ id: 'main', nodes: [{ id: 'a' }] }] })))
      .toThrow(FlowchartParseError)
  })

  it('拒绝重复的流程图 id，避免后续编辑覆盖同 id 的另一张流程图', () => {
    const raw = JSON.stringify({
      flowcharts: [{ id: 'main', name: '主线' }, { id: 'main', name: '重复主线' }],
    })

    expect(() => parseFlowchartDocument(raw)).toThrow(FlowchartParseError)
  })

  it('剔除悬空连线与重复 id，并给出修复警告', () => {
    const raw = JSON.stringify({
      flowcharts: [{
        id: 'main',
        name: '主线',
        nodes: [
          { id: 'a', position: { x: 0, y: 0 }, data: { label: 'A', isRoot: true } },
          { id: 'a', position: { x: 0, y: 10 }, data: { label: '重复' } },
        ],
        edges: [
          { id: 'e1', source: 'a', target: 'missing' },
          { id: 'e2', source: 'a', target: 'a' },
          { id: 'e2', source: 'a', target: 'a' },
        ],
      }],
    })

    const { document, warnings } = parseFlowchartDocument(raw)
    const main = document.flowcharts[0]!

    expect(main.nodes).toHaveLength(1)
    expect(main.edges.map(edge => edge.id)).toEqual(['e2'])
    expect(warnings).toHaveLength(3)
  })

  it('只保留第一个根节点标记', () => {
    const raw = JSON.stringify({
      flowcharts: [{
        id: 'main',
        nodes: [
          { id: 'a', position: { x: 0, y: 0 }, data: { label: 'A', isRoot: true } },
          { id: 'b', position: { x: 0, y: 0 }, data: { label: 'B', isRoot: true } },
        ],
      }],
    })

    const { document, warnings } = parseFlowchartDocument(raw)
    expect(document.flowcharts[0]!.nodes.filter(node => node.isRoot).map(node => node.id)).toEqual(['a'])
    expect(warnings).toHaveLength(1)
  })
})

describe('normalizeFlowchartDocument', () => {
  it('缺少主线时补出默认主线', () => {
    const raw = JSON.stringify({
      flowcharts: [{ id: 'alice', name: 'Alice线', nodes: [{ id: 'a', position: { x: 0, y: 0 }, data: { label: 'A' } }] }],
    })
    const { document } = parseFlowchartDocument(raw)
    const normalized = normalizeFlowchartDocument(document, defaults)

    expect(normalized.flowcharts[0]).toMatchObject({ id: MAIN_FLOWCHART_ID, kind: 'main', name: '主线剧情' })
    expect(normalized.flowcharts[1]!.nodes[0]).toMatchObject({ id: 'a', isRoot: true })
  })

  it('为空流程图补出根节点，并补齐空标题', () => {
    const normalized = normalizeFlowchartDocument({
      flowcharts: [
        { id: 'main', kind: 'main', name: '主线', nodes: [], edges: [] },
        {
          id: 'alice',
          kind: 'character',
          name: 'Alice线',
          nodes: [{ id: 'a', title: '', scene: undefined, position: { x: 1, y: 2 }, isRoot: false }],
          edges: [],
        },
      ],
    }, defaults)

    expect(normalized.flowcharts[0]!.nodes).toEqual([
      { id: 'root', title: '起点', scene: undefined, position: { x: 0, y: 0 }, isRoot: true },
    ])
    expect(normalized.flowcharts[1]!.nodes[0]).toMatchObject({ title: '节点', isRoot: true })
  })

  it('已满足不变量时保持原样', () => {
    const document = createDefaultFlowchartDocument(defaults)
    expect(normalizeFlowchartDocument(document, defaults)).toEqual(document)
  })
})

describe('serializeFlowchartDocument', () => {
  it('只输出稳定业务字段', () => {
    const document = createDefaultFlowchartDocument(defaults)
    document.flowcharts[0]!.nodes.push({
      id: 'node-1',
      title: '第一章',
      scene: undefined,
      position: { x: 12, y: 34 },
      isRoot: false,
    })
    document.flowcharts[0]!.edges.push({ id: 'edge-1', source: 'root', target: 'node-1' })

    const serialized = JSON.parse(serializeFlowchartDocument(document))
    expect(serialized).toEqual({
      flowcharts: [{
        id: 'main',
        name: '主线剧情',
        type: 'main',
        nodes: [
          { id: 'root', type: 'custom', position: { x: 0, y: 0 }, data: { label: '起点', sceneName: '', isRoot: true } },
          { id: 'node-1', type: 'custom', position: { x: 12, y: 34 }, data: { label: '第一章', sceneName: '' } },
        ],
        edges: [{ id: 'edge-1', source: 'root', target: 'node-1' }],
      }],
    })
  })

  it('序列化结果可被重新解析且内容一致', () => {
    const document = createDefaultFlowchartDocument(defaults)
    const roundTripped = parseFlowchartDocument(serializeFlowchartDocument(document))
    expect(roundTripped.document).toEqual(document)
  })
})
