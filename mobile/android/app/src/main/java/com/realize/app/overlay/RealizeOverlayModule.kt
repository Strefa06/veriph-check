package com.realize.app.overlay

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.media.projection.MediaProjectionManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.ContextCompat
import android.content.pm.PackageManager
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class RealizeOverlayModule(
  private val reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext), ActivityEventListener {

  companion object {
    private const val SCREEN_CAPTURE_REQUEST = 7001
  }

  private var capturePermissionPromise: Promise? = null

  init {
    reactContext.addActivityEventListener(this)
    OverlayEventDispatcher.attach(reactContext)
  }

  override fun getName(): String = "RealizeOverlay"

  private fun hasAccessibilityPermission(): Boolean {
    return try {
      val enabled = Settings.Secure.getInt(
        reactContext.contentResolver,
        Settings.Secure.ACCESSIBILITY_ENABLED,
        0
      ) == 1

      if (!enabled) {
        false
      } else {
        val enabledServices = Settings.Secure.getString(
          reactContext.contentResolver,
          Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES
        ) ?: return false

        enabledServices.contains(reactContext.packageName)
      }
    } catch (_: Throwable) {
      false
    }
  }

  @ReactMethod
  fun addListener(eventName: String) {
    // Required for RN event emitter contract.
  }

  @ReactMethod
  fun removeListeners(count: Int) {
    // Required for RN event emitter contract.
  }

  @ReactMethod
  fun requestOverlayPermission(promise: Promise) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(reactContext)) {
      promise.resolve(true)
      return
    }

    val intent = Intent(
      Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
      Uri.parse("package:${reactContext.packageName}")
    ).apply {
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }
    reactContext.startActivity(intent)
    promise.resolve(false)
  }

  @ReactMethod
  fun requestAccessibilityPermission(promise: Promise) {
    val intent = Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS).apply {
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }
    reactContext.startActivity(intent)
    promise.resolve(false)
  }

  @ReactMethod
  fun requestScreenCapturePermission(promise: Promise) {
    val activity = currentActivity
    if (activity == null) {
      promise.reject("NO_ACTIVITY", "Cannot request screen capture without an active Activity")
      return
    }

    val projectionManager =
      reactContext.getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager

    capturePermissionPromise = promise
    activity.startActivityForResult(
      projectionManager.createScreenCaptureIntent(),
      SCREEN_CAPTURE_REQUEST
    )
  }

  @ReactMethod
  fun requestMicrophonePermission(promise: Promise) {
    val granted =
      ContextCompat.checkSelfPermission(
        reactContext,
        android.Manifest.permission.RECORD_AUDIO
      ) == PackageManager.PERMISSION_GRANTED
    promise.resolve(granted)
  }

  @ReactMethod
  fun startOverlayService(promise: Promise) {
    val serviceIntent = Intent(reactContext, RealizeOverlayService::class.java).apply {
      action = RealizeOverlayService.ACTION_SHOW_OVERLAY
    }

    ContextCompat.startForegroundService(reactContext, serviceIntent)
    promise.resolve(null)
  }

  @ReactMethod
  fun stopOverlayService(promise: Promise) {
    val serviceIntent = Intent(reactContext, RealizeOverlayService::class.java).apply {
      action = RealizeOverlayService.ACTION_STOP_ALL
    }

    reactContext.startService(serviceIntent)
    promise.resolve(null)
  }

  @ReactMethod
  fun startRealtimeDetection(promise: Promise) {
    val serviceIntent = Intent(reactContext, RealizeOverlayService::class.java).apply {
      action = RealizeOverlayService.ACTION_START_DETECTION
    }

    reactContext.startService(serviceIntent)
    promise.resolve(null)
  }

  @ReactMethod
  fun stopRealtimeDetection(promise: Promise) {
    val serviceIntent = Intent(reactContext, RealizeOverlayService::class.java).apply {
      action = RealizeOverlayService.ACTION_STOP_DETECTION
    }

    reactContext.startService(serviceIntent)
    promise.resolve(null)
  }

  @ReactMethod
  fun getOverlayStatus(promise: Promise) {
    val status = Arguments.createMap().apply {
      putBoolean("active", RealizeOverlayService.overlayVisible)
      putBoolean("hasAccessibilityPermission", hasAccessibilityPermission())
      putBoolean(
        "hasDrawOverlayPermission",
        Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(reactContext)
      )
      putBoolean(
        "hasMicrophonePermission",
        ContextCompat.checkSelfPermission(
          reactContext,
          android.Manifest.permission.RECORD_AUDIO
        ) == PackageManager.PERMISSION_GRANTED
      )
      putBoolean("hasScreenCapturePermission", RealizeOverlayService.hasScreenCapturePermission())
      putBoolean("detectionActive", RealizeOverlayService.detectionActive)
    }

    promise.resolve(status)
  }

  @ReactMethod
  fun updateOverlayResult(payload: com.facebook.react.bridge.ReadableMap, promise: Promise) {
    val label = payload.getString("label") ?: "Real"
    val mode = payload.getString("mode") ?: "Uncertain"
    val confidence = payload.getDouble("confidence")
    val trustPercent = payload.getDouble("trustPercent")
    val explanation = payload.getString("explanation") ?: ""
    val detectedText = payload.getString("detectedText") ?: ""
    val summarizedText = payload.getString("summarizedText") ?: ""

    val links = mutableListOf<String>()
    val linksArray = payload.getArray("sourceLinks")
    if (linksArray != null) {
      for (i in 0 until linksArray.size()) {
        val value = linksArray.getString(i)
        if (!value.isNullOrBlank()) {
          links.add(value)
        }
      }
    }

    RealizeOverlayService.updateLiveResult(
      label = label,
      mode = mode,
      confidence = confidence,
      trustPercent = trustPercent,
      explanation = explanation,
      detectedText = detectedText,
      summarizedText = summarizedText,
      sourceLinks = links
    )

    promise.resolve(null)
  }

  @ReactMethod
  fun pushFrame(payload: com.facebook.react.bridge.ReadableMap, promise: Promise) {
    val text = payload.getString("visibleText") ?: return promise.resolve(null)
    OverlayEventDispatcher.emitDetectedText("screen", text, System.currentTimeMillis().toDouble())
    promise.resolve(null)
  }

  override fun onActivityResult(
    activity: Activity?,
    requestCode: Int,
    resultCode: Int,
    data: Intent?
  ) {
    if (requestCode != SCREEN_CAPTURE_REQUEST) return

    val promise = capturePermissionPromise
    capturePermissionPromise = null

    if (promise == null) return

    if (resultCode == Activity.RESULT_OK && data != null) {
      RealizeOverlayService.setScreenCapturePermission(resultCode, data)
      promise.resolve(true)
    } else {
      promise.resolve(false)
    }
  }

  override fun onNewIntent(intent: Intent?) {
    // No-op.
  }
}
