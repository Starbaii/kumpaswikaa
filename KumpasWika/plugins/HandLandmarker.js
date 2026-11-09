const {
  withDangerousMod,
  withMainApplication,
  withAppBuildGradle,
} = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

const DEFAULT_OPTIONS = {
  numHands: 2,
  minDetectionConfidence: 0.4,
  minPresenceConfidence: 0.4,
  minTrackingConfidence: 0.4,
  enablePose: false,
  enableFace: false,
  preferGpu: false,
};

const MODEL_HAND = "hand_landmarker.task";
const MODEL_POSE = "pose_landmarker_lite.task";
const MODEL_FACE = "face_landmarker.task";

function getHandLandmarkerPluginKotlin(packageName, options) {
  const {
    numHands,
    minDetectionConfidence,
    minPresenceConfidence,
    minTrackingConfidence,
    enablePose,
    enableFace,
    preferGpu,
  } = { ...DEFAULT_OPTIONS, ...options };

  const poseImports = enablePose
    ? `import com.google.mediapipe.tasks.vision.poselandmarker.PoseLandmarker\n`
    : "";
  const faceImports = enableFace
    ? `import com.google.mediapipe.tasks.vision.facelandmarker.FaceLandmarker\n`
    : "";

  const poseField = enablePose ? `    private var poseLandmarker: PoseLandmarker? = null\n` : "";
  const faceField = enableFace ? `    private var faceLandmarker: FaceLandmarker? = null\n` : "";

  const poseInit = enablePose
    ? `
            poseLandmarker = createWithDelegateFallback("PoseLandmarker") { delegate, useBuffer ->
                val poseBase = baseOptions("${MODEL_POSE}", delegate, useBuffer)
                val poseOptions = PoseLandmarker.PoseLandmarkerOptions.builder()
                    .setBaseOptions(poseBase)
                    .setRunningMode(RunningMode.VIDEO)
                    .setNumPoses(1)
                    .setMinPoseDetectionConfidence(${minDetectionConfidence}f)
                    .setMinPosePresenceConfidence(${minPresenceConfidence}f)
                    .setMinTrackingConfidence(${minTrackingConfidence}f)
                    .build()
                PoseLandmarker.createFromOptions(context, poseOptions)
            }
`
    : "";

  const faceInit = enableFace
    ? `
            faceLandmarker = createWithDelegateFallback("FaceLandmarker") { delegate, useBuffer ->
                val faceBase = baseOptions("${MODEL_FACE}", delegate, useBuffer)
                val faceOptions = FaceLandmarker.FaceLandmarkerOptions.builder()
                    .setBaseOptions(faceBase)
                    .setRunningMode(RunningMode.VIDEO)
                    .setNumFaces(1)
                    .setMinFaceDetectionConfidence(${minDetectionConfidence}f)
                    .setMinFacePresenceConfidence(${minPresenceConfidence}f)
                    .setMinTrackingConfidence(${minTrackingConfidence}f)
                    .build()
                FaceLandmarker.createFromOptions(context, faceOptions)
            }
`
    : "";

  const poseDetect = enablePose
    ? `
            if (!runPose) {
                lastPosePoints = null
            } else
            poseLandmarker?.let { pl ->
              try {
                if (frameCounter % 2L != 0L) {
                    lastPosePoints?.let { output["pose"] = it }
                } else {
                val poseResult = pl.detectForVideo(mpImage, timestampMs)
                if (poseResult.landmarks().isNotEmpty()) {
                    val posePoints = mutableListOf<Map<String, Double>>()
                    for (lm in poseResult.landmarks()[0]) {
                        val point = hashMapOf(
                            "x" to lm.x().toDouble(),
                            "y" to lm.y().toDouble(),
                            "z" to lm.z().toDouble()
                        )
                        val vis = lm.visibility().orElse(null) ?: lm.presence().orElse(null)
                        if (vis != null) point["visibility"] = vis.toDouble()
                        posePoints.add(point)
                    }
                    output["pose"] = posePoints
                    lastPosePoints = posePoints
                } else {
                    lastPosePoints = null
                }
                }
              } catch (e: Exception) {
                Log.e(TAG, "POSE detect failed (ts=\$timestampMs)", e)
                output["poseError"] = (e.message ?: e.toString())
              }
            }
`
    : "";

  const faceDetect = enableFace
    ? `
            if (!runFace) {
                lastFacePoints = null
            } else
            faceLandmarker?.let { fl ->
              try {
                if (frameCounter % 3L != 0L) {
                    lastFacePoints?.let { output["face"] = it }
                } else {
                val faceResult = fl.detectForVideo(mpImage, timestampMs)
                if (faceResult.faceLandmarks().isNotEmpty()) {
                    val facePoints = mutableListOf<Map<String, Double>>()
                    for (lm in faceResult.faceLandmarks()[0]) {
                        facePoints.add(hashMapOf(
                            "x" to lm.x().toDouble(),
                            "y" to lm.y().toDouble(),
                            "z" to lm.z().toDouble()
                        ))
                    }
                    output["face"] = facePoints
                    lastFacePoints = facePoints
                } else {
                    lastFacePoints = null
                }
                }
              } catch (e: Exception) {
                Log.e(TAG, "FACE detect failed (ts=\$timestampMs)", e)
                output["faceError"] = (e.message ?: e.toString())
              }
            }
`
    : "";

  return `package ${packageName}

import android.graphics.Bitmap
import android.graphics.Matrix
import android.media.Image
import android.util.Log
import com.google.mediapipe.framework.image.BitmapImageBuilder
import com.google.mediapipe.framework.image.MPImage
import com.google.mediapipe.tasks.core.BaseOptions
import com.google.mediapipe.tasks.core.Delegate
import com.google.mediapipe.tasks.vision.core.RunningMode
import com.google.mediapipe.tasks.vision.handlandmarker.HandLandmarker
${poseImports}${faceImports}import com.mrousavy.camera.core.types.Orientation
import com.mrousavy.camera.frameprocessors.Frame
import com.mrousavy.camera.frameprocessors.FrameProcessorPlugin
import com.mrousavy.camera.frameprocessors.VisionCameraProxy

class HandLandmarkerPlugin(
    proxy: VisionCameraProxy,
    options: Map<String, Any>?
) : FrameProcessorPlugin() {

    companion object {
        private const val TAG = "HandLandmarkerPlugin"
    }

    private var handLandmarker: HandLandmarker? = null
${poseField}${faceField}    private var initError: String? = null

    private val delegatesUsed = mutableMapOf<String, String>()

    private var reusableRaw: Bitmap? = null

    private var frameCounter = 0L
    private var lastPosePoints: List<Map<String, Double>>? = null
    private var lastFacePoints: List<Map<String, Double>>? = null

    private val appContext = proxy.context

    private var lastCreateErrors: String = ""
    private var initAttempts = 0
    private var lastInitAttemptMs = 0L

    private val heldBuffers = mutableListOf<java.nio.ByteBuffer>()

    private fun readAssetDirect(assetName: String): java.nio.ByteBuffer {
        appContext.assets.open(assetName).use { input ->
            val bytes = input.readBytes()
            val buf = java.nio.ByteBuffer.allocateDirect(bytes.size)
            buf.put(bytes)
            buf.rewind()
            heldBuffers.add(buf)
            return buf
        }
    }

    private fun baseOptions(assetName: String, delegate: Delegate, useBuffer: Boolean): BaseOptions {
        val builder = BaseOptions.builder().setDelegate(delegate)
        if (useBuffer) builder.setModelAssetBuffer(readAssetDirect(assetName))
        else builder.setModelAssetPath(assetName)
        return builder.build()
    }

    private fun <T> createWithDelegateFallback(name: String, create: (Delegate, Boolean) -> T): T? {
        val order = if (${preferGpu}) listOf(Delegate.GPU, Delegate.CPU) else listOf(Delegate.CPU, Delegate.GPU)
        val errors = mutableListOf<String>()
        for (delegate in order) {
            for (useBuffer in listOf(false, true)) {
                try {
                    val instance = create(delegate, useBuffer)
                    delegatesUsed[name] = delegate.name
                    Log.d(TAG, "=== \$name CREATED (\${delegate.name}, \${if (useBuffer) "buffer" else "path"}) ===")
                    return instance
                } catch (e: Throwable) {
                    val msg = "\${delegate.name}/\${if (useBuffer) "buffer" else "path"}: \${e.javaClass.simpleName}: \${e.message}"
                    errors.add(msg)
                    Log.w(TAG, "\$name failed — \$msg", e)
                }
            }
        }
        delegatesUsed[name] = "FAILED"
        lastCreateErrors = errors.joinToString(" | ")
        Log.e(TAG, "=== \$name FAILED on every delegate === \$lastCreateErrors")
        return null
    }

    private fun modelAssetProblem(assetName: String): String? {
        return try {
            appContext.assets.open(assetName).use { it.read() }
            null
        } catch (e: Throwable) {
            "Model file '\$assetName' is missing from the app (\${e.message}). Rebuild with a clean prebuild."
        }
    }

    private fun initLandmarkers() {
        initAttempts++
        lastInitAttemptMs = System.currentTimeMillis()
        initError = null
        lastCreateErrors = ""
        try {
            Log.d(TAG, "=== INITIALIZING HandLandmarkerPlugin (attempt \$initAttempts) ===")
            val context = appContext

            handLandmarker = createWithDelegateFallback("HandLandmarker") { delegate, useBuffer ->
                val handBase = baseOptions("${MODEL_HAND}", delegate, useBuffer)

                val landmarkerOptions = HandLandmarker.HandLandmarkerOptions.builder()
                    .setBaseOptions(handBase)
                    .setRunningMode(RunningMode.VIDEO)
                    .setNumHands(${numHands})
                    .setMinHandDetectionConfidence(${minDetectionConfidence}f)
                    .setMinHandPresenceConfidence(${minPresenceConfidence}f)
                    .setMinTrackingConfidence(${minTrackingConfidence}f)
                    .build()

                HandLandmarker.createFromOptions(context, landmarkerOptions)
            }
            if (handLandmarker == null) {
                val assetProblem = modelAssetProblem("${MODEL_HAND}")
                initError = "HandLandmarker failed to start. " + (assetProblem ?: lastCreateErrors)
            }
${poseInit}${faceInit}        } catch (t: Throwable) {
            initError = "HandLandmarker init error: " + (t.message ?: t.toString())
            Log.e(TAG, "=== ERROR INITIALIZING landmarkers ===", t)
        }
    }

    init {
        initLandmarkers()
    }

    private fun frameToUprightBitmap(frame: Frame): Bitmap {
        val image: Image = frame.image
        val plane = image.planes[0]
        val buffer = plane.buffer
        buffer.rewind()

        val pixelStride = plane.pixelStride
        val rowPadding = plane.rowStride - pixelStride * image.width
        val paddedWidth = image.width + rowPadding / pixelStride

        var raw = reusableRaw
        if (raw == null || raw.width != paddedWidth || raw.height != image.height) {
            raw?.recycle()
            raw = Bitmap.createBitmap(paddedWidth, image.height, Bitmap.Config.ARGB_8888)
            reusableRaw = raw
        }
        raw.copyPixelsFromBuffer(buffer)

        val degrees = when (frame.orientation) {
            Orientation.PORTRAIT -> 0f
            Orientation.LANDSCAPE_LEFT -> 270f
            Orientation.PORTRAIT_UPSIDE_DOWN -> 180f
            Orientation.LANDSCAPE_RIGHT -> 90f
        }
        if (degrees == 0f && rowPadding == 0) return raw

        val matrix = Matrix().apply { postRotate(degrees) }
        return Bitmap.createBitmap(raw, 0, 0, image.width, image.height, matrix, true)
    }

    override fun callback(frame: Frame, params: Map<String, Any>?): Any? {
        if (handLandmarker == null && initAttempts < 4 &&
            System.currentTimeMillis() - lastInitAttemptMs > 1500L) {
            initLandmarkers()
        }

        if (handLandmarker == null) {
            Log.e(TAG, "HandLandmarker is null! Error: \$initError")
            return hashMapOf<String, Any>(
                "hands" to emptyList<Any>(),
                "error" to (initError ?: "HandLandmarker not initialized")
            )
        }

        frameCounter++

        val runPose = params?.get("pose") as? Boolean ?: true
        val runFace = params?.get("face") as? Boolean ?: true

        var mpImage: MPImage? = null
        try {
            val upright = frameToUprightBitmap(frame)
            mpImage = BitmapImageBuilder(upright).build()

            val timestampMs = frame.timestamp / 1_000_000

            val result = handLandmarker!!.detectForVideo(mpImage, timestampMs)

            val output = hashMapOf<String, Any>()

            output["imageWidth"] = upright.width
            output["imageHeight"] = upright.height

            output["delegates"] = HashMap(delegatesUsed)

            val handsArray = mutableListOf<List<Map<String, Double>>>()
            for (hand in result.landmarks()) {
                val points = mutableListOf<Map<String, Double>>()
                for (landmark in hand) {
                    points.add(hashMapOf(
                        "x" to landmark.x().toDouble(),
                        "y" to landmark.y().toDouble(),
                        "z" to landmark.z().toDouble()
                    ))
                }
                handsArray.add(points)
            }
            output["hands"] = handsArray

            val handednessArray = mutableListOf<List<Map<String, Any>>>()
            for (categories in result.handednesses()) {
                val categoryList = mutableListOf<Map<String, Any>>()
                for (category in categories) {
                    categoryList.add(hashMapOf(
                        "categoryName" to (category.categoryName() ?: "Unknown") as Any,
                        "score" to category.score().toDouble() as Any,
                        "displayName" to (category.displayName() ?: category.categoryName() ?: "Unknown") as Any
                    ))
                }
                handednessArray.add(categoryList)
            }
            output["handedness"] = handednessArray
${poseDetect}${faceDetect}
            return output
        } catch (e: Exception) {
            Log.e(TAG, "ERROR in detection callback", e)
            return hashMapOf<String, Any>(
                "hands" to emptyList<Any>(),
                "error" to (e.message ?: "Unknown error")
            )
        } finally {
            mpImage?.close()
        }
    }
}
`;
}

