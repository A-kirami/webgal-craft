import { invoke } from '@tauri-apps/api/core'

import { AbsPath } from '~/domain/path'

export interface ManagedResourceRoots {
  game: AbsPath
  engine: AbsPath
  template: AbsPath
  export: AbsPath
}

interface NativeManagedResourceRoots {
  game: string
  engine: string
  template: string
  export: string
}

export async function resolveManagedResourceRoots(): Promise<ManagedResourceRoots> {
  const roots = await invoke<NativeManagedResourceRoots>('android_resource_import_resolve_roots')

  return {
    game: AbsPath.from(roots.game),
    engine: AbsPath.from(roots.engine),
    template: AbsPath.from(roots.template),
    export: AbsPath.from(roots.export),
  }
}
