import SceneParser from 'webgal-parser'
import { SCRIPT_CONFIG } from 'webgal-parser/src/config/scriptConfig'
import { commandType } from 'webgal-parser/src/interface/sceneInterface'

import { handleError } from '~/utils/error-handler'

import type { IScene, ISentence } from 'webgal-parser/src/interface/sceneInterface'
import type { EngineRuntimeCapabilities } from '~/domain/engine/runtime-capabilities'

type SceneSyntaxCapabilities = Pick<EngineRuntimeCapabilities, 'sceneSemantics'>

function createBareReturnSentence(): ISentence {
  return {
    command: commandType.return,
    commandRaw: 'return',
    content: '',
    args: [],
    sentenceAssets: [],
    subScene: [],
    inlineComment: '',
    startLine: 0,
    endLine: 0,
    isLineBreakHolder: false,
  }
}

function normalizeBareReturns(scene: IScene, rawText: string): IScene {
  const lines = rawText.split('\n')
  return {
    ...scene,
    sentenceList: scene.sentenceList.map((sentence) => {
      const source = lines.slice(sentence.startLine, sentence.endLine + 1).join('\n').trim()
      return source === 'return;'
        ? { ...createBareReturnSentence(), startLine: sentence.startLine, endLine: sentence.endLine }
        : sentence
    }),
  }
}

function createWebgalParser(scriptConfig = SCRIPT_CONFIG): SceneParser {
  return new SceneParser(
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    () => {},
    fileName => fileName,
    [],
    scriptConfig,
  )
}

export const webgalParser = createWebgalParser()

export const LEGACY_WEBGAL_SCRIPT_CONFIG = SCRIPT_CONFIG.filter(
  config => config.scriptType !== commandType.return,
)

const legacyWebgalParser = createWebgalParser(
  LEGACY_WEBGAL_SCRIPT_CONFIG,
)

function resolveWebgalParser(capabilities?: SceneSyntaxCapabilities): SceneParser {
  return capabilities?.sceneSemantics === false ? legacyWebgalParser : webgalParser
}

export function parseScene(
  rawText: string,
  fileName: string = '',
  fileUrl: string = '',
  capabilities?: SceneSyntaxCapabilities,
): IScene | undefined {
  try {
    const scene = resolveWebgalParser(capabilities).parse(rawText, fileName, fileUrl)
    return capabilities?.sceneSemantics === false ? scene : normalizeBareReturns(scene, rawText)
  } catch (error) {
    handleError(error, { silent: true })
    return undefined
  }
}

export function parseSceneOrEmpty(
  rawText: string,
  fileName: string = '',
  fileUrl: string = '',
  capabilities?: SceneSyntaxCapabilities,
): IScene {
  return parseScene(rawText, fileName, fileUrl, capabilities)
    ?? resolveWebgalParser(capabilities).parse('', fileName, fileUrl)
}

/**
 * 解析单条语句文本为 ISentence。
 * 解析失败时返回 undefined。
 */
export function parseSentence(
  rawText: string,
  capabilities?: SceneSyntaxCapabilities,
): ISentence | undefined {
  return parseScene(rawText, '', '', capabilities)?.sentenceList[0]
}
