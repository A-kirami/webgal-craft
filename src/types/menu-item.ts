import type { Component } from 'vue'

export interface MenuItem {
  icon: Component
  label: string
  onClick: () => void
  disabled?: boolean
  class?: string
}
