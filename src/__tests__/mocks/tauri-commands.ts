import { vi } from 'vitest'

export interface TauriCommandMockBundle {
  fsCmds: {
    copyDirectory: ReturnType<typeof vi.fn>
    copyDirectoryWithProgress: ReturnType<typeof vi.fn>
    copyFile: ReturnType<typeof vi.fn>
    createFile: ReturnType<typeof vi.fn>
    createFolder: ReturnType<typeof vi.fn>
    deleteFile: ReturnType<typeof vi.fn>
    generateUniqueFileName: ReturnType<typeof vi.fn>
    getImageDimensions: ReturnType<typeof vi.fn>
    isBinaryFile: ReturnType<typeof vi.fn>
    moveFile: ReturnType<typeof vi.fn>
    renameFile: ReturnType<typeof vi.fn>
    validateDirectoryStructure: ReturnType<typeof vi.fn>
  }
  gameCmds: {
    getGameConfig: ReturnType<typeof vi.fn>
    setGameConfig: ReturnType<typeof vi.fn>
  }
  serverCmds: {
    addStaticSite: ReturnType<typeof vi.fn>
    broadcastMessage: ReturnType<typeof vi.fn>
    getConnectedClients: ReturnType<typeof vi.fn>
    startServer: ReturnType<typeof vi.fn>
    unicastMessage: ReturnType<typeof vi.fn>
  }
  windowCmds: {
    createWindow: ReturnType<typeof vi.fn>
  }
}

export function createTauriCommandMockBundle(): TauriCommandMockBundle {
  return {
    fsCmds: {
      copyDirectory: vi.fn(),
      copyDirectoryWithProgress: vi.fn(),
      copyFile: vi.fn(),
      createFile: vi.fn(),
      createFolder: vi.fn(),
      deleteFile: vi.fn(),
      generateUniqueFileName: vi.fn(),
      getImageDimensions: vi.fn(),
      isBinaryFile: vi.fn(),
      moveFile: vi.fn(),
      renameFile: vi.fn(),
      validateDirectoryStructure: vi.fn(),
    },
    gameCmds: {
      getGameConfig: vi.fn(),
      setGameConfig: vi.fn(),
    },
    serverCmds: {
      addStaticSite: vi.fn(),
      broadcastMessage: vi.fn(),
      getConnectedClients: vi.fn(),
      startServer: vi.fn(),
      unicastMessage: vi.fn(),
    },
    windowCmds: {
      createWindow: vi.fn(),
    },
  }
}

export function resetTauriCommandMockBundle(bundle: TauriCommandMockBundle) {
  for (const moduleMocks of Object.values(bundle)) {
    for (const mock of Object.values(moduleMocks) as ReturnType<typeof vi.fn>[]) {
      mock.mockReset()
    }
  }
}
