package com.akirami.webgalcraft

import android.content.ContentValues
import android.net.Uri
import android.provider.MediaStore
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import java.io.File
import java.util.UUID
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class AndroidExportRecoveryInstrumentationTest {
  private val context = InstrumentationRegistry.getInstrumentation().targetContext
  private val sessions = AndroidExportSessionStore(context)
  private val cleanup = AndroidExportSessionCleanup(context, sessions)

  @Test
  fun recoveryDeletesPendingMediaEntryAndPrivateStaging() {
    val sessionId = UUID.randomUUID().toString()
    val staging = ManagedStoragePaths.exportStaging(context.filesDir, sessionId)
    val contentUri = insertDownload("webgal-craft-pending-$sessionId.zip", pending = true)
    try {
      assertTrue(staging.mkdirs())
      File(staging, "export.zip").writeText("fixture")
      sessions.create(sessionId).also { session ->
        session.status = AndroidExportStatus.MEDIA_PENDING
        session.contentUri = contentUri.toString()
        sessions.save(session)
      }

      cleanup.recoverAll()

      assertFalse(staging.exists())
      assertNull(sessions.find(sessionId))
      assertFalse(mediaEntryExists(contentUri))
    } finally {
      context.contentResolver.delete(contentUri, null, null)
      staging.deleteRecursively()
    }
  }

  @Test
  fun recoveryPreservesPublishedMediaEntryAndCleansPrivateState() {
    val sessionId = UUID.randomUUID().toString()
    val staging = ManagedStoragePaths.exportStaging(context.filesDir, sessionId)
    val contentUri = insertDownload("webgal-craft-published-$sessionId.zip", pending = false)
    try {
      assertTrue(staging.mkdirs())
      File(staging, "export.zip").writeText("fixture")
      sessions.create(sessionId).also { session ->
        session.status = AndroidExportStatus.PUBLISHED
        session.contentUri = contentUri.toString()
        sessions.save(session)
      }

      cleanup.recoverAll()

      assertFalse(staging.exists())
      assertNull(sessions.find(sessionId))
      assertTrue(mediaEntryExists(contentUri))
    } finally {
      context.contentResolver.delete(contentUri, null, null)
      staging.deleteRecursively()
    }
  }

  @Test
  fun publishedUriMustBelongToManagedExportDirectory() {
    val contentUri = insertDownload(
      "webgal-craft-unmanaged-${UUID.randomUUID()}.zip",
      pending = false,
      relativePath = "Download/",
    )
    try {
      val error = runCatching {
        requirePublishedExportUri(context, contentUri.toString())
      }.exceptionOrNull()

      assertTrue(error is IllegalArgumentException)
    } finally {
      context.contentResolver.delete(contentUri, null, null)
    }
  }

  private fun insertDownload(
    displayName: String,
    pending: Boolean,
    relativePath: String = ANDROID_EXPORT_RELATIVE_PATH,
  ): Uri =
    requireNotNull(context.contentResolver.insert(
      MediaStore.Downloads.EXTERNAL_CONTENT_URI,
      ContentValues().apply {
        put(MediaStore.Downloads.DISPLAY_NAME, displayName)
        put(MediaStore.Downloads.MIME_TYPE, ANDROID_EXPORT_MIME_TYPE)
        put(MediaStore.Downloads.RELATIVE_PATH, relativePath)
        put(MediaStore.Downloads.IS_PENDING, if (pending) 1 else 0)
      },
    ))

  private fun mediaEntryExists(uri: Uri): Boolean =
    context.contentResolver.query(uri, arrayOf(MediaStore.Downloads._ID), null, null, null)
      ?.use { it.moveToFirst() } == true
}
