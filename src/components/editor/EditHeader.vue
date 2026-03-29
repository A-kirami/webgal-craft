<script setup lang="ts">
import { WebviewWindow } from '@tauri-apps/api/webviewWindow'
import { ArrowLeft, Download, Loader2, MonitorPlay, Pencil, Play, Settings } from 'lucide-vue-next'

import { windowCmds } from '~/commands/window'
import { useModalStore } from '~/stores/modal'
import { useWorkspaceStore } from '~/stores/workspace'
import { handleError } from '~/utils/error-handler'

import type { UnlistenFn } from '@tauri-apps/api/event'

const router = useRouter()

const { t } = useI18n()

function handleBack() {
  void closeTestWindow()
  router.push('/')
}

const workspaceStore = useWorkspaceStore()
const modalStore = useModalStore()

const HEADER_ICON_THUMBNAIL = {
  width: 64,
  height: 64,
  resizeMode: 'contain',
} as const

const canTestGame = $computed(() => !!workspaceStore.currentGameServeUrl && !!workspaceStore.currentGame)
const testWindowLabel = $computed(() => (workspaceStore.currentGame ? `test-${workspaceStore.currentGame.id}` : ''))

let isTestOpening = $ref(false)
let isTestWindowActive = $ref(false)
let unlistenWindowClosed: UnlistenFn | undefined
let lastTestWindowLabel = $ref('')

async function handleTestGame() {
  const gameUrl = workspaceStore.currentGameServeUrl
  const currentGame = workspaceStore.currentGame

  if (!canTestGame) {
    return
  }

  if (!gameUrl || !currentGame) {
    logger.warn('无法打开测试窗口，预览地址或当前游戏不存在')
    toast.error(t('edit.header.missingPreviewUrl'))
    return
  }

  const createWindowOptions = {
    label: testWindowLabel,
    target: gameUrl,
    title: currentGame.metadata.name,
    center: true,
    reuse: true,
  }

  if (isTestWindowActive && !isTestOpening) {
    try {
      await windowCmds.createWindow(createWindowOptions)
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.warn(`无法聚焦测试窗口: ${errorMessage}`)
    }
    return
  }

  isTestOpening = true
  try {
    await windowCmds.createWindow(createWindowOptions)
    isTestWindowActive = true
    if (!unlistenWindowClosed) {
      const webview = await WebviewWindow.getByLabel(testWindowLabel)
      if (webview) {
        unlistenWindowClosed = await webview.once('tauri://destroyed', () => {
          isTestWindowActive = false
          unlistenWindowClosed = undefined
        })
      } else {
        logger.warn(`无法获取测试窗口实例: ${testWindowLabel}`)
      }
    }
  } catch (error: unknown) {
    handleError(error, { context: t('edit.header.openFailed') })
  } finally {
    isTestOpening = false
  }
}

watch(
  [() => workspaceStore.currentGame?.id, () => workspaceStore.currentGameServeUrl],
  ([gameId]) => {
    if (gameId) {
      lastTestWindowLabel = `test-${gameId}`
    }
    isTestWindowActive = false
    unlistenWindowClosed?.()
    unlistenWindowClosed = undefined
  },
)

async function closeTestWindow() {
  const label = lastTestWindowLabel || testWindowLabel
  if (!label) {
    return
  }

  const existingWindow = await WebviewWindow.getByLabel(label)
  if (!existingWindow) {
    return
  }

  try {
    await existingWindow.close()
    isTestWindowActive = false
  } catch (error) {
    logger.warn(`无法关闭测试窗口: ${error}`)
  }
}

onBeforeUnmount(() => {
  void closeTestWindow()
  unlistenWindowClosed?.()
})
</script>

<template>
  <header class="px-4 border-b bg-white flex h-12 items-center justify-between dark:bg-gray-950">
    <div class="flex gap-2 items-center">
      <Button variant="ghost" size="icon" class="size-8" @click="handleBack">
        <ArrowLeft class="size-5!" />
        <span class="sr-only">{{ $t('common.back') }}</span>
      </Button>
      <div class="flex gap-2 items-center">
        <AssetImage
          :path="workspaceStore.currentGame?.previewAssets.icon.path"
          :root-path="workspaceStore.CWD"
          :serve-url="workspaceStore.currentGameServeUrl"
          :alt="`${workspaceStore.currentGame?.metadata.name} 游戏图标`"
          :cache-version="workspaceStore.currentGame?.previewAssets.icon.cacheVersion"
          :thumbnail="HEADER_ICON_THUMBNAIL"
          fallback-image="/placeholder.svg"
          class="rounded-md size-6"
        />
        <span class="font-medium">{{ workspaceStore.currentGame?.metadata.name }}</span>
      </div>
      <Button variant="ghost" size="icon" class="size-8" :title="$t('edit.header.gameSettings')" @click="modalStore.open('GameConfigModal')">
        <Pencil class="size-4" />
        <span class="sr-only">{{ $t('edit.header.gameSettings') }}</span>
      </Button>
    </div>
    <div class="flex gap-2 items-center">
      <Button
        :variant="isTestWindowActive ? 'outline' : 'default'"
        size="sm"
        class="gap-1 h-8"
        :class="isTestWindowActive ? 'text-emerald-600 border-emerald-200 bg-emerald-50 hover:bg-emerald-100 hover:text-emerald-800' : ''"
        :disabled="!canTestGame || isTestOpening"
        @click="handleTestGame"
      >
        <Loader2 v-if="isTestOpening" class="size-4 animate-spin" />
        <MonitorPlay v-else-if="isTestWindowActive" class="size-4" />
        <Play v-else class="size-4" />
        {{ $t('edit.header.testGame') }}
      </Button>
      <Button variant="outline" size="sm" class="gap-1 h-8">
        <Download class="size-4" />
        {{ $t('edit.header.export') }}
      </Button>
      <Button variant="ghost" size="icon" class="h-8 w-8" @click="modalStore.open('SettingsModal')">
        <Settings class="size-4" />
        <span class="sr-only">{{ $t('common.settings') }}</span>
      </Button>
    </div>
  </header>
</template>
