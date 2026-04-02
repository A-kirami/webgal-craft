import { join } from '@tauri-apps/api/path'
import { open as openDialog } from '@tauri-apps/plugin-dialog'
import { exists, readDir } from '@tauri-apps/plugin-fs'
import { useForm } from 'vee-validate'
import * as z from 'zod'

import {
  resolveCreateGameDefaultEngineId,
  resolveCreateGamePathSuggestion,
} from '~/features/modals/create-game/create-game-modal'
import { gameManager } from '~/services/game-manager'
import { useResourceStore } from '~/stores/resource'
import { useStorageSettingsStore } from '~/stores/storage-settings'

interface UseCreateGameFormOptions {
  open: Ref<boolean | undefined>
  onSuccess?: (gameId: string) => void
}

interface CreateGameFormValues {
  gameName: string
  gamePath: string
  gameEngine: string
}

export function useCreateGameForm(options: UseCreateGameFormOptions) {
  const storageSettingsStore = useStorageSettingsStore()
  const resourceStore = useResourceStore()
  const { t } = useI18n()

  async function checkPath(path: string): Promise<boolean> {
    try {
      const pathExists = await exists(path)
      if (!pathExists) {
        return true
      }

      const entries = await readDir(path)
      return entries.length === 0
    } catch (error) {
      void logger.error(`检查路径 ${path} 失败: ${error}`)
      return false
    }
  }

  const schema = z.object({
    gameName: z.preprocess(
      value => value ?? '',
      z.string().min(1, t('modals.createGame.gameNameRequired')),
    ),
    gamePath: z.string().refine(
      async path => await checkPath(path),
      t('modals.createGame.pathNotEmpty'),
    ),
    gameEngine: z.string(),
  })

  const { handleSubmit, isFieldDirty: checkIsFieldDirty, setFieldValue } = useForm({
    validationSchema: schema,
    initialValues: { gamePath: storageSettingsStore.gameSavePath },
  })

  let isComposing = $ref(false)
  let isPathManuallyChanged = $ref(false)

  async function handleGameNameChange(event: Event): Promise<void> {
    const value = (event.target as HTMLInputElement).value
    const gamePath = await resolveCreateGamePathSuggestion({
      gameName: value,
      gameSavePath: storageSettingsStore.gameSavePath,
      isComposing,
      isPathManuallyChanged,
      joinPath: join,
    })

    if (gamePath !== undefined) {
      setFieldValue('gamePath', gamePath, false)
    }
  }

  function handleCompositionStart(): void {
    isComposing = true
  }

  async function handleCompositionEnd(event: Event): Promise<void> {
    isComposing = false
    await handleGameNameChange(event)
  }

  async function handleSelectFolder(): Promise<void> {
    const selected = await openDialog({
      title: t('modals.createGame.selectSaveLocation'),
      directory: true,
      multiple: false,
      defaultPath: storageSettingsStore.gameSavePath,
    })

    if (selected) {
      isPathManuallyChanged = true
      setFieldValue('gamePath', selected, false)
    }
  }

  const engineOptions = computed(() => {
    return resourceStore.engines?.map(engine => ({
      id: engine.id,
      name: engine.metadata.name,
    }))
  })

  function resolveCreateGameErrorMessage(error: unknown): string {
    if (error instanceof Error && error.message) {
      return error.message
    }

    return t('modals.createGame.createFailed')
  }

  const isFieldDirty = computed(() => {
    return checkIsFieldDirty('gameName')
      || checkIsFieldDirty('gamePath')
      || checkIsFieldDirty('gameEngine')
  })

  watch(engineOptions, (options_) => {
    const defaultEngineId = resolveCreateGameDefaultEngineId(options_)
    if (!defaultEngineId || checkIsFieldDirty('gameEngine')) {
      return
    }

    setFieldValue('gameEngine', defaultEngineId)
  }, {
    immediate: true,
  })

  const onSubmit = handleSubmit(async (values: CreateGameFormValues) => {
    const engine = resourceStore.engines?.find(engine => engine.id === values.gameEngine)
    if (!engine) {
      notify.error(t('home.engines.noEngineContent'))
      return
    }

    try {
      const gameId = await gameManager.createGame(values.gameName, values.gamePath, engine.path)
      options.open.value = false
      options.onSuccess?.(gameId)
    } catch (error) {
      notify.error(resolveCreateGameErrorMessage(error))
    }
  })

  return {
    engineOptions,
    handleCompositionEnd,
    handleCompositionStart,
    handleGameNameChange,
    handleSelectFolder,
    isFieldDirty,
    onSubmit,
  }
}
