import { describe, expectTypeOf, it } from 'vitest'

import { createTestEngine, createTestGame, createTestTemplate } from '~/__tests__/factories'
import { configManager } from '~/services/config-manager'
import { engineManager } from '~/services/engine-manager'
import { gameManager } from '~/services/game-manager'
import { templateManager } from '~/services/template-manager'
import { templateSwitch } from '~/services/template-switch'

import type { Engine, Game, Template } from '~/database/model'
import type { AbsPath } from '~/domain/path'
import type { DiscoveredResource } from '~/features/home/discovered-resource'
import type {
  EngineBuiltinTemplateSourceItem,
  StandaloneTemplateSourceItem,
} from '~/features/home/templates-tab/template-groups'

describe('path brands', () => {
  it('requires AbsPath for database resource paths', () => {
    expectTypeOf<Game['path']>().toEqualTypeOf<AbsPath>()
    expectTypeOf<Engine['path']>().toEqualTypeOf<AbsPath>()
    expectTypeOf<Template['path']>().toEqualTypeOf<AbsPath>()
    expectTypeOf<DiscoveredResource['path']>().toEqualTypeOf<AbsPath>()
  })

  it('requires AbsPath for path-bearing service public APIs', () => {
    expectTypeOf<Parameters<typeof gameManager.validateGame>[0]>().toEqualTypeOf<AbsPath>()
    expectTypeOf<Parameters<typeof gameManager.getGameMetadata>[0]>().toEqualTypeOf<AbsPath>()
    expectTypeOf<Parameters<typeof gameManager.getGamePreviewAssets>[0]>().toEqualTypeOf<AbsPath>()
    expectTypeOf<Parameters<typeof gameManager.getGameSnapshot>[0]>().toEqualTypeOf<AbsPath>()
    expectTypeOf<Parameters<typeof gameManager.refreshRegisteredGameSnapshot>[0]>().toEqualTypeOf<AbsPath>()
    expectTypeOf<Parameters<typeof gameManager.registerGame>[0]>().toEqualTypeOf<AbsPath>()
    expectTypeOf<Parameters<typeof gameManager.createGame>[1]>().toEqualTypeOf<AbsPath>()
    expectTypeOf<Parameters<typeof gameManager.relinkGame>[1]>().toEqualTypeOf<AbsPath>()
    expectTypeOf<Parameters<typeof gameManager.importGame>[0]>().toEqualTypeOf<AbsPath>()
    expectTypeOf<Parameters<typeof gameManager.inspectGame>[0]>().toEqualTypeOf<AbsPath>()
    expectTypeOf<Parameters<typeof gameManager.resolvePreviewSite>[0]['path']>().toEqualTypeOf<AbsPath>()

    expectTypeOf<Parameters<typeof engineManager.validateEngine>[0]>().toEqualTypeOf<AbsPath>()
    expectTypeOf<Parameters<typeof engineManager.classifyEngine>[0]>().toEqualTypeOf<AbsPath>()
    expectTypeOf<Parameters<typeof engineManager.inspectEngine>[0]>().toEqualTypeOf<AbsPath>()
    expectTypeOf<Parameters<typeof engineManager.getEnginePreviewAssets>[0]>().toEqualTypeOf<AbsPath>()
    expectTypeOf<Parameters<typeof engineManager.importEngine>[0]>().toEqualTypeOf<AbsPath>()
    expectTypeOf<Parameters<typeof engineManager.identityKeyOf>[0]['path']>().toEqualTypeOf<AbsPath>()

    expectTypeOf<Parameters<typeof templateManager.validateTemplate>[0]>().toEqualTypeOf<AbsPath>()
    expectTypeOf<Parameters<typeof templateManager.inspectTemplateAvailability>[0]>().toEqualTypeOf<AbsPath>()
    expectTypeOf<Parameters<typeof templateManager.getTemplateMetadata>[0]>().toEqualTypeOf<AbsPath>()
    expectTypeOf<Parameters<typeof templateManager.importTemplate>[0]>().toEqualTypeOf<AbsPath>()

    expectTypeOf<Parameters<typeof configManager.getConfig>[0]>().toEqualTypeOf<AbsPath>()
    expectTypeOf<Parameters<typeof configManager.setConfig>[0]>().toEqualTypeOf<AbsPath>()

    expectTypeOf<Parameters<typeof templateSwitch.resolveTemplatePath>[0]>().not.toBeAny()
    expectTypeOf<Awaited<ReturnType<typeof templateSwitch.resolveTemplatePath>>>().toEqualTypeOf<AbsPath | undefined>()
    expectTypeOf<Parameters<typeof templateSwitch.evaluateTemplateStrategy>[0]>().toEqualTypeOf<AbsPath>()
    expectTypeOf<Parameters<typeof templateSwitch.isTemplateDirty>[0]>().toEqualTypeOf<AbsPath>()
    expectTypeOf<Parameters<typeof templateSwitch.notifyTemplateChanged>[0]>().toEqualTypeOf<AbsPath>()
  })

  it('uses AbsPath in shared test factories', () => {
    expectTypeOf<ReturnType<typeof createTestGame>['path']>().toEqualTypeOf<AbsPath>()
    expectTypeOf<ReturnType<typeof createTestEngine>['path']>().toEqualTypeOf<AbsPath>()
    expectTypeOf<ReturnType<typeof createTestTemplate>['path']>().toEqualTypeOf<AbsPath>()
    expectTypeOf<NonNullable<Parameters<typeof createTestGame>[0]>['path']>().toEqualTypeOf<AbsPath | undefined>()
    expectTypeOf<NonNullable<Parameters<typeof createTestEngine>[0]>['path']>().toEqualTypeOf<AbsPath | undefined>()
    expectTypeOf<NonNullable<Parameters<typeof createTestTemplate>[0]>['path']>().toEqualTypeOf<AbsPath | undefined>()
  })

  it('requires AbsPath for template group and preview session boundaries', () => {
    expectTypeOf<StandaloneTemplateSourceItem['path']>().toEqualTypeOf<AbsPath>()
    expectTypeOf<EngineBuiltinTemplateSourceItem['enginePath']>().toEqualTypeOf<AbsPath>()
    expectTypeOf<EngineBuiltinTemplateSourceItem['templatePath']>().toEqualTypeOf<AbsPath>()
  })
})
