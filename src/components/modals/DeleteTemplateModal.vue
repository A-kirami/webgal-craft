<script setup lang="ts">
import { TriangleAlert } from '@lucide/vue'

import { templateManager } from '~/services/template-manager'

import type { Template } from '~/database/model'

const { t } = useI18n()
const open = defineModel<boolean>('open')

const props = defineProps<{
  template: Template
}>()

let isDeleting = $ref(false)

const isUnavailable = $computed(() => props.template.availability !== 'available')

async function handleConfirm() {
  if (isDeleting) {
    return
  }
  isDeleting = true
  try {
    await templateManager.deleteTemplate(props.template)
    open.value = false
    notify.success(isUnavailable
      ? t('modals.deleteTemplate.removeSuccess')
      : t('modals.deleteTemplate.deleteSuccess'))
  } catch (error) {
    notify.error(error instanceof Error ? error.message : String(error))
  } finally {
    isDeleting = false
  }
}
</script>

<template>
  <AlertDialog ::open="open">
    <AlertDialogContent>
      <div class="flex flex-col gap-2 sm:flex-row sm:gap-4 max-sm:items-center">
        <div
          class="text-destructive rounded-lg bg-destructive/10 flex shrink-0 size-9 items-center justify-center"
          aria-hidden="true"
        >
          <TriangleAlert class="size-5" aria-hidden="true" />
        </div>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {{ isUnavailable ? $t('modals.deleteTemplate.removeTitle') : $t('modals.deleteTemplate.title') }}
          </AlertDialogTitle>
          <AlertDialogDescription>
            <i18n-t v-if="isUnavailable" keypath="modals.deleteTemplate.removeDescription" tag="p">
              <template #name>
                <span class="text-foreground font-bold">{{ template.metadata.name }}</span>
              </template>
            </i18n-t>
            <i18n-t v-else keypath="modals.deleteTemplate.description" tag="p">
              <template #name>
                <span class="text-foreground font-bold">{{ template.metadata.name }}</span>
              </template>
            </i18n-t>
            <p>{{ isUnavailable ? $t('modals.deleteTemplate.removeWarning') : $t('modals.deleteTemplate.warning') }}</p>
          </AlertDialogDescription>
        </AlertDialogHeader>
      </div>
      <AlertDialogFooter>
        <AlertDialogCancel>{{ $t('common.cancel') }}</AlertDialogCancel>
        <AlertDialogAction variant="destructive" :disabled="isDeleting" @click="handleConfirm">
          {{ $t('common.confirm') }}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
