import type { AbsPath } from '~/domain/path'

export type PathEchoMode = 'watcher' | 'synthetic'

export interface PathMutationResult {
  echoMode: PathEchoMode
  newPath: AbsPath
}
