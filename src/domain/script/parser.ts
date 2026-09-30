import SceneParser from 'webgal-parser'
import { SCRIPT_CONFIG } from 'webgal-parser/src/config/scriptConfig'
import { commandType } from 'webgal-parser/src/interface/sceneInterface'

import { handleError } from '~/utils/error-handler'

import type { IScene, ISentence } from 'webgal-parser/src/interface/sceneInterface'
import type { EngineRuntimeCapabilities } from '~/domain/engine/runtime-capabilities'

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

// 旧引擎不认识的命令要在解析器层面缺席：认识它就会把它当成可编辑命令改写，
// 而旧引擎只会把整句当旁白读出；缺席后该行退化成 say 简写，commandRaw 保留原命令名，
// 序列化后文本不变。诊断侧靠 commandRaw 反查该命令，见 command-registry/diagnostics.ts。
function isUnsupportedByLegacyEngine(type: commandType): boolean {
  return type === commandType.return || type === commandType.changeFigureDiff
}

export const LEGACY_WEBGAL_SCRIPT_CONFIG = SCRIPT_CONFIG.filter(
  config => !isUnsupportedByLegacyEngine(config.scriptType),
)

const legacyWebgalParser = createWebgalParser(
  LEGACY_WEBGAL_SCRIPT_CONFIG,
)

/** 选择解析器只需知道决定命令表的两项能力 */
export type SceneSyntaxCapabilities = Pick<EngineRuntimeCapabilities, 'changeFigureDiff' | 'sceneSemantics'>

/**
 * 该引擎的脚本语法是否缺少完整命令表。
 *
 * 两个能力各自决定一部分命令是否缺席：sceneSemantics 决定 return，changeFigureDiff 决定立绘差分。
 * 缺任一都只能用旧命令表；文本编辑器选高亮语言时也以此为准，避免两处判据漂移。
 */
export function usesLegacySceneParser(capabilities?: SceneSyntaxCapabilities): boolean {
  return capabilities?.sceneSemantics === false || capabilities?.changeFigureDiff === false
}

function resolveWebgalParser(capabilities?: SceneSyntaxCapabilities): SceneParser {
  return usesLegacySceneParser(capabilities) ? legacyWebgalParser : webgalParser
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
