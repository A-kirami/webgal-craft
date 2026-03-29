import { vi } from 'vitest'

type TauriPathModule = typeof import('@tauri-apps/api/path')

type TauriPathMockKeys =
  | 'basename'
  | 'dirname'
  | 'extname'
  | 'join'
  | 'normalize'
  | 'sep'

export type TauriPathMockOverrides = Partial<Pick<TauriPathModule, TauriPathMockKeys>>

export function createDefaultTauriPathMocks(): Required<TauriPathMockOverrides> {
  return {
    basename: vi.fn(async (filePath: string) => filePath.split(/[/\\]/).at(-1) ?? ''),
    dirname: vi.fn(async (filePath: string) => filePath.replace(/[\\/][^\\/]+$/, '')),
    extname: vi.fn(async (filePath: string) => {
      const match = /\.[^./\\]+$/.exec(filePath)
      return match?.[0] ?? ''
    }),
    join: vi.fn(async (...parts: string[]) => parts.join('/')),
    normalize: vi.fn(async (filePath: string) => filePath.replaceAll('\\', '/')),
    sep: vi.fn(() => '/'),
  }
}

export async function createTauriPathModuleMock(
  overrides: TauriPathMockOverrides = {},
): Promise<TauriPathModule> {
  const actual = await vi.importActual<TauriPathModule>('@tauri-apps/api/path')

  return {
    ...actual,
    ...createDefaultTauriPathMocks(),
    ...overrides,
  }
}
