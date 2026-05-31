import { AbsPath } from '~/domain/path'

export function fromExternalAbsPath(rawPath: string): AbsPath {
  return AbsPath.from(rawPath)
}
