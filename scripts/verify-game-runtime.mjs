import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
/* eslint-disable no-await-in-loop -- Native lifecycle steps and bounded polling depend on previous results. */
import { cp, mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

const { dirname, join, resolve, sep } = path

assert.equal(process.platform, 'win32', 'This smoke test uses the Windows WebView2 debugging endpoint')
const runtime = resolve(process.argv[2] ?? 'src-tauri/target/debug/webgal-game-runtime.exe')
const root = await mkdtemp(join(tmpdir(), 'webgal-runtime-smoke-'))
const gameKey = randomUUID()
const storageId = createHash('sha256').update(gameKey).digest('hex')
const profiles = [resolve(process.env.LOCALAPPDATA, `com.webgalcraft.game.${storageId}`)]
const downloadName = `webgal-runtime-smoke-${gameKey}.json`
const downloads = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
  String.raw`[Environment]::ExpandEnvironmentVariables((Get-ItemProperty -LiteralPath 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\User Shell Folders').'{374DE290-123F-4565-9164-39C4925E467B}')`,
], { windowsHide: true, encoding: 'utf8' }).trim()
const downloadPath = join(downloads, downloadName)
const config = {
  gameKey,
  title: 'Runtime smoke test',
  width: 800,
  height: 600,
  minWidth: 400,
  minHeight: 300,
  fullScreen: false,
  resizable: true,
}
let directory = join(root, 'first export')
let executableName = 'Game.exe'
let child
let socket

async function launch(ready = '!!document.querySelector("button")') {
  const probe = createServer()
  await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve))
  const { port } = probe.address()
  await new Promise(resolve => probe.close(resolve))
  child = spawn(join(directory, executableName), [], {
    cwd: directory,
    windowsHide: true,
    env: { ...process.env, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}` },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let logs = ''
  child.stdout.on('data', (data) => {
    logs += data
  })
  child.stderr.on('data', (data) => {
    logs += data
  })
  let pages
  for (let attempt = 0; attempt < 100; attempt++) {
    assert.ok(child.exitCode === null, logs)
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`)
      pages = await response.json()
      if (pages.length > 0) {
        break
      }
    } catch {}
    await delay(100)
  }
  assert.ok(pages?.length, `No WebView2 target: ${logs}`)
  socket = new WebSocket(pages[0].webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true })
    socket.addEventListener('error', reject, { once: true })
  })
  let requestId = 0
  const pending = new Map()
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data)
    pending.get(message.id)?.(message)
    pending.delete(message.id)
  })
  async function evaluate(expression) {
    const id = ++requestId
    const response = new Promise(resolve => pending.set(id, resolve))
    socket.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: {
      expression, returnByValue: true, awaitPromise: true, userGesture: true,
    } }))
    const message = await Promise.race([response, delay(5000).then(() => {
      throw new Error('CDP evaluation timed out')
    })])
    assert.equal(message.result?.exceptionDetails, undefined, JSON.stringify(message))
    return message.result.result.value
  }
  await waitFor(evaluate, ready)
  return evaluate
}

async function waitFor(evaluate, expression) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (await evaluate(expression)) {
      return
    }
    await delay(100)
  }
  throw new Error(`Game page did not become ready: ${expression}; ${await evaluate('document.body.innerText.slice(0, 2000)')}`)
}

async function close(expression = 'window.close()') {
  const exited = new Promise(resolve => child.once('exit', resolve))
  socket.send(JSON.stringify({ id: 99_9999, method: 'Runtime.evaluate', params: { expression } }))
  await Promise.race([exited, delay(5000).then(() => {
    throw new Error('Native exit timed out')
  })])
  assert.equal(child.exitCode, 0)
  socket.close()
  await delay(300)
}

