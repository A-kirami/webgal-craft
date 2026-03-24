import { vi } from 'vitest'

interface MonacoEditorInstanceMock {
  addCommand: ReturnType<typeof vi.fn>
  deltaDecorations: ReturnType<typeof vi.fn>
  dispose: ReturnType<typeof vi.fn>
  getAction: ReturnType<typeof vi.fn>
  getDomNode: ReturnType<typeof vi.fn>
  getModel: ReturnType<typeof vi.fn>
  getPosition: ReturnType<typeof vi.fn>
  onDidCompositionEnd: ReturnType<typeof vi.fn>
  onDidCompositionStart: ReturnType<typeof vi.fn>
  onDidChangeCursorPosition: ReturnType<typeof vi.fn>
  onDidChangeCursorSelection: ReturnType<typeof vi.fn>
  onDidChangeModelContent: ReturnType<typeof vi.fn>
  onDidScrollChange: ReturnType<typeof vi.fn>
  onKeyDown: ReturnType<typeof vi.fn>
  onMouseDown: ReturnType<typeof vi.fn>
  trigger: ReturnType<typeof vi.fn>
  updateOptions: ReturnType<typeof vi.fn>
}

interface MonacoMockState {
  create: ReturnType<typeof vi.fn>
  editorInstance: MonacoEditorInstanceMock
  setTheme: ReturnType<typeof vi.fn>
}

let decorationIdCounter = 0

function resetDecorationIdCounter() {
  decorationIdCounter = 0
}

function createDecorationIds(nextDecorations: unknown[]) {
  return nextDecorations.map(() => `decoration-${++decorationIdCounter}`)
}

function createDisposable() {
  return {
    dispose: vi.fn(),
  }
}

function createDisposableListenerMock() {
  return vi.fn(() => createDisposable())
}

function createDomNodeMock() {
  return {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }
}

function applyEditorInstanceMockDefaults(editorInstance: MonacoEditorInstanceMock) {
  const domNode = createDomNodeMock()

  editorInstance.deltaDecorations.mockImplementation((_: string[], nextDecorations: unknown[]) =>
    createDecorationIds(nextDecorations),
  )
  editorInstance.getAction.mockImplementation((actionId: string) => ({
    id: actionId,
    label: actionId,
    run: vi.fn(async () => undefined),
  }))
  editorInstance.getDomNode.mockImplementation(() => domNode)
  editorInstance.getModel.mockReturnValue(undefined)
  editorInstance.getPosition.mockReturnValue(undefined)
  editorInstance.onDidCompositionEnd.mockImplementation(() => createDisposable())
  editorInstance.onDidCompositionStart.mockImplementation(() => createDisposable())
  editorInstance.onKeyDown.mockImplementation(() => createDisposable())
  editorInstance.trigger.mockImplementation(() => undefined)
}

function createEditorInstanceMock(): MonacoEditorInstanceMock {
  const editorInstance: MonacoEditorInstanceMock = {
    addCommand: vi.fn(),
    deltaDecorations: vi.fn(),
    dispose: vi.fn(),
    getAction: vi.fn(),
    getDomNode: vi.fn(),
    getModel: vi.fn(),
    getPosition: vi.fn(),
    onDidCompositionEnd: createDisposableListenerMock(),
    onDidCompositionStart: createDisposableListenerMock(),
    onDidChangeCursorPosition: vi.fn(),
    onDidChangeCursorSelection: vi.fn(),
    onDidChangeModelContent: vi.fn(),
    onDidScrollChange: vi.fn(),
    onKeyDown: createDisposableListenerMock(),
    onMouseDown: vi.fn(),
    trigger: vi.fn(),
    updateOptions: vi.fn(),
  }

  applyEditorInstanceMockDefaults(editorInstance)

  return editorInstance
}

function createMonacoMockState(): MonacoMockState {
  const editorInstance = createEditorInstanceMock()

  return {
    create: vi.fn(() => editorInstance),
    editorInstance,
    setTheme: vi.fn(),
  }
}

export const monacoMockState = createMonacoMockState()

export function resetMonacoMockState() {
  resetDecorationIdCounter()
  monacoMockState.create.mockReset()
  monacoMockState.create.mockImplementation(() => monacoMockState.editorInstance)

  monacoMockState.setTheme.mockReset()

  for (const [key] of Object.entries(monacoMockState.editorInstance)) {
    const current = monacoMockState.editorInstance[key as keyof MonacoEditorInstanceMock]
    current.mockReset()
  }

  applyEditorInstanceMockDefaults(monacoMockState.editorInstance)
}

export function createMonacoMockModule() {
  return {
    KeyCode: {
      KeyS: 49,
    },
    KeyMod: {
      CtrlCmd: 2048,
    },
    Range: class Range {
      startLineNumber: number
      startColumn: number
      endLineNumber: number
      endColumn: number

      constructor(startLineNumber: number, startColumn: number, endLineNumber: number, endColumn: number) {
        this.startLineNumber = startLineNumber
        this.startColumn = startColumn
        this.endLineNumber = endLineNumber
        this.endColumn = endColumn
      }
    },
    editor: {
      create: monacoMockState.create,
      MouseTargetType: {
        GUTTER_GLYPH_MARGIN: 2,
      },
      setTheme: monacoMockState.setTheme,
    },
  }
}
