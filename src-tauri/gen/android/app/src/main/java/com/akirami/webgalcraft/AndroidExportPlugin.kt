package com.akirami.webgalcraft

import android.app.Activity
import android.content.ContentValues
import android.content.Intent
import android.net.Uri
import android.provider.MediaStore
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.plugin.Invoke
import app.tauri.plugin.Plugin
import java.io.FileInputStream
import java.io.IOException
import java.util.concurrent.Executors

private const val EXPORT_BUFFER_SIZE = 64 * 1024

@InvokeArg
private class ExportPublishArgs {
  lateinit var exportSessionId: String
  lateinit var suggestedFileName: String
}

@InvokeArg
private class ExportSessionArgs {
  lateinit var exportSessionId: String
}

@InvokeArg
private class PublishedUriArgs {
  lateinit var contentUri: String
}

class AndroidExportPlugin(private val activity: Activity) : Plugin(activity) {
  private val executor = Executors.newSingleThreadExecutor()
  private val sessions = AndroidExportSessionStore(activity)
  private val sessionCleanup = AndroidExportSessionCleanup(activity, sessions)

  @Command
  fun resolveWebExportStaging(invoke: Invoke) {
    try {
      val args = invoke.parseArgs(ExportSessionArgs::class.java)
      sessions.create(args.exportSessionId)
      invoke.resolveObject(mapOf(
        "sessionPath" to ManagedStoragePaths.exportStaging(activity.filesDir, args.exportSessionId).absolutePath,
      ))
    } catch (error: Exception) {
      invoke.reject(error.message ?: "unable to resolve export staging")
    }
  }

  @Command
  fun publishWebExport(invoke: Invoke) {
    executor.execute {
      var publishedUri: Uri? = null
      var session: AndroidExportSession? = null
      try {
        val args = invoke.parseArgs(ExportPublishArgs::class.java)
        session = sessions.require(args.exportSessionId)
        require(session.status == AndroidExportStatus.GENERATING) { "export session is not publishable" }

        val sessionDirectory = ManagedStoragePaths.exportStaging(activity.filesDir, args.exportSessionId)
        val zipFile = sessionDirectory.resolve("export.zip")
        require(zipFile.isFile) { "export ZIP is missing" }

        val displayName = findAvailableExportName(sanitizeZipFileName(args.suggestedFileName))
        publishedUri = activity.contentResolver.insert(
          MediaStore.Downloads.EXTERNAL_CONTENT_URI,
          ContentValues().apply {
            put(MediaStore.Downloads.DISPLAY_NAME, displayName)
            put(MediaStore.Downloads.MIME_TYPE, ANDROID_EXPORT_MIME_TYPE)
            put(MediaStore.Downloads.RELATIVE_PATH, ANDROID_EXPORT_RELATIVE_PATH)
            put(MediaStore.Downloads.IS_PENDING, 1)
          },
        ) ?: throw IOException("unable to create Downloads entry")

        session.contentUri = publishedUri.toString()
        session.status = AndroidExportStatus.MEDIA_PENDING
        sessions.save(session)

        activity.contentResolver.openOutputStream(publishedUri, "w").use { output ->
          requireNotNull(output) { "unable to open Downloads entry" }
          FileInputStream(zipFile).use { input -> input.copyTo(output, EXPORT_BUFFER_SIZE) }
        }

        val updated = activity.contentResolver.update(
          publishedUri,
          ContentValues().apply { put(MediaStore.Downloads.IS_PENDING, 0) },
          null,
          null,
        )
        if (updated != 1) {
          throw IOException("unable to publish Downloads entry")
        }

        session.status = AndroidExportStatus.PUBLISHED
        sessions.save(session)
        invoke.resolveObject(mapOf(
          "kind" to "published",
          "contentUri" to publishedUri.toString(),
          "displayPath" to "Downloads/WebGALCraft/exports/$displayName",
        ))
      } catch (error: Exception) {
        val removed = publishedUri?.let(::deleteMediaEntry) ?: true
        if (removed && session != null && session.status != AndroidExportStatus.PUBLISHED) {
          session.contentUri = null
          session.status = AndroidExportStatus.GENERATING
          runCatching { sessions.save(session) }
        }
        invoke.reject(error.message ?: "unable to publish export", exportErrorCode(error))
      }
    }
  }

