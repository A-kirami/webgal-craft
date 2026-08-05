import { resourceImportCmds } from '~/commands/resource-import'

import type { AbsPath } from '~/domain/path'

export interface ManagedResourceRoots {
  game: AbsPath
  engine: AbsPath
  template: AbsPath
  export: AbsPath
}

export async function resolveManagedResourceRoots(): Promise<ManagedResourceRoots> {
  return resourceImportCmds.resolveRoots()
}
