<script setup lang="ts">
import { resetAllTourProgress } from '~/features/onboarding/tour-state'

let hasReset = $ref(false)

function handleReset(): void {
  resetAllTourProgress()
  hasReset = true
}
</script>

<template>
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
</template>