  @Command
  fun cleanupWebExport(invoke: Invoke) {
    executor.execute {
      try {
        val args = invoke.parseArgs(ExportSessionArgs::class.java)
        sessionCleanup.cleanup(args.exportSessionId)
        invoke.resolve()
      } catch (error: Exception) {
        invoke.reject(error.message ?: "unable to clean export staging")
      }
    }
  }

  @Command
  fun cleanupRecoverableWebExports(invoke: Invoke) {
    executor.execute {
      try {
        sessionCleanup.recoverAll()
        invoke.resolve()
      } catch (error: Exception) {
        invoke.reject(error.message ?: "unable to recover export session")
      }
    }
  }

  @Command
  fun openPublishedExport(invoke: Invoke) {
    launchPublishedUri(invoke, Intent.ACTION_VIEW)
  }

  @Command
  fun sharePublishedExport(invoke: Invoke) {
    try {
      val uri = requirePublishedExportUri(
        activity,
        invoke.parseArgs(PublishedUriArgs::class.java).contentUri,
      )
      activity.startActivity(Intent.createChooser(
        Intent(Intent.ACTION_SEND).apply {
          type = ANDROID_EXPORT_MIME_TYPE
          putExtra(Intent.EXTRA_STREAM, uri)
          addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        },
        null,
      ))
      invoke.resolve()
    } catch (error: Exception) {
      invoke.reject(error.message ?: "unable to share export")
    }
  }

  private fun deleteMediaEntry(uri: Uri): Boolean =
    runCatching { activity.contentResolver.delete(uri, null, null) >= 0 }.getOrDefault(false)

  private fun sanitizeZipFileName(value: String): String {
    val stem = value.removeSuffix(".zip").trim()
      .replace(Regex("""[\/:*?"<>|\p{Cc}]"""), "_")
      .trim('.', ' ')
      .take(100)
    require(stem.isNotEmpty() && stem != "..") { "invalid export file name" }
    return "$stem.zip"
  }

  private fun findAvailableExportName(baseName: String): String {
    val stem = baseName.removeSuffix(".zip")
    var candidate = baseName
    var suffix = 2
    while (downloadNameExists(candidate)) {
      candidate = "$stem ($suffix).zip"
      suffix++
    }
    return candidate
  }

  private fun downloadNameExists(displayName: String): Boolean {
    activity.contentResolver.query(
      MediaStore.Downloads.EXTERNAL_CONTENT_URI,
      arrayOf(MediaStore.Downloads._ID),
      "${MediaStore.Downloads.DISPLAY_NAME} = ? AND ${MediaStore.Downloads.RELATIVE_PATH} = ?",
      arrayOf(displayName, ANDROID_EXPORT_RELATIVE_PATH),
      null,
    ).use { cursor -> return cursor?.moveToFirst() == true }
  }

  private fun launchPublishedUri(invoke: Invoke, action: String) {
    try {
      val uri = requirePublishedExportUri(
        activity,
        invoke.parseArgs(PublishedUriArgs::class.java).contentUri,
      )
      activity.startActivity(Intent(action).apply {
        setDataAndType(uri, ANDROID_EXPORT_MIME_TYPE)
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
      })
      invoke.resolve()
    } catch (error: Exception) {
      invoke.reject(error.message ?: "unable to open export")
    }
  }

  private fun exportErrorCode(error: Exception): String = when (error) {
    is IllegalArgumentException -> "INVALID_EXPORT"
    is IOException -> "EXPORT_IO_FAILED"
    else -> "EXPORT_FAILED"
  }
}
