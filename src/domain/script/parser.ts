import SceneParser from 'webgal-parser'
import { SCRIPT_CONFIG } from 'webgal-parser/src/config/scriptConfig'
import { commandType } from 'webgal-parser/src/interface/sceneInterface'

import { handleError } from '~/utils/error-handler'

import type { IScene, ISentence } from 'webgal-parser/src/interface/sceneInterface'

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

export const webgalParser = new SceneParser(
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  () => {},
  fileName => fileName,
  [],
  SCRIPT_CONFIG,
)

export function parseScene(
  rawText: string,
  fileName: string = '',
  fileUrl: string = '',
): IScene | undefined {
  try {
    return normalizeBareReturns(webgalParser.parse(rawText, fileName, fileUrl), rawText)
  } catch (error) {
    handleError(error, { silent: true })
    return undefined
  }
}

export function parseSceneOrEmpty(
  rawText: string,
  fileName: string = '',
  fileUrl: string = '',
): IScene {
  return parseScene(rawText, fileName, fileUrl)
    ?? webgalParser.parse('', fileName, fileUrl)
}

/**
 * 解析单条语句文本为 ISentence。
 * 解析失败时返回 undefined。
 */
export function parseSentence(rawText: string): ISentence | undefined {
  if (rawText.trim() === 'return;') {
    return createBareReturnSentence()
  }
  return parseScene(rawText)?.sentenceList[0]
}
