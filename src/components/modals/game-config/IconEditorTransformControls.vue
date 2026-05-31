<script setup lang="ts">
import { Slider } from '~/components/ui/slider'

import type { IconEditorTransformControl } from '~/features/modals/game-config/icon-editor/icon-editor-controls'

interface Props {
  controls: IconEditorTransformControl[]
}

defineProps<Props>()

function controlTestId(control: IconEditorTransformControl, suffix: string) {
  return `${control.id}-${suffix}`
}
</script>

<template>
  <div class="flex flex-col gap-2.5">
    <div
      v-for="control in controls"
      :key="control.id"
      class="flex gap-2 items-center"
      :data-testid="controlTestId(control, 'control')"
    >
      <Label
        :for="controlTestId(control, 'input')"
        class="text-xs text-muted-foreground shrink-0 min-w-0 w-12"
      >
        <span class="block truncate">{{ control.label }}</span>
      </Label>
      <div class="flex flex-1 gap-2 min-w-0 items-center">
        <Slider
          :model-value="[control.value]"
          :min="control.min"
          :max="control.max"
          :step="control.step"
          :data-testid="controlTestId(control, 'slider')"
          @update:model-value="control.update($event, { fromSlider: true })"
          @value-commit="control.update($event, { fromSlider: true })"
        />
        <InputGroup class="h-7 w-18 shadow-none">
          <InputGroupInput
            :id="controlTestId(control, 'input')"
            type="number"
            :model-value="control.value"
            :min="control.min"
            :max="control.max"
            :step="control.step"
            :aria-label="control.label"
            :data-testid="controlTestId(control, 'input')"
            class="text-xs pr-1 h-auto shadow-none"
            @update:model-value="control.update"
          />
          <InputGroupAddon
            align="inline-end"
            class="text-xs text-muted-foreground pr-1.5"
            :data-testid="controlTestId(control, 'unit')"
          >
            %
          </InputGroupAddon>
        </InputGroup>
      </div>
    </div>
  </div>
</template>
