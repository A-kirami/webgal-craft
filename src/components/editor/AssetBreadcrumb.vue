<script setup lang="ts">
import { useWorkspaceStore } from '~/stores/workspace'
import { joinPath } from '~/utils/path'

const { assetType } = defineProps<{ assetType: string }>()

let currentPath = $(defineModel<string>('current-path', { required: true }))

const workspaceStore = useWorkspaceStore()

const rootPath = $computed(() => {
  const gamePath = workspaceStore.currentGame?.path
  if (!gamePath) {
    return ''
  }
  return joinPath(gamePath, 'game', assetType)
})

function handleNavigate(path: string) {
  currentPath = path
}
</script>

<template>
  <PathBreadcrumb
    :root-path="rootPath"
    :current-path="currentPath"
    @navigate="handleNavigate"
  />
</template>
