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

import { LATEST_ENGINE_RUNTIME_CAPABILITIES, LEGACY_ENGINE_RUNTIME_CAPABILITIES } from '~/domain/engine/runtime-capabilities'
import { resolveWebgalScriptConfigKey } from '~/domain/script/parser'
import { resolveWebgalScriptLanguageId } from '~/features/editor/text-editor/text-editor-language'
import { updateEditorDiagnostics } from '~/plugins/editor/diagnostics'

const OWNER = 'webgal-editor-diagnostics'
/** 能力全关时的语言档位：return 与立绘差分都按旁白着色 */
const LEGACY_LANGUAGE_ID = resolveWebgalScriptLanguageId(
  resolveWebgalScriptConfigKey(LEGACY_ENGINE_RUNTIME_CAPABILITIES),
)
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
    monaco.languages.register({ id: LEGACY_LANGUAGE_ID })
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

  it('多行 choose 的资源 marker 定位到各自的物理行', () => {
    useResourceIndex.mockReturnValue({
      status: { value: 'ready' },
      hasAssetKey: vi.fn(() => false),
    })

    const model = createModel([
      'choose:First:missing-a.txt',
      '  |Second:missing-b.txt;',
    ].join('\n'))
    updateEditorDiagnostics(model)

    expect(readMarkers(model)).toEqual([
      expect.objectContaining({
        startLineNumber: 1,
        startColumn: 14,
      }),
      expect.objectContaining({
        startLineNumber: 2,
        startColumn: 11,
      }),
    ])
  })

  it('旧运行时会将多行语句标为错误', () => {
    useResourceIndex.mockReturnValue({
      status: { value: 'ready' },
      hasAssetKey: vi.fn(() => true),
    })

    const model = createModel([
      'changeFigure:hero.png',
      '  -id=hero;',
    ].join('\n'))
    updateEditorDiagnostics(model, LEGACY_ENGINE_RUNTIME_CAPABILITIES)

    expect(readMarkers(model)).toEqual([expect.objectContaining({
      startLineNumber: 1,
      startColumn: 1,
      endLineNumber: 2,
      severity: monaco.MarkerSeverity.Error,
      message: 'edit.diagnostics.unsupportedMultilineStatements:',
    })])
  })

  it('旧运行时会标记立绘差分，范围覆盖整条语句', () => {
    useResourceIndex.mockReturnValue({
      status: { value: 'ready' },
      hasAssetKey: vi.fn(() => true),
    })

    const statement = 'changeFigureDiff:smile.png -left -id=hero;'
    const model = createModel([
      'changeFigure: hero.png -left;',
      statement,
    ].join('\n'))
    updateEditorDiagnostics(model, LEGACY_ENGINE_RUNTIME_CAPABILITIES)

    expect(readMarkers(model)).toEqual([expect.objectContaining({
      startLineNumber: 2,
      startColumn: 1,
      endLineNumber: 2,
      // 命令名与全部参数都在范围内，不能只划图片路径
      endColumn: statement.length + 1,
      severity: monaco.MarkerSeverity.Warning,
      message: 'edit.diagnostics.unsupportedChangeFigureDiff:',
    })])
  })

  it('多行立绘差分的范围覆盖它的全部物理行', () => {
    useResourceIndex.mockReturnValue({
      status: { value: 'ready' },
      hasAssetKey: vi.fn(() => true),
    })

    const model = createModel([
      'changeFigureDiff:stand.webp',
      '  -id=hero -left;',
      'say:next;',
    ].join('\n'))
    // 只有 4.6.5 起才有该命令，但多行语句是 4.6.3 的能力：需要这个组合才能出现多行差分语句
    updateEditorDiagnostics(model, {
      changeFigureDiff: false,
      figurePositions: true,
      multilineStatements: true,
      opusVocalShorthand: true,
      sceneSemantics: true,
      transformFrom: false,
    })

    expect(readMarkers(model)).toEqual([expect.objectContaining({
      startLineNumber: 1,
      startColumn: 1,
      endLineNumber: 2,
      endColumn: '  -id=hero -left;'.length + 1,
      severity: monaco.MarkerSeverity.Warning,
      message: 'edit.diagnostics.unsupportedChangeFigureDiff:',
    })])
  })

  it('新运行时不标记立绘差分，但会标记被引擎跳过的模型内容', () => {
    useResourceIndex.mockReturnValue({
      status: { value: 'ready' },
      hasAssetKey: vi.fn(() => true),
    })

    const statement = 'changeFigureDiff:live2d/hero.json -id=hero;'
    const model = createModel([
      'changeFigureDiff:smile.png -left;',
      statement,
    ].join('\n'))
    updateEditorDiagnostics(model, LATEST_ENGINE_RUNTIME_CAPABILITIES)

    expect(readMarkers(model)).toEqual([expect.objectContaining({
      startLineNumber: 2,
      startColumn: 1,
      endLineNumber: 2,
      endColumn: statement.length + 1,
      severity: monaco.MarkerSeverity.Warning,
      message: 'edit.diagnostics.skippedFigureDiffModel:',
    })])
  })

  it('旧运行时会标记扩展立绘位置', () => {
    useResourceIndex.mockReturnValue({
      status: { value: 'ready' },
      hasAssetKey: vi.fn(() => true),
    })

    const model = createModel([
      'Alice: hello -left13;',
      'changeFigure: hero.png -right14;',
      'setAnimation: bounce -target=fig-left14;',
      'setTransform: {} -target=fig-right13;',
    ].join('\n'))
    updateEditorDiagnostics(model, LEGACY_ENGINE_RUNTIME_CAPABILITIES)

    expect(readMarkers(model)).toEqual([
      expect.objectContaining({
        startLineNumber: 1,
        severity: monaco.MarkerSeverity.Warning,
        message: 'edit.diagnostics.unsupportedFigurePosition:',
      }),
      expect.objectContaining({
        startLineNumber: 2,
        severity: monaco.MarkerSeverity.Warning,
        message: 'edit.diagnostics.unsupportedFigurePosition:',
      }),
      expect.objectContaining({
        startLineNumber: 3,
        severity: monaco.MarkerSeverity.Warning,
        message: 'edit.diagnostics.unsupportedFigurePosition:',
      }),
      expect.objectContaining({
        startLineNumber: 4,
        severity: monaco.MarkerSeverity.Warning,
        message: 'edit.diagnostics.unsupportedFigurePosition:',
      }),
    ])
  })

  it('旧引擎标记整个 transformFrom 参数而不是它的取值', () => {
    useResourceIndex.mockReturnValue({
      status: { value: 'ready' },
      hasAssetKey: vi.fn(() => true),
    })

    const model = createModel('setTransform: {} -target=fig-center -transformFrom=default;')
    updateEditorDiagnostics(model, LEGACY_ENGINE_RUNTIME_CAPABILITIES)

    expect(readMarkers(model)).toEqual([expect.objectContaining({
      startLineNumber: 1,
      startColumn: 37,
      endColumn: 59,
      severity: monaco.MarkerSeverity.Warning,
      message: 'edit.diagnostics.unsupportedTransformFrom:',
    })])
  })

  it('多行语句中的 transformFrom 定位到参数所在的物理行', () => {
    useResourceIndex.mockReturnValue({
      status: { value: 'ready' },
      hasAssetKey: vi.fn(() => true),
    })

    const model = createModel([
      'setTransform:',
      '  -transformFrom=default;',
    ].join('\n'))
    updateEditorDiagnostics(model, { ...LATEST_ENGINE_RUNTIME_CAPABILITIES, transformFrom: false })

    expect(readMarkers(model)).toEqual([expect.objectContaining({
      startLineNumber: 2,
      startColumn: 3,
      endColumn: 25,
      severity: monaco.MarkerSeverity.Warning,
      message: 'edit.diagnostics.unsupportedTransformFrom:',
    })])
  })

  it('新引擎标记整个旧写入参数 token', () => {
    useResourceIndex.mockReturnValue({
      status: { value: 'ready' },
      hasAssetKey: vi.fn(() => true),
    })

    const model = createModel('setTransform: {} -writeDefault -ignoreDefault=false;')
    updateEditorDiagnostics(model, LATEST_ENGINE_RUNTIME_CAPABILITIES)

    expect(readMarkers(model)).toEqual([
      expect.objectContaining({
        startLineNumber: 1,
        startColumn: 18,
        endColumn: 31,
        severity: monaco.MarkerSeverity.Warning,
        message: 'edit.diagnostics.legacyTransformWriteArg:',
      }),
      expect.objectContaining({
        startLineNumber: 1,
        startColumn: 32,
        endColumn: 52,
        severity: monaco.MarkerSeverity.Warning,
        message: 'edit.diagnostics.legacyTransformWriteArg:',
      }),
    ])
  })

  it('同句含 transformFrom 时旧写入参数提示被当前引擎忽略', () => {
    useResourceIndex.mockReturnValue({
      status: { value: 'ready' },
      hasAssetKey: vi.fn(() => true),
    })

    const model = createModel('setTransform: {} -transformFrom=current -writeDefault;')
    updateEditorDiagnostics(model, LATEST_ENGINE_RUNTIME_CAPABILITIES)

    expect(readMarkers(model)).toEqual([expect.objectContaining({
      startLineNumber: 1,
      startColumn: 41,
      endColumn: 54,
      severity: monaco.MarkerSeverity.Warning,
      message: 'edit.diagnostics.legacyTransformWriteArgOverridden:',
    })])
  })

  it('legacy 语言模型仍会生成旧运行时诊断', () => {
    useResourceIndex.mockReturnValue({
      status: { value: 'ready' },
      hasAssetKey: vi.fn(() => true),
    })

    const model = createModel('setVar: result=1 -local;', LEGACY_LANGUAGE_ID)
    updateEditorDiagnostics(model, LEGACY_ENGINE_RUNTIME_CAPABILITIES)

    expect(readMarkers(model)).toEqual([expect.objectContaining({
      message: 'edit.diagnostics.unsupportedLocalVariable:',
      severity: monaco.MarkerSeverity.Warning,
    })])
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

  it('为旧引擎的 say Opus 语音引用定位黄色 marker', () => {
    useResourceIndex.mockReturnValue({
      status: { value: 'ready' },
      hasAssetKey: vi.fn(() => true),
    })

    const model = createModel('say:voice.opus -voice.opus;')
    updateEditorDiagnostics(model, LEGACY_ENGINE_RUNTIME_CAPABILITIES)

    expect(readMarkers(model)).toEqual([expect.objectContaining({
      startLineNumber: 1,
      startColumn: 17,
      endColumn: 27,
      severity: monaco.MarkerSeverity.Warning,
      message: 'edit.diagnostics.unsupportedOpusVocal:',
    })])
  })

  it('旧运行时不将 return 识别为返回命令，但仍标记受限场景语义', () => {
    useResourceIndex.mockReturnValue({
      status: { value: 'ready' },
      hasAssetKey: vi.fn(() => true),
    })

    const model = createModel([
      'return;',
      'setVar: result=1 -local;',
      'callScene:battle.txt -enemy=slime -writeReturnTo=result;',
    ].join('\n'))
    updateEditorDiagnostics(model, LEGACY_ENGINE_RUNTIME_CAPABILITIES)

    expect(readMarkers(model)).toEqual([
      expect.objectContaining({
        startLineNumber: 2,
        startColumn: 18,
        endColumn: 24,
        severity: monaco.MarkerSeverity.Warning,
        message: 'edit.diagnostics.unsupportedLocalVariable:',
      }),
      expect.objectContaining({
        startLineNumber: 3,
        startColumn: 22,
        endColumn: 34,
        severity: monaco.MarkerSeverity.Warning,
        message: 'edit.diagnostics.unsupportedCallSceneArgument:',
      }),
      expect.objectContaining({
        startLineNumber: 3,
        startColumn: 35,
        endColumn: 56,
        severity: monaco.MarkerSeverity.Warning,
        message: 'edit.diagnostics.unsupportedCallSceneArgument:',
      }),
    ])
  })

  it('callScene 的保留参数与不支持参数都标记整个参数 token', () => {
    useResourceIndex.mockReturnValue({
      status: { value: 'ready' },
      hasAssetKey: vi.fn(() => true),
    })

    const model = createModel('callScene:battle.txt -next=false -enemy=slime;')
    updateEditorDiagnostics(model, LEGACY_ENGINE_RUNTIME_CAPABILITIES)

    expect(readMarkers(model)).toEqual([
      expect.objectContaining({
        startLineNumber: 1,
        startColumn: 22,
        endColumn: 33,
        severity: monaco.MarkerSeverity.Warning,
        message: 'edit.diagnostics.reservedCallSceneArgument:next',
      }),
      expect.objectContaining({
        startLineNumber: 1,
        startColumn: 34,
        endColumn: 46,
        severity: monaco.MarkerSeverity.Warning,
        message: 'edit.diagnostics.unsupportedCallSceneArgument:',
      }),
    ])
  })

  it('色值格式诊断按声明的等级生成 marker', () => {
    useResourceIndex.mockReturnValue({
      status: { value: 'ready' },
      hasAssetKey: vi.fn(() => true),
    })

    const model = createModel([
      'intro: 你好 -fontColor=red;',
      'intro: 你好 -fontColor=#zzz;',
    ].join('\n'))
    updateEditorDiagnostics(model)

    expect(readMarkers(model)).toEqual([
      expect.objectContaining({
        startLineNumber: 1,
        severity: monaco.MarkerSeverity.Warning,
        message: 'edit.diagnostics.unsupportedColorFormat:red',
      }),
      expect.objectContaining({
        startLineNumber: 2,
        severity: monaco.MarkerSeverity.Error,
        message: 'edit.diagnostics.invalidColorFormat:#zzz',
      }),
    ])
  })
})
