package com.realize.app.overlay

import android.accessibilityservice.AccessibilityService
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo

class RealizeAccessibilityService : AccessibilityService() {

  private var lastPublishedText = ""

  override fun onAccessibilityEvent(event: AccessibilityEvent?) {
    if (!RealizeOverlayService.detectionActive) return
    if (event == null) return

    val sb = StringBuilder()

    val eventText = event.text
      .map { it?.toString()?.trim().orEmpty() }
      .filter { it.isNotBlank() }
      .joinToString(" ")
      .orEmpty()

    if (eventText.isNotBlank()) {
      sb.append(eventText)
    }

    appendNodeText(rootInActiveWindow, sb, 0)

    val normalized = sb.toString()
      .replace("\\s+".toRegex(), " ")
      .trim()

    if (normalized.length < 12) return
    if (normalized == lastPublishedText) return

    lastPublishedText = normalized
    OverlayEventDispatcher.emitDetectedText(
      "screen",
      normalized,
      System.currentTimeMillis().toDouble()
    )
  }

  override fun onInterrupt() {
    // No-op.
  }

  private fun appendNodeText(node: AccessibilityNodeInfo?, sb: StringBuilder, depth: Int) {
    if (node == null || depth > 5) return

    val text = node.text?.toString()?.trim().orEmpty()
    val desc = node.contentDescription?.toString()?.trim().orEmpty()

    if (text.isNotBlank()) {
      sb.append(' ').append(text)
    }
    if (desc.isNotBlank()) {
      sb.append(' ').append(desc)
    }

    val childCount = node.childCount
    for (i in 0 until childCount) {
      appendNodeText(node.getChild(i), sb, depth + 1)
    }
  }
}
