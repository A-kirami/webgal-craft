import { safeInvoke } from '~/utils/invoke'

import type { EngineManifestResult } from '~/types/engine'

function readEngineManifest(enginePath: string): Promise<EngineManifestResult> {
  return safeInvoke('read_engine_manifest', { enginePath })
}

export const engineCmds = {
  readEngineManifest,
}
