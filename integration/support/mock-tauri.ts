import type { Page } from '@playwright/test'

interface SeedEngine {
  id: string
  path: string
  createdAt: number
  status: 'creating' | 'created'
  metadata: {
    name: string
    icon: string
    description: string
  }
}

export interface InstallMockTauriOptions {
  documentDir?: string
  seedEngines?: SeedEngine[]
}

interface VirtualEntry {
  isDirectory: boolean
  size?: number
  mtime?: number
  birthtime?: number
}

interface TauriMockGlobal {
  __TAURI_EVENT_PLUGIN_INTERNALS__?: {
    unregisterListener(): void
  }
  __TAURI_INTERNALS__?: unknown
  __TAURI_MOCK_PENDING__?: boolean
  __TAURI_MOCK_READY__?: boolean
  __TAURI_MOCK_ERROR__?: string
}

const defaultSeedEngine: SeedEngine = {
  id: 'engine-default',
  path: 'C:/Engines/Default',
  createdAt: 1,
  status: 'created',
  metadata: {
    name: 'Default Engine',
    icon: 'C:/Engines/Default/icons/favicon.ico',
    description: '用于集成测试的默认引擎',
  },
}

export async function installMockTauri(page: Page, options: InstallMockTauriOptions = {}) {
  await page.addInitScript(
    async ({ documentDir, seedEngines }) => {
      const callbackRegistry = new Map<number, { callback?: (payload: unknown) => void, once: boolean }>()
      const eventListeners = new Map<number, {
        event: string
        handlerId: number
        targetLabel?: string
        targetKind?: string
      }>()
      const gameConfigStore = new Map<string, Record<string, string>>()
      const fileSystem = new Map<string, VirtualEntry>()
      const fileContents = new Map<string, Uint8Array>()
      const openWindows = new Set<string>(['main'])
      let nextCallbackId = 1
      let nextEventId = 1
      const tauriMockGlobal = globalThis as typeof globalThis & TauriMockGlobal

      function normalizePath(path: string) {
        return path.replaceAll('\\', '/').replaceAll(/\/+/g, '/')
      }

      function joinPaths(parts: string[]) {
        return normalizePath(parts.filter(Boolean).join('/'))
      }

      function now() {
        return Date.now()
      }

      function ensureDirectory(path: string) {
        const normalized = normalizePath(path)
        const segments = normalized.split('/')
        const currentSegments: string[] = []

        for (const segment of segments) {
          if (segment === '') {
            continue
          }

          currentSegments.push(segment)
          const currentPath = currentSegments.join('/').replace(/^([A-Za-z]:)$/, '$1/')
          if (!fileSystem.has(currentPath)) {
            fileSystem.set(currentPath, {
              isDirectory: true,
              size: 0,
              mtime: now(),
              birthtime: now(),
            })
          }
        }
      }

      function encodeContent(content: string | Uint8Array) {
        return typeof content === 'string' ? new TextEncoder().encode(content) : content
      }

      function ensureFile(path: string, content: string | Uint8Array = '') {
        const normalized = normalizePath(path)
        const bytes = encodeContent(content)
        ensureDirectory(dirname(normalized))
        fileContents.set(normalized, bytes)
        fileSystem.set(normalized, {
          isDirectory: false,
          size: bytes.byteLength,
          mtime: now(),
          birthtime: now(),
        })
      }

      function writeVirtualFile(path: string, content: Uint8Array) {
        const normalized = normalizePath(path)
        const currentEntry = fileSystem.get(normalized)
        const createdAt = currentEntry?.birthtime ?? now()

        ensureDirectory(dirname(normalized))
        fileContents.set(normalized, content)
        fileSystem.set(normalized, {
          isDirectory: false,
          size: content.byteLength,
          mtime: now(),
          birthtime: createdAt,
        })
      }

      function listDirectory(path: string) {
        const normalized = normalizePath(path)
        const prefix = normalized.endsWith('/') ? normalized : `${normalized}/`
        const children = new Map<string, { name: string, isDirectory: boolean }>()

        for (const [entryPath, entry] of fileSystem.entries()) {
          if (!entryPath.startsWith(prefix) || entryPath === normalized) {
            continue
          }

          const rest = entryPath.slice(prefix.length)
          if (rest.length === 0) {
            continue
          }

          const [childName] = rest.split('/')
          if (!childName) {
            continue
          }

          children.set(childName, {
            name: childName,
            isDirectory: rest.includes('/') ? true : entry.isDirectory,
          })
        }

        return [...children.values()]
      }

      function createGameSkeleton(gamePath: string) {
        ensureDirectory(gamePath)
        ensureDirectory(joinPaths([gamePath, 'assets']))
        ensureDirectory(joinPaths([gamePath, 'game']))
        ensureDirectory(joinPaths([gamePath, 'game', 'scene']))
        ensureDirectory(joinPaths([gamePath, 'game', 'background']))
        ensureDirectory(joinPaths([gamePath, 'icons']))
        ensureFile(joinPaths([gamePath, 'index.html']))
        ensureFile(joinPaths([gamePath, 'manifest.json']))
        ensureFile(joinPaths([gamePath, 'webgal-serviceworker.js']))
        ensureFile(joinPaths([gamePath, 'icons', 'favicon.ico']))
        ensureFile(joinPaths([gamePath, 'game', 'background', 'cover.png']))
        ensureFile(joinPaths([gamePath, 'game', 'scene', 'start.txt']), '; WebGAL scene\nintro:欢迎来到集成测试。')
      }

      function emitWindowEvent(label: string, event: string) {
        for (const [listenerId, listener] of eventListeners.entries()) {
          if (listener.event !== event || listener.targetLabel !== label) {
            continue
          }

          const callback = callbackRegistry.get(listener.handlerId)
          callback?.callback?.({
            event,
            id: listenerId,
            payload: undefined,
          })

          if (callback?.once) {
            callbackRegistry.delete(listener.handlerId)
          }
        }
      }

      function seedEngineFileSystem(engine: SeedEngine) {
        ensureDirectory(engine.path)
        ensureDirectory(joinPaths([engine.path, 'assets']))
        ensureDirectory(joinPaths([engine.path, 'game']))
        ensureDirectory(joinPaths([engine.path, 'game', 'scene']))
        ensureDirectory(joinPaths([engine.path, 'game', 'background']))
        ensureDirectory(joinPaths([engine.path, 'icons']))
        ensureFile(joinPaths([engine.path, 'index.html']))
        ensureFile(joinPaths([engine.path, 'manifest.json']))
        ensureFile(joinPaths([engine.path, 'webgal-serviceworker.js']))
        ensureFile(joinPaths([engine.path, 'icons', 'favicon.ico']))
        ensureFile(joinPaths([engine.path, 'game', 'background', 'cover.png']))
        ensureFile(joinPaths([engine.path, 'game', 'scene', 'start.txt']), '; Engine default scene')
      }

      function dirname(path: string) {
        const normalized = normalizePath(path)
        const segments = normalized.split('/')
        segments.pop()
        return segments.join('/') || normalized
      }

      function basename(path: string, ext?: string) {
        const normalized = normalizePath(path)
        const name = normalized.split('/').pop() ?? normalized
        return ext && name.endsWith(ext) ? name.slice(0, -ext.length) : name
      }

      function isBinaryPath(path: string) {
        return /\.(png|jpe?g|gif|webp|ico|bmp|mp3|wav|ogg|m4a|mp4|webm|mov|ttf|otf|woff2?)$/i.test(path)
      }

      function asCommandArgs(value: unknown) {
        return value && typeof value === 'object' && !ArrayBuffer.isView(value)
          ? value as Record<string, unknown>
          : {}
      }

      async function seedDatabase(engines: SeedEngine[]) {
        await new Promise<void>((resolve, reject) => {
          const request = globalThis.indexedDB.open('WebGALCraft', 1)

          request.onupgradeneeded = () => {
            const db = request.result

            if (!db.objectStoreNames.contains('games')) {
              const games = db.createObjectStore('games', { keyPath: 'id' })
              games.createIndex('path', 'path', { unique: false })
              games.createIndex('createdAt', 'createdAt', { unique: false })
              games.createIndex('lastModified', 'lastModified', { unique: false })
              games.createIndex('status', 'status', { unique: false })
            }

            if (!db.objectStoreNames.contains('engines')) {
              const enginesStore = db.createObjectStore('engines', { keyPath: 'id' })
              enginesStore.createIndex('path', 'path', { unique: false })
              enginesStore.createIndex('createdAt', 'createdAt', { unique: false })
              enginesStore.createIndex('status', 'status', { unique: false })
            }
          }

          request.addEventListener('error', () => {
            reject(request.error ?? new Error('打开 IndexedDB 失败'))
          })

          request.onsuccess = () => {
            const db = request.result
            const tx = db.transaction(['games', 'engines'], 'readwrite')
            const gamesStore = tx.objectStore('games')
            const enginesStore = tx.objectStore('engines')

            void gamesStore.clear()
            void enginesStore.clear()

            for (const engine of engines) {
              void enginesStore.put(engine)
            }

            tx.oncomplete = () => {
              db.close()
              resolve()
            }
            tx.addEventListener('error', () => {
              reject(tx.error ?? new Error('写入 IndexedDB 失败'))
            })
          }
        })
      }

      tauriMockGlobal.__TAURI_MOCK_PENDING__ = true
      tauriMockGlobal.__TAURI_MOCK_READY__ = false
      tauriMockGlobal.__TAURI_MOCK_ERROR__ = undefined

      tauriMockGlobal.__TAURI_EVENT_PLUGIN_INTERNALS__ = {
        unregisterListener: () => { /* no-op */ },
      }

      const mockReadyPromise = (async () => {
        await seedDatabase(seedEngines)
        ensureDirectory(documentDir)

        for (const engine of seedEngines) {
          seedEngineFileSystem(engine)
        }
      })()

      void mockReadyPromise.then(() => {
        tauriMockGlobal.__TAURI_MOCK_PENDING__ = false
        tauriMockGlobal.__TAURI_MOCK_READY__ = true
      }, (error: unknown) => {
        tauriMockGlobal.__TAURI_MOCK_PENDING__ = false
        tauriMockGlobal.__TAURI_MOCK_READY__ = false
        tauriMockGlobal.__TAURI_MOCK_ERROR__ = error instanceof Error ? error.message : String(error)
      })

      tauriMockGlobal.__TAURI_INTERNALS__ = {
        callbacks: callbackRegistry,
        convertFileSrc: (filePath: string) => filePath,
        metadata: {
          currentWebview: {
            label: 'main',
          },
          currentWindow: {
            label: 'main',
          },
        },
        transformCallback(callback?: (payload: unknown) => void, once = false) {
          const id = nextCallbackId++
          callbackRegistry.set(id, { callback, once })
          return id
        },
        unregisterCallback(id: number) {
          callbackRegistry.delete(id)
        },
        async invoke(
          command: string,
          args: Record<string, unknown> | Uint8Array = {},
          options?: { headers?: Record<string, string> },
        ) {
          await mockReadyPromise
          const invokeArgs = asCommandArgs(args)

          switch (command) {
            case 'plugin:event|listen': {
              const eventId = nextEventId++
              const target = invokeArgs.target as { label?: string, kind?: string } | undefined
              eventListeners.set(eventId, {
                event: String(invokeArgs.event ?? ''),
                handlerId: Number(invokeArgs.handler),
                targetKind: target?.kind,
                targetLabel: target?.label,
              })
              return eventId
            }
            case 'plugin:event|unlisten': {
              eventListeners.delete(Number(invokeArgs.eventId))
              return
            }
            case 'plugin:event|emit':
            case 'plugin:event|emit_to':
            case 'plugin:log|log': {
              return
            }
            case 'plugin:path|resolve_directory': {
              return documentDir
            }
            case 'plugin:path|join': {
              return joinPaths((invokeArgs.paths as string[]) ?? [])
            }
            case 'plugin:path|dirname': {
              return dirname(String(invokeArgs.path ?? ''))
            }
            case 'plugin:path|normalize': {
              return normalizePath(String(invokeArgs.path ?? ''))
            }
            case 'plugin:path|resolve': {
              return joinPaths((invokeArgs.paths as string[]) ?? [])
            }
            case 'plugin:path|basename': {
              return basename(String(invokeArgs.path ?? ''), invokeArgs.ext as string | undefined)
            }
            case 'plugin:path|is_absolute': {
              return /^[A-Za-z]:\//.test(normalizePath(String(invokeArgs.path ?? '')))
            }
            case 'plugin:fs|exists': {
              return fileSystem.has(normalizePath(String(invokeArgs.path ?? '')))
            }
            case 'plugin:fs|read_dir': {
              const path = normalizePath(String(invokeArgs.path ?? ''))
              return listDirectory(path)
            }
            case 'plugin:fs|stat': {
              const path = normalizePath(String(invokeArgs.path ?? ''))
              const entry = fileSystem.get(path)
              if (!entry) {
                throw new Error(`路径不存在: ${path}`)
              }

              return {
                isFile: !entry.isDirectory,
                isDirectory: entry.isDirectory,
                isSymlink: false,
                size: entry.size ?? 0,
                mtime: entry.mtime ?? now(),
                atime: undefined,
                birthtime: entry.birthtime ?? now(),
                readonly: false,
                fileAttributes: undefined,
                dev: undefined,
                ino: undefined,
                mode: undefined,
                nlink: undefined,
                uid: undefined,
                gid: undefined,
                rdev: undefined,
                blksize: undefined,
                blocks: undefined,
              }
            }
            case 'plugin:fs|read_file': {
              const path = normalizePath(String(invokeArgs.path ?? ''))
              const content = fileContents.get(path)
              if (!content) {
                throw new Error(`文件不存在: ${path}`)
              }
              return content
            }
            case 'plugin:fs|write_file':
            case 'plugin:fs|write_text_file': {
              const path = decodeURIComponent(String(options?.headers?.path ?? ''))
              const content = args instanceof Uint8Array ? args : new Uint8Array()
              writeVirtualFile(path, content)
              return
            }
            case 'plugin:fs|watch': {
              return 1
            }
            case 'start_server': {
              return 'http://127.0.0.1:8899'
            }
            case 'add_static_site': {
              return basename(String(invokeArgs.path ?? '')) || 'game'
            }
            case 'remove_static_site': {
              return
            }
            case 'copy_directory_with_progress': {
              createGameSkeleton(String(invokeArgs.destination ?? ''))
              return
            }
            case 'is_binary_file': {
              return isBinaryPath(normalizePath(String(invokeArgs.path ?? '')))
            }
            case 'create_window': {
              const createOptions = invokeArgs.options as { label?: string } | undefined
              const label = createOptions?.label
              if (label) {
                openWindows.add(label)
              }
              return true
            }
            case 'plugin:window|get_all_windows': {
              return [...openWindows]
            }
            case 'plugin:window|close':
            case 'plugin:window|destroy': {
              const label = String(invokeArgs.label ?? '')
              openWindows.delete(label)
              emitWindowEvent(label, 'tauri://destroyed')
              return
            }
            case 'set_game_config': {
              const gamePath = String(invokeArgs.gamePath ?? '')
              const current = gameConfigStore.get(gamePath) ?? {}
              gameConfigStore.set(gamePath, {
                ...current,
                ...(invokeArgs.config as Record<string, string> | undefined),
              })
              return
            }
            case 'get_game_config': {
              const gamePath = String(invokeArgs.gamePath ?? '')
              const config = gameConfigStore.get(gamePath) ?? {}
              const gameName = config.gameName ?? 'Demo Game'

              return {
                gameName,
                description: `${gameName} description`,
                gameKey: gameName.toLowerCase().replaceAll(/\s+/g, '-'),
                packageName: `craft.${gameName.toLowerCase().replaceAll(/\s+/g, '-')}`,
                titleImg: 'cover.png',
              }
            }
            case 'get_thumbnail': {
              return new Uint8Array([])
            }
            default: {
              throw new Error(`未处理的 Tauri invoke: ${command}`)
            }
          }
        },
      }
    },
    {
      documentDir: options.documentDir ?? 'C:/Users/Integration/Documents',
      seedEngines: options.seedEngines ?? [defaultSeedEngine],
    },
  )
}

export async function waitForMockTauriReady(page: Page) {
  await page.waitForFunction(() => {
    const tauriMockGlobal = globalThis as typeof globalThis & TauriMockGlobal

    if (tauriMockGlobal.__TAURI_MOCK_ERROR__) {
      throw new Error(tauriMockGlobal.__TAURI_MOCK_ERROR__)
    }

    return tauriMockGlobal.__TAURI_MOCK_PENDING__ === false
      && tauriMockGlobal.__TAURI_MOCK_READY__ === true
  })
}
