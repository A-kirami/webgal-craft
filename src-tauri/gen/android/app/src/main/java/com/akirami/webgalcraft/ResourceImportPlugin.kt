package com.akirami.webgalcraft

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.ParcelFileDescriptor
import android.provider.DocumentsContract
import androidx.activity.result.ActivityResult
import app.tauri.annotation.ActivityCallback
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.plugin.Channel
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import java.io.BufferedInputStream
import java.io.BufferedOutputStream
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.IOException
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean
import org.json.JSONObject

private const val SESSION_PREFERENCES = "managed-resource-import-sessions"
private const val BUFFER_SIZE = 64 * 1024
private const val MAX_FILES = 50_000L
private const val MAX_TOTAL_BYTES = 2L * 1024 * 1024 * 1024
private const val MAX_FILE_BYTES = 512L * 1024 * 1024
private const val MAX_DEPTH = 32

private data class ImportSession(
  val sessionId: String,
  val kind: ResourceKind,
  var operation: String = "import",
  var existingGameId: String? = null,
  var status: String = "selecting",
  var stagingRelativePath: String,
  var finalRelativePath: String? = null,
  var resourceId: String? = null,
  var createdParentRelativePath: String? = null,
  var grantUri: String? = null,
  var updatedAt: Long = System.currentTimeMillis(),
) {
  fun toJson(): String = JSONObject()
    .put("sessionId", sessionId)
    .put("kind", kind.name)
    .put("operation", operation)
    .put("existingGameId", existingGameId)
    .put("status", status)
    .put("stagingRelativePath", stagingRelativePath)
    .put("finalRelativePath", finalRelativePath)
    .put("resourceId", resourceId)
    .put("createdParentRelativePath", createdParentRelativePath)
    .put("grantUri", grantUri)
    .put("updatedAt", updatedAt)
    .toString()

  companion object {
    fun fromJson(value: String): ImportSession? = runCatching {
      JSONObject(value).let { json ->
        ImportSession(
          sessionId = json.getString("sessionId"),
          kind = ResourceKind.valueOf(json.getString("kind")),
          operation = json.optString("operation", "import"),
          existingGameId = json.optString("existingGameId").ifBlank { null },
          status = json.getString("status"),
          stagingRelativePath = json.getString("stagingRelativePath"),
          finalRelativePath = json.optString("finalRelativePath").ifBlank { null },
          resourceId = json.optString("resourceId").ifBlank { null },
          createdParentRelativePath = json.optString("createdParentRelativePath").ifBlank { null },
          grantUri = json.optString("grantUri").ifBlank { null },
          updatedAt = json.getLong("updatedAt"),
        )
      }
    }.getOrNull()
  }
}

@InvokeArg
private class OperationArgs {
  var kind: String? = null
  var existingGameId: String? = null
}

@InvokeArg
private class SelectArgs {
  lateinit var kind: String
  var operation: OperationArgs? = null
  var onProgress: Channel? = null
}

@InvokeArg
private class SessionArgs {
  lateinit var sessionId: String
}

@InvokeArg
private class PublishArgs {
  lateinit var sessionId: String
  lateinit var finalRelativePath: String
}

@InvokeArg
private class CommitArgs {
  lateinit var sessionId: String
  lateinit var resourceId: String
}

private data class PendingPicker(val session: ImportSession, val progress: Channel?)

class ResourceImportPlugin(private val activity: Activity) : Plugin(activity) {
  private val executor = Executors.newSingleThreadExecutor()
  private val pendingPickers = ConcurrentHashMap<Long, PendingPicker>()
  private val cancellation = ConcurrentHashMap<String, AtomicBoolean>()

  private val preferences by lazy {
    activity.getSharedPreferences(SESSION_PREFERENCES, Activity.MODE_PRIVATE)
  }

  @Command
  fun resolveResourceRoots(invoke: Invoke) {
    val roots = JSObject()
    ResourceKind.entries.forEach { kind ->
      roots.put(kind.directoryName.removeSuffix("s"), ResourceImportPaths.root(activity.filesDir, kind).absolutePath)
    }
    roots.put("export", File(File(activity.filesDir, "documents"), "WebGALCraft/exports").absolutePath)
    invoke.resolve(roots)
  }

