<script setup lang="ts">
import { join } from '@tauri-apps/api/path'
import { exists, writeTextFile } from '@tauri-apps/plugin-fs'
import sanitize from 'sanitize-filename'
import { useForm } from 'vee-validate'
import * as z from 'zod'

import { FormField } from '~/components/ui/form'

let open = $(defineModel<boolean>('open'))

const props = defineProps<{
  onSuccess?: (filePath: string) => void
}>()

const workspaceStore = useWorkspaceStore()
const { t } = useI18n()

async function buildSceneFilePath(fileName: string): Promise<string | undefined> {
  if (!workspaceStore.CWD) {
    return
  }

  const sanitizedName = sanitize(fileName, { replacement: '_' })
  const fileNameWithExt = sanitizedName.endsWith('.txt')
    ? sanitizedName
    : `${sanitizedName}.txt`

  const folderPath = await join(workspaceStore.CWD, 'game', 'scene')
  return await join(folderPath, fileNameWithExt)
}

async function isFileAvailable(fileName: string): Promise<boolean> {
  const filePath = await buildSceneFilePath(fileName)
  if (!filePath) {
    return false
  }
  return !(await exists(filePath))
}

const schema = z.object({
  fileName: z.preprocess(
    val => val || '',
    z.string().min(1, t('modals.createFile.fileNameRequired')),
  ),
}).refine(
  async (data) => {
    return await isFileAvailable(data.fileName)
  },
  {
    message: t('modals.createFile.fileExists'),
    path: ['fileName'],
  },
)

const { handleSubmit } = useForm({
  validationSchema: schema,
})

const onSubmit = handleSubmit(async (values) => {
  const filePath = await buildSceneFilePath(values.fileName)
  if (!filePath) {
    return
  }

  try {
    await writeTextFile(filePath, '')
    await gameManager.updateCurrentGameLastModified()
    open = false
    props.onSuccess?.(filePath)
  } catch (error) {
    logger.error(`创建文件失败: ${error}`)
  }
})
</script>

<template>
  <Dialog ::open="open">
    <DialogContent class="sm:max-w-[425px]">
      <DialogHeader>
        <DialogTitle>{{ $t('modals.createFile.title') }}</DialogTitle>
        <DialogDescription>
          {{ $t('modals.createFile.description') }}
        </DialogDescription>
      </DialogHeader>
      <form id="create-file-form" @submit="onSubmit">
        <FormField v-slot="{ componentField }" name="fileName">
          <FormItem>
            <FormControl>
              <Input v-bind="componentField" :placeholder="$t('modals.createFile.fileNamePlaceholder')" autofocus />
            </FormControl>
            <FormMessage />
          </FormItem>
        </FormField>
      </form>
      <DialogFooter>
        <Button form="create-file-form" type="submit" class="w-full">
          {{ $t('modals.createFile.create') }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
