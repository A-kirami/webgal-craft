import { vi } from 'vitest'

vi.mock('vue-router', () => ({
  useRoute: () => ({
    params: {},
    query: {},
    path: '/',
    name: '',
    meta: {},
  }),
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
  }),
}))
