import { vi } from 'vitest'

import type { Mock } from 'vitest'

type AnyMonacoMock = Mock<(...args: unknown[]) => unknown>

interface MonacoDisposableMock {
  dispose: Mock<() => void>
}

interface MonacoActionMock {
  id: string
  label: string
  run: Mock<() => Promise<void>>
}

interface MonacoDomNodeMock {
  addEventListener: Mock<(type: string, listener: unknown, options?: boolean) => void>
  removeEventListener: Mock<(type: string, listener: unknown, options?: boolean) => void>
}

export interface MonacoEditorInstanceMock {
  addCommand: AnyMonacoMock
  deltaDecorations: Mock<(oldDecorations: string[], newDecorations: unknown[]) => string[]>
  dispose: Mock<() => void>
  getAction: Mock<(actionId: string) => MonacoActionMock | undefined>
  getDomNode: Mock<() => MonacoDomNodeMock | null>
  getModel: Mock<() => unknown>
  getPosition: Mock<() => unknown>
  onDidCompositionEnd: Mock<(listener: () => void) => MonacoDisposableMock>
  onDidCompositionStart: Mock<(listener: () => void) => MonacoDisposableMock>
  onDidChangeCursorPosition: AnyMonacoMock
  onDidChangeCursorSelection: AnyMonacoMock
  onDidChangeModelContent: AnyMonacoMock
  onDidScrollChange: AnyMonacoMock
  onKeyDown: Mock<(listener: () => void) => MonacoDisposableMock>
  onMouseDown: AnyMonacoMock
  trigger: Mock<(source: string, handlerId: string, payload: unknown) => void>
  updateOptions: AnyMonacoMock
}

export interface MonacoMockState {
  create: Mock<() => MonacoEditorInstanceMock>
  editorInstance: MonacoEditorInstanceMock
  setTheme: Mock<(themeName: string) => void>
}

let decorationIdCounter = 0

function resetDecorationIdCounter() {
  decorationIdCounter = 0
}

function createDecorationIds(nextDecorations: unknown[]) {
  return nextDecorations.map(() => `decoration-${++decorationIdCounter}`)
}

function createDisposable(): MonacoDisposableMock {
  return {
    dispose: vi.fn<() => void>(),
  }
}

function createDisposableListenerMock() {
  return vi.fn<(listener: () => void) => MonacoDisposableMock>(() => createDisposable())
}

function createDomNodeMock(): MonacoDomNodeMock {
  return {
    addEventListener: vi.fn<(type: string, listener: unknown, options?: boolean) => void>(),
    removeEventListener: vi.fn<(type: string, listener: unknown, options?: boolean) => void>(),
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
    run: vi.fn<() => Promise<void>>(async () => undefined),
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
    addCommand: vi.fn<(...args: unknown[]) => unknown>(),
    deltaDecorations: vi.fn<(oldDecorations: string[], newDecorations: unknown[]) => string[]>(),
    dispose: vi.fn<() => void>(),
    getAction: vi.fn<(actionId: string) => MonacoActionMock | undefined>(),
    getDomNode: vi.fn<() => MonacoDomNodeMock | null>(),
    getModel: vi.fn<() => unknown>(),
    getPosition: vi.fn<() => unknown>(),
    onDidCompositionEnd: createDisposableListenerMock(),
    onDidCompositionStart: createDisposableListenerMock(),
    onDidChangeCursorPosition: vi.fn<(...args: unknown[]) => unknown>(),
    onDidChangeCursorSelection: vi.fn<(...args: unknown[]) => unknown>(),
    onDidChangeModelContent: vi.fn<(...args: unknown[]) => unknown>(),
    onDidScrollChange: vi.fn<(...args: unknown[]) => unknown>(),
    onKeyDown: createDisposableListenerMock(),
    onMouseDown: vi.fn<(...args: unknown[]) => unknown>(),
    trigger: vi.fn<(source: string, handlerId: string, payload: unknown) => void>(),
    updateOptions: vi.fn<(...args: unknown[]) => unknown>(),
  }

  applyEditorInstanceMockDefaults(editorInstance)

  return editorInstance
}

function createMonacoMockState(): MonacoMockState {
  const editorInstance = createEditorInstanceMock()

  return {
    create: vi.fn<() => MonacoEditorInstanceMock>(() => editorInstance),
    editorInstance,
    setTheme: vi.fn<(themeName: string) => void>(),
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
