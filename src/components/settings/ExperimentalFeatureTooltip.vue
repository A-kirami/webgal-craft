<script setup lang="ts">
import { FlaskConical } from '@lucide/vue'
</script>

<template>
  <Tooltip :delay-duration="0">
    <TooltipTrigger>
      <FlaskConical class="text-blue-500 size-4" />
    </TooltipTrigger>
    <TooltipContent>
      <p>{{ $t('settings.experimental.tooltip') }}</p>
    </TooltipContent>
  </Tooltip>
</template>
