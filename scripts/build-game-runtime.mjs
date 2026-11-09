import { execFileSync } from 'node:child_process'
import { chmodSync, copyFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

const { values } = parseArgs({ options: {
  target: { type: 'string' },
  release: { type: 'boolean', default: false },
} })
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const target = values.target ?? execFileSync('rustc', ['-vV'], { encoding: 'utf8' }).match(/^host: (.+)$/m)[1]
const platforms = {
  'x86_64-pc-windows-msvc': 'windows-x64.exe',
  'x86_64-apple-darwin': 'macos-x64',
  'aarch64-apple-darwin': 'macos-arm64',
  'x86_64-unknown-linux-gnu': 'linux-x64',
}
const platform = platforms[target]
if (!platform) {
  throw new Error(`Unsupported game runtime target: ${target}`)
}
execFileSync('cargo', [
  'build', '--locked', '--manifest-path', 'src-tauri/Cargo.toml',
  '-p', 'webgal-game-runtime', '--target', target,
  ...(values.release ? ['--release'] : []),
], { cwd: root, stdio: 'inherit' })
const targetRoot = path.resolve(root, process.env.CARGO_TARGET_DIR ?? 'src-tauri/target')
const executable = `webgal-game-runtime${target.includes('windows') ? '.exe' : ''}`
const output = path.join(root, 'src-tauri/resources/game-runtimes', `webgal-game-runtime-${platform}`)
mkdirSync(path.dirname(output), { recursive: true })
copyFileSync(path.join(targetRoot, target, values.release ? 'release' : 'debug', executable), output)
if (!target.includes('windows')) {
  chmodSync(output, 0o755)
}
process.stdout.write(`Game runtime: ${output}\n`)
