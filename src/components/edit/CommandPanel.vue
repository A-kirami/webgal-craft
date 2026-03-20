<script setup lang="ts">
import {
  categoryTheme,
  commandEntries,
  commandPanelCategories,
  getCategoryLabel,
  getCommandConfig,
  getCommandDescription,
} from '~/helper/command-registry'
import { resolveI18n } from '~/helper/command-registry/schema'
import { parseSentence } from '~/helper/webgal-script/parser'
import { useCommandPanelStore } from '~/stores/command-panel'

import type { commandType } from 'webgal-parser/src/interface/sceneInterface'
import type { ScrollArea } from '~/components/ui/scroll-area'
import type { CommandPanelCategory, StatementGroup } from '~/stores/command-panel'

const emit = defineEmits<{
  insertCommand: [type: commandType]
  insertGroup: [group: StatementGroup]
}>()

const { t } = useI18n()
const commandPanelStore = useCommandPanelStore()

const isGroupsView = $computed(() => commandPanelStore.activeCategory === 'groups')
const visibleCommands = $computed(() => {
  if (commandPanelStore.activeCategory === 'all' || commandPanelStore.activeCategory === 'groups') {
    return commandEntries
  }
  return commandEntries.filter(entry => entry.category === commandPanelStore.activeCategory)
})
const modalStore = useModalStore()

function openDefaultsModal(type: commandType) {
  modalStore.open('CommandDefaultsModal', { type })
}

function openGroupModal(group?: StatementGroup) {
  modalStore.open('StatementGroupModal', { group })
}

function deleteGroup(groupId: string) {
  commandPanelStore.deleteGroup(groupId)
  pendingDeleteGroupId = undefined
}

let pendingDeleteGroupId = $ref<string | undefined>()

function handleCategoryClick(category: CommandPanelCategory) {
  commandPanelStore.setActiveCategory(category)
}

const CommandAreaRef = $(useTemplateRef('CommandAreaRef'))

function resetScrollTop() {
  nextTick(() => {
    const el = CommandAreaRef?.viewport?.viewportElement as HTMLElement | undefined
    if (el) {
      el.scrollTop = 0
    }
  })
}

// 切换分类时重置滚动位置
watch(() => commandPanelStore.activeCategory, () => {
  resetScrollTop()
})

interface GroupTagEntry {
  label: string
  count: number
}

function getGroupTagEntries(group: StatementGroup): GroupTagEntry[] {
  const countMap = new Map<string, { label: string, count: number }>()
  for (const rawText of group.rawTexts) {
    const sentence = parseSentence(rawText)
    if (!sentence) {
      continue
    }
    const config = getCommandConfig(sentence.command)
    const label = resolveI18n(config.label, t)
    const existing = countMap.get(label)
    if (existing) {
      existing.count++
    } else {
      countMap.set(label, { label, count: 1 })
    }
  }
  return [...countMap.values()]
}

const groupTagEntriesMap = $computed(() => {
  const map = new Map<string, GroupTagEntry[]>()
  for (const group of commandPanelStore.groups) {
    map.set(group.id, getGroupTagEntries(group))
  }
  return map
})

const CommandTabsRef = $(useTemplateRef('CommandTabsRef'))

</script>

<template>
  <div class="flex flex-col h-full min-h-0">
    <div class="px-2 py-1 border-b flex gap-3 items-center">
      <ScrollArea ref="CommandTabsRef" @wheel="handleWheelToHorizontalScroll">
        <div class="flex flex-1 gap-1">
          <Button
            variant="ghost"
            size="sm"
            class="px-3 rounded-sm shrink-0 h-6"
            :class="commandPanelStore.activeCategory === 'all' && 'bg-accent text-accent-foreground'"
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
            :class="commandPanelStore.activeCategory === category && `${categoryTheme[category].bg} ${categoryTheme[category].text} ${categoryTheme[category].hoverBg} ${categoryTheme[category].hoverText}`"
            @click="handleCategoryClick(category)"
          >
            {{ getCategoryLabel(category, t) }}
          </Button>
        </div>
        <ScrollBar orientation="horizontal" class="opacity-75 h-1.5 -mb-0.25 hover:opacity-100" />
      </ScrollArea>

      <Separator orientation="vertical" class="h-5" />

      <Button
        variant="ghost"
        size="sm"
        class="px-3 py-1 rounded-sm shrink-0 h-6"
        :class="commandPanelStore.activeCategory === 'groups' && 'bg-violet-50 dark:bg-violet-950 text-violet-500 hover:bg-violet-100 dark:hover:bg-violet-900 hover:text-violet-600 dark:hover:text-violet-400'"
        @click="handleCategoryClick('groups')"
      >
        {{ getCategoryLabel('groups', t) }}
      </Button>
    </div>

    <TooltipProvider :skip-delay-duration="0">
      <ScrollArea ref="CommandAreaRef" class="flex-1 min-h-0">
        <div
          class="p-2 gap-1.5 grid"
          style="grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));"
        >
          <template v-if="!isGroupsView">
            <CommandPanelCard
              v-for="entry in visibleCommands"
              :key="entry.type"
              :title="resolveI18n(entry.label, t)"
              :description="getCommandDescription(entry.type, t)"
              :icon="entry.icon"
              :gradient="categoryTheme[entry.category].gradient"
              :icon-bg="categoryTheme[entry.category].bg"
              :icon-text="categoryTheme[entry.category].text"
              @click="emit('insertCommand', entry.type)"
            >
              <template v-if="!entry.locked" #actions>
                <Button
                  variant="ghost"
                  size="sm"
                  class="p-0 opacity-60 size-6 hover:opacity-100"
                  :title="$t('edit.visualEditor.commandPanel.editDefaults')"
                  @click.stop="openDefaultsModal(entry.type)"
                >
                  <div class="i-lucide-pencil size-3" />
                </Button>
              </template>
            </CommandPanelCard>
          </template>

          <template v-else>
            <CommandPanelCard
              v-for="group in commandPanelStore.groups"
              :key="group.id"
              :title="group.name"
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
                  <template v-if="(groupTagEntriesMap.get(group.id) ?? []).length > 0">
                    <Separator />
                    <div
                      v-for="entry in groupTagEntriesMap.get(group.id)"
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
                  class="p-0 opacity-60 size-6 hover:opacity-100"
                  :title="$t('common.edit')"
                  @click.stop="openGroupModal(group)"
                >
                  <div class="i-lucide-pencil size-3" />
                </Button>
                <Popover :open="pendingDeleteGroupId === group.id" @update:open="(v: boolean) => { if (!v) pendingDeleteGroupId = undefined }">
                  <PopoverTrigger as-child>
                    <Button
                      variant="ghost"
                      size="sm"
                      class="p-0 opacity-60 size-6 hover:text-destructive hover:opacity-100"
                      :title="$t('common.delete')"
                      @click.stop="pendingDeleteGroupId = group.id"
                    >
                      <div class="i-lucide-trash-2 size-3" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent class="p-3 w-auto" side="top" align="end" @click.stop>
                    <p class="text-sm mb-2">
                      {{ $t('edit.visualEditor.commandPanel.confirmDeleteGroup') }}
                    </p>
                    <div class="flex gap-2 justify-end">
                      <Button variant="outline" size="sm" class="h-6" @click="pendingDeleteGroupId = undefined">
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
  </div>
</template>
