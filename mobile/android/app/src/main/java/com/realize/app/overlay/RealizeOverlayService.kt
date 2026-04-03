package com.realize.app.overlay

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.ColorMatrix
import android.graphics.ColorMatrixColorFilter
import android.graphics.Paint
import android.graphics.PixelFormat
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.ImageReader
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.os.IBinder
import android.os.Looper
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.util.DisplayMetrics
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView
import androidx.core.app.NotificationCompat
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import com.realize.app.R
import java.lang.ref.WeakReference
import java.util.Locale
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.math.max

class RealizeOverlayService : Service(), RecognitionListener {

  companion object {
    const val ACTION_SHOW_OVERLAY = "com.realize.app.overlay.SHOW"
    const val ACTION_START_DETECTION = "com.realize.app.overlay.START_DETECTION"
    const val ACTION_STOP_DETECTION = "com.realize.app.overlay.STOP_DETECTION"
    const val ACTION_STOP_ALL = "com.realize.app.overlay.STOP_ALL"

    private const val CHANNEL_ID = "realize_overlay_channel"
    private const val NOTIFICATION_ID = 3101

    @Volatile
    var overlayVisible: Boolean = false

    @Volatile
    var detectionActive: Boolean = false

    private var screenCaptureResultCode: Int? = null
    private var screenCaptureIntent: Intent? = null

    private var latestLabel: String = "Real"
    private var latestMode: String = "Uncertain"
    private var latestConfidence: Double = 0.0
    private var latestTrustPercent: Double = 0.0
    private var latestExplanation: String = "Waiting for analysis..."
    private var latestDetectedText: String = ""
    private var latestSummaryText: String = ""
    private var latestSourceLinks: List<String> = emptyList()

    private var serviceRef: WeakReference<RealizeOverlayService>? = null

    fun setScreenCapturePermission(resultCode: Int, data: Intent) {
      screenCaptureResultCode = resultCode
      screenCaptureIntent = data
    }

    fun hasScreenCapturePermission(): Boolean {
      return screenCaptureResultCode != null && screenCaptureIntent != null
    }

    fun updateLiveResult(
      label: String,
      mode: String,
      confidence: Double,
      trustPercent: Double,
      explanation: String,
      detectedText: String,
      summarizedText: String,
      sourceLinks: List<String>
    ) {
      latestLabel = label
      latestMode = mode
      latestConfidence = confidence
      latestTrustPercent = trustPercent
      latestExplanation = explanation
      latestDetectedText = detectedText
      latestSummaryText = summarizedText
      latestSourceLinks = sourceLinks
      serviceRef?.get()?.updateResultViews()
    }
  }

  private lateinit var windowManager: WindowManager
  private lateinit var overlayParams: WindowManager.LayoutParams
  private var overlayRootView: View? = null
  private var overlayContentView: View? = null

  private var statusTextView: TextView? = null
  private var labelTextView: TextView? = null
  private var classificationTextView: TextView? = null
  private var confidenceTextView: TextView? = null
  private var trustTextView: TextView? = null
  private var summaryTextView: TextView? = null
  private var detectedTextView: TextView? = null
  private var toggleDetectedButton: Button? = null
  private var explanationTextView: TextView? = null
  private var linksTextView: TextView? = null
  private var trustProgressBar: ProgressBar? = null
  private var detectionButton: Button? = null

  private var minimized = false
  private var expandedDetectedText = false
  private var speechRecognizer: SpeechRecognizer? = null
  private var lastSpeechText = ""
  private var lastScreenText = ""
  private var repeatedSpeechCount = 0
  private var repeatedScreenCount = 0
  private var lastSpeechDetectedAt = 0L
  private var lastSpeechEmitAt = 0L
  private var lastScreenEmitAt = 0L
  private val mainHandler = Handler(Looper.getMainLooper())

  private val ignoredUiTokens = setOf(
    "reailize",
    "real-time ai and fake news detection",
    "manual mode input",
    "analyze manual input",
    "realtime overlay mode",
    "start live session",
    "stop live session",
    "latest detection",
    "using offline detection",
    "waiting for analysis",
    "likely real",
    "likely misleading",
    "uncertain",
    "chunks",
    "like",
    "share",
    "comment",
    "follow",
    "watch",
    "reels",
    "stories",
    "message",
    "send",
    "home",
    "menu",
    "notifications"
  )

