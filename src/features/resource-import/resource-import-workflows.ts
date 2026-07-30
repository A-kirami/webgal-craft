import { engineManager } from '~/services/engine-manager'
import { gameManager } from '~/services/game-manager'
import { isAndroidRuntime } from '~/services/platform/runtime'
import { templateManager } from '~/services/template-manager'
import { useManagedImportStore } from '~/stores/managed-import'
import { AppError } from '~/types/errors'

import { androidDirectoryMaterializer } from './android-directory-materializer'
import { desktopDirectoryPicker } from './desktop-directory-picker'

import type {
  DirectoryMaterializer,
  ImportResourceKind,
  PreparedManagedImport,
} from './directory-materializer'
import type { AbsPath } from '~/domain/path'
import type { HomeResourceImportOutcome } from '~/features/home/shared/home-resource-import'
import type { PreparedEngineManagedImport } from '~/services/engine-manager'
import type { PreparedGameManagedImport } from '~/services/game-manager'
import type { PreparedTemplateManagedImport } from '~/services/template-manager'
import type { ResolveImportDependencies } from '~/types/import-dependency-resolution'

interface ManagedImportDomain<TPlan> {
  prepare: (stagingPath: AbsPath) => Promise<
    | { kind: 'duplicate', existingId: string }
    | { kind: 'ready', prepared: PreparedManagedImport<TPlan> }
  >
  register: (finalPath: AbsPath, prepared: PreparedManagedImport<TPlan>) => Promise<{ id: string }>
  duplicateOutcome: 'already-registered' | 'duplicate-error'
}

interface ResourceImportWorkflowOptions<TPlan> {
  kind: ImportResourceKind
  selectTitle: string
  desktopImport: (path: AbsPath) => Promise<HomeResourceImportOutcome | unknown>
  domain: ManagedImportDomain<TPlan>
  afterDesktopCommit?: (resourceId: string) => Promise<unknown> | unknown
  afterManagedCommit?: (resourceId: string) => Promise<unknown> | unknown
  materializer?: DirectoryMaterializer
  android?: boolean
}

export interface ResourceImportWorkflow {
  importFromPicker: () => Promise<HomeResourceImportOutcome | undefined>
  cancel: () => Promise<void>
  readonly isBusy: boolean
}

async function rollbackPreservingError(
  materializer: DirectoryMaterializer,
  sessionId: string,
  originalError: unknown,
): Promise<never> {
  try {
    await materializer.rollback(sessionId)
  } catch (cleanupError) {
    logger.error(`托管导入回滚失败: session=${sessionId}, error=${cleanupError}`)
  }
  throw originalError
}

function createResourceImportWorkflow<TPlan>(
  options: ResourceImportWorkflowOptions<TPlan>,
): ResourceImportWorkflow {
  const store = useManagedImportStore()
  const materializer = options.materializer ?? androidDirectoryMaterializer
  function runningOnAndroid(): boolean {
    if (options.android !== undefined) {
      return options.android
    }

    try {
      return isAndroidRuntime()
    } catch {
      return false
    }
  }

  async function importManaged(): Promise<HomeResourceImportOutcome | undefined> {
    if (!store.begin(options.kind)) {
      throw new AppError('IO_ERROR', '已有目录导入正在进行', {
        details: { reason: 'IMPORT_BUSY' },
      })
    }

    let sessionId: string | undefined
    let registeredId: string | undefined
    try {
      let staged
      try {
        staged = await materializer.selectAndStage(options.kind, {
          operation: { kind: 'import' },
          onProgress: store.updateProgress,
        })
      } catch (error) {
        throw AppError.fromInvoke('selectAndStage', error)
      }
      if (staged.kind === 'cancelled') {
        return
      }

      sessionId = staged.sessionId
      store.updatePhase('validating')
      const preparation = await options.domain.prepare(staged.stagingPath)
      if (preparation.kind === 'duplicate') {
        await materializer.rollback(sessionId)
        sessionId = undefined
        if (options.domain.duplicateOutcome === 'duplicate-error') {
          throw new AppError('DUPLICATE_RESOURCE', '资源已存在')
        }
        return { alreadyRegistered: true }
      }

      store.updatePhase('publishing')
      const { finalPath } = await materializer.publish(
        sessionId,
        preparation.prepared.finalRelativePath,
      )
      store.updatePhase('registering')
      const registered = await options.domain.register(finalPath, preparation.prepared)
      registeredId = registered.id

      try {
        await materializer.commit(sessionId, registeredId)
      } catch (error) {
        logger.error(`托管导入 native commit 失败，保留 session 供恢复: session=${sessionId}, error=${error}`)
      }

      await options.afterManagedCommit?.(registeredId)
      return { alreadyRegistered: false }
    } catch (error) {
      if (sessionId && !registeredId) {
        return rollbackPreservingError(materializer, sessionId, error)
      }
      throw error
    } finally {
      store.finish()
    }
  }

  async function importFromPicker(): Promise<HomeResourceImportOutcome | undefined> {
    if (runningOnAndroid()) {
      return importManaged()
    }

    const path = await desktopDirectoryPicker.selectDirectory(options.selectTitle)
    if (!path) {
      return
    }
    const result = await options.desktopImport(path)
    if (result && typeof result === 'object' && 'id' in result && typeof result.id === 'string') {
      await options.afterDesktopCommit?.(result.id)
    }
    return result as HomeResourceImportOutcome | undefined
  }

  async function cancel(): Promise<void> {
    const sessionId = store.activeSessionId
    if (sessionId) {
      await materializer.cancel(sessionId)
    }
  }

  return {
    importFromPicker,
    cancel,
    get isBusy() {
      return store.activeKind === options.kind
    },
  }
}

export function createGameImportWorkflow(options: {
  selectTitle: string
  resolveDependencies: ResolveImportDependencies
  afterDesktopCommit?: (gameId: string) => Promise<unknown> | unknown
  afterManagedCommit?: (gameId: string) => Promise<unknown> | unknown
  android?: boolean
}): ResourceImportWorkflow {
  return createResourceImportWorkflow<PreparedGameManagedImport['plan']>({
    kind: 'game',
    selectTitle: options.selectTitle,
    desktopImport: path => gameManager.importGame(path, { resolveDependencies: options.resolveDependencies }),
    domain: {
      prepare: gameManager.prepareManagedImport,
      register: (path, prepared) => gameManager.registerManagedImport(path, prepared, {
        resolveDependencies: options.resolveDependencies,
      }),
      duplicateOutcome: 'already-registered',
    },
    afterDesktopCommit: options.afterDesktopCommit,
    afterManagedCommit: options.afterManagedCommit,
    android: options.android,
  })
}

export function createEngineImportWorkflow(selectTitle: string, android?: boolean): ResourceImportWorkflow {
  return createResourceImportWorkflow<PreparedEngineManagedImport['plan']>({
    kind: 'engine',
    selectTitle,
    desktopImport: path => engineManager.importEngine(path),
    domain: {
      prepare: engineManager.prepareManagedImport,
      register: engineManager.registerManagedImport,
      duplicateOutcome: 'already-registered',
    },
    android,
  })
}

export function createTemplateImportWorkflow(selectTitle: string, android?: boolean): ResourceImportWorkflow {
  return createResourceImportWorkflow<PreparedTemplateManagedImport['plan']>({
    kind: 'template',
    selectTitle,
    desktopImport: path => templateManager.importTemplate(path),
    domain: {
      prepare: templateManager.prepareManagedImport,
      register: templateManager.registerManagedImport,
      duplicateOutcome: 'duplicate-error',
    },
    android,
  })
}
