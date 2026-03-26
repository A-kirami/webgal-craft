<script setup lang="ts">
import { storeToRefs } from 'pinia'

import { useModalStore } from '~/stores/modal'

const { modalStack } = storeToRefs(useModalStore())
</script>

<template>
  <component
    :is="modal.component"
    v-for="[key, modal] in modalStack"
    :key="key"
    v-bind="modal.props"
    ::open="modal.isOpen"
  />
</template>
