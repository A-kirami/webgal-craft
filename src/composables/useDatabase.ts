import { useDexieLiveQuery } from '~/composables/useDexieLiveQuery'
import { db } from '~/database/db'

import type { Engine, Game, Template } from '~/database/model'

export function useGames() {
  return useDexieLiveQuery<Game[]>(() => db.games.toArray())
}

export function useEngines() {
  return useDexieLiveQuery<Engine[]>(() => db.engines.toArray())
}

export function useTemplates() {
  return useDexieLiveQuery<Template[]>(() => db.templates.toArray())
}
