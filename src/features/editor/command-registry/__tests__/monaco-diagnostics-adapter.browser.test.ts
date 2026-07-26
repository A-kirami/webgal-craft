import * as monaco from 'monaco-editor'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const { useResourceIndex, useResourceStore, useWorkspaceStore } = vi.hoisted(() => ({
  useResourceIndex: vi.fn(),
  useResourceStore: vi.fn(),
  useWorkspaceStore: vi.fn(),
}))

vi.mock('~/services/resource-index/service', () => ({ useResourceIndex }))
vi.mock('~/stores/resource', () => ({ useResourceStore }))
vi.mock('~/stores/workspace', () => ({ useWorkspaceStore }))
vi.mock('~/plugins/i18n', () => ({
  i18n: { global: { t: (key: string, params: Record<string, unknown> = {}) => `${key}:${Object.values(params).join(':')}` } },
}))

import { updateEditorDiagnostics } from '~/plugins/editor/diagnostics'

const OWNER = 'webgal-editor-diagnostics'
const models: monaco.editor.ITextModel[] = []
let modelId = 0

function createModel(text: string, language = 'webgalscript'): monaco.editor.ITextModel {
  const model = monaco.editor.createModel(
    text,
    language,
    monaco.Uri.parse(`inmemory://resource-diagnostics/${++modelId}`),
  )
  models.push(model)
  return model
}

function readMarkers(model: monaco.editor.ITextModel): monaco.editor.IMarker[] {
  return monaco.editor.getModelMarkers({ owner: OWNER, resource: model.uri })
}

describe('updateEditorDiagnostics', () => {
  beforeAll(() => {
    monaco.languages.register({ id: 'webgalscript' })
  })

  beforeEach(() => {
    useResourceIndex.mockReset()
    useResourceStore.mockReset()
    useWorkspaceStore.mockReset()
    useResourceStore.mockReturnValue({ currentEngineCapabilities: undefined })
    useWorkspaceStore.mockReturnValue({ currentGame: { path: '/game' } })
  })

  afterEach(() => {
    for (const model of models.splice(0)) {
      model.dispose()
    }
  })

  it('为资源索引中不存在的内容引用创建精确定位的红色 marker', () => {
    useResourceIndex.mockReturnValue({
      status: { value: 'ready' },
      hasAssetKey: vi.fn(() => false),
    })

    const model = createModel('changeBg:  missing/night.png;')
    updateEditorDiagnostics(model)

    expect(readMarkers(model)).toEqual([expect.objectContaining({
      startLineNumber: 1,
      startColumn: 12,
      endColumn: 29,
      severity: monaco.MarkerSeverity.Error,
      message: 'edit.completion.missingResource:missing/night.png',
    })])
  })

  it('资源索引未就绪时清除已有 marker', () => {
    const model = createModel('changeBg:missing.png;')
    useResourceIndex.mockReturnValue({
      status: { value: 'ready' },
      hasAssetKey: vi.fn(() => false),
    })
    updateEditorDiagnostics(model)
    expect(readMarkers(model)).toHaveLength(1)

    useResourceIndex.mockReturnValue({
      status: { value: 'building' },
      hasAssetKey: vi.fn(() => true),
    })
    updateEditorDiagnostics(model)
    expect(readMarkers(model)).toEqual([])
  })

  it('切换为非 WebGAL 语言时清除已有 marker', () => {
    const model = createModel('changeBg:missing.png;')
    useResourceIndex.mockReturnValue({
      status: { value: 'ready' },
      hasAssetKey: vi.fn(() => false),
    })
    updateEditorDiagnostics(model)
    expect(readMarkers(model)).toHaveLength(1)

    monaco.editor.setModelLanguage(model, 'plaintext')
    updateEditorDiagnostics(model)

    expect(readMarkers(model)).toEqual([])
  })

  it('choose 中重复路径的 marker 分别定位到对应选项', () => {
    useResourceIndex.mockReturnValue({
      status: { value: 'ready' },
      hasAssetKey: vi.fn(() => false),
    })

    const model = createModel('choose:First:missing.txt|Second:missing.txt;')
    updateEditorDiagnostics(model)

    expect(readMarkers(model).map(marker => marker.startColumn)).toEqual([14, 33])
  })

  it('choose 过滤空选项后仍按诊断索引定位 marker', () => {
    useResourceIndex.mockReturnValue({
      status: { value: 'ready' },
      hasAssetKey: vi.fn(() => false),
    })

    const model = createModel('choose:First:missing.txt||Second:missing.txt;')
    updateEditorDiagnostics(model)

    expect(readMarkers(model).map(marker => marker.startColumn)).toEqual([14, 34])
  })

  it('为同一场景中的全部重复标签创建黄色 marker', () => {
    useResourceIndex.mockReturnValue({
      status: { value: 'building' },
      hasAssetKey: vi.fn(() => true),
    })

    const model = createModel([
      'label: start;',
      'say:hello;',
      'label:start;',
    ].join('\n'))
    updateEditorDiagnostics(model)

    expect(readMarkers(model)).toEqual([
      expect.objectContaining({
        startLineNumber: 1,
        startColumn: 8,
        endColumn: 13,
        severity: monaco.MarkerSeverity.Warning,
        message: 'edit.diagnostics.duplicateLabel:start:2',
      }),
      expect.objectContaining({
        startLineNumber: 3,
        startColumn: 7,
        endColumn: 12,
        severity: monaco.MarkerSeverity.Warning,
        message: 'edit.diagnostics.duplicateLabel:start:2',
      }),
    ])
  })

  it('为 jumpLabel 引用的不存在标签创建红色 marker', () => {
    useResourceIndex.mockReturnValue({
      status: { value: 'building' },
      hasAssetKey: vi.fn(() => true),
    })

    const model = createModel('jumpLabel: missing;')
    updateEditorDiagnostics(model)

    expect(readMarkers(model)).toEqual([expect.objectContaining({
      startLineNumber: 1,
      startColumn: 12,
      endColumn: 19,
      severity: monaco.MarkerSeverity.Error,
      message: 'edit.diagnostics.missingLabel:missing',
    })])
  })

  it('为当前引擎不支持的 Live2D 与 Spine 引用创建黄色 marker', () => {
    useResourceIndex.mockReturnValue({
      status: { value: 'ready' },
      hasAssetKey: vi.fn(() => true),
    })
    useResourceStore.mockReturnValue({
      currentEngineCapabilities: { live2d: false, spine: false },
    })

    const model = createModel([
      'changeFigure:live2d/hero.json;',
      'changeFigure:spine/hero.json?type=spine;',
      'changeFigure:spine/hero.skel;',
    ].join('\n'))
    updateEditorDiagnostics(model)

    expect(readMarkers(model)).toEqual([
      expect.objectContaining({
        startLineNumber: 1,
        severity: monaco.MarkerSeverity.Warning,
        message: 'edit.diagnostics.unsupportedLive2d:',
      }),
      expect.objectContaining({
        startLineNumber: 2,
        severity: monaco.MarkerSeverity.Warning,
        message: 'edit.diagnostics.unsupportedSpine:',
      }),
      expect.objectContaining({
        startLineNumber: 3,
        severity: monaco.MarkerSeverity.Warning,
        message: 'edit.diagnostics.unsupportedSpine:',
      }),
    ])
  })
})
