<script setup lang="ts">
import { join } from '@tauri-apps/api/path'
import { open as openDialog } from '@tauri-apps/plugin-dialog'
import { exists, readDir } from '@tauri-apps/plugin-fs'
import { FolderOpen } from 'lucide-vue-next'
import sanitize from 'sanitize-filename'
import { useForm } from 'vee-validate'
import * as z from 'zod'

import { FormField } from '~/components/ui/form'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '~/components/ui/tooltip'

const open = defineModel<boolean>('open')

const props = defineProps<{
  onSuccess?: (gameId: string) => void
}>()

const settingsStore = useSettingsStore()

const checkPath = async (path: string) => {
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
  gameName: z.string(),
  gamePath: z.string().refine(
    async path => await checkPath(path),
    '游戏保存目录必须不存在或为空',
  ),
  gameEngine: z.string(),
})

const { handleSubmit, isFieldDirty, setFieldValue } = useForm({
  validationSchema: schema,
  initialValues: { gamePath: settingsStore.gameSavePath },
})

let isComposing = $ref(false)
let isPathManuallyChanged = $ref(false)

const handleGameNameChange = async (event: Event) => {
  if (isComposing) {
    return
  }

  const value = (event.target as HTMLInputElement).value
  const sanitizeGameName = sanitize(value ?? '', { replacement: '_' })
  const gamePath = await join(settingsStore.gameSavePath, sanitizeGameName)
  if (!isPathManuallyChanged) {
    setFieldValue('gamePath', gamePath, false)
  }
}

const handleCompositionStart = () => {
  isComposing = true
}

const handleCompositionEnd = async (event: Event) => {
  isComposing = false
  handleGameNameChange(event)
}

const handleSelectFolder = async () => {
  const selected = await openDialog({
    title: '游戏保存位置',
    directory: true,
    multiple: false,
    defaultPath: settingsStore.gameSavePath,
  })

  if (selected) {
    isPathManuallyChanged = true
    setFieldValue('gamePath', selected, false)
  }
}

const resourceStore = useResourceStore()

const engineOptions = computed(() => {
  return resourceStore.engines?.map(engine => ({
    id: engine.id,
    name: engine.metadata.name,
  }))
})

const onSubmit = handleSubmit(async (values) => {
  const engine = resourceStore.engines?.find(engine => engine.id === values.gameEngine)
  if (!engine) {
    return
  }
  open.value = false
  const gameId = await gameManager.createGame(values.gameName, values.gamePath, engine.path)
  props.onSuccess?.(gameId)
})
</script>

<template>
  <Dialog ::open="open">
    <DialogContent class="sm:max-w-[425px]">
      <DialogHeader>
        <DialogTitle>创建新游戏</DialogTitle>
        <DialogDescription>
          从这里开始你的新创作
        </DialogDescription>
      </DialogHeader>
      <form id="create-game-form" @submit="onSubmit">
        <div class="gap-4 grid">
          <FormField v-slot="{ componentField }" name="gameName" :validate-on-blur="!isFieldDirty">
            <FormItem class="px-2 gap-x-4 gap-y-2 grid grid-cols-[auto_1fr] items-center space-y-0">
              <FormLabel class="text-right whitespace-nowrap">
                游戏名称
              </FormLabel>
              <FormControl>
                <Input v-bind="componentField" class="w-full" @input="handleGameNameChange" @compositionstart="handleCompositionStart" @compositionend="handleCompositionEnd" />
              </FormControl>
              <FormMessage class="col-start-2" />
            </FormItem>
          </FormField>

          <FormField v-slot="{ componentField }" name="gamePath" :validate-on-blur="false" :validate-on-change="false">
            <FormItem class="px-2 gap-x-4 gap-y-2 grid grid-cols-[auto_1fr] items-center space-y-0">
              <FormLabel class="text-right whitespace-nowrap">
                保存位置
              </FormLabel>
              <div class="flex gap-2">
                <FormControl>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger as-child>
                        <Input v-bind="componentField" class="bg-accent flex-1 cursor-default!" disabled />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{{ componentField.modelValue }}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </FormControl>
                <Button variant="outline" size="icon" type="button" @click="handleSelectFolder">
                  <FolderOpen class="h-4 w-4" />
                </Button>
              </div>
              <FormMessage class="col-start-2" />
            </FormItem>
          </FormField>

          <FormField v-slot="{ componentField }" name="gameEngine" :validate-on-blur="!isFieldDirty">
            <FormItem class="px-2 gap-x-4 gap-y-2 grid grid-cols-[auto_1fr] items-center space-y-0">
              <FormLabel class="text-right whitespace-nowrap">
                游戏引擎
              </FormLabel>
              <FormControl>
                <Select v-bind="componentField">
                  <SelectTrigger class="w-full">
                    <SelectValue placeholder="选择游戏引擎" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem v-for="engine in engineOptions" :key="engine.id" :value="engine.id">
                      {{ engine.name }}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </FormControl>
              <FormMessage class="col-start-2" />
            </FormItem>
          </FormField>
        </div>
      </form>
      <DialogFooter>
        <Button form="create-game-form" type="submit" class="w-full">
          创建
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
