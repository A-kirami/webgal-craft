import { commandType } from 'webgal-parser/src/interface/sceneInterface'

import { parseCommandNode } from '~/domain/script/codec'
import { parseSentence } from '~/domain/script/parser'
import { ensureParsed, readSentenceArgString, splitStatements } from '~/domain/script/sentence'

import type { ISentence } from 'webgal-parser/src/interface/sceneInterface'
import type { StatementEntry, StatementSyntaxCapabilities } from '~/domain/script/sentence'
import type { SceneAutocompleteCollection } from '~/features/editor/command-registry/schema'

interface SceneAutocompleteOption {
  label: string
  value: string
}

export type SceneAutocompleteOptions = Record<SceneAutocompleteCollection, SceneAutocompleteOption[]>

interface SceneAutocompleteBuckets {
  figureIds: Set<string>
  sceneLabels: Set<string>
  soundEffectIds: Set<string>
  speakers: Set<string>
}

export const EMPTY_SCENE_AUTOCOMPLETE_OPTIONS: SceneAutocompleteOptions = {
  figureIds: [],
  sceneLabels: [],
  soundEffectIds: [],
  speakers: [],
}

function createBuckets(): SceneAutocompleteBuckets {
  return {
    figureIds: new Set<string>(),
    sceneLabels: new Set<string>(),
    soundEffectIds: new Set<string>(),
    speakers: new Set<string>(),
  }
}

function addOption(options: Set<string>, rawValue: string) {
  const value = rawValue.trim()
  if (value) {
    options.add(value)
  }
}

function collectSentenceAutocompleteOptions(
  sentence: ISentence | undefined,
  buckets: SceneAutocompleteBuckets,
) {
  if (!sentence) {
    return
  }

  if (sentence.command === commandType.say) {
    const commandNode = parseCommandNode(sentence)
    if (commandNode.type === commandType.say && !commandNode.clear) {
      addOption(buckets.speakers, commandNode.speaker)
    }
    return
  }

  if (sentence.command === commandType.label) {
    addOption(buckets.sceneLabels, sentence.content)
    return
  }

  if (sentence.command === commandType.changeFigure) {
    addOption(buckets.figureIds, readSentenceArgString(sentence, 'id'))
    return
  }

  if (sentence.command === commandType.playEffect) {
    addOption(buckets.soundEffectIds, readSentenceArgString(sentence, 'id'))
  }
}

function toOptions(values: Set<string>): SceneAutocompleteOption[] {
  return Array.from(values, value => ({ label: value, value }))
}

function buildOptions(buckets: SceneAutocompleteBuckets): SceneAutocompleteOptions {
  return {
    figureIds: toOptions(buckets.figureIds),
    sceneLabels: toOptions(buckets.sceneLabels),
    soundEffectIds: toOptions(buckets.soundEffectIds),
    speakers: toOptions(buckets.speakers),
  }
}

function buildOptionsFromSentences(sentences: readonly (ISentence | undefined)[]): SceneAutocompleteOptions {
  const buckets = createBuckets()

  for (const sentence of sentences) {
    collectSentenceAutocompleteOptions(sentence, buckets)
  }

  return buildOptions(buckets)
}

export function buildSceneAutocompleteOptionsFromStatements(
  statements: readonly StatementEntry[],
): SceneAutocompleteOptions {
  return buildOptionsFromSentences(statements.map(statement => ensureParsed(statement)))
}

export function buildSceneAutocompleteOptionsFromText(
  text: string,
  capabilities?: StatementSyntaxCapabilities,
): SceneAutocompleteOptions {
  return buildOptionsFromSentences(splitStatements(text, capabilities).map(line => parseSentence(line, capabilities)))
}
