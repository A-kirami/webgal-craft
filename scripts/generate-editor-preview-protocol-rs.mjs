import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { argv, exit } from 'node:process'

const protocolModuleUrl = new URL('../src/types/editorPreviewProtocol.ts', import.meta.url)
const generatedDirectoryUrl = new URL('../src-tauri/src/generated/', import.meta.url)
const outputFileUrl = new URL('editor_preview_protocol.rs', generatedDirectoryUrl)

const {
  EDITOR_PREVIEW_PROTOCOL_V1_SUBPROTOCOL,
  HOST_EVENT_TYPES,
  PREVIEW_COMMAND_TYPES,
  PREVIEW_QUERY_TYPES,
  SET_EFFECT_COMMAND_TYPE,
  SESSION_REGISTER_PREVIEW_TYPE,
} = await import(protocolModuleUrl.href)

function renderRustStringArray(name, values) {
  if (values.length <= 2) {
    const inlineItems = values.map(value => JSON.stringify(value)).join(', ')
    return `pub const ${name}: [&str; ${values.length}] = [${inlineItems}];`
  }

  const items = values.map(value => `    ${JSON.stringify(value)},`).join('\n')
  return `pub const ${name}: [&str; ${values.length}] = [\n${items}\n];`
}

function renderRustModule() {
  return `// 此文件由 \`bun run generate:protocol\` 自动生成。不要手动编辑。

pub const EDITOR_PREVIEW_PROTOCOL_V1_SUBPROTOCOL: &str = ${JSON.stringify(EDITOR_PREVIEW_PROTOCOL_V1_SUBPROTOCOL)};
pub const SESSION_REGISTER_PREVIEW_TYPE: &str = ${JSON.stringify(SESSION_REGISTER_PREVIEW_TYPE)};
pub const SET_EFFECT_COMMAND_TYPE: &str = ${JSON.stringify(SET_EFFECT_COMMAND_TYPE)};

${renderRustStringArray('PREVIEW_COMMAND_TYPES', PREVIEW_COMMAND_TYPES)}
${renderRustStringArray('PREVIEW_QUERY_TYPES', PREVIEW_QUERY_TYPES)}
${renderRustStringArray('HOST_EVENT_TYPES', HOST_EVENT_TYPES)}

pub fn is_preview_request_type(message_type: &str) -> bool {
    PREVIEW_COMMAND_TYPES.contains(&message_type) || PREVIEW_QUERY_TYPES.contains(&message_type)
}

pub fn is_preview_response_type(message_type: &str) -> bool {
    is_preview_request_type(message_type)
}
`
}

const nextContent = renderRustModule()

let currentContent
try {
  currentContent = await readFile(outputFileUrl, 'utf8')
} catch (error) {
  if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
    currentContent = undefined
  } else {
    throw error
  }
}

if (argv.includes('--check')) {
  if (currentContent !== nextContent) {
    process.stderr.write('editor preview 协议 Rust 工件未同步，请运行 bun run generate:protocol\n')
    exit(1)
  }

  exit(0)
}

await mkdir(generatedDirectoryUrl, { recursive: true })
await writeFile(outputFileUrl, nextContent, 'utf8')

process.stdout.write('已更新 src-tauri/src/generated/editor_preview_protocol.rs\n')
