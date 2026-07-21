import type { AssetKey } from './keys'
import type { ISentence } from 'webgal-parser/src/interface/sceneInterface'

export type ResourceReferenceSource =
  | { kind: 'content' }
  | { kind: 'argument', key: string }
  | { kind: 'choice', index: number }

export interface ResourceReferenceQuery {
  assetKey: AssetKey
  value: string
  source: ResourceReferenceSource
}

export type SentenceResourceReferenceQuery = (sentence: ISentence) => ResourceReferenceQuery[]

export function isSameResourceReferenceSource(left: ResourceReferenceSource, right: ResourceReferenceSource): boolean {
  if (left.kind !== right.kind) {
    return false
  }
  if (left.kind === 'argument' && right.kind === 'argument') {
    return left.key === right.key
  }
  if (left.kind === 'choice' && right.kind === 'choice') {
    return left.index === right.index
  }
  return true
}
