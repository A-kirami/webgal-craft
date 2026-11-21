import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { access, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

import { chromium } from '@playwright/test'

const { dirname, join, resolve, sep } = path

/* eslint-disable no-await-in-loop -- Install, launch, upgrade, and uninstall depend on previous results. */
assert.equal(process.platform, 'win32', 'This lifecycle test uses Windows NSIS and WebView2')
const runtime = resolve(process.argv[2] ?? 'src-tauri/resources/game-runtimes/webgal-game-runtime-windows-x64.exe')
const packager = resolve(process.argv[3] ?? 'src-tauri/target/debug/webgal-craft.exe')
const scratch = await mkdtemp(join(tmpdir(), 'webgal-installer-smoke-'))
const key = randomUUID()
const identity = `com.webgalcraft.game.${createHash('sha256').update(key).digest('hex')}`
const installation = join(scratch, 'installed game')
const profile = resolve(process.env.LOCALAPPDATA, identity)
const registry = `HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${identity}`
const options = { windowsHide: true, encoding: 'utf8', timeout: 12_0000 }
let child
let browser
let installed = false

function runInstaller(executable, args) {
  // NSIS requires /D= and _?= to be the final, unquoted command-line argument.
  execFileSync(executable, args, { ...options, windowsVerbatimArguments: true, argv0: `"${executable}"` })
}

function uninstall() {
  // _?= runs the uninstaller in place, allowing us to wait for completion.
  runInstaller(join(installation, 'uninstall.exe'), ['/S', `_?=${installation}`])
  installed = false
}

async function launch() {
  const server = createServer()
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address()
  await new Promise(resolve => server.close(resolve))
  child = spawn(join(installation, `${identity}.exe`), [], {
    cwd: installation, windowsHide: true, stdio: 'inherit',
    env: { ...process.env, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}` },
  })
  for (let attempt = 0; attempt < 100; attempt++) {
    assert.ok(child.exitCode === null, `Installed game exited during startup with code ${child.exitCode}`)
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`)
      const pages = response.ok ? await response.json() : []
      if (pages.length > 0) {
        browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`)
        const page = browser.contexts()[0].pages()[0]
        await page.waitForSelector('button')
        return page
      }
    } catch (error) {
      if (error.code !== 'ECONNREFUSED' && error.cause?.code !== 'ECONNREFUSED') {
        throw error
      }
    }
    await delay(100)
  }
  throw new Error(`Installed game did not expose a WebView2 page at http://127.0.0.1:${port}/json/list`)
}

async function closeGame(page) {
  const exited = new Promise((resolve, reject) => {
    child.once('exit', resolve)
    child.once('error', reject)
  })
  await page.evaluate(() => setTimeout(() => document.querySelector('button').click(), 0))
  await Promise.race([exited, delay(1_0000).then(() => {
    throw new Error('Exit did not close the installed game')
  })])
  assert.equal(child.exitCode, 0)
  await browser.close()
  browser = undefined
  child = undefined
}

try {
  if (!process.argv[3]) {
    execFileSync('cargo', ['build', '--locked', '--manifest-path', 'src-tauri/Cargo.toml', '--bin', 'webgal-craft'], {
      ...options, timeout: 60_0000, stdio: 'inherit',
    })
  }
  execFileSync('cargo', ['test', '--locked', '--manifest-path', 'src-tauri/Cargo.toml', '--lib',
    'commands::export::tests::builds_native_installers_for_smoke_test', '--', '--ignored', '--exact', '--nocapture'], {
    ...options, timeout: 60_0000, stdio: 'inherit',
    env: { ...process.env, WEBGAL_INSTALLER_SMOKE_RUNTIME: runtime, WEBGAL_INSTALLER_SMOKE_ARCH: 'x64', WEBGAL_INSTALLER_SMOKE_DIR: scratch, WEBGAL_INSTALLER_SMOKE_KEY: key, WEBGAL_INSTALLER_SMOKE_PACKAGER: packager },
  })
  runInstaller(join(scratch, 'first/setup.exe'), ['/S', '/NS', `/D=${installation}`])
  installed = true
  const first = await launch()
  await first.evaluate(() => localStorage.setItem('installer-save', 'preserved'))
  await closeGame(first)
  const playerFile = join(installation, 'player-note.txt')
  await writeFile(playerFile, key)
  await access(join(installation, 'resources/game/scene/obsolete.txt'))

  const uninstaller = join(installation, 'uninstall.exe')
  const uninstallerBackup = join(scratch, 'uninstall.exe')
  await rename(uninstaller, uninstallerBackup)
  try {
    assert.throws(() => runInstaller(join(scratch, 'upgrade/setup.exe'), ['/S', '/NS']), error => error.status === 2)
  } finally {
    await rename(uninstallerBackup, uninstaller)
  }

  runInstaller(join(scratch, 'upgrade/setup.exe'), ['/S', '/NS'])
  const registration = execFileSync('reg.exe', ['query', registry], options)
  assert.match(registration, /Installer smoke renamed/)
  assert.match(registration, /1\.1\.0/)
  assert.match(registration, /Studio B/)
  await access(join(installation, `${identity}.exe`))
  await assert.rejects(access(join(installation, 'resources/game/scene/obsolete.txt')), { code: 'ENOENT' })
  assert.equal(await readFile(playerFile, 'utf8'), key)
  const upgraded = await launch()
  assert.equal(await upgraded.evaluate(() => localStorage.getItem('installer-save')), 'preserved')
  await closeGame(upgraded)
  // NSIS returns 2 when .onInit aborts installation.
  assert.throws(() => runInstaller(join(scratch, 'first/setup.exe'), ['/S', '/NS']), error => error.status === 2)
  assert.match(execFileSync('reg.exe', ['query', registry, '/v', 'DisplayVersion'], options), /1\.1\.0/)
  runInstaller(join(scratch, 'upgrade/setup.exe'), ['/S', '/NS', '/UPDATE'])
  assert.equal(await readFile(playerFile, 'utf8'), key)
  uninstall()
  await assert.rejects(access(join(installation, `${identity}.exe`)), { code: 'ENOENT' })
  assert.equal(await readFile(playerFile, 'utf8'), key)
  runInstaller(join(scratch, 'upgrade/setup.exe'), ['/S', '/NS', `/D=${installation}`])
  installed = true
  const reinstalled = await launch()
  assert.equal(await reinstalled.evaluate(() => localStorage.getItem('installer-save')), 'preserved')
  await closeGame(reinstalled)
  uninstall()
  process.stdout.write('PASS: install, native startup/exit, rename/publisher upgrade, same-version reinstall, retired assets, player files, stable storage, uninstall preserves saves\n')
} finally {
  if (child?.exitCode === null) {
    child.kill()
    await new Promise(resolve => child.once('exit', resolve))
  }
  if (browser) {
    await browser.close()
  }
  if (installed) {
    uninstall()
  }
  // All recursive cleanup targets are this run's scratch directory or its random identity.
  assert.equal(dirname(scratch), resolve(tmpdir()))
  assert.ok(scratch.startsWith(`${resolve(tmpdir())}${sep}webgal-installer-smoke-`))
  assert.equal(dirname(profile), resolve(process.env.LOCALAPPDATA))
  await rm(scratch, { recursive: true, force: true })
  await rm(profile, { recursive: true, force: true })
}
