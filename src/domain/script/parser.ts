import SceneParser from 'webgal-parser'
import { SCRIPT_CONFIG } from 'webgal-parser/src/config/scriptConfig'

import { handleError } from '~/utils/error-handler'

import type { IScene, ISentence } from 'webgal-parser/src/interface/sceneInterface'

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
    return webgalParser.parse(rawText, fileName, fileUrl)
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
  return parseScene(rawText)?.sentenceList[0]
}
