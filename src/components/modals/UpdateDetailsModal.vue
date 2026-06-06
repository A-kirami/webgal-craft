<script setup lang="ts">
import { ExternalLink } from '@lucide/vue'

import SafeMarkdown from '~/components/shared/SafeMarkdown.vue'
import { useAppUpdateStore } from '~/stores/app-update'

import type { AppUpdateInfo } from '~/services/app-update/update-service'

let open = $(defineModel<boolean>('open'))

const props = defineProps<{
  update?: AppUpdateInfo
  onOpenReleasePage?: (version: string) => void | Promise<void>
  onSkipVersion?: () => void | Promise<void>
  onUpdateNow?: () => void | Promise<void>
}>()

const appUpdateStore = useAppUpdateStore()
const { locale } = useI18n()

const updateInfo = $computed(() => props.update ?? appUpdateStore.availableUpdate)
const releaseDate = $computed(() => {
  const date = updateInfo?.date
  if (!date) {
    return
  }

  const parsedDate = new Date(date)
  if (Number.isNaN(parsedDate.getTime())) {
    return date
  }

  return new Intl.DateTimeFormat(locale.value, {
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
    year: 'numeric',
  }).format(parsedDate)
})

function handleUpdateNow(): void {
  open = false
  void props.onUpdateNow?.()
}

async function handleSkipVersion(): Promise<void> {
  await props.onSkipVersion?.()
  open = false
}

async function handleOpenReleasePage(): Promise<void> {
  const version = updateInfo?.version
  if (!version) {
    return
  }

  await props.onOpenReleasePage?.(version)
}
</script>

<template>
  <AlertDialog ::open="open">
    <AlertDialogContent
      v-if="updateInfo"
      data-testid="update-details-modal-content"
      class="grid grid-rows-[auto_minmax(0,1fr)_auto] max-h-[85vh] overflow-hidden sm:max-w-[640px]"
    >
      <AlertDialogHeader class="shrink-0">
        <AlertDialogTitle>
          {{ $t('appUpdate.details.title', { version: updateInfo.version }) }}
        </AlertDialogTitle>
        <AlertDialogDescription>
          {{ $t('appUpdate.details.description', { currentVersion: updateInfo.currentVersion }) }}
        </AlertDialogDescription>
      </AlertDialogHeader>

      <div
        data-testid="update-details-body"
        class="flex flex-1 flex-col gap-4 min-h-0 min-w-0 overflow-hidden"
      >
        <section
          data-testid="update-details-release-notes"
          class="flex flex-1 flex-col gap-2 min-h-0 min-w-0 overflow-hidden"
        >
          <div class="text-sm flex flex-wrap gap-x-4 gap-y-1 items-baseline justify-between">
            <div class="font-medium">
              {{ $t('appUpdate.details.releaseNotes') }}
            </div>
            <time
              v-if="releaseDate"
              class="text-muted-foreground"
            >
              {{ releaseDate }}
            </time>
          </div>
          <ScrollArea
            v-if="updateInfo.body"
            class="flex-scroll-area p-3 border rounded-md bg-muted/25 flex-1 min-h-0 min-w-0 w-full"
            type="auto"
          >
            <SafeMarkdown :source="updateInfo.body" />
          </ScrollArea>
          <p v-else class="text-sm text-muted-foreground">
            {{ $t('appUpdate.details.emptyReleaseNotes') }}
          </p>
        </section>
      </div>

      <AlertDialogFooter class="shrink-0 gap-2 sm:justify-between">
        <Button variant="ghost" class="text-muted-foreground mr-auto" @click="handleOpenReleasePage">
          <ExternalLink class="size-4" aria-hidden="true" />
          {{ $t('appUpdate.details.openReleasePage') }}
        </Button>
        <AlertDialogCancel>
          {{ $t('appUpdate.details.later') }}
        </AlertDialogCancel>
        <Button variant="outline" @click="handleSkipVersion">
          {{ $t('appUpdate.details.skipVersion') }}
        </Button>
        <AlertDialogAction @click="handleUpdateNow">
          <template v-if="appUpdateStore.isDownloaded">
            {{ $t('appUpdate.details.installUpdateNow') }}
          </template>
          <template v-else>
            {{ $t('appUpdate.details.updateNow') }}
          </template>
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
