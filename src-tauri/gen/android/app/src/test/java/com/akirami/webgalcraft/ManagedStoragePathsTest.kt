package com.akirami.webgalcraft

import java.io.File
import java.nio.file.Files
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class ManagedStoragePathsTest {
  @Test
  fun `resolves each resource root below app-owned files`() {
    val filesDir = Files.createTempDirectory("resource-roots").toFile()

    assertEquals(File(filesDir, "documents/WebGALCraft/games"), ManagedStoragePaths.root(filesDir, ResourceKind.GAME))
    assertEquals(File(filesDir, "documents/WebGALCraft/engines"), ManagedStoragePaths.root(filesDir, ResourceKind.ENGINE))
    assertEquals(File(filesDir, "documents/WebGALCraft/templates"), ManagedStoragePaths.root(filesDir, ResourceKind.TEMPLATE))
    assertEquals(File(filesDir, "documents/WebGALCraft/exports"), ManagedStoragePaths.exportRoot(filesDir))
    assertEquals(
      File(filesDir, "documents/WebGALCraft/exports/.export-staging"),
      ManagedStoragePaths.exportStagingRoot(filesDir),
    )
    assertEquals(
      File(filesDir, "documents/WebGALCraft/exports/.export-staging/session-1"),
      ManagedStoragePaths.exportStaging(filesDir, "session-1"),
    )
  }

  @Test
  fun `accepts only the resource-specific final layout`() {
    val root = Files.createTempDirectory("resource-final").toFile()

    assertEquals(File(root, "game-id").canonicalFile, ManagedStoragePaths.resolveFinal(root, "game-id", 1))
    assertEquals(
      File(root, "WebGAL/4.6.2").canonicalFile,
      ManagedStoragePaths.resolveFinal(root, "WebGAL/4.6.2", 2),
    )
    assertThrows(IllegalArgumentException::class.java) {
      ManagedStoragePaths.resolveFinal(root, "publisher/engine/version", 2)
    }
  }

  @Test
  fun `rejects unsafe or escaping final paths`() {
    val root = Files.createTempDirectory("resource-unsafe").toFile()
    val invalid = listOf("", ".", "..", "../outside", "/absolute", "C:\\absolute", "name/../outside", "bad\u0000name")

    invalid.forEach { path ->
      assertThrows(path, IllegalArgumentException::class.java) {
        ManagedStoragePaths.resolveFinal(root, path, 2)
      }
    }
  }

  @Test
  fun `session ids cannot contain separators or dot segments`() {
    assertTrue(ManagedStoragePaths.validateSessionId("9c1195e0-31bc-4a4a-9930-4dc588985c26"))
    listOf("", ".", "..", "../other", "other/session", "other\\session").forEach { value ->
      assertTrue("expected invalid session id: $value", !ManagedStoragePaths.validateSessionId(value))
      assertThrows(value, IllegalArgumentException::class.java) {
        ManagedStoragePaths.exportStaging(File("/files"), value)
      }
    }
  }
}
