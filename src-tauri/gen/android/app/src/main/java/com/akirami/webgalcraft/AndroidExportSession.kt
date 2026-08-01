package com.akirami.webgalcraft

import android.app.Activity
import android.content.Context
import android.net.Uri
import android.provider.MediaStore
import java.io.IOException
import org.json.JSONObject

private const val EXPORT_SESSION_PREFERENCES = "android-web-export-sessions"
internal const val ANDROID_EXPORT_MIME_TYPE = "application/zip"
internal const val ANDROID_EXPORT_RELATIVE_PATH = "Download/WebGALCraft/exports/"

internal enum class AndroidExportStatus(val value: String) {
  GENERATING("generating"),
  MEDIA_PENDING("media-pending"),
  PUBLISHED("published");

  companion object {
    fun fromValue(value: String): AndroidExportStatus = entries.first { it.value == value }
  }
}

internal data class AndroidExportSession(
  val sessionId: String,
  var status: AndroidExportStatus = AndroidExportStatus.GENERATING,
  var contentUri: String? = null,
) {
  fun toJson(): String = JSONObject()
    .put("sessionId", sessionId)
    .put("status", status.value)
    .put("contentUri", contentUri)
    .toString()

  companion object {
    fun fromJson(value: String): AndroidExportSession? = runCatching {
      JSONObject(value).let { json ->
        AndroidExportSession(
          sessionId = json.getString("sessionId"),
          status = AndroidExportStatus.fromValue(json.getString("status")),
          contentUri = json.optString("contentUri").ifBlank { null },
        )
      }
    }.getOrNull()
  }
}

internal class AndroidExportSessionStore(context: Context) {
  private val preferences = context.getSharedPreferences(
    EXPORT_SESSION_PREFERENCES,
    Activity.MODE_PRIVATE,
  )

  fun create(sessionId: String): AndroidExportSession {
    require(ManagedStoragePaths.validateSessionId(sessionId)) { "invalid export session id" }
    require(find(sessionId) == null) { "export session already exists" }
    return AndroidExportSession(sessionId).also(::save)
  }

  fun find(sessionId: String): AndroidExportSession? {
    require(ManagedStoragePaths.validateSessionId(sessionId)) { "invalid export session id" }
    val value = preferences.getString(sessionId, null) ?: return null
    return AndroidExportSession.fromJson(value)?.takeIf { it.sessionId == sessionId }
      ?: throw IllegalStateException("invalid export session state")
  }

  fun require(sessionId: String): AndroidExportSession =
    find(sessionId) ?: throw IllegalStateException("unknown export session")

  fun all(): List<AndroidExportSession> = preferences.all.map { (key, value) ->
    require(value is String) { "invalid export session state" }
    AndroidExportSession.fromJson(value)?.takeIf { it.sessionId == key }
      ?: throw IllegalStateException("invalid export session state")
  }

  fun save(session: AndroidExportSession) {
    check(preferences.edit().putString(session.sessionId, session.toJson()).commit()) {
      "unable to persist export session"
    }
  }

  fun delete(sessionId: String) {
    check(preferences.edit().remove(sessionId).commit()) {
      "unable to delete export session"
    }
  }
}

internal class AndroidExportSessionCleanup(
  private val context: Context,
  private val sessions: AndroidExportSessionStore,
) {
  fun recoverAll() {
    sessions.all().forEach { session -> cleanup(session.sessionId) }
  }

  fun cleanup(sessionId: String) {
    val session = sessions.find(sessionId)
    if (session?.status == AndroidExportStatus.MEDIA_PENDING) {
      val contentUri = requireNotNull(session.contentUri) { "pending export URI is missing" }
      val deleted = context.contentResolver.delete(parsePublishedExportUri(contentUri), null, null)
      if (deleted < 0) {
        throw IOException("unable to delete pending Downloads entry")
      }
    }

    val directory = ManagedStoragePaths.exportStaging(context.filesDir, sessionId)
    if (directory.exists() && !directory.deleteRecursively()) {
      throw IOException("unable to clean export staging")
    }
    if (session != null) {
      sessions.delete(sessionId)
    }
  }
}

internal fun parsePublishedExportUri(value: String): Uri {
  val uri = Uri.parse(value)
  require(uri.scheme == "content" && uri.authority == MediaStore.AUTHORITY) {
    "invalid published export URI"
  }
  return uri
}

internal fun requirePublishedExportUri(context: Context, value: String): Uri {
  val uri = parsePublishedExportUri(value)
  context.contentResolver.query(
    uri,
    arrayOf(MediaStore.Downloads.MIME_TYPE, MediaStore.Downloads.RELATIVE_PATH),
    null,
    null,
    null,
  ).use { cursor ->
    require(cursor != null && cursor.moveToFirst()) { "published export does not exist" }
    require(cursor.getString(0) == ANDROID_EXPORT_MIME_TYPE) { "published export is not a ZIP" }
    require(cursor.getString(1) == ANDROID_EXPORT_RELATIVE_PATH) {
      "published export is outside the managed export directory"
    }
  }
  return uri
}
