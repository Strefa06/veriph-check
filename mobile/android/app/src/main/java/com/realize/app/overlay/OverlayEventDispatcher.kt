package com.realize.app.overlay

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.modules.core.DeviceEventManagerModule

object OverlayEventDispatcher {
  private var reactContext: ReactApplicationContext? = null

  fun attach(context: ReactApplicationContext) {
    reactContext = context
  }

  fun emitDetectedText(source: String, text: String, timestamp: Double) {
    val context = reactContext ?: return
    val payload = Arguments.createMap().apply {
      putString("source", source)
      putString("text", text)
      putDouble("timestamp", timestamp)
    }
    context
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit("onTextDetected", payload)
  }
}
