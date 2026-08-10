<script setup lang="ts">
import { CopyMinus, FolderOpen, History, PanelRight, Save, X } from '@lucide/vue'

import type { Component } from 'vue'
import type { EditorTabContextMenuAction } from '~/features/editor/editor-tabs/editor-tabs'

interface Props {
  canCloseOthers: boolean
  canCloseRight: boolean
  canCloseSaved: boolean
  canViewHistory: boolean
}

interface Emits {
  action: [action: EditorTabContextMenuAction]
}

interface MenuItem {
  action: EditorTabContextMenuAction
  disabled?: boolean
  icon: Component
  label: string
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()
const { t } = useI18n()

const menuItems = $computed<(MenuItem | 'separator')[]>(() => [
  { action: 'close', icon: X, label: t('edit.editorTabs.close') },
  {
    action: 'closeOthers',
    disabled: !props.canCloseOthers,
    icon: CopyMinus,
    label: t('edit.editorTabs.closeOthers'),
  },
  {
    action: 'closeSaved',
    disabled: !props.canCloseSaved,
    icon: Save,
    label: t('edit.editorTabs.closeSaved'),
  },
  { action: 'closeAll', icon: X, label: t('edit.editorTabs.closeAll') },
  {
    action: 'closeRight',
    disabled: !props.canCloseRight,
    icon: PanelRight,
    label: t('edit.editorTabs.closeRight'),
  },
  'separator',
  ...(props.canViewHistory
    ? [{ action: 'viewHistory' as const, icon: History, label: t('edit.editorTabs.viewHistory') }]
    : []),
  { action: 'revealInExplorer', icon: FolderOpen, label: t('edit.editorTabs.revealInExplorer') },
])

function handleAction(action: EditorTabContextMenuAction): void {
  emit('action', action)
}
</script>

<template>
  <ContextMenu>
    <ContextMenuTrigger as-child>
      <slot />
    </ContextMenuTrigger>
    <ContextMenuContent class="w-52" @close-auto-focus.prevent>
      <template v-for="(menuItem, index) in menuItems" :key="menuItem === 'separator' ? `separator-${index}` : menuItem.action">
        <ContextMenuSeparator v-if="menuItem === 'separator'" />
        <ContextMenuItem
          v-else
          :disabled="menuItem.disabled"
          @click="handleAction(menuItem.action)"
        >
          <component :is="menuItem.icon" class="mr-2 size-3.5" />
          {{ menuItem.label }}
        </ContextMenuItem>
      </template>
    </ContextMenuContent>
  </ContextMenu>
</template>