function resolveOptions(userOptions = {}) {
  const opts = { ...DEFAULT_OPTIONS };

  if (typeof userOptions.numHands === "number" && userOptions.numHands >= 1 && userOptions.numHands <= 4) {
    opts.numHands = Math.floor(userOptions.numHands);
  }

  for (const key of ["minDetectionConfidence", "minPresenceConfidence", "minTrackingConfidence"]) {
    if (typeof userOptions[key] === "number" && userOptions[key] >= 0.0 && userOptions[key] <= 1.0) {
      opts[key] = userOptions[key];
    }
  }

  for (const key of ["enablePose", "enableFace", "preferGpu"]) {
    if (typeof userOptions[key] === "boolean") {
      opts[key] = userOptions[key];
    }
  }

  return opts;
}

function contentHash(content) {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return hash.toString(36);
}

function patchVisionCameraBackpressure(projectRoot) {
  const target = path.join(
    projectRoot, "node_modules", "react-native-vision-camera", "android", "src",
    "main", "java", "com", "mrousavy", "camera", "core",
    "CameraSession+Configuration.kt"
  );
  if (!fs.existsSync(target)) {
    console.warn("[HandLandmarker] ⚠️  CameraSession+Configuration.kt not found — backpressure not adjusted");
    return;
  }
  const source = fs.readFileSync(target, "utf-8");
  const from = "ImageAnalysis.STRATEGY_BLOCK_PRODUCER";
  const to = "ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST";
  if (source.includes(to)) return;
  if (!source.includes(from)) {
    console.warn("[HandLandmarker] ⚠️  STRATEGY_BLOCK_PRODUCER not found — VisionCamera may have changed");
    return;
  }
  fs.writeFileSync(target, source.replace(from, to));
  console.log("[HandLandmarker] ⚡ frame processor backpressure → KEEP_ONLY_LATEST");
}

