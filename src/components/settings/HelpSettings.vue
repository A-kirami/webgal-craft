<script setup lang="ts">
import { createShortcutGuide } from '~/features/editor/shortcut/guide'
import { resetAllTourProgress } from '~/features/onboarding/tour-state'
import { detectSystemPlatform } from '~/utils/platform'

const { t } = useI18n()
const platform = detectSystemPlatform()
const shortcutGroups = $computed(() => createShortcutGuide(t, platform))

let hasReset = $ref(false)

function handleReset(): void {
  resetAllTourProgress()
  hasReset = true
}
</script>

<template>
  <div class="space-y-5">
    <section class="space-y-3">
      <div class="space-y-1">
        <h3 class="text-sm font-medium">
          {{ $t('settings.help.shortcuts.title') }}
        </h3>
        <p class="text-xs text-muted-foreground">
          {{ $t('settings.help.shortcuts.description') }}
        </p>
      </div>

      <div v-for="group in shortcutGroups" :key="group.id" class="space-y-1.5">
        <h4 class="text-xs font-medium">
          {{ group.title }}
        </h4>
        <ul class="space-y-1">
          <li
            v-for="(entry, entryIndex) in group.entries"
            :key="entryIndex"
            class="flex gap-4 items-center justify-between"
          >
            <span class="text-xs text-muted-foreground">{{ entry.label }}</span>
            <Kbd v-if="entry.gesture" class="shrink-0">{{ entry.gesture }}</Kbd>
            <span v-else class="flex shrink-0 gap-1 items-center">
              <template v-for="(chord, chordIndex) in entry.chords" :key="chordIndex">
                <span v-if="chordIndex > 0" class="text-11px text-muted-foreground">/</span>
                <KbdGroup>
                  <Kbd v-for="(part, partIndex) in chord" :key="partIndex">
                    {{ part }}
                  </Kbd>
                </KbdGroup>
              </template>
            </span>
          </li>
        </ul>
      </div>
    </section>

    <section class="space-y-2">
      <h3 class="text-sm font-medium">
        {{ $t('settings.help.reset.label') }}
      </h3>
      <p class="text-xs text-muted-foreground">
        {{ $t('settings.help.reset.description') }}
      </p>
      <Button variant="outline" size="sm" @click="handleReset">
        {{ $t('settings.help.reset.action') }}
      </Button>
      <p v-if="hasReset" role="status" class="text-xs text-muted-foreground">
        {{ $t('settings.help.reset.done') }}
      </p>
    </section>
  </div>
</template>
