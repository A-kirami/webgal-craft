import { vi } from 'vitest'

import type { Mock } from 'vitest'

type MonacoEditorCreateOptions = Record<string, unknown>

interface MonacoModelContentChangedEventMock {
  isFlush: boolean
}

interface MonacoMouseEventMock {
  event: {
    leftButton: boolean
  }
  target: {
    position?: {
      lineNumber: number
    } | null
    type: number
  }
}

type MonacoListener<TEvent = unknown> = (event: TEvent) => unknown
type MonacoListenerMock<TEvent = unknown> = Mock<(listener: MonacoListener<TEvent>) => MonacoDisposableMock>
type MonacoCommandHandler = () => unknown
type MonacoCommandMock = Mock<(keybinding: number, handler: MonacoCommandHandler) => unknown>
type MonacoCreateMock = Mock<(container: HTMLElement, options: MonacoEditorCreateOptions) => MonacoEditorInstanceMock>
type MonacoUpdateOptionsMock = Mock<(options: MonacoEditorCreateOptions) => void>

interface MonacoDisposableMock {
  dispose: Mock<() => void>
}

export interface MonacoDecorationsCollectionMock {
  append: Mock<(newDecorations: readonly unknown[]) => string[]>
  clear: Mock<() => void>
  getIds: () => string[]
  set: Mock<(newDecorations: readonly unknown[]) => string[]>
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
  addCommand: MonacoCommandMock
  createDecorationsCollection: Mock<(decorations?: readonly unknown[]) => MonacoDecorationsCollectionMock>
  dispose: Mock<() => void>
  focus: Mock<() => void>
  getAction: Mock<(actionId: string) => MonacoActionMock | undefined>
  getDomNode: Mock<() => MonacoDomNodeMock | null>
  getModel: Mock<() => unknown>
  getPosition: Mock<() => unknown>
  onDidCompositionEnd: Mock<(listener: () => void) => MonacoDisposableMock>
  onDidCompositionStart: Mock<(listener: () => void) => MonacoDisposableMock>
  onDidChangeCursorPosition: MonacoListenerMock
  onDidChangeCursorSelection: MonacoListenerMock
  onDidChangeModelContent: MonacoListenerMock<MonacoModelContentChangedEventMock>
  onDidScrollChange: MonacoListenerMock
  onKeyDown: Mock<(listener: () => void) => MonacoDisposableMock>
  onMouseDown: MonacoListenerMock<MonacoMouseEventMock>
  trigger: Mock<(source: string, handlerId: string, payload: unknown) => void>
  updateOptions: MonacoUpdateOptionsMock
}

export interface MonacoMockState {
  create: MonacoCreateMock
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

function createDecorationsCollectionMock(initialDecorations: readonly unknown[] = []): MonacoDecorationsCollectionMock {
  let decorationIds = createDecorationIds([...initialDecorations])

  return {
    append: vi.fn<(newDecorations: readonly unknown[]) => string[]>((newDecorations) => {
      const nextIds = createDecorationIds([...newDecorations])
      decorationIds = [...decorationIds, ...nextIds]
      return nextIds
    }),
    clear: vi.fn<() => void>(() => {
      decorationIds = []
    }),
    getIds: () => [...decorationIds],
    set: vi.fn<(newDecorations: readonly unknown[]) => string[]>((newDecorations) => {
      decorationIds = createDecorationIds([...newDecorations])
      return decorationIds
    }),
  }
}

function createDisposable(): MonacoDisposableMock {
  return {
    dispose: vi.fn<() => void>(),
  }
}

function createDisposableListenerMock<TEvent = unknown>() {
  return vi.fn<(listener: MonacoListener<TEvent>) => MonacoDisposableMock>(() => createDisposable())
}

function createDomNodeMock(): MonacoDomNodeMock {
  return {
    addEventListener: vi.fn<(type: string, listener: unknown, options?: boolean) => void>(),
    removeEventListener: vi.fn<(type: string, listener: unknown, options?: boolean) => void>(),
  }
}

function applyEditorInstanceMockDefaults(editorInstance: MonacoEditorInstanceMock) {
  const domNode = createDomNodeMock()

  editorInstance.createDecorationsCollection.mockImplementation(createDecorationsCollectionMock)
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
    addCommand: vi.fn<(keybinding: number, handler: MonacoCommandHandler) => unknown>(),
    createDecorationsCollection: vi.fn<(decorations?: readonly unknown[]) => MonacoDecorationsCollectionMock>(),
    dispose: vi.fn<() => void>(),
    focus: vi.fn<() => void>(),
    getAction: vi.fn<(actionId: string) => MonacoActionMock | undefined>(),
    getDomNode: vi.fn<() => MonacoDomNodeMock | null>(),
    getModel: vi.fn<() => unknown>(),
    getPosition: vi.fn<() => unknown>(),
    onDidCompositionEnd: createDisposableListenerMock(),
    onDidCompositionStart: createDisposableListenerMock(),
    onDidChangeCursorPosition: createDisposableListenerMock(),
    onDidChangeCursorSelection: createDisposableListenerMock(),
    onDidChangeModelContent: createDisposableListenerMock<MonacoModelContentChangedEventMock>(),
    onDidScrollChange: createDisposableListenerMock(),
    onKeyDown: createDisposableListenerMock(),
    onMouseDown: createDisposableListenerMock<MonacoMouseEventMock>(),
    trigger: vi.fn<(source: string, handlerId: string, payload: unknown) => void>(),
    updateOptions: vi.fn<(options: MonacoEditorCreateOptions) => void>(),
  }

  applyEditorInstanceMockDefaults(editorInstance)

  return editorInstance
}

function createMonacoMockState(): MonacoMockState {
  const editorInstance = createEditorInstanceMock()

  return {
    create: vi.fn<(container: HTMLElement, options: MonacoEditorCreateOptions) => MonacoEditorInstanceMock>(
      () => editorInstance,
    ),
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
    Position: class Position {
      lineNumber: number
      column: number

      constructor(lineNumber: number, column: number) {
        this.lineNumber = lineNumber
        this.column = column
      }
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
        CONTENT_EMPTY: 7,
        CONTENT_TEXT: 6,
        GUTTER_GLYPH_MARGIN: 2,
      },
      setTheme: monacoMockState.setTheme,
      TrackedRangeStickiness: {
        NeverGrowsWhenTypingAtEdges: 0,
      },
    },
  }
}
