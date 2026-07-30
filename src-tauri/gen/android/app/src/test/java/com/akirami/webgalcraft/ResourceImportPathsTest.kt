package com.akirami.webgalcraft

import java.io.File
import java.nio.file.Files
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class ResourceImportPathsTest {
  @Test
  fun `resolves each resource root below app-owned files`() {
    val filesDir = Files.createTempDirectory("resource-roots").toFile()

    assertEquals(File(filesDir, "documents/WebGALCraft/games"), ResourceImportPaths.root(filesDir, ResourceKind.GAME))
    assertEquals(File(filesDir, "documents/WebGALCraft/engines"), ResourceImportPaths.root(filesDir, ResourceKind.ENGINE))
    assertEquals(File(filesDir, "documents/WebGALCraft/templates"), ResourceImportPaths.root(filesDir, ResourceKind.TEMPLATE))
  }

  @Test
  fun `accepts only the resource-specific final layout`() {
    val root = Files.createTempDirectory("resource-final").toFile()

    assertEquals(File(root, "game-id").canonicalFile, ResourceImportPaths.resolveFinal(root, "game-id", 1))
    assertEquals(
      File(root, "WebGAL/4.6.2").canonicalFile,
      ResourceImportPaths.resolveFinal(root, "WebGAL/4.6.2", 2),
    )
    assertThrows(IllegalArgumentException::class.java) {
      ResourceImportPaths.resolveFinal(root, "publisher/engine/version", 2)
    }
  }

  @Test
  fun `rejects unsafe or escaping final paths`() {
    val root = Files.createTempDirectory("resource-unsafe").toFile()
    val invalid = listOf("", ".", "..", "../outside", "/absolute", "C:\\absolute", "name/../outside", "bad\u0000name")

    invalid.forEach { path ->
      assertThrows(path, IllegalArgumentException::class.java) {
        ResourceImportPaths.resolveFinal(root, path, 2)
      }
    }
  }

  @Test
  fun `session ids cannot contain separators or dot segments`() {
    assertTrue(ResourceImportPaths.validateSessionId("9c1195e0-31bc-4a4a-9930-4dc588985c26"))
    listOf("", ".", "..", "../other", "other/session", "other\\session").forEach { value ->
      assertTrue("expected invalid session id: $value", !ResourceImportPaths.validateSessionId(value))
    }
  }
}
