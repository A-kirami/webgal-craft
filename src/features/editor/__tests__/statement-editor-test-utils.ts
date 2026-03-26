import { vi } from 'vitest'
import { ref, shallowReactive } from 'vue'
import { commandType } from 'webgal-parser/src/interface/sceneInterface'

import { useStatementEditor } from '~/features/editor/statement-editor/useStatementEditor'

import type { ISentence } from 'webgal-parser/src/interface/sceneInterface'
import type { StatementEntry } from '~/domain/script/sentence'
import type { ArgField } from '~/features/editor/command-registry/schema'
import type { StatementUpdatePayload } from '~/features/editor/statement-editor/useStatementEditor'

const {
  fileSystemEventsOnMock,
  gameAssetDirMock,
  gameSceneDirMock,
  loggerDebugMock,
  loggerErrorMock,
  loggerInfoMock,
  loggerWarnMock,
  useWorkspaceStoreMock,
} = vi.hoisted(() => ({
  fileSystemEventsOnMock: vi.fn(),
  gameAssetDirMock: vi.fn(async (_cwd: string, assetType: string): Promise<string> => `/mock/${assetType}`),
  gameSceneDirMock: vi.fn(async (_cwd: string): Promise<string> => '/mock/scene'),
  loggerDebugMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  loggerInfoMock: vi.fn(),
  loggerWarnMock: vi.fn(),
  useWorkspaceStoreMock: vi.fn(),
}))

export { fileSystemEventsOnMock, gameAssetDirMock, gameSceneDirMock, loggerDebugMock, loggerErrorMock, loggerInfoMock, loggerWarnMock }

export const workspaceStoreState = shallowReactive<{ CWD?: string }>({
  CWD: undefined,
})

vi.mock('@tauri-apps/plugin-log', () => ({
  attachConsole: vi.fn(),
  debug: loggerDebugMock,
  error: loggerErrorMock,
  info: loggerInfoMock,
  warn: loggerWarnMock,
}))

vi.mock('~/stores/workspace', () => ({
  useWorkspaceStore: useWorkspaceStoreMock,
}))

vi.mock('~/services/platform/app-paths', () => ({
  gameAssetDir: gameAssetDirMock,
  gameSceneDir: gameSceneDirMock,
}))

vi.mock('~/composables/useFileSystemEvents', () => ({
  useFileSystemEvents: () => ({
    on: fileSystemEventsOnMock,
  }),
}))

export function resetStatementEditorRuntime() {
  workspaceStoreState.CWD = undefined

  gameAssetDirMock.mockReset()
  gameAssetDirMock.mockImplementation(async (_cwd: string, assetType: string): Promise<string> => `/mock/${assetType}`)

  gameSceneDirMock.mockReset()
  gameSceneDirMock.mockImplementation(async (_cwd: string): Promise<string> => '/mock/scene')

  fileSystemEventsOnMock.mockReset()
  loggerDebugMock.mockReset()
  loggerErrorMock.mockReset()
  loggerInfoMock.mockReset()
  loggerWarnMock.mockReset()

  useWorkspaceStoreMock.mockReset()
  useWorkspaceStoreMock.mockReturnValue(workspaceStoreState)
}

resetStatementEditorRuntime()

export function createEntry(rawText: string): StatementEntry {
  return {
    id: 1,
    rawText,
    parsed: undefined,
    parseError: false,
  }
}

export function createSentence(overrides: Partial<ISentence> = {}): ISentence {
  const command = overrides.command ?? commandType.say

  return {
    command,
    commandRaw: overrides.commandRaw ?? commandType[command],
    content: '',
    args: [],
    sentenceAssets: [],
    subScene: [],
    inlineComment: '',
    ...overrides,
  }
}

export function createHarness(rawText: string) {
  const updates: StatementUpdatePayload[] = []
  const editor = useStatementEditor({
    entry: createEntry(rawText),
    emitUpdate(payload) {
      updates.push(payload)
    },
  })
  return { editor, updates }
}

export function createReactiveHarness(rawText: string) {
  const updates: StatementUpdatePayload[] = []
  const entry = ref(createEntry(rawText))
  const editor = useStatementEditor({
    entry,
    emitUpdate(payload) {
      updates.push(payload)
      entry.value = {
        ...entry.value,
        parseError: false,
        parsed: payload.parsed,
        rawText: payload.rawText,
      }
    },
  })
  return { editor, entry, updates }
}

export async function flushMicrotasks(times = 1): Promise<void> {
  if (times <= 0) {
    return
  }
  await Promise.resolve()
  await flushMicrotasks(times - 1)
}

export function requireArgField(
  editor: ReturnType<typeof useStatementEditor>,
  key: string,
): ArgField {
  const argField = editor.params.argFields.value.find(field => field.field.key === key)
  if (!argField) {
    throw new TypeError(`missing arg field: ${key}`)
  }
  return argField
}