  private var mediaProjection: MediaProjection? = null
  private var imageReader: ImageReader? = null
  private var virtualDisplay: VirtualDisplay? = null
  private var captureThread: HandlerThread? = null
  private var captureHandler: Handler? = null
  private val ocrBusy = AtomicBoolean(false)
  private var lastOcrAt = 0L

  private val speechMonitorRunnable = object : Runnable {
    override fun run() {
      if (!detectionActive) {
        return
      }

      val now = System.currentTimeMillis()
      val silenceDuration = now - lastSpeechDetectedAt

      if (silenceDuration > 12000L) {
        restartSpeechRecognition("No speech detected, resetting listener")
      }

      mainHandler.postDelayed(this, 2500L)
    }
  }

  private val textRecognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    serviceRef = WeakReference(this)
    windowManager = getSystemService(WINDOW_SERVICE) as WindowManager
    startForeground(NOTIFICATION_ID, buildNotification("Overlay is active"))
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACTION_SHOW_OVERLAY -> showOverlay()
      ACTION_START_DETECTION -> startDetection()
      ACTION_STOP_DETECTION -> stopDetection()
      ACTION_STOP_ALL -> {
        stopDetection()
        hideOverlay()
        stopSelf()
      }
    }
    return START_STICKY
  }

  override fun onDestroy() {
    stopDetection()
    hideOverlay()
    serviceRef = null
    textRecognizer.close()
    super.onDestroy()
  }

  private fun showOverlay() {
    if (overlayRootView != null) return

    val root = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      setPadding(18, 18, 18, 18)
      setBackgroundColor(Color.parseColor("#E6F8FAFD"))
    }

    val header = LinearLayout(this).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = Gravity.CENTER_VERTICAL
    }

    val title = TextView(this).apply {
      text = "ReAIlize"
      setTextColor(Color.parseColor("#0D2E5C"))
      textSize = 16f
      setTypeface(typeface, android.graphics.Typeface.BOLD)
      layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
    }

    val minimizeButton = Button(this).apply {
      text = "-"
      setOnClickListener {
        minimized = !minimized
        overlayContentView?.visibility = if (minimized) View.GONE else View.VISIBLE
      }
    }

    val closeButton = Button(this).apply {
      text = "x"
      setOnClickListener {
        stopDetection()
        hideOverlay()
      }
    }

    header.addView(title)
    header.addView(minimizeButton)
    header.addView(closeButton)

    val content = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      setPadding(0, 12, 0, 0)
    }

    statusTextView = TextView(this).apply {
      text = "Idle"
      setTextColor(Color.parseColor("#1A365D"))
      textSize = 12f
    }

    labelTextView = TextView(this).apply {
      text = "Label: Real"
      setTextColor(Color.parseColor("#0B2545"))
      textSize = 14f
      setTypeface(typeface, android.graphics.Typeface.BOLD)
    }

    classificationTextView = TextView(this).apply {
      text = "Classification: Uncertain"
      setTextColor(Color.parseColor("#9A3412"))
      textSize = 12f
      setTypeface(typeface, android.graphics.Typeface.BOLD)
    }

    confidenceTextView = TextView(this).apply {
      text = "Confidence: 0%"
      setTextColor(Color.parseColor("#334E68"))
      textSize = 12f
    }

    trustTextView = TextView(this).apply {
      text = "Trust: 0%"
      setTextColor(Color.parseColor("#334E68"))
      textSize = 12f
    }

    trustProgressBar = ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal).apply {
      max = 100
      progress = 0
      progressTintList = android.content.res.ColorStateList.valueOf(Color.parseColor("#1D72B8"))
    }

    summaryTextView = TextView(this).apply {
      text = "Summary: waiting for analysis"
      setTextColor(Color.parseColor("#2F4858"))
      textSize = 11f
    }

    toggleDetectedButton = Button(this).apply {
      text = "Expand Detected Text"
      setOnClickListener {
        expandedDetectedText = !expandedDetectedText
        text = if (expandedDetectedText) "Collapse Detected Text" else "Expand Detected Text"
        updateResultViews()
      }
    }

    detectedTextView = TextView(this).apply {
      text = "Detected text: waiting for capture"
      setTextColor(Color.parseColor("#1F2937"))
      textSize = 11f
      maxLines = 4
    }

    explanationTextView = TextView(this).apply {
      text = "Waiting for analysis..."
      setTextColor(Color.parseColor("#486581"))
      textSize = 11f
    }

    linksTextView = TextView(this).apply {
      text = "Sources: -"
      setTextColor(Color.parseColor("#1D72B8"))
      textSize = 11f
    }

    detectionButton = Button(this).apply {
      text = "Start Detection"
      setOnClickListener {
        if (detectionActive) {
          stopDetection()
        } else {
          startDetection()
        }
      }
    }

    content.addView(statusTextView)
    content.addView(labelTextView)
    content.addView(classificationTextView)
    content.addView(confidenceTextView)
    content.addView(trustTextView)
    content.addView(trustProgressBar)
    content.addView(summaryTextView)
    content.addView(toggleDetectedButton)
    content.addView(detectedTextView)
    content.addView(explanationTextView)
    content.addView(linksTextView)
    content.addView(detectionButton)

    // Enable dragging by grabbing the header only.
    header.setOnTouchListener(object : View.OnTouchListener {
      private var initialX = 0
      private var initialY = 0
      private var initialTouchX = 0f
      private var initialTouchY = 0f

      override fun onTouch(v: View?, event: MotionEvent): Boolean {
        when (event.action) {
          MotionEvent.ACTION_DOWN -> {
            initialX = overlayParams.x
            initialY = overlayParams.y
            initialTouchX = event.rawX
            initialTouchY = event.rawY
            return true
          }

          MotionEvent.ACTION_MOVE -> {
            overlayParams.x = initialX - (event.rawX - initialTouchX).toInt()
            overlayParams.y = initialY + (event.rawY - initialTouchY).toInt()
            overlayRootView?.let { windowManager.updateViewLayout(it, overlayParams) }
            return true
          }
        }
        return false
      }
    })

    root.addView(header)
    root.addView(content)

    overlayParams = WindowManager.LayoutParams(
      WindowManager.LayoutParams.WRAP_CONTENT,
      WindowManager.LayoutParams.WRAP_CONTENT,
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
      } else {
        WindowManager.LayoutParams.TYPE_PHONE
      },
      WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
      PixelFormat.TRANSLUCENT
    ).apply {
      gravity = Gravity.TOP or Gravity.END
      x = 24
      y = 180
    }

    overlayRootView = root
    overlayContentView = content
    windowManager.addView(root, overlayParams)
    overlayVisible = true
    updateResultViews()
  }

  private fun hideOverlay() {
    overlayRootView?.let { windowManager.removeView(it) }
    overlayRootView = null
    overlayContentView = null
    overlayVisible = false
  }

  private fun startDetection() {
    if (detectionActive) return
    detectionActive = true
    lastSpeechDetectedAt = System.currentTimeMillis()
    lastSpeechEmitAt = 0L
    lastScreenEmitAt = 0L
    repeatedSpeechCount = 0
    repeatedScreenCount = 0
    lastSpeechText = ""
    lastScreenText = ""
    latestDetectedText = ""
    latestSummaryText = "Listening to realtime content"
    expandedDetectedText = false

    statusTextView?.text = "Detecting screen + audio..."
    detectionButton?.text = "Stop Detection"

    startSpeechRecognition()
    mainHandler.removeCallbacks(speechMonitorRunnable)
    mainHandler.postDelayed(speechMonitorRunnable, 2500L)
    startScreenCaptureLoop()
    refreshNotification("Realtime detection is active")
  }

  private fun stopDetection() {
    detectionActive = false
    mainHandler.removeCallbacks(speechMonitorRunnable)

    stopSpeechRecognition()
    stopScreenCaptureLoop()

    statusTextView?.text = "Idle"
    detectionButton?.text = "Start Detection"
    refreshNotification("Overlay is active")
  }

  private fun startSpeechRecognition() {
    if (!SpeechRecognizer.isRecognitionAvailable(this)) return

    if (speechRecognizer == null) {
      val recognizer = SpeechRecognizer.createSpeechRecognizer(this)
      recognizer.setRecognitionListener(this)
      speechRecognizer = recognizer
    }

    val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
      putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
      putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
      putExtra(RecognizerIntent.EXTRA_LANGUAGE, Locale.getDefault())
      putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 3)
      putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 1500)
      putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS, 1100)
      putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_MINIMUM_LENGTH_MILLIS, 1200)
    }

    try {
      speechRecognizer?.startListening(intent)
    } catch (_: Throwable) {
      // Recognizer can throw when restarted too quickly; monitor loop will retry.
    }
  }

  private fun stopSpeechRecognition() {
    try {
      speechRecognizer?.stopListening()
    } catch (_: Throwable) {
      // Ignore shutdown race.
    }
    speechRecognizer?.destroy()
    speechRecognizer = null
  }

  private fun restartSpeechRecognition(statusMessage: String) {
    if (!detectionActive) return

    try {
      speechRecognizer?.cancel()
    } catch (_: Throwable) {
      // Ignore cancellation race.
    }

    statusTextView?.post {
      statusTextView?.text = statusMessage
    }

    mainHandler.postDelayed({ startSpeechRecognition() }, 500)
  }

  private fun startScreenCaptureLoop() {
    if (!hasScreenCapturePermission()) {
      statusTextView?.text = "Screen capture permission required"
      return
    }

    if (mediaProjection != null) return

    val manager = getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
    val resultCode = screenCaptureResultCode ?: return
    val permissionData = screenCaptureIntent ?: return

    mediaProjection = manager.getMediaProjection(resultCode, permissionData)

    val metrics = DisplayMetrics()
    val wm = getSystemService(Context.WINDOW_SERVICE) as WindowManager
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      val bounds = wm.currentWindowMetrics.bounds
      metrics.widthPixels = bounds.width()
      metrics.heightPixels = bounds.height()
      metrics.densityDpi = resources.displayMetrics.densityDpi
    } else {
      @Suppress("DEPRECATION")
      wm.defaultDisplay.getMetrics(metrics)
    }

    val width = metrics.widthPixels.coerceAtLeast(720)
    val height = metrics.heightPixels.coerceAtLeast(1280)

    imageReader = ImageReader.newInstance(width, height, PixelFormat.RGBA_8888, 2)

    captureThread = HandlerThread("ReAIlize-OCR").also { it.start() }
    captureHandler = Handler(captureThread!!.looper)

    imageReader?.setOnImageAvailableListener({ reader ->
      processImageFrame(reader)
    }, captureHandler)

    virtualDisplay = mediaProjection?.createVirtualDisplay(
      "ReAIlizeCapture",
      width,
      height,
      metrics.densityDpi,
      DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
      imageReader?.surface,
      null,
      captureHandler
    )
  }

  private fun stopScreenCaptureLoop() {
    virtualDisplay?.release()
    virtualDisplay = null

    imageReader?.setOnImageAvailableListener(null, null)
    imageReader?.close()
    imageReader = null

    mediaProjection?.stop()
    mediaProjection = null

    captureThread?.quitSafely()
    captureThread = null
    captureHandler = null

    ocrBusy.set(false)
  }

  private fun preprocessBitmapForOcr(source: Bitmap): Bitmap {
    val top = (source.height * 0.12f).toInt().coerceAtLeast(0)
    val bottom = (source.height * 0.88f).toInt().coerceAtMost(source.height)
    val cropHeight = (bottom - top).coerceAtLeast(1)

    val cropped = Bitmap.createBitmap(source, 0, top, source.width, cropHeight)
    val scaled = Bitmap.createScaledBitmap(
      cropped,
      (cropped.width * 1.15f).toInt().coerceAtLeast(1),
      (cropped.height * 1.15f).toInt().coerceAtLeast(1),
      true
    )
    cropped.recycle()

    val enhanced = Bitmap.createBitmap(scaled.width, scaled.height, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(enhanced)
    val paint = Paint(Paint.ANTI_ALIAS_FLAG)

    val grayscale = ColorMatrix().apply { setSaturation(0f) }
    val contrast = 1.28f
    val translate = (-0.5f * contrast + 0.5f) * 255f
    val contrastMatrix = ColorMatrix(
      floatArrayOf(
        contrast,
        0f,
        0f,
        0f,
        translate,
        0f,
        contrast,
        0f,
        0f,
        translate,
        0f,
        0f,
        contrast,
        0f,
        translate,
        0f,
        0f,
        0f,
        1f,
        0f
      )
    )
    grayscale.postConcat(contrastMatrix)
    paint.colorFilter = ColorMatrixColorFilter(grayscale)
    canvas.drawBitmap(scaled, 0f, 0f, paint)
    scaled.recycle()

    return enhanced
  }

  private fun filterOcrText(rawText: String): String {
    val uniqueLines = LinkedHashSet<String>()
    var ignoredCount = 0
    var processedCount = 0

    rawText
      .lines()
      .map { it.trim().replace(Regex("\\s+"), " ") }
      .filter { it.length >= 6 }
      .forEach { line ->
        processedCount += 1
        val lower = line.lowercase(Locale.US)
        if (ignoredUiTokens.any { token -> lower == token || lower.startsWith("$token ") }) {
          ignoredCount += 1
          return@forEach
        }
        uniqueLines.add(line)
      }

    if (processedCount > 0 && ignoredCount >= 2 && ignoredCount >= processedCount * 0.45) {
      return ""
    }

    return uniqueLines.joinToString(" ").take(1100)
  }

  private fun normalizeForComparison(text: String): String {
    return text
      .lowercase(Locale.US)
      .replace(Regex("[^a-z0-9\\s]"), " ")
      .replace(Regex("\\s+"), " ")
      .trim()
  }

  private fun levenshteinDistance(left: String, right: String): Int {
    if (left.isEmpty()) return right.length
    if (right.isEmpty()) return left.length

    val matrix = Array(left.length + 1) { IntArray(right.length + 1) }
    for (i in 0..left.length) matrix[i][0] = i
    for (j in 0..right.length) matrix[0][j] = j

    for (i in 1..left.length) {
      for (j in 1..right.length) {
        val cost = if (left[i - 1] == right[j - 1]) 0 else 1
        matrix[i][j] = minOf(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + cost
        )
      }
    }

    return matrix[left.length][right.length]
  }

  private fun similarity(left: String, right: String): Double {
    if (left.isBlank() || right.isBlank()) return 0.0
    val distance = levenshteinDistance(left, right)
    val maxLength = max(left.length, right.length)
    if (maxLength == 0) return 1.0
    return (1.0 - distance.toDouble() / maxLength).coerceIn(0.0, 1.0)
  }

  private fun processImageFrame(reader: ImageReader) {
    if (!detectionActive) return

    val now = System.currentTimeMillis()
    if (now - lastOcrAt < 850) {
      reader.acquireLatestImage()?.close()
      return
    }

    if (!ocrBusy.compareAndSet(false, true)) {
      reader.acquireLatestImage()?.close()
      return
    }

    val image = reader.acquireLatestImage() ?: run {
      ocrBusy.set(false)
      return
    }

    try {
      val plane = image.planes[0]
      val buffer = plane.buffer
      val pixelStride = plane.pixelStride
      val rowStride = plane.rowStride
      val rowPadding = rowStride - pixelStride * image.width

      val bitmap = Bitmap.createBitmap(
        image.width + rowPadding / pixelStride,
        image.height,
        Bitmap.Config.ARGB_8888
      )
      bitmap.copyPixelsFromBuffer(buffer)

      val cropped = Bitmap.createBitmap(bitmap, 0, 0, image.width, image.height)
      bitmap.recycle()
      val processed = preprocessBitmapForOcr(cropped)
      cropped.recycle()

      val inputImage = InputImage.fromBitmap(processed, 0)

      textRecognizer
        .process(inputImage)
        .addOnSuccessListener { result ->
          val text = filterOcrText(result.text.trim())
          if (text.isNotEmpty()) {
            emitIfChanged("screen", text)
            lastOcrAt = System.currentTimeMillis()
          }
          processed.recycle()
          ocrBusy.set(false)
        }
        .addOnFailureListener {
          processed.recycle()
          ocrBusy.set(false)
        }
    } catch (_: Throwable) {
      ocrBusy.set(false)
    } finally {
      image.close()
    }
  }

  private fun emitIfChanged(source: String, text: String) {
    val normalized = text.trim().replace(Regex("\\s+"), " ")
    if (normalized.length < 8) return

    val comparable = normalizeForComparison(normalized)
    val now = System.currentTimeMillis()
    val previous = if (source == "audio") lastSpeechText else lastScreenText
    val similarityScore = similarity(comparable, previous)

    if (comparable == previous || similarityScore >= 0.94) {
      if (source == "audio") {
        repeatedSpeechCount += 1
        if (repeatedSpeechCount >= 3) {
          repeatedSpeechCount = 0
          lastSpeechText = ""
          restartSpeechRecognition("Detected repeated audio loop, resetting listener")
        }
      } else {
        repeatedScreenCount += 1
        if (repeatedScreenCount >= 3) {
          repeatedScreenCount = 0
          lastScreenText = ""
        }
      }
      return
    }

    if (source == "audio") {
      if (now - lastSpeechEmitAt < 1200 && similarityScore > 0.82) return
      repeatedSpeechCount = 0
      lastSpeechText = comparable
      lastSpeechEmitAt = now
      lastSpeechDetectedAt = now
    } else {
      if (now - lastScreenEmitAt < 700 && similarityScore > 0.88) return
      repeatedScreenCount = 0
      lastScreenText = comparable
      lastScreenEmitAt = now
    }

    OverlayEventDispatcher.emitDetectedText(
      source,
      normalized,
      now.toDouble()
    )

    latestDetectedText = if (latestDetectedText.isBlank()) {
      normalized
    } else {
      "${latestDetectedText} ${normalized}".take(1200)
    }
    if (latestSummaryText.isBlank()) {
      latestSummaryText = "Streaming detected text"
    }
    updateResultViews()

    statusTextView?.post {
      statusTextView?.text = "Detected ${source}: ${normalized.take(48)}"
    }
  }

  private fun updateResultViews() {
    val label = latestLabel
    val mode = latestMode
    val confidencePercent = (latestConfidence * 100.0).toInt().coerceIn(0, 100)
    val trustPercent = latestTrustPercent.toInt().coerceIn(0, 100)
    val summary = latestSummaryText.ifBlank { "Summary unavailable" }
    val detectedText = latestDetectedText.ifBlank { "Detected text will appear here during live capture." }
    val displayedDetectedText = if (expandedDetectedText) {
      detectedText
    } else {
      "${detectedText.take(220)}${if (detectedText.length > 220) "..." else ""}"
    }
    val explanation = latestExplanation.ifBlank { "Waiting for analysis..." }
    val links = if (latestSourceLinks.isEmpty()) "-" else latestSourceLinks.take(3).joinToString(" | ")
    val classificationColor = when (label) {
      "Fake" -> Color.parseColor("#B00020")
      "AI" -> Color.parseColor("#9A3412")
      else -> Color.parseColor("#166534")
    }

    labelTextView?.post {
      labelTextView?.text = "Label: $label"
      classificationTextView?.setTextColor(classificationColor)
      classificationTextView?.text = "Classification: $mode"
      confidenceTextView?.text = "Confidence: $confidencePercent%"
      trustTextView?.text = "Trust: $trustPercent%"
      trustProgressBar?.progress = trustPercent
      summaryTextView?.text = "Summary: $summary"
      toggleDetectedButton?.text = if (expandedDetectedText) "Collapse Detected Text" else "Expand Detected Text"
      detectedTextView?.maxLines = if (expandedDetectedText) 20 else 4
      detectedTextView?.text = "Detected text: $displayedDetectedText"
      explanationTextView?.text = explanation
      linksTextView?.text = "Sources: $links"
    }
  }

  private fun buildNotification(content: String): Notification {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val channel = NotificationChannel(
        CHANNEL_ID,
        "ReAIlize Overlay",
        NotificationManager.IMPORTANCE_LOW
      )
      val manager = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
      manager.createNotificationChannel(channel)
    }

    return NotificationCompat.Builder(this, CHANNEL_ID)
      .setSmallIcon(R.mipmap.ic_launcher)
      .setContentTitle("ReAIlize")
      .setContentText(content)
      .setOngoing(true)
      .build()
  }

  private fun refreshNotification(content: String) {
    val manager = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
    manager.notify(NOTIFICATION_ID, buildNotification(content))
  }

  override fun onReadyForSpeech(params: android.os.Bundle?) {}

  override fun onBeginningOfSpeech() {
    lastSpeechDetectedAt = System.currentTimeMillis()
  }

  override fun onRmsChanged(rmsdB: Float) {
    if (rmsdB > -2f) {
      lastSpeechDetectedAt = System.currentTimeMillis()
    }
  }

  override fun onBufferReceived(buffer: ByteArray?) {}

  override fun onEndOfSpeech() {}

  override fun onError(error: Int) {
    if (detectionActive) {
      mainHandler.postDelayed({ startSpeechRecognition() }, 500)
    }
  }

  override fun onResults(results: android.os.Bundle?) {
    val items = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION) ?: return
    val text = items.firstOrNull()?.trim().orEmpty()
    if (text.isNotEmpty()) {
      emitIfChanged("audio", text)
    }

    if (detectionActive) {
      mainHandler.postDelayed({ startSpeechRecognition() }, 250)
    }
  }

  override fun onPartialResults(partialResults: android.os.Bundle?) {
    val items = partialResults?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION) ?: return
    val text = items.firstOrNull()?.trim().orEmpty()
    if (text.isNotEmpty()) {
      emitIfChanged("audio", text)
    }
  }

  override fun onEvent(eventType: Int, params: android.os.Bundle?) {}
}
