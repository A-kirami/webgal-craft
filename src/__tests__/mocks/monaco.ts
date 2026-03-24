import { vi } from 'vitest'

interface MonacoEditorInstanceMock {
  addCommand: ReturnType<typeof vi.fn>
  deltaDecorations: ReturnType<typeof vi.fn>
  dispose: ReturnType<typeof vi.fn>
  getModel: ReturnType<typeof vi.fn>
  getPosition: ReturnType<typeof vi.fn>
  onDidChangeCursorPosition: ReturnType<typeof vi.fn>
  onDidChangeCursorSelection: ReturnType<typeof vi.fn>
  onDidChangeModelContent: ReturnType<typeof vi.fn>
  onDidScrollChange: ReturnType<typeof vi.fn>
  onMouseDown: ReturnType<typeof vi.fn>
  updateOptions: ReturnType<typeof vi.fn>
}

interface MonacoMockState {
  create: ReturnType<typeof vi.fn>
  editorInstance: MonacoEditorInstanceMock
  setTheme: ReturnType<typeof vi.fn>
}

function createEditorInstanceMock(): MonacoEditorInstanceMock {
  return {
    addCommand: vi.fn(),
    deltaDecorations: vi.fn((_: string[], nextDecorations: unknown[]) =>
      nextDecorations.map((_, index) => `decoration-${index + 1}`),
    ),
    dispose: vi.fn(),
    getModel: vi.fn(),
    getPosition: vi.fn(),
    onDidChangeCursorPosition: vi.fn(),
    onDidChangeCursorSelection: vi.fn(),
    onDidChangeModelContent: vi.fn(),
    onDidScrollChange: vi.fn(),
    onMouseDown: vi.fn(),
    updateOptions: vi.fn(),
  }
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
  monacoMockState.create.mockReset()
  monacoMockState.create.mockImplementation(() => monacoMockState.editorInstance)

  monacoMockState.setTheme.mockReset()

  for (const [key] of Object.entries(monacoMockState.editorInstance)) {
    const current = monacoMockState.editorInstance[key as keyof MonacoEditorInstanceMock]
    current.mockReset()
  }

  monacoMockState.editorInstance.deltaDecorations.mockImplementation((_: string[], nextDecorations: unknown[]) =>
    nextDecorations.map((_, index) => `decoration-${index + 1}`),
  )
  monacoMockState.editorInstance.getModel.mockReturnValue(undefined)
  monacoMockState.editorInstance.getPosition.mockReturnValue(undefined)
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
