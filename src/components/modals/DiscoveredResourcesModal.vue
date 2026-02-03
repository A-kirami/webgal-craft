<script setup lang="ts">
import { Box, CheckCircle2, Scroll } from 'lucide-vue-next'

let open = $(defineModel<boolean>('open'))

const props = defineProps<{
  type: 'games' | 'engines'
  resources: { path: string, name: string, icon?: string }[]
  onImport?: (paths: string[]) => void
}>()

let selectedPaths = $ref(new Set(props.resources.map(r => r.path)))

const toggleSelection = (path: string) => {
  if (selectedPaths.has(path)) {
    selectedPaths.delete(path)
  } else {
    selectedPaths.add(path)
  }
}

const toggleAll = () => {
  if (selectedPaths.size === props.resources.length) {
    selectedPaths.clear()
  } else {
    selectedPaths = new Set(props.resources.map(r => r.path))
  }
}

const handleImport = () => {
  open = false
  props.onImport?.([...selectedPaths])
}

const handleSkip = () => {
  open = false
}

const icon = $computed(() => props.type === 'games' ? Scroll : Box)
const isAllSelected = $computed(() => selectedPaths.size === props.resources.length)
</script>

<template>
  <Dialog ::open="open">
    <DialogScrollContent class="max-h-[80vh] max-w-2xl">
      <DialogHeader>
        <DialogTitle class="flex gap-2 items-center">
          {{ type === 'games' ? $t('modals.discoveredResources.gamesTitle') : $t('modals.discoveredResources.enginesTitle') }}
        </DialogTitle>
        <DialogDescription>
          {{ type === 'games'
            ? $t('modals.discoveredResources.gamesDescription', { count: resources.length })
            : $t('modals.discoveredResources.enginesDescription', { count: resources.length })
          }}
        </DialogDescription>
      </DialogHeader>

      <div class="py-2 space-y-3">
        <div class="flex items-center justify-between">
          <Button variant="ghost" size="sm" class="text-xs h-7" @click="toggleAll">
            {{ isAllSelected ? $t('modals.discoveredResources.deselectAll') : $t('modals.discoveredResources.selectAll') }}
          </Button>
          <span class="text-xs text-muted-foreground">
            {{ $t('modals.discoveredResources.selected', { count: selectedPaths.size, total: resources.length }) }}
          </span>
        </div>

        <div class="border rounded-lg max-h-96 overflow-y-auto divide-y">
          <div
            v-for="resource in resources"
            :key="resource.path"
            class="p-3 flex cursor-pointer transition-colors items-center justify-between hover:bg-accent/50"
            :class="{ 'bg-accent': selectedPaths.has(resource.path) }"
            @click="toggleSelection(resource.path)"
          >
            <div class="flex flex-1 gap-3 min-w-0 items-center">
              <Thumbnail
                v-if="resource.icon"
                :path="resource.icon"
                :alt="resource.name"
                :size="64"
                class="rounded shrink-0 size-10"
              />
              <component :is="icon" v-else class="text-muted-foreground shrink-0 size-10" />
              <div class="flex-1 min-w-0">
                <h4 class="font-medium truncate">
                  {{ resource.name }}
                </h4>
                <p class="text-xs text-muted-foreground truncate">
                  {{ resource.path }}
                </p>
              </div>
            </div>
            <CheckCircle2
              class="ml-2 shrink-0 size-5 transition-opacity"
              :class="selectedPaths.has(resource.path) ? 'text-primary opacity-100' : 'text-muted-foreground opacity-0'"
            />
          </div>
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" @click="handleSkip">
          {{ $t('modals.discoveredResources.skip') }}
        </Button>
        <Button :disabled="selectedPaths.size === 0" @click="handleImport">
          {{ $t('modals.discoveredResources.import', { count: selectedPaths.size }) }}
        </Button>
      </DialogFooter>
    </DialogScrollContent>
  </Dialog>
</template>
