package com.akirami.webgalcraft

import java.io.File

internal enum class ResourceKind(val directoryName: String, val maxRelativeSegments: Int) {
  GAME("games", 1),
  ENGINE("engines", 2),
  TEMPLATE("templates", 1),
}

internal object ManagedStoragePaths {
  fun root(filesDir: File, kind: ResourceKind): File =
    File(File(File(filesDir, "documents"), "WebGALCraft"), kind.directoryName)

  fun stagingRoot(filesDir: File, kind: ResourceKind): File =
    File(root(filesDir, kind), ".import-staging")

  fun staging(filesDir: File, kind: ResourceKind, sessionId: String): File {
    require(validateSessionId(sessionId)) { "invalid import session id" }
    return File(stagingRoot(filesDir, kind), sessionId)
  }

  fun exportRoot(filesDir: File): File =
    File(File(filesDir, "documents"), "WebGALCraft/exports")

  fun exportStagingRoot(filesDir: File): File =
    File(exportRoot(filesDir), ".export-staging")

  fun exportStaging(filesDir: File, sessionId: String): File {
    require(validateSessionId(sessionId)) { "invalid export session id" }
    return File(exportStagingRoot(filesDir), sessionId)
  }

  fun validateSessionId(sessionId: String): Boolean =
    sessionId.isNotBlank() && sessionId.length <= 80 && sessionId.all { it.isLetterOrDigit() || it == '-' }

  fun resolveFinal(root: File, relativePath: String, maxSegments: Int): File {
    val segments = relativePath.split('/')
    require(segments.size in 1..maxSegments) { "invalid relative path depth" }
    require(segments.all(::isSafeSegment)) { "invalid relative path" }

    val rootCanonical = root.canonicalFile
    val target = File(rootCanonical, relativePath).canonicalFile
    require(target.path == rootCanonical.path || target.path.startsWith(rootCanonical.path + File.separator)) {
      "path escapes resource root"
    }
    return target
  }

  private fun isSafeSegment(segment: String): Boolean =
    segment.isNotEmpty()
      && segment != "."
      && segment != ".."
      && !segment.contains('\u0000')
      && !segment.contains('/')
      && !segment.contains('\\')
}
