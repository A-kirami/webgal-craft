import { open } from '@tauri-apps/plugin-dialog'
import { exists, readDir } from '@tauri-apps/plugin-fs'
import { useForm } from 'vee-validate'
import * as z from 'zod'

import { db } from '~/database/db'
import {
  resolveCreateGamePathSuggestion,
} from '~/features/modals/create-game/create-game-modal'
import { gameManager } from '~/services/game-manager'
import { resourceReconcile } from '~/services/resource-reconcile'
import { useStorageSettingsStore } from '~/stores/storage-settings'

import type { TemplateBinding } from '~/types/project-config'

interface UseCreateGameFormOptions {
  open: Ref<boolean | undefined>
  onSuccess?: (gameId: string) => void
}

export function useCreateGameForm(options: UseCreateGameFormOptions) {
  const storageSettingsStore = useStorageSettingsStore()
  const { t } = useI18n()

  async function checkPathAvailable(path: string): Promise<boolean> {
    try {
      if (!(await exists(path))) {
        return true
      }

      const entries = await readDir(path)
      return entries.length === 0
    } catch (error) {
      logger.error(`检查路径 ${path} 失败: ${error}`)
      return false
    }
  }

  const schema = z.object({
    gameName: z.preprocess(
      value => value ?? '',
      z.string().min(1, { error: t('modals.createGame.gameNameRequired') }),
    ),
    gamePath: z.string().refine(
      checkPathAvailable,
      { error: t('modals.createGame.pathNotEmpty') },
    ),
    gameEngine: z.string().min(1, t('home.engines.noEngineContent')),
    gameTemplate: z.custom<TemplateBinding | undefined>().optional(),
  })

  const { handleSubmit, isFieldDirty: checkIsFieldDirty, setFieldValue } = useForm({
    validationSchema: schema,
    initialValues: {
      gamePath: storageSettingsStore.gameSavePath,
      gameTemplate: undefined,
    },
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
    const selected = await open({
      title: t('modals.createGame.selectSaveLocation'),
      directory: true,
      multiple: false,
      defaultPath: storageSettingsStore.gameSavePath,
    })

    if (typeof selected === 'string') {
      isPathManuallyChanged = true
      setFieldValue('gamePath', selected, false)
    }
  }

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
      || checkIsFieldDirty('gameTemplate')
  })

  const onSubmit = handleSubmit(async ({ gameName, gamePath, gameEngine, gameTemplate }) => {
    // 提交时即时校验所选引擎，避免基于过期 availability 创建游戏后才在引擎层报错
    const engine = await db.engines.get(gameEngine)
    const engineAvailability = engine ? await resourceReconcile.reconcileEngineRecord(engine) : undefined
    if (engineAvailability !== 'available') {
      notify.error(t('modals.createGame.engineUnavailable'))
      setFieldValue('gameEngine', '', false)
      return
    }

    // standalone 模板同样需即时校验，防止在 game/template 复制阶段才报路径不存在
    if (gameTemplate?.kind === 'standalone') {
      const template = await db.templates.where('metadata.name').equals(gameTemplate.name).first()
      if (template) {
        const templateAvailability = await resourceReconcile.reconcileTemplateRecord(template)
        if (templateAvailability !== 'available') {
          notify.error(t('modals.createGame.templateUnavailable'))
          setFieldValue('gameTemplate', undefined, false)
          return
        }
      }
    }

    options.open.value = false

    try {
      const gameId = await gameManager.createGame(gameName, gamePath, gameEngine, {
        templateBinding: gameTemplate,
      })
      options.onSuccess?.(gameId)
    } catch (error) {
      notify.error(resolveCreateGameErrorMessage(error))
    }
  })

  return {
    setFieldValue,
    handleCompositionEnd,
    handleCompositionStart,
    handleGameNameChange,
    handleSelectFolder,
    isFieldDirty,
    onSubmit,
  }
}
