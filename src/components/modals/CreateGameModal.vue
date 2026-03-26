<script setup lang="ts">
import { FolderOpen } from 'lucide-vue-next'

import { FormField } from '~/components/ui/form'
import { useCreateGameForm } from '~/features/modals/create-game/useCreateGameForm'

const open = defineModel<boolean>('open')

const props = defineProps<{
  onSuccess?: (gameId: string) => void
}>()

const gameNameFieldId = 'create-game-name'
const gamePathFieldId = 'create-game-path'

const {
  engineOptions,
  handleCompositionEnd,
  handleCompositionStart,
  handleGameNameChange,
  handleSelectFolder,
  isFieldDirty,
  onSubmit,
} = useCreateGameForm({
  open,
  onSuccess: props.onSuccess,
})
</script>

<template>
  <Dialog ::open="open">
    <DialogContent class="sm:max-w-[425px]">
      <DialogHeader>
        <DialogTitle>{{ $t('modals.createGame.title') }}</DialogTitle>
        <DialogDescription>
          {{ $t('modals.createGame.description') }}
        </DialogDescription>
      </DialogHeader>
      <form id="create-game-form" @submit="onSubmit">
        <div class="gap-4 grid">
          <FormField v-slot="{ componentField }" name="gameName" :validate-on-blur="!isFieldDirty">
            <FormItem class="px-2 gap-x-4 gap-y-2 grid grid-cols-[auto_1fr] items-center space-y-0">
              <FormLabel :for="gameNameFieldId" class="text-right whitespace-nowrap">
                {{ $t('modals.createGame.gameName') }}
              </FormLabel>
              <FormControl>
                <Input
                  :id="gameNameFieldId"
                  v-bind="componentField"
                  class="w-full"
                  @input="handleGameNameChange"
                  @compositionstart="handleCompositionStart"
                  @compositionend="handleCompositionEnd"
                />
              </FormControl>
              <FormMessage class="col-start-2" />
            </FormItem>
          </FormField>

          <FormField v-slot="{ componentField }" name="gamePath" :validate-on-blur="false" :validate-on-change="false">
            <FormItem class="px-2 gap-x-4 gap-y-2 grid grid-cols-[auto_1fr] items-center space-y-0">
              <FormLabel :for="gamePathFieldId" class="text-right whitespace-nowrap">
                {{ $t('modals.createGame.saveLocation') }}
              </FormLabel>
              <div class="flex gap-2">
                <FormControl>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger as-child>
                        <Input :id="gamePathFieldId" v-bind="componentField" class="bg-accent flex-1 cursor-default!" disabled />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{{ componentField.modelValue }}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </FormControl>
                <Button :aria-label="$t('modals.createGame.selectSaveLocation')" variant="outline" size="icon" type="button" @click="handleSelectFolder">
                  <FolderOpen class="h-4 w-4" />
                </Button>
              </div>
              <FormMessage class="col-start-2" />
            </FormItem>
          </FormField>

          <FormField v-slot="{ componentField }" name="gameEngine" :validate-on-blur="!isFieldDirty">
            <FormItem class="px-2 gap-x-4 gap-y-2 grid grid-cols-[auto_1fr] items-center space-y-0">
              <FormLabel class="text-right whitespace-nowrap">
                {{ $t('modals.createGame.gameEngine') }}
              </FormLabel>
              <FormControl>
                <Select v-bind="componentField">
                  <SelectTrigger class="w-full">
                    <SelectValue :placeholder="$t('modals.createGame.selectEngine')" />
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
          {{ $t('modals.createGame.create') }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
