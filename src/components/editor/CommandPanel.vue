<script setup lang="ts">
import { Pencil, Star } from '@lucide/vue'

import { useDragSession } from '~/composables/useDragSession'
import { useDragSource } from '~/composables/useDragTransfer'
import {
  buildCommandPanelGroupTagEntries,
  resolveCommandPanelVisibleCommands,
} from '~/features/editor/command-panel/command-panel'
import {
  categoryTheme,
  commandPanelCategories, CommandPanelCategory,
  getCategoryLabel,
  getCommandDescription,
} from '~/features/editor/command-registry'
import { resolveI18n } from '~/features/editor/command-registry/schema'
import { useShortcutContext } from '~/features/editor/shortcut/useShortcutContext'
import { StatementGroup, useCommandPanelStore } from '~/stores/command-panel'
import { useModalStore } from '~/stores/modal'
import { handleWheelToHorizontalScroll } from '~/utils/wheel'

import type { StyleValue } from 'vue'
import type { commandType } from 'webgal-parser/src/interface/sceneInterface'
import type { ScrollArea } from '~/components/ui/scroll-area'
import type { CommandPanelStatementDragPayload } from '~/types/drag-drop'

const emit = defineEmits<{
  insertCommand: [type: commandType]
  insertGroup: [group: StatementGroup]
}>()

const { t } = useI18n()
const commandPanelStore = useCommandPanelStore()
const activeCategory = $computed(() => commandPanelStore.activeCategory)
const dragSession = useDragSession()

const isGroupsView = $computed(() => activeCategory === 'groups')
const visibleCommands = $computed(() => resolveCommandPanelVisibleCommands(
  activeCategory,
  commandPanelStore.favoriteCommandIds,
))
const isEmptyFavorites = $computed(() => activeCategory === 'favorites' && visibleCommands.length === 0)
const modalStore = useModalStore()

function openDefaultsModal(type: commandType): void {
  modalStore.open('CommandDefaultsModal', { type })
}

function openGroupModal(group?: StatementGroup): void {
  modalStore.open('StatementGroupModal', { group })
}

function deleteGroup(groupId: string): void {
  commandPanelStore.deleteGroup(groupId)
  clearPendingDeleteGroup()
}

let pendingDeleteGroupId = $ref<string | undefined>()

function clearPendingDeleteGroup(): void {
  pendingDeleteGroupId = undefined
}

function handleCategoryClick(category: CommandPanelCategory): void {
  commandPanelStore.setActiveCategory(category)
}

function getFavoriteActionLabel(type: commandType): string {
  if (commandPanelStore.isFavorite(type)) {
    return t('edit.visualEditor.commandPanel.removeFavorite')
  }
  return t('edit.visualEditor.commandPanel.addFavorite')
}

function handleDeletePopoverOpenChange(groupId: string, open: boolean): void {
  pendingDeleteGroupId = open ? groupId : undefined
}

function requestDeleteGroup(groupId: string): void {
  pendingDeleteGroupId = groupId
}

const commandAreaRef = $(useTemplateRef('commandAreaRef'))
const commandAreaViewport = $computed(() =>
  commandAreaRef?.viewport?.viewportElement as HTMLElement | undefined,
)
const commandAreaViewportRef = computed(() => commandAreaViewport)
const commandDragSource = useDragSource<CommandPanelStatementDragPayload>({
  autoScroll: {
    container: commandAreaViewportRef,
    edgeSize: 32,
  },
  getData: getCommandPanelDragPayload,
  type: 'command-panel-statement',
})

function resetScrollTop(): void {
  nextTick(() => {
    const el = commandAreaRef?.viewport?.viewportElement as HTMLElement | undefined
    if (el) {
      el.scrollTop = 0
    }
  })
}

// 切换分类时重置滚动位置
watch(() => commandPanelStore.activeCategory, () => {
  resetScrollTop()
})

const groupTagEntriesMap = $computed(() => {
  const map = new Map<string, ReturnType<typeof buildCommandPanelGroupTagEntries>>()
  for (const group of commandPanelStore.groups) {
    map.set(group.id, buildCommandPanelGroupTagEntries(group, t))
  }
  return map
})

function getGroupTagEntries(groupId: string) {
  return groupTagEntriesMap.get(groupId) ?? []
}

function getCommandPanelDragPayload(element: HTMLElement): CommandPanelStatementDragPayload {
  const { dataset } = element
  const kind = dataset.commandPanelDragKind
  const label = dataset.commandPanelDragLabel ?? ''

  if (kind === 'group') {
    const group = commandPanelStore.groups.find(item => item.id === dataset.commandPanelGroupId)
    return {
      label: group?.name ?? label,
      rawTexts: group ? [...group.rawTexts] : [],
      source: 'command-panel',
      type: 'command-panel-statement',
    }
  }

  const rawType = dataset.commandPanelCommandType
  const type = rawType === undefined ? undefined : Number(rawType) as commandType
  return {
    label,
    rawTexts: type === undefined ? [] : [commandPanelStore.getInsertText(type)],
    source: 'command-panel',
    type: 'command-panel-statement',
  }
}

