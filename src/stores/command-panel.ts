import { defineStore } from 'pinia'
import { commandType } from 'webgal-parser/src/interface/sceneInterface'

import { getFactoryDefaultCommandText } from '~/helper/command-registry'
import { parseSentence } from '~/helper/webgal-script/parser'

export type { CommandPanelCategory } from '~/helper/command-registry'

export interface StatementGroup {
  id: string
  name: string
  rawTexts: string[]
  createdAt: number
}

function createGroupId(): string {
  return crypto.randomUUID()
}

export const useCommandPanelStore = defineStore(
  'command-panel',
  () => {
    let defaults = $ref<Partial<Record<commandType, string>>>({})
    let groups = $ref<StatementGroup[]>([])
    let activeCategory = $ref<CommandPanelCategory>('all')

    function getInsertText(type: commandType): string {
      const userDefault = defaults[type]
      if (userDefault !== undefined) {
        return userDefault
      }
      return getFactoryDefaultCommandText(type)
    }

    function saveDefault(type: commandType, rawText: string) {
      const factoryDefault = getFactoryDefaultCommandText(type)
      if (rawText === factoryDefault) {
        resetDefault(type)
        return
      }
      defaults = {
        ...defaults,
        [type]: rawText,
      }
    }

    function resetDefault(type: commandType) {
      const nextDefaults = { ...defaults }
      delete nextDefaults[type]
      defaults = nextDefaults
    }

    function saveGroup(input: Omit<StatementGroup, 'id' | 'createdAt'> & Partial<Pick<StatementGroup, 'id' | 'createdAt'>>) {
      const normalizedName = input.name.trim()
      const normalizedGroup: StatementGroup = {
        id: input.id ?? createGroupId(),
        name: normalizedName,
        rawTexts: [...input.rawTexts],
        createdAt: input.createdAt ?? Date.now(),
      }

      const existingIndex = groups.findIndex(group => group.id === normalizedGroup.id)
      if (existingIndex === -1) {
        groups = [...groups, normalizedGroup]
        return normalizedGroup
      }

      const nextGroups = [...groups]
      nextGroups.splice(existingIndex, 1, normalizedGroup)
      groups = nextGroups
      return normalizedGroup
    }

    function deleteGroup(id: string) {
      groups = groups.filter(group => group.id !== id)
    }

    /** 重置语句组内所有语句为出厂默认 */
    function resetGroup(id: string) {
      const group = groups.find(g => g.id === id)
      if (!group) {
        return
      }
      const resetRawTexts = group.rawTexts.map((rawText) => {
        const parsed = parseSentence(rawText)
        if (!parsed) {
          return rawText
        }
        return getFactoryDefaultCommandText(parsed.command)
      })
      saveGroup({
        ...group,
        rawTexts: resetRawTexts,
      })
    }

    function setActiveCategory(category: CommandPanelCategory) {
      activeCategory = category
    }

    return $$({
      defaults,
      groups,
      activeCategory,
      getInsertText,
      saveDefault,
      resetDefault,
      saveGroup,
      deleteGroup,
      resetGroup,
      setActiveCategory,
    })
  },
  {
    persist: true,
  },
)