  @Command
  fun selectAndStage(invoke: Invoke) {
    try {
      val args = parseSelectArgs(invoke)
      val kind = ResourceKind.valueOf(args.kind.uppercase())
      val sessionId = UUID.randomUUID().toString()
      val session = ImportSession(
        sessionId = sessionId,
        kind = kind,
        operation = args.operation?.kind ?: "import",
        existingGameId = args.operation?.existingGameId,
        stagingRelativePath = "$sessionId",
      )
      saveSession(session)
      pendingPickers[invoke.id] = PendingPicker(session, args.onProgress)
      val intent = Intent(Intent.ACTION_OPEN_DOCUMENT_TREE).apply {
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        addFlags(Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION)
        addFlags(Intent.FLAG_GRANT_PREFIX_URI_PERMISSION)
      }
      startActivityForResult(invoke, intent, "directoryPickerResult")
    } catch (error: Exception) {
      invoke.reject(error.message ?: "unable to start directory picker")
    }
  }

  @ActivityCallback
  fun directoryPickerResult(invoke: Invoke, result: ActivityResult) {
    val pending = pendingPickers.remove(invoke.id)
    if (pending == null) {
      invoke.reject("directory picker session not found")
      return
    }

    if (result.resultCode != Activity.RESULT_OK || result.data?.data == null) {
      deleteSession(pending.session)
      invoke.resolveObject(mapOf("kind" to "cancelled"))
      return
    }

    val uri = result.data!!.data!!
    try {
      activity.contentResolver.takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION)
    } catch (_: SecurityException) {
      deleteSession(pending.session)
      invoke.reject("provider denied read permission", "PROVIDER_DENIED")
      return
    }

