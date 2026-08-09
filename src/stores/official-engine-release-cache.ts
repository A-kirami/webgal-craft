import { defineStore } from 'pinia'

import type { OfficialEngineRelease } from '~/domain/engine/official-release'

export const useOfficialEngineReleaseCacheStore = defineStore(
  'official-engine-release-cache',
  () => {
    let latestVersion = $ref<string>()
    let releases = $ref<OfficialEngineRelease[]>([])

    function replaceReleases(nextReleases: OfficialEngineRelease[], nextLatestVersion: string): void {
      releases = nextReleases
      latestVersion = nextLatestVersion
    }

    return $$({
      latestVersion,
      releases,
      replaceReleases,
    })
  },
  {
    persist: true,
  },
)
