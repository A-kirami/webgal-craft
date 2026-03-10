import SceneParser from 'webgal-parser'
import { SCRIPT_CONFIG } from 'webgal-parser/src/config/scriptConfig'

import type { ISentence } from 'webgal-parser/src/interface/sceneInterface'

export const webgalParser = new SceneParser(
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  () => {},
  fileName => fileName,
  [],
  SCRIPT_CONFIG,
)

/**
 * 解析单条语句文本为 ISentence。
 * 解析失败时返回 undefined。
 */
export function parseSentence(rawText: string): ISentence | undefined {
  try {
    const scene = webgalParser.parse(rawText, '', '')
    return scene.sentenceList[0]
  } catch (error) {
    handleError(error, { silent: true })
    return undefined
  }
}