try {
  await mkdir(join(directory, 'resources'), { recursive: true })
  await cp(runtime, join(directory, 'Game.exe'))
  await writeFile(join(directory, 'webgal-runtime.json'), JSON.stringify(config))
  await writeFile(join(directory, 'resources', 'index.html'), '<!doctype html><title>Runtime smoke</title><button>Game</button>')
  await writeFile(join(directory, 'resources', 'fixture.txt'), 'game resource')
  await writeFile(join(directory, 'private.txt'), 'outside resource scope')
  let evaluate = await launch()
  process.stdout.write(`Page: ${JSON.stringify(await evaluate('({url:location.href,origin:location.origin,fullscreen:document.fullscreenEnabled})'))}\n`)
  assert.equal(await evaluate('fetch("fixture.txt").then(r=>r.text())'), 'game resource')
  assert.deepEqual(await evaluate('fetch("fixture.txt", {headers:{Range:"bytes=0-3"}}).then(async r=>({status:r.status,body:await r.text()}))'), { status: 206, body: 'game' })
  assert.equal(await evaluate('fetch("../private.txt").then(r=>r.status)'), 403)
  assert.equal(await evaluate('new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(reader.error);reader.readAsText(new Blob(["存档导入"]))})'), '存档导入')
  const saveJson = JSON.stringify({ slot: 1, text: '存档导出' })
  await evaluate(`(()=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([${JSON.stringify(saveJson)}],{type:'application/json'}));a.download=${JSON.stringify(downloadName)};document.body.append(a);a.click();a.remove();return true})()`)
  let downloaded
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      downloaded = await readFile(downloadPath, 'utf8')
      break
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error
      }
    }
    await delay(100)
  }
  assert.equal(downloaded, saveJson, 'Native download must preserve exported save data')
  await evaluate(`(async()=>{
    localStorage.setItem('smoke','saved');
    const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('smoke',1);r.onupgradeneeded=()=>r.result.createObjectStore('saves');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
    await new Promise((resolve,reject)=>{const tx=db.transaction('saves','readwrite');tx.objectStore('saves').put('save-data','slot');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});db.close();return true;
  })()`)
  await evaluate('document.documentElement.requestFullscreen().then(()=>true)')
  assert.equal(await evaluate('document.fullscreenElement===document.documentElement'), true)
  await evaluate('document.exitFullscreen().then(()=>true)')
  assert.equal(await evaluate('document.fullscreenElement===null'), true)
  await close()
  const moved = join(root, 'renamed export')
  await rename(directory, moved)
  directory = moved
  await rename(join(directory, executableName), join(directory, 'Renamed Game.exe'))
  executableName = 'Renamed Game.exe'
  config.title = 'Renamed game'
  await writeFile(join(directory, 'webgal-runtime.json'), JSON.stringify(config))
  evaluate = await launch()
  assert.equal(await evaluate('localStorage.getItem("smoke")'), 'saved')
  assert.equal(await evaluate(`(async()=>{const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('smoke',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});const result=await new Promise((resolve,reject)=>{const r=db.transaction('saves').objectStore('saves').get('slot');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});db.close();return result})()`), 'save-data')
  await close()
  config.fullScreen = true
  await writeFile(join(directory, 'webgal-runtime.json'), JSON.stringify(config))
  evaluate = await launch()
  assert.equal(await evaluate('document.fullscreenElement===document.documentElement'), true)
  await evaluate('document.exitFullscreen().then(()=>true)')
  assert.equal(await evaluate('document.fullscreenElement===null'), true)
  await close()
  config.gameKey = randomUUID()
  config.fullScreen = false
  const otherId = createHash('sha256').update(config.gameKey).digest('hex')
  profiles.push(resolve(process.env.LOCALAPPDATA, `com.webgalcraft.game.${otherId}`))
  await writeFile(join(directory, 'webgal-runtime.json'), JSON.stringify(config))
  evaluate = await launch()
  assert.ok(await evaluate('localStorage.getItem("smoke")===null'))
  assert.deepEqual(await evaluate('indexedDB.databases().then(dbs=>dbs.map(db=>db.name))'), [])
  await close()
  process.stdout.write('PASS: resources, root/startup fullscreen, native exit, storage isolation, and persistence after directory/executable/title changes\n')
  if (process.argv[3]) {
    await cp(resolve(process.argv[3]), join(directory, 'resources'), { recursive: true })
    const configPath = join(directory, 'resources/game/config.txt')
    const originalConfig = await readFile(configPath, 'utf8')
    const gameConfig = originalConfig.replace(/Game_key:[^;]*;/, `Game_key:${config.gameKey};`)
    await writeFile(configPath, gameConfig)
    // WebGAL replaces its title CSS classes after loading custom styles; select the clickable label.
    const exitButton = 'Array.from(document.querySelectorAll("div")).find(element => element.onclick && element.textContent.startsWith("退出游戏"))'
    const ready = `!!document.querySelector(".title__enter-game-target") && !!(${exitButton})`
    evaluate = await launch(ready)
    await evaluate('document.documentElement.requestFullscreen().then(()=>true)')
    await evaluate('document.exitFullscreen().then(()=>true)')
    const writeVolume = `(async () => {
      const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open('localforage');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const volume = await new Promise((resolve, reject) => {
        const transaction = db.transaction('keyvaluepairs', 'readwrite');
        const store = transaction.objectStore('keyvaluepairs');
        const request = store.get(${JSON.stringify(config.gameKey)});
        request.onsuccess = () => {
          const value = request.result;
          value.optionData.volumeMain = 37;
          store.put(value, ${JSON.stringify(config.gameKey)});
          transaction.oncomplete = () => resolve(value.optionData.volumeMain);
        };
        transaction.onerror = () => reject(transaction.error);
      });
      db.close();
      return volume;
    })()`
    assert.equal(await evaluate(writeVolume), 37)
    await close()
    evaluate = await launch(ready)
    const restored = await evaluate(`(async () => {
      const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open('localforage');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const value = await new Promise((resolve, reject) => {
        const request = db.transaction('keyvaluepairs').objectStore('keyvaluepairs').get(${JSON.stringify(config.gameKey)});
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      db.close();
      return value.optionData.volumeMain;
    })()`)
    assert.equal(restored, 37, 'Real engine data must survive restart without being reset')
    await waitFor(evaluate, `!!(${exitButton})`)
    await evaluate(`(${exitButton}).click()`)
    await waitFor(evaluate, '!!document.querySelector("#globalDialogContainer [class*=button_list]")')
    await close('document.querySelector("#globalDialogContainer [class*=button_list]").firstElementChild.click()')
    process.stdout.write('PASS: real WebGAL engine loading, fullscreen, localforage persistence, and exit through its confirmation dialog\n')
  }
} finally {
  socket?.close()
  if (child && child.exitCode === null) {
    const exited = new Promise(resolve => child.once('exit', resolve))
    child.kill()
    await exited
  }
  await delay(500)
  assert.ok(resolve(root).startsWith(`${resolve(tmpdir())}${sep}webgal-runtime-smoke-`))
  assert.equal(path.basename(downloadPath), downloadName)
  await rm(downloadPath, { force: true })
  await rm(root, { recursive: true, force: true })
  for (const profile of profiles) {
    assert.equal(dirname(profile), resolve(process.env.LOCALAPPDATA))
    assert.match(profile.split(sep).at(-1), /^com\.webgalcraft\.game\.[a-f\d]{64}$/)
    await rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
  }
}
