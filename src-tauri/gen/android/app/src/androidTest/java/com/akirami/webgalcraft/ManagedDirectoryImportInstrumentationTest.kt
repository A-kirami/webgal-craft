package com.akirami.webgalcraft

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import java.io.File
import java.util.UUID
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class ManagedDirectoryImportInstrumentationTest {
  private val context = InstrumentationRegistry.getInstrumentation().targetContext

  @Test
  fun publishesFixturesWithinEachManagedResourceRoot() {
    val fixtures = listOf(
      ResourceKind.GAME to "game-${UUID.randomUUID()}",
      ResourceKind.ENGINE to "engine-${UUID.randomUUID()}/1.0.0",
      ResourceKind.TEMPLATE to "template-${UUID.randomUUID()}",
    )

    fixtures.forEach { (kind, relativePath) ->
      val sessionId = UUID.randomUUID().toString()
      val staging = ManagedStoragePaths.staging(context.filesDir, kind, sessionId)
      val final = ManagedStoragePaths.resolveFinal(
        ManagedStoragePaths.root(context.filesDir, kind),
        relativePath,
        kind.maxRelativeSegments,
      )
      try {
        assertTrue(staging.mkdirs())
        File(staging, "fixture.txt").writeText(kind.name)
        final.parentFile?.mkdirs()

        assertTrue(staging.renameTo(final))
        assertEquals(kind.name, File(final, "fixture.txt").readText())
        assertTrue(final.canonicalPath.startsWith(ManagedStoragePaths.root(context.filesDir, kind).canonicalPath))
      } finally {
        final.deleteRecursively()
        ManagedStoragePaths.stagingRoot(context.filesDir, kind).deleteRecursively()
      }
    }
  }

  @Test
  fun relinkFixturePublishesANewGameDirectoryWithoutReplacingTheExistingOne() {
    val gameRoot = ManagedStoragePaths.root(context.filesDir, ResourceKind.GAME)
    val existing = File(gameRoot, "existing-${UUID.randomUUID()}")
    val sessionId = UUID.randomUUID().toString()
    val staging = ManagedStoragePaths.staging(context.filesDir, ResourceKind.GAME, sessionId)
    val replacement = ManagedStoragePaths.resolveFinal(
      gameRoot,
      "replacement-${UUID.randomUUID()}",
      ResourceKind.GAME.maxRelativeSegments,
    )
    try {
      assertTrue(existing.mkdirs())
      File(existing, "fixture.txt").writeText("existing")
      assertTrue(staging.mkdirs())
      File(staging, "fixture.txt").writeText("replacement")

      assertTrue(staging.renameTo(replacement))
      assertEquals("existing", File(existing, "fixture.txt").readText())
      assertEquals("replacement", File(replacement, "fixture.txt").readText())
    } finally {
      existing.deleteRecursively()
      replacement.deleteRecursively()
      ManagedStoragePaths.stagingRoot(context.filesDir, ResourceKind.GAME).deleteRecursively()
    }
  }
}
