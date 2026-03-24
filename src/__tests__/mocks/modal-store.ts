import { vi } from 'vitest'

vi.mock('~/stores/modal', () => ({
  useModalStore: () => ({}),
}))
