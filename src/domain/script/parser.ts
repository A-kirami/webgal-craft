import { compareVersions } from 'compare-versions'
import SceneParser from 'webgal-parser'
import { SCRIPT_CONFIG } from 'webgal-parser/src/config/scriptConfig'
import { commandType } from 'webgal-parser/src/interface/sceneInterface'

import { capabilityMinimumVersion, supportsEngineRuntimeCapability } from '~/domain/engine/runtime-capabilities'
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

function createWebgalParser(scriptConfig: WebgalScriptConfig): SceneParser {
  return new SceneParser(
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    () => {},
    fileName => fileName,
    [],
    scriptConfig,
  )
}

export type WebgalScriptConfig = typeof SCRIPT_CONFIG

/** 受能力门控的命令表档位标识；Monaco 语言 id 由 features 层映射，见 text-editor-language.ts */
export type WebgalScriptConfigKey = string

/**
 * 决定命令表的能力：新增一项时必须在下表里显式声明（编译期报错），
 * 由此该能力的档位剖面、档位标识与 Monaco 语言都会自动跟上。
 */
export type SceneSyntaxCapabilities = Pick<EngineRuntimeCapabilities, 'changeFigureDiff' | 'sceneSemantics'>

type GatingCapability = keyof SceneSyntaxCapabilities

const GATING_CAPABILITY_DECLARATION = {
  changeFigureDiff: true,
  sceneSemantics: true,
} satisfies Record<GatingCapability, true>

const GATING_CAPABILITIES = Object.keys(GATING_CAPABILITY_DECLARATION) as GatingCapability[]

/** 命令表档位：每个受门控能力都必须显式声明，见上表 */
type GatingProfile = Record<GatingCapability, boolean>

/**
 * 命令 → 它需要的能力。这是「命令表因引擎而异」的**唯一**源头：
 * 各档命令表、档位标识与 Monaco 语言都从它加上能力的最低版本推导出来，
 * 新增一条受能力门控的命令只需改这里（并保证该能力在 CAPABILITY_MINIMUM_VERSIONS 里有门槛）。
 */
export const GATED_COMMANDS = [
  { command: commandType.return, capability: 'sceneSemantics' },
  { command: commandType.changeFigureDiff, capability: 'changeFigureDiff' },
] as const satisfies readonly {
  command: commandType
  capability: GatingCapability
}[]

/** 引擎版本轴上的分界点：受门控能力各自的最低版本 */
function gatingVersions(): string[] {
  const versions = new Set(GATING_CAPABILITIES.map(capability => capabilityMinimumVersion(capability)))
  return [...versions].toSorted(compareVersions)
}

function profileAt(version: string | undefined): GatingProfile {
  return Object.fromEntries(
    GATING_CAPABILITIES.map(capability => [capability, supportsEngineRuntimeCapability(version, capability)]),
  ) as GatingProfile
}

/**
 * 引擎版本轴能取到的能力剖面，外加「能力未知」（编辑器尚无引擎上下文）这一档。
 * 每个受门控能力只在它自己的最低版本处翻转，因此逐个分界点取值即可覆盖全部真实剖面，
 * 无需枚举 2ⁿ 种组合。
 */
function gatingProfiles(): GatingProfile[] {
  return [undefined, ...gatingVersions()]
    .map(version => profileAt(version))
    .filter((profile, index, profiles) =>
      profiles.findIndex(candidate => sameProfile(candidate, profile)) === index)
}

function sameProfile(left: GatingProfile, right: GatingProfile): boolean {
  return GATING_CAPABILITIES.every(capability => left[capability] === right[capability])
}

/**
 * 旧引擎不认识的命令要在解析器层面缺席：认识它就会把它当成可编辑命令改写，
 * 而旧引擎只会把整句当旁白读出；缺席后该行退化成 say 简写，commandRaw 保留原命令名，
 * 序列化后文本不变。诊断侧靠 commandRaw 反查该命令，见 command-registry/diagnostics.ts。
 */
function buildConfigForProfile(profile: GatingProfile): WebgalScriptConfig {
  return SCRIPT_CONFIG.filter(config =>
    GATED_COMMANDS.every(({ command, capability }) => command !== config.scriptType || profile[capability]))
}

/** 受门控能力，按声明顺序去重：档位标识里的缺失项按这个顺序排列，保持稳定 */
function gatingCapabilities(): GatingCapability[] {
  const capabilities = GATED_COMMANDS.map(({ capability }) => capability)
  return capabilities.filter((capability, index) => capabilities.indexOf(capability) === index)
}

/** 档位标识由缺失的能力决定，不另起名字；无缺失即完整命令表 */
function buildConfigKey(profile: GatingProfile): WebgalScriptConfigKey {
  const missing = gatingCapabilities().filter(capability => !profile[capability])
  return missing.length === 0 ? 'full' : `missing:${missing.join(',')}`
}

interface WebgalScriptLanguage {
  id: WebgalScriptConfigKey
  /** 该档对应的引擎能力剖面；解析器按剖面匹配，不按版本号 */
  profile: GatingProfile
  config: WebgalScriptConfig
}

/** 同一命令表的档位会重复出现（分界点之间的版本赋值相同），按档位标识去重并保留先出现的 */
function dedupeConfigKeys(languages: WebgalScriptLanguage[]): WebgalScriptLanguage[] {
  const byId = new Map<WebgalScriptConfigKey, WebgalScriptLanguage>()
  for (const language of languages) {
    if (!byId.has(language.id)) {
      byId.set(language.id, language)
    }
  }
  return [...byId.values()]
}

/**
 * 命令表档位，由 GATED_COMMANDS 与各能力的最低版本推导。每档精确对应一类引擎版本，不能合并：
 * 4.6.3 / 4.6.4 有场景语义但没有立绘差分，用最残缺的一档会让 return 在这些引擎上被当成旁白。
 *
 * 这是命令表的唯一来源：解析器、Monaco 高亮与文本编辑器选语言都从这里取，不会漂移。
 */
export const WEBGAL_SCRIPT_LANGUAGES: readonly WebgalScriptLanguage[] = dedupeConfigKeys(
  // 能力全部已知的档排在前，便于 profileMatches 先命中
  gatingProfiles().toReversed().map(profile => ({
    id: buildConfigKey(profile),
    profile,
    config: buildConfigForProfile(profile),
  })),
)

const webgalParsers = new Map(
  WEBGAL_SCRIPT_LANGUAGES.map(({ id, config }) => [id, createWebgalParser(config)] as const),
)

/** 能力未提供（编辑器还没有引擎上下文）时不参与判定，由调用方回退到最完整的一档 */
function profileMatches(profile: GatingProfile, capabilities?: SceneSyntaxCapabilities): boolean {
  return (Object.keys(profile) as GatingCapability[]).every((capability) => {
    const actual = capabilities?.[capability]
    return actual === undefined || actual === profile[capability]
  })
}

/** 当前能力对应的命令表档位；能力缺失越多，命中的档越靠后 */
export function resolveWebgalScriptConfigKey(
  capabilities?: SceneSyntaxCapabilities,
): WebgalScriptConfigKey {
  const matched = WEBGAL_SCRIPT_LANGUAGES.find(language => profileMatches(language.profile, capabilities))
  return (matched ?? WEBGAL_SCRIPT_LANGUAGES[0]!).id
}

function resolveWebgalParser(capabilities?: SceneSyntaxCapabilities): SceneParser {
  return webgalParsers.get(resolveWebgalScriptConfigKey(capabilities))!
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