const activeCommandPanelPayload = $computed(() => {
  const state = dragSession.state.value
  if (
    !state.isActive
    || state.mode !== 'transfer'
    || state.payload?.type !== 'command-panel-statement'
    || state.payload.source !== 'command-panel'
  ) {
    return
  }

  return state.payload
})

const dragOverlayStyle = $computed<StyleValue | undefined>(() => {
  const currentPosition = dragSession.state.value.currentPosition
  if (!activeCommandPanelPayload || !currentPosition) {
    return
  }

  return {
    transform: `translate3d(${currentPosition.x + 6}px, ${currentPosition.y + 6}px, 0)`,
    zIndex: '9999',
  }
})

useShortcutContext({
  panelFocus: 'commandPanel',
}, {
  trackFocus: true,
})
</script>

<template>
  <div class="flex flex-col h-full min-h-0">
    <div class="px-2 py-1 border-b flex gap-3 items-center">
      <ScrollArea @wheel="handleWheelToHorizontalScroll">
        <div class="flex flex-1 gap-1">
          <Button
            variant="ghost"
            size="sm"
            class="px-3 rounded-sm shrink-0 h-6"
            :class="activeCategory === 'all' && 'bg-accent text-accent-foreground'"
            :aria-pressed="activeCategory === 'all'"
            @click="handleCategoryClick('all')"
          >
            {{ getCategoryLabel('all', t) }}
          </Button>
          <Button
            v-for="category in commandPanelCategories"
            :key="category"
            variant="ghost"
            size="sm"
            class="px-3 rounded-sm shrink-0 h-6"
            :class="activeCategory === category && `${categoryTheme[category].bg} ${categoryTheme[category].text} ${categoryTheme[category].hoverBg} ${categoryTheme[category].hoverText}`"
            :aria-pressed="activeCategory === category"
            @click="handleCategoryClick(category)"
          >
            {{ getCategoryLabel(category, t) }}
          </Button>
        </div>
        <ScrollBar orientation="horizontal" class="opacity-75 h-1.5 -mb-0.25 hover:opacity-100" />
      </ScrollArea>

      <Separator orientation="vertical" class="h-5" />

      <div class="flex gap-1 items-center">
        <Button
          variant="ghost"
          size="sm"
          class="px-3 py-1 rounded-sm shrink-0 h-6"
          :class="activeCategory === 'favorites' && 'bg-cyan-50 dark:bg-cyan-950 text-cyan-500 hover:bg-cyan-100 dark:hover:bg-cyan-900 hover:text-cyan-600 dark:hover:text-cyan-400'"
          :aria-pressed="activeCategory === 'favorites'"
          @click="handleCategoryClick('favorites')"
        >
          {{ getCategoryLabel('favorites', t) }}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          class="px-3 py-1 rounded-sm shrink-0 h-6"
          :class="activeCategory === 'groups' && 'bg-violet-50 dark:bg-violet-950 text-violet-500 hover:bg-violet-100 dark:hover:bg-violet-900 hover:text-violet-600 dark:hover:text-violet-400'"
          :aria-pressed="activeCategory === 'groups'"
          @click="handleCategoryClick('groups')"
        >
          {{ getCategoryLabel('groups', t) }}
        </Button>
      </div>
    </div>

    <TooltipProvider :skip-delay-duration="0">
      <ScrollArea ref="commandAreaRef" class="flex-1 min-h-0">
        <div
          v-if="isEmptyFavorites"
          class="text-muted-foreground p-2 text-center grid inset-0 place-items-center absolute"
          role="status"
        >
          <p class="text-sm">
            {{ $t('edit.visualEditor.commandPanel.emptyFavorites') }}
          </p>
        </div>
        <div
          v-else
          class="p-2 gap-1.5 grid"
          style="grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));"
        >
          <template v-if="!isGroupsView">
            <CommandPanelCard
              v-for="entry in visibleCommands"
              :key="entry.type"
              :title="resolveI18n(entry.label, t)"
              :description="getCommandDescription(entry.type, t)"
              :drag-data="{
                kind: 'command',
                commandType: entry.type,
                label: resolveI18n(entry.label, t),
              }"
              :drag-source="commandDragSource"
              :icon="entry.icon"
              :gradient="categoryTheme[entry.category].gradient"
              :icon-bg="categoryTheme[entry.category].bg"
              :icon-text="categoryTheme[entry.category].text"
              :actions-always-visible="commandPanelStore.isFavorite(entry.type)"
              @click="emit('insertCommand', entry.type)"
            >
              <template #actions>
                <Button
                  v-if="!entry.locked"
                  variant="ghost"
                  size="sm"
                  class="p-0 opacity-0 size-6 group-focus-visible:opacity-60 group-has-[:focus-visible]:opacity-60 group-hover:opacity-60 hover:opacity-100 [&_svg]:size-3.5"
                  :title="$t('edit.visualEditor.commandPanel.editDefaults')"
                  @click="openDefaultsModal(entry.type)"
                >
                  <Pencil aria-hidden="true" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  class="p-0 size-6 transition-all hover:text-amber-500 hover:opacity-100 [&_svg]:size-3.5"
                  :class="commandPanelStore.isFavorite(entry.type) ? 'text-amber-500 opacity-100' : 'opacity-60'"
                  :title="getFavoriteActionLabel(entry.type)"
                  :aria-label="getFavoriteActionLabel(entry.type)"
                  :aria-pressed="commandPanelStore.isFavorite(entry.type)"
                  @click="commandPanelStore.toggleFavorite(entry.type)"
                >
                  <Star
                    :fill="commandPanelStore.isFavorite(entry.type) ? 'currentColor' : 'none'"
                    aria-hidden="true"
                  />
                </Button>
              </template>
            </CommandPanelCard>
          </template>

          <template v-else>
            <CommandPanelCard
              v-for="group in commandPanelStore.groups"
              :key="group.id"
              :title="group.name"
              :drag-data="{
                kind: 'group',
                groupId: group.id,
                label: group.name,
              }"
              :drag-source="commandDragSource"
              icon="i-lucide-box"
              gradient="from-violet-500 to-fuchsia-300"
              icon-bg="bg-violet-50 dark:bg-violet-950"
              icon-text="text-violet-500"
              @click="emit('insertGroup', group)"
            >
              <template #tooltip>
                <div class="text-xs flex flex-col gap-1.5 min-w-28">
                  <div>
                    {{ $t('edit.visualEditor.commandPanel.groupCount', { count: group.rawTexts.length }) }}
                  </div>
                  <template v-if="getGroupTagEntries(group.id).length > 0">
                    <Separator />
                    <div
                      v-for="entry in getGroupTagEntries(group.id)"
                      :key="entry.label"
                      class="flex gap-4 items-center justify-between"
                    >
                      <span>{{ entry.label }}</span>
                      <span class="text-primary-foreground tabular-nums">{{ entry.count }}</span>
                    </div>
                  </template>
                </div>
              </template>
              <template #actions>
                <Button
                  variant="ghost"
                  size="sm"
                  class="p-0 opacity-60 size-6 hover:opacity-100 [&_svg]:size-3"
                  :title="$t('common.edit')"
                  @click="openGroupModal(group)"
                >
                  <Pencil aria-hidden="true" />
                </Button>
                <Popover :open="pendingDeleteGroupId === group.id" @update:open="value => handleDeletePopoverOpenChange(group.id, value)">
                  <PopoverTrigger as-child>
                    <Button
                      variant="ghost"
                      size="sm"
                      class="p-0 opacity-60 size-6 hover:text-destructive hover:opacity-100"
                      :title="$t('common.delete')"
                      @click="requestDeleteGroup(group.id)"
                    >
                      <div class="i-lucide-trash-2 size-3" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent class="p-3 w-auto" side="top" align="end" @click.stop>
                    <p class="text-sm mb-2">
                      {{ $t('edit.visualEditor.commandPanel.confirmDeleteGroup') }}
                    </p>
                    <div class="flex gap-2 justify-end">
                      <Button variant="outline" size="sm" class="h-6" @click="clearPendingDeleteGroup">
                        {{ $t('common.cancel') }}
                      </Button>
                      <Button variant="destructive" size="sm" class="h-6" @click="deleteGroup(group.id)">
                        {{ $t('common.delete') }}
                      </Button>
                    </div>
                  </PopoverContent>
                </Popover>
              </template>
            </CommandPanelCard>

            <CommandPanelCard
              :title="$t('edit.visualEditor.commandPanel.createGroup')"
              :description="$t('edit.visualEditor.commandPanel.createGroupDescription')"
              icon="i-lucide-plus"
              gradient="from-border to-border"
              dashed
              @click="openGroupModal()"
            />
          </template>
        </div>
      </ScrollArea>
    </TooltipProvider>
    <DragOverlay :visible="activeCommandPanelPayload !== undefined" :overlay-style="dragOverlayStyle">
      <div class="text-xs text-popover-foreground px-2.5 py-1.5 border rounded-md bg-popover max-w-48 min-w-28 shadow-lg">
        <div class="font-medium truncate">
          {{ activeCommandPanelPayload?.label }}
        </div>
        <div class="text-muted-foreground tabular-nums">
          {{ $t('edit.visualEditor.commandPanel.groupCount', { count: activeCommandPanelPayload?.rawTexts.length ?? 0 }) }}
        </div>
      </div>
    </DragOverlay>
  </div>
</template>