    pending.session.grantUri = uri.toString()
    pending.session.status = "copying"
    saveSession(pending.session)
    cancellation[pending.session.sessionId] = AtomicBoolean(false)
    emitProgress(pending.progress, pending.session, 0, 0, null, null, null)
    executor.execute {
      try {
        copyTree(uri, pending.session, pending.progress)
        pending.session.status = "staged"
        saveSession(pending.session)
        invoke.resolveObject(mapOf(
          "kind" to "staged",
          "sessionId" to pending.session.sessionId,
          "stagingPath" to stagingDirectory(pending.session).absolutePath,
        ))
      } catch (error: CopyCancelledException) {
        val cleanupError = runCatching { cleanupSession(pending.session) }.exceptionOrNull()
        if (cleanupError == null) {
          invoke.resolveObject(mapOf("kind" to "cancelled"))
        } else {
          invoke.reject("import cancelled but cleanup is incomplete", "ROLLBACK_FAILED")
        }
      } catch (error: Exception) {
        val cleanupError = runCatching { cleanupSession(pending.session) }.exceptionOrNull()
        val message = error.message ?: "directory copy failed"
        invoke.reject(
          if (cleanupError == null) message else "$message; import cleanup is incomplete",
          errorCode(error),
        )
      } finally {
        cancellation.remove(pending.session.sessionId)
      }
    }
  }

  @Command
  fun cancel(invoke: Invoke) {
    try {
      val args = invoke.parseArgs(SessionArgs::class.java)
      cancellation[args.sessionId]?.set(true)
      sessions()[args.sessionId]?.let { cleanupSession(it) }
      invoke.resolve()
    } catch (error: Exception) {
      invoke.reject(error.message ?: "unable to cancel session")
    }
  }

  @Command
  fun publish(invoke: Invoke) {
    try {
      val args = invoke.parseArgs(PublishArgs::class.java)
      val session = requireSession(args.sessionId)
      require(session.status == "staged" || session.status == "prepared") { "session is not publishable" }
      val finalPath = ResourceImportPaths.resolveFinal(
        ResourceImportPaths.root(activity.filesDir, session.kind),
        args.finalRelativePath,
        session.kind.maxRelativeSegments,
      )
      require(!finalPath.exists()) { "target already exists" }
      val staging = stagingDirectory(session)
      require(staging.exists() && staging.isDirectory) { "staging directory is missing" }
      finalPath.parentFile?.let { parent ->
        if (!parent.exists()) {
          require(parent.mkdirs()) { "unable to create target parent" }
          session.createdParentRelativePath = parent.relativeTo(ResourceImportPaths.root(activity.filesDir, session.kind)).path
        }
      }
      require(staging.renameTo(finalPath)) { "unable to publish staged directory" }
      session.finalRelativePath = args.finalRelativePath
      session.status = "published"
      saveSession(session)
      emitProgress(null, session, 0, 0, null, null, null)
      invoke.resolveObject(mapOf("finalPath" to finalPath.absolutePath))
    } catch (error: Exception) {
      invoke.reject(error.message ?: "unable to publish directory", errorCode(error))
    }
  }

  @Command
  fun commit(invoke: Invoke) {
    try {
      val args = invoke.parseArgs(CommitArgs::class.java)
      val session = requireSession(args.sessionId)
      session.resourceId = args.resourceId
      session.status = "committed"
      releaseGrant(session)
      saveSession(session)
      invoke.resolve()
    } catch (error: Exception) {
      invoke.reject(error.message ?: "unable to commit import")
    }
  }

  @Command
  fun rollback(invoke: Invoke) {
    try {
      val args = invoke.parseArgs(SessionArgs::class.java)
      sessions()[args.sessionId]?.let { cleanupSession(it) }
      invoke.resolve()
    } catch (error: Exception) {
      invoke.reject(error.message ?: "unable to rollback import")
    }
  }

  @Command
  fun listRecoverableSessions(invoke: Invoke) {
    val result = sessions().values.filter { it.status !in setOf("committed", "rolled-back") }
      .map { session ->
        mapOf(
          "sessionId" to session.sessionId,
          "resourceKind" to session.kind.name.lowercase(),
          "operation" to mapOf(
            "kind" to session.operation,
            "existingGameId" to session.existingGameId,
          ),
          "status" to session.status,
          "stagingPath" to stagingDirectory(session).absolutePath,
          "finalPath" to session.finalRelativePath?.let {
            ResourceImportPaths.resolveFinal(
              ResourceImportPaths.root(activity.filesDir, session.kind), it, session.kind.maxRelativeSegments,
            ).absolutePath
          },
          "resourceId" to session.resourceId,
          "updatedAt" to session.updatedAt,
        )
      }
    invoke.resolveObject(result)
  }

  private fun parseSelectArgs(invoke: Invoke): SelectArgs =
    invoke.parseArgs(SelectArgs::class.java)

  private fun copyTree(rootUri: Uri, session: ImportSession, progress: Channel?): CopyStats {
    val staging = stagingDirectory(session)
    require(staging.mkdirs() || staging.isDirectory) { "unable to create staging directory" }
    val rootDocumentId = DocumentsContract.getTreeDocumentId(rootUri)
    require(!rootDocumentId.isNullOrBlank()) { "provider did not provide a stable document identifier" }
    val visited = HashSet<String>()
    val stats = CopyStats()
    copyDirectory(rootUri, rootDocumentId, staging, "", 0, visited, stats, session, progress)
    return stats
  }

  private fun copyDirectory(
    treeUri: Uri,
    documentId: String,
    destination: File,
    relative: String,
    depth: Int,
    visited: MutableSet<String>,
    stats: CopyStats,
    session: ImportSession,
    progress: Channel?,
  ) {
    checkCancelled(session)
    require(depth <= MAX_DEPTH) { "directory depth exceeds limit" }
    require(visited.add(documentId)) { "provider directory cycle detected" }
    val childrenUri = DocumentsContract.buildChildDocumentsUriUsingTree(treeUri, documentId)
    val names = HashSet<String>()
    activity.contentResolver.query(childrenUri, arrayOf(
      DocumentsContract.Document.COLUMN_DOCUMENT_ID,
      DocumentsContract.Document.COLUMN_DISPLAY_NAME,
      DocumentsContract.Document.COLUMN_MIME_TYPE,
      DocumentsContract.Document.COLUMN_SIZE,
    ), null, null, null)?.use { cursor ->
      val idIndex = cursor.getColumnIndexOrThrow(DocumentsContract.Document.COLUMN_DOCUMENT_ID)
      val nameIndex = cursor.getColumnIndexOrThrow(DocumentsContract.Document.COLUMN_DISPLAY_NAME)
      val mimeIndex = cursor.getColumnIndexOrThrow(DocumentsContract.Document.COLUMN_MIME_TYPE)
      val sizeIndex = cursor.getColumnIndexOrThrow(DocumentsContract.Document.COLUMN_SIZE)
      while (cursor.moveToNext()) {
        checkCancelled(session)
        val childId = cursor.getString(idIndex) ?: throw IOException("provider returned empty document id")
        require(!visited.contains(childId)) { "provider returned a repeated document identifier" }
        val name = cursor.getString(nameIndex) ?: throw IOException("provider returned empty entry name")
        require(isSafeEntryName(name)) { "unsafe document name" }
        require(names.add(name)) { "duplicate sibling name" }
        val mimeType = cursor.getString(mimeIndex) ?: throw IOException("provider returned empty mime type")
        val childRelative = if (relative.isEmpty()) name else "$relative/$name"
        val childTarget = File(destination, childRelative).canonicalFile
        require(childTarget.path.startsWith(destination.canonicalPath + File.separator)) { "entry escapes staging" }
        if (mimeType == DocumentsContract.Document.MIME_TYPE_DIR) {
          require(depth + 1 <= MAX_DEPTH) { "directory depth exceeds limit" }
          require(childTarget.mkdirs() || childTarget.isDirectory) { "unable to create staging directory" }
          copyDirectory(treeUri, childId, destination, childRelative, depth + 1, visited, stats, session, progress)
        } else if (mimeType.isBlank()) {
          throw IOException("unsupported document type")
        } else {
          visited.add(childId)
          if (stats.files >= MAX_FILES) throw SizeLimitException()
          val expectedSize = if (cursor.isNull(sizeIndex)) -1L else cursor.getLong(sizeIndex)
          if (expectedSize > MAX_FILE_BYTES) throw SizeLimitException()
          copyFile(treeUri, childId, childTarget, expectedSize, stats, session, progress, childRelative)
        }
      }
    } ?: throw IOException("provider refused directory enumeration")
  }

  private fun copyFile(
    treeUri: Uri,
    documentId: String,
    target: File,
    expectedSize: Long,
    stats: CopyStats,
    session: ImportSession,
    progress: Channel?,
    relative: String,
  ) {
    checkCancelled(session)
    val uri = DocumentsContract.buildDocumentUriUsingTree(treeUri, documentId)
    val temporary = File(target.parentFile, ".${target.name}.${UUID.randomUUID()}.tmp")
    var copied = 0L
    try {
      activity.contentResolver.openFileDescriptor(uri, "r", null)?.use { descriptor: ParcelFileDescriptor ->
        FileInputStream(descriptor.fileDescriptor).use { source ->
          BufferedInputStream(source, BUFFER_SIZE).use { input ->
            FileOutputStream(temporary).use { output ->
              BufferedOutputStream(output, BUFFER_SIZE).use { buffered ->
                val buffer = ByteArray(BUFFER_SIZE)
                while (true) {
                  checkCancelled(session)
                  val read = input.read(buffer)
                  if (read < 0) break
                  copied += read
                  stats.filesBytes += read
                  if (copied > MAX_FILE_BYTES || stats.filesBytes > MAX_TOTAL_BYTES) throw SizeLimitException()
                  buffered.write(buffer, 0, read)
                  emitProgress(progress, session, stats.filesBytes, stats.files + 1, relative, null, null)
                }
              }
            }
          }
        }
      } ?: throw IOException("provider refused file read")
      if (expectedSize >= 0 && expectedSize != copied) throw IOException("provider file size changed")
      require(temporary.renameTo(target)) { "unable to finalize copied file" }
      stats.files += 1
      emitProgress(progress, session, stats.filesBytes, stats.files, relative, null, null)
    } finally {
      if (temporary.exists()) temporary.delete()
    }
  }

  private fun checkCancelled(session: ImportSession) {
    if (cancellation[session.sessionId]?.get() == true) throw CopyCancelledException()
  }

  private fun emitProgress(
    channel: Channel?, session: ImportSession, bytes: Long, files: Long,
    entry: String?, totalBytes: Long?, totalFiles: Long?,
  ) {
    channel?.sendObject(mapOf(
      "sessionId" to session.sessionId,
      "resourceKind" to session.kind.name.lowercase(),
      "phase" to when (session.status) { "copying" -> "copying"; "published" -> "publishing"; else -> "copying" },
      "copiedBytes" to bytes,
      "copiedFiles" to files,
      "currentEntry" to entry,
      "totalBytes" to totalBytes,
      "totalFiles" to totalFiles,
    ))
  }

  private fun stagingDirectory(session: ImportSession): File =
    ResourceImportPaths.staging(activity.filesDir, session.kind, session.sessionId)

  private fun requireSession(sessionId: String): ImportSession {
    require(ResourceImportPaths.validateSessionId(sessionId)) { "invalid import session id" }
    return sessions()[sessionId] ?: throw IOException("unknown import session")
  }

  private fun sessions(): MutableMap<String, ImportSession> =
    preferences.all.mapNotNull { (key, value) ->
      if (value !is String) return@mapNotNull null
      ImportSession.fromJson(value)?.takeIf { it.sessionId == key }
    }.associateByTo(mutableMapOf()) { it.sessionId }

  private fun saveSession(session: ImportSession) {
    session.updatedAt = System.currentTimeMillis()
    preferences.edit().putString(session.sessionId, session.toJson()).apply()
  }

  private fun deleteSession(session: ImportSession) {
    preferences.edit().remove(session.sessionId).apply()
  }

  private fun releaseGrant(session: ImportSession) {
    session.grantUri?.let { uri ->
      runCatching {
        activity.contentResolver.releasePersistableUriPermission(
          Uri.parse(uri), Intent.FLAG_GRANT_READ_URI_PERMISSION,
        )
      }
    }
    session.grantUri = null
  }

  private fun cleanupSession(session: ImportSession) {
    cancellation[session.sessionId]?.set(true)
    val shouldDeleteFinal = session.status != "committed"
    session.status = "rolling-back"
    saveSession(session)
    var cleanupSucceeded = deleteRecursively(stagingDirectory(session))
    if (session.finalRelativePath != null && shouldDeleteFinal) {
      val finalPath = ResourceImportPaths.resolveFinal(
        ResourceImportPaths.root(activity.filesDir, session.kind),
        session.finalRelativePath!!,
        session.kind.maxRelativeSegments,
      )
      cleanupSucceeded = deleteRecursively(finalPath) && cleanupSucceeded
      session.createdParentRelativePath?.let { relative ->
        val parent = ResourceImportPaths.resolveFinal(
          ResourceImportPaths.root(activity.filesDir, session.kind), relative, session.kind.maxRelativeSegments,
        )
        if (parent.isDirectory && parent.listFiles()?.isEmpty() == true) {
          cleanupSucceeded = parent.delete() && cleanupSucceeded
        }
      }
    }
    releaseGrant(session)
    if (!cleanupSucceeded) {
      saveSession(session)
      throw IOException("import cleanup is incomplete")
    }
    session.status = "rolled-back"
    saveSession(session)
    deleteSession(session)
  }

  private fun deleteRecursively(file: File): Boolean {
    if (!file.exists()) return true
    if (file.isDirectory) {
      val children = file.listFiles() ?: return false
      if (!children.all(::deleteRecursively)) return false
    }
    return file.delete()
  }

  private fun isSafeEntryName(name: String): Boolean =
    name.isNotEmpty() && name != "." && name != ".." && !name.contains('\u0000')
      && !name.contains('/') && !name.contains('\\')

  private fun errorCode(error: Exception): String = when (error) {
    is SizeLimitException -> "RESOURCE_LIMIT"
    is CopyCancelledException -> "CANCELLED"
    is IllegalArgumentException -> "UNSAFE_ENTRY"
    is IOException -> if (error.message?.contains("ENOSPC", ignoreCase = true) == true
      || error.message?.contains("no space", ignoreCase = true) == true
    ) "STORAGE_FULL" else "COPY_FAILED"
    else -> "COPY_FAILED"
  }

  private class CopyStats(var files: Long = 0, var filesBytes: Long = 0)
  private class CopyCancelledException : IOException()
  private class SizeLimitException : IOException()
}
