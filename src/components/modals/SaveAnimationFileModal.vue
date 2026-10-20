<script setup lang="ts">
import { exists } from '@tauri-apps/plugin-fs'
import { useForm } from 'vee-validate'
import * as z from 'zod'

import { FormField } from '~/components/ui/form'
import { resolveAnimationFileTarget, saveAnimationFile } from '~/features/editor/animation/animation-file'
import { handleError } from '~/utils/error-handler'

import type { AbsPath } from '~/domain/path'
import type { AnimationFrame } from '~/domain/stage/types'
import type { AnimationFileTargetError } from '~/features/editor/animation/animation-file'

let open = $(defineModel<boolean>('open'))

const props = defineProps<{
  frames: readonly AnimationFrame[]
  gamePath: AbsPath
  onSaved?: (animationName: string) => void
}>()

const { t } = useI18n()

const targetErrorMessages: Record<AnimationFileTargetError, string> = {
  'empty': t('modals.saveAnimationFile.fileNameRequired'),
  'invalid-path': t('modals.saveAnimationFile.invalidPath'),
  'reserved-name': t('modals.saveAnimationFile.reservedName'),
}

const schema = z.object({
  fileName: z.preprocess(
    // 字段初始值是 undefined；先归一成空串，避免 zod 在 min 之前抛出未国际化的类型错误
    value => value ?? '',
    z.string().trim().min(1, { error: t('modals.saveAnimationFile.fileNameRequired') })
      .superRefine((value, ctx) => {
        const resolution = resolveAnimationFileTarget(props.gamePath, value)
        if (!resolution.ok) {
          ctx.addIssue({
            code: 'custom',
            message: targetErrorMessages[resolution.error],
          })
        }
      }),
  ),
})

const { handleSubmit, isSubmitting, setFieldError } = useForm({
  validationSchema: schema,
})

const onSubmit = handleSubmit(async (values) => {
  const resolution = resolveAnimationFileTarget(props.gamePath, values.fileName)
  if (!resolution.ok) {
    setFieldError('fileName', targetErrorMessages[resolution.error])
    return
  }

  const { target } = resolution
  try {
    if (await exists(target.filePath)) {
      setFieldError('fileName', t('modals.saveAnimationFile.fileExists'))
      return
    }

    await saveAnimationFile(props.gamePath, target, props.frames)
  } catch (error) {
    handleError(error, { context: t('modals.saveAnimationFile.saveFailed') })
    return
  }

  open = false
  props.onSaved?.(target.animationName)
})
</script>

<template>
  <Dialog ::open="open">
    <DialogContent class="sm:max-w-[425px]">
      <DialogHeader>
        <DialogTitle>{{ $t('modals.saveAnimationFile.title') }}</DialogTitle>
        <DialogDescription>
          {{ $t('modals.saveAnimationFile.description') }}
        </DialogDescription>
      </DialogHeader>
      <form id="save-animation-file-form" @submit="onSubmit">
        <FormField v-slot="{ componentField }" name="fileName">
          <FormItem>
            <FormControl>
              <Input v-bind="componentField" :placeholder="$t('modals.saveAnimationFile.fileNamePlaceholder')" autofocus />
            </FormControl>
            <FormMessage />
          </FormItem>
        </FormField>
      </form>
      <DialogFooter>
        <Button form="save-animation-file-form" type="submit" class="w-full" :disabled="isSubmitting">
          {{ $t('modals.saveAnimationFile.save') }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