function writeFileIfChanged(filePath, content) {
  if (fs.existsSync(filePath)) {
    const existing = fs.readFileSync(filePath, "utf-8");
    if (contentHash(existing) === contentHash(content)) {
      return false;
    }
  }
  fs.writeFileSync(filePath, content);
  return true;
}

function withHandLandmarker(config, options = {}) {
  const resolvedOptions = resolveOptions(options);

  console.log(`[HandLandmarker] 🖐️ Configuring with options:`, resolvedOptions);

  config = withAppBuildGradle(config, (mod) => {
    const gradle = mod.modResults.contents;

    if (!gradle.includes("com.google.mediapipe:tasks-vision")) {
      mod.modResults.contents = gradle.replace(
        /dependencies\s*\{/,
        `dependencies {\n    implementation("com.google.mediapipe:tasks-vision:0.10.21")\n`
      );
      console.log("[HandLandmarker] ✅ Added MediaPipe dependency to build.gradle");
    } else {
      console.log("[HandLandmarker] ⏭️  MediaPipe dependency already in build.gradle");
    }
    return mod;
  });

  config = withMainApplication(config, (mod) => {
    let contents = mod.modResults.contents;

    if (!contents.includes("FrameProcessorPluginRegistry")) {
      contents = contents.replace(
        /^(package .+)$/m,
        `$1\n\nimport com.mrousavy.camera.frameprocessors.FrameProcessorPluginRegistry`
      );
    }

    if (!contents.includes("handLandmarker")) {
      contents = contents.replace(
        /class MainApplication\s*:\s*Application\(\)\s*,\s*ReactApplication\s*\{/,
        `class MainApplication : Application(), ReactApplication {\n\n    companion object {\n        init {\n            FrameProcessorPluginRegistry.addFrameProcessorPlugin("handLandmarker") { proxy: com.mrousavy.camera.frameprocessors.VisionCameraProxy, options: Map<String, Any>? ->\n                HandLandmarkerPlugin(proxy, options)\n            }\n        }\n    }\n`
      );
    } else {
      console.log("[HandLandmarker] ⏭️  Plugin already registered in MainApplication.kt");
    }

    mod.modResults.contents = contents;
    return mod;
  });

  config = withDangerousMod(config, [
    "android",
    async (mod) => {
      const projectRoot = mod.modRequest.projectRoot;
      const packageName = config.android?.package || "com.li.vision.handlandmarker";
      const packageDir = packageName.replace(/\./g, "/");

      const javaDir = path.join(
        projectRoot, "android", "app", "src", "main", "java", packageDir
      );
      const assetsDir = path.join(
        projectRoot, "android", "app", "src", "main", "assets"
      );

      fs.mkdirSync(javaDir, { recursive: true });
      fs.mkdirSync(assetsDir, { recursive: true });

      patchVisionCameraBackpressure(projectRoot);

      const kotlinSource = getHandLandmarkerPluginKotlin(packageName, resolvedOptions);
      const kotlinPath = path.join(javaDir, "HandLandmarkerPlugin.kt");
      const wasWritten = writeFileIfChanged(kotlinPath, kotlinSource);

      if (wasWritten) {
        console.log("[HandLandmarker] ✅ Generated HandLandmarkerPlugin.kt");
      } else {
        console.log("[HandLandmarker] ⏭️  HandLandmarkerPlugin.kt unchanged, skipping");
      }

      const requiredModels = [MODEL_HAND];
      if (resolvedOptions.enablePose) requiredModels.push(MODEL_POSE);
      if (resolvedOptions.enableFace) requiredModels.push(MODEL_FACE);

      for (const modelName of requiredModels) {
        const possibleSources = [
          path.join(projectRoot, "assets", modelName),
          path.join(projectRoot, modelName),
          path.join(projectRoot, "node_modules", "expo-vision-camera-v4-mediapipe", modelName),
        ];

        const dest = path.join(assetsDir, modelName);
        const srcFound = possibleSources.find((src) => fs.existsSync(src));
        if (
          fs.existsSync(dest) &&
          (!srcFound || fs.statSync(dest).size === fs.statSync(srcFound).size)
        ) {
          console.log(`[HandLandmarker] ⏭️  "${modelName}" already in assets, skipping`);
          continue;
        }

        let found = false;
        for (const src of possibleSources) {
          if (fs.existsSync(src)) {
            fs.copyFileSync(src, dest);
            console.log(`[HandLandmarker] ✅ Copied "${modelName}" from ${src}`);
            found = true;
            break;
          }
        }
        if (!found) {
          console.warn(
            `[HandLandmarker] ⚠️  Model "${modelName}" not found in:\n` +
            possibleSources.map((s) => `  - ${s}`).join("\n") + "\n" +
            "  Download models at https://ai.google.dev/edge/mediapipe/solutions/vision"
          );
        }
      }

      return mod;
    },
  ]);

  return config;
}

module.exports = withHandLandmarker;
module.exports.getHandLandmarkerPluginKotlin = getHandLandmarkerPluginKotlin;
module.exports.resolveOptions = resolveOptions;
