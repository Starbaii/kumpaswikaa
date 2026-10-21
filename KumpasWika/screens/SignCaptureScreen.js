import * as Speech from 'expo-speech';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import {
  Camera,
  useCameraDevice,
  useCameraFormat,
  useCameraPermission,
  useFrameProcessor,
  VisionCameraProxy,
} from 'react-native-vision-camera';
import { Worklets } from 'react-native-worklets-core';
import { SEQUENCE_LENGTH } from '../lib/config';
import { labelText } from '../lib/labels';
import { getRecognizer } from '../lib/models';
import { colors, fonts, radii } from '../theme';


const handPlugin = VisionCameraProxy.initFrameProcessorPlugin('handLandmarker', {});

const UI_INTERVAL_MS = 120; // on screen refresh num
const ALLOW_ONLINE_FALLBACK = true; // use online speech recognition when no offline model exists
const START_TIMEOUT_MS = 5000; // give up if the recognizer never reports 'start'

const dbg = (...a) => console.log('[STT]', ...a); // visible in Metro / adb logcat
const normLocale = (l) => String(l).replace('_', '-').toLowerCase();
// The native offline-model calls have no timeout of their own and can hang on some phones.
const withTimeout = (promise, ms, fallback) =>
  Promise.race([
    Promise.resolve(promise).catch(() => fallback),
    new Promise((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);

export default function SignCaptureScreen({ navigation, route }) {
  const [language, setLanguage] = useState(route?.params?.language ?? 'tagalog');
  const [facing, setFacing] = useState('front');
  const [autoSpeak, setAutoSpeak] = useState(true);
  const [transcript, setTranscript] = useState([]); // committed labels
  const [live, setLive] = useState(null); // numbers for the live card
  const [micState, setMicState] = useState('idle'); // 'idle' | 'starting' | 'listening'
  const [replies, setReplies] = useState([]); // committed spoken sentences (speech-to-text)
  const [interim, setInterim] = useState(''); // in-progress speech while listening
  const [micError, setMicError] = useState(null);
  const [micMode, setMicMode] = useState(''); // 'offline' | 'online' (shown while listening)
  const listening = micState === 'listening';
  const starting = micState === 'starting';

  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice(facing);
  const format = useCameraFormat(device, [
    { videoResolution: { width: 640, height: 480 } },
    { fps: 30 },
  ]);

  const loaded = useMemo(() => getRecognizer(), []);
  const languageRef = useRef(language);
  const autoSpeakRef = useRef(autoSpeak);
  const lastUiRef = useRef(0);
  const listeningRef = useRef(false); // true while the USER wants the mic on (Start pressed, Stop not yet)
  const startTokenRef = useRef(0); // invalidates an in-flight Start if the user taps Stop/Cancel
  const modeRef = useRef({ lang: 'fil-PH', onDevice: false, continuous: true });
  const restartsRef = useRef([]); // timestamps, to stop a runaway restart loop
  const restartTimerRef = useRef(null);
  const interimRef = useRef('');
  const ignoreEndsRef = useRef(0); // 'end' events caused by our own abort() calls
  const startWatchdogRef = useRef(null);
  languageRef.current = language;
  autoSpeakRef.current = autoSpeak;

  useEffect(() => {
    if (!hasPermission) requestPermission();
  }, [hasPermission, requestPermission]);

  useEffect(
    () => () => {
      Speech.stop();
      listeningRef.current = false;
      clearTimeout(restartTimerRef.current);
      clearTimeout(startWatchdogRef.current);
      ExpoSpeechRecognitionModule.abort();
    },
    []
  );

  // Switching TL/EN while listening: stop so the next Start uses the new language.
  useEffect(() => {
    if (listeningRef.current) stopListening();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language]);

  // ---- speech-to-text (hearing user replies to the deaf user) -------------
  const startRecognition = (mode) => {
    dbg('start', JSON.stringify(mode));
    clearTimeout(startWatchdogRef.current);
    ExpoSpeechRecognitionModule.start({
      lang: mode.lang,
      interimResults: true,
      continuous: mode.continuous,
      addsPunctuation: true,
      requiresOnDeviceRecognition: mode.onDevice,
    });
    // If the recognizer never reports 'start', don't leave the button hanging.
    startWatchdogRef.current = setTimeout(onStartTimeout, START_TIMEOUT_MS);
  };

  function onStartTimeout() {
    if (!listeningRef.current) return;
    dbg('no start event within', START_TIMEOUT_MS, 'ms', JSON.stringify(modeRef.current));
    ignoreEndsRef.current += 1;
    ExpoSpeechRecognitionModule.abort();
    if (modeRef.current.continuous) {
      // Some phones' recognizers can't use the continuous audio source: retry one phrase at a time.
      modeRef.current = { ...modeRef.current, continuous: false };
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = setTimeout(() => {
        if (listeningRef.current) startRecognition(modeRef.current);
      }, 400);
    } else {
      failMic(
        'Speech recognition did not start. Make sure "Speech Recognition & Synthesis" by Google is installed and enabled, then try again.'
      );
    }
  }

  const failMic = (message) => {
    listeningRef.current = false;
    startTokenRef.current += 1;
    clearTimeout(restartTimerRef.current);
    clearTimeout(startWatchdogRef.current);
    interimRef.current = '';
    setMicState('idle');
    setInterim('');
    setMicError(message);
  };

  const stopListening = () => {
    listeningRef.current = false;
    startTokenRef.current += 1; // cancels a Start that is still waiting on permission/model checks
    clearTimeout(restartTimerRef.current);
    clearTimeout(startWatchdogRef.current);
    // keep whatever was already heard, then end the session right away
    const pending = interimRef.current;
    if (pending) setReplies((r) => [...r.slice(-19), pending]);
    interimRef.current = '';
    setInterim('');
    setMicState('idle'); // update the button immediately
    ignoreEndsRef.current += 1;
    ExpoSpeechRecognitionModule.abort();
  };

  useSpeechRecognitionEvent('start', () => {
    dbg('event: start');
    clearTimeout(startWatchdogRef.current);
    if (!listeningRef.current) {
      ignoreEndsRef.current += 1;
      ExpoSpeechRecognitionModule.abort(); // user already tapped Stop while it was starting
      return;
    }
    setMicState('listening');
  });
  useSpeechRecognitionEvent('end', () => {
    dbg('event: end');
    interimRef.current = '';
    setInterim('');
    if (ignoreEndsRef.current > 0) {
      ignoreEndsRef.current -= 1; // caused by our own abort()
      if (!listeningRef.current) setMicState('idle');
      return;
    }
    if (!listeningRef.current) {
      setMicState('idle');
      return;
    }
    // The session ended by itself (silence timeout, one phrase finished). The user has not
    // pressed Stop, so quietly start a new session and keep listening.
    const now = Date.now();
    restartsRef.current = restartsRef.current.filter((t) => now - t < 5000);
    if (restartsRef.current.length >= 4) {
      failMic('Speech recognition keeps stopping. Tap Start to try again.');
      return;
    }
    restartsRef.current.push(now);
    clearTimeout(restartTimerRef.current);
    restartTimerRef.current = setTimeout(() => {
      if (!listeningRef.current) return;
      try {
        startRecognition(modeRef.current);
      } catch (e) {
        failMic(e?.message || 'Could not restart speech recognition.');
      }
    }, 250);
  });
  useSpeechRecognitionEvent('result', (event) => {
    const text = (event.results?.[0]?.transcript ?? '').trim();
    dbg('event: result', event.isFinal, text);
    if (!text) return;
    if (event.isFinal) {
      interimRef.current = '';
      setReplies((r) => [...r.slice(-19), text]);
      setInterim('');
    } else {
      interimRef.current = text;
      setInterim(text);
    }
  });
  useSpeechRecognitionEvent('error', (event) => {
    dbg('event: error', event.error, event.message);
    // silence / our own abort are not real failures ('end' restarts or settles the button)
    if (event.error === 'no-speech' || event.error === 'speech-timeout' || event.error === 'aborted') return;
    failMic(
      event.error === 'not-allowed'
        ? 'Microphone permission denied.'
        : event.error === 'language-not-supported'
        ? 'Speech recognition is not available for this language on this phone.'
        : event.error === 'network'
        ? 'Online speech recognition needs an internet connection.'
        : event.error === 'service-not-allowed'
        ? 'The phone\'s speech recognition service is disabled or not allowed.'
        : event.message || String(event.error)
    );
  });

  // Is the offline model for this language already on the phone? Never blocks for long:
  // the native check has no timeout and can hang on some phones.
  const offlineModelReady = async (lang) => {
    if (!ExpoSpeechRecognitionModule.supportsOnDeviceRecognition()) return false;
    const info = await withTimeout(ExpoSpeechRecognitionModule.getSupportedLocales({}), 1500, null);
    if (!info) return false;
    const want = normLocale(lang);
    return (info.installedLocales ?? []).some((l) => normLocale(l) === want);
  };

  // One button: tap to start, tap again to stop.
  const toggleListening = async () => {
    if (listeningRef.current) {
      stopListening(); // also cancels while it is still 'starting'
      return;
    }
    listeningRef.current = true;
    const token = ++startTokenRef.current;
    const cancelled = () => !listeningRef.current || token !== startTokenRef.current;
    setMicError(null);
    interimRef.current = '';
    setInterim('');
    setMicState('starting'); // instant feedback on the button

    try {
      // microphone only: offline recognition needs no separate speech permission
      const perm = await ExpoSpeechRecognitionModule.requestMicrophonePermissionsAsync();
      if (cancelled()) return;
      if (!perm.granted) return failMic('Microphone permission denied.');

      const lang = languageRef.current === 'tagalog' ? 'fil-PH' : 'en-US';
      const langName = lang === 'fil-PH' ? 'Tagalog' : 'English';
      const onDevice = await offlineModelReady(lang);
      if (cancelled()) return;

      // Prefer fully offline. If this phone has no offline model for the language
      // (common for Tagalog), fall back to the phone's normal recognizer so the
      // button still works. Set ALLOW_ONLINE_FALLBACK = false to force offline-only.
      if (!onDevice) {
        if (!ALLOW_ONLINE_FALLBACK) {
          // ask Android to fetch the model in the background; never wait on it
          ExpoSpeechRecognitionModule.androidTriggerOfflineModelDownload({ locale: lang }).catch(() => {});
          return failMic(
            `The offline ${langName} speech model is not installed. Requested the download - tap Start again when it finishes.`
          );
        }
        if (!ExpoSpeechRecognitionModule.isRecognitionAvailable()) {
          return failMic(
            'Speech recognition is not available on this phone. Install and enable "Speech Recognition & Synthesis" by Google.'
          );
        }
      }

      Speech.stop(); // don't let the phone's own voice feed back into the mic
      modeRef.current = { lang, onDevice, continuous: true };
      setMicMode(onDevice ? 'offline' : 'online');
      restartsRef.current = [];
      startRecognition(modeRef.current);
      // the 'start' event flips the button to Stop/listening (watchdog covers the case it never comes)
    } catch (e) {
      failMic(e?.message || 'Could not start speech recognition.');
    }
  };

  // The JS thread for every camera frame.
  const handleResult = useCallback(
    (result) => {
      if (!loaded.recognizer) return;
      const out = loaded.recognizer.process(result);

      if (out.committed) {
        const label = out.committed;
        setTranscript((t) => [...t.slice(-19), label]);
        if (autoSpeakRef.current && !listeningRef.current) {
          Speech.stop();
          Speech.speak(labelText(label, languageRef.current), {
            language: languageRef.current === 'tagalog' ? 'fil-PH' : 'en-US',
          });
        }
      }

      const now = Date.now();
      if (now - lastUiRef.current >= UI_INTERVAL_MS) {
        lastUiRef.current = now;
        setLive({
          handCount: out.handCount,
          bufferFill: out.bufferFill,
          candidate: out.candidate,
          rawStatic: out.static,
          rawVideo: out.video,
          error: result && result.error,
        });
      }
    },
    [loaded]
  );

  const onResult = useMemo(() => Worklets.createRunOnJS(handleResult), [handleResult]);

  const frameProcessor = useFrameProcessor(
    (frame) => {
      'worklet';
      if (handPlugin == null) return;
      const result = handPlugin.call(frame, { pose: false, face: false });
      if (result != null) onResult(result);
    },
    [onResult]
  );

  // Reads the signed sentence out loud (this used to be the Speak button).
  const speakAll = () => {
    if (transcript.length === 0) return;
    Speech.stop();
    Speech.speak(transcript.map((l) => labelText(l, language)).join(' '), {
      language: language === 'tagalog' ? 'fil-PH' : 'en-US',
    });
  };

  // camera perms before start
  if (!hasPermission) {
    return (
      <View style={[styles.container, styles.center]}>
        <Text style={styles.bigIcon}>📹</Text>
        <Text style={styles.title}>Camera access needed</Text>
        <Text style={styles.body}>KumpasWika uses your camera to read your signing.</Text>
        <TouchableOpacity style={styles.primaryButton} onPress={requestPermission}>
          <Text style={styles.primaryButtonText}>Allow camera</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => Linking.openSettings()}>
          <Text style={styles.link}>Open settings</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.link}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (loaded.error) {
    return (
      <View style={[styles.container, styles.center]}>
        <Text style={styles.bigIcon}>⚠️</Text>
        <Text style={styles.title}>Models not loaded</Text>
        <Text style={styles.body}>{loaded.error}</Text>
        <TouchableOpacity style={styles.primaryButton} onPress={() => navigation.goBack()}>
          <Text style={styles.primaryButtonText}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (handPlugin == null) {
    return (
      <View style={[styles.container, styles.center]}>
        <Text style={styles.bigIcon}>⚠️</Text>
        <Text style={styles.title}>Hand tracking unavailable</Text>
        <Text style={styles.body}>
          This needs the installed app (APK / development build). It cannot run in Expo Go.
        </Text>
        <TouchableOpacity style={styles.primaryButton} onPress={() => navigation.goBack()}>
          <Text style={styles.primaryButtonText}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!device) {
    return (
      <View style={[styles.container, styles.center]}>
        <Text style={styles.body}>No camera found on this device.</Text>
      </View>
    );
  }

  const cand = live && live.candidate;
  const mainText = cand
    ? labelText(cand.label, language)
    : live && live.handCount > 0
    ? 'Reading…'
    : 'Show your hands';

  return (
    <View style={styles.container}>
      <Camera
        style={StyleSheet.absoluteFill}
        device={device}
        format={format}
        isActive
        pixelFormat="rgb" // required by the MediaPipe plugin
        frameProcessor={frameProcessor}
      />

      {/* top bar */}
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.roundButton} onPress={() => navigation.goBack()}>
          <Text style={styles.roundButtonText}>✕</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.chip}
          onPress={() => setLanguage((l) => (l === 'tagalog' ? 'english' : 'tagalog'))}
        >
          <Text style={styles.chipText}>{language === 'tagalog' ? 'TL' : 'EN'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.chip} onPress={() => setAutoSpeak((a) => !a)}>
          <Text style={styles.chipText}>{autoSpeak ? '🔊 ON' : '🔇 OFF'}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.roundButton}
          onPress={() => {
            loaded.recognizer.reset();
            setFacing((f) => (f === 'front' ? 'back' : 'front'));
          }}
        >
          <Text style={styles.roundButtonText}>🔄</Text>
        </TouchableOpacity>
      </View>

      {/* bottom panel */}
      <View style={styles.panel}>
        <Text style={styles.meta}>
          HANDS {live ? live.handCount : 0}/2 · FRAMES {live ? live.bufferFill : 0}/{SEQUENCE_LENGTH}
          {cand ? ` · ${Math.round(cand.confidence * 100)}% ${cand.source.toUpperCase()}` : ''}
        </Text>
        {live && (live.rawStatic || live.rawVideo) ? (
          <Text style={styles.meta}>
            {live.rawStatic ? `S: ${live.rawStatic.label} ${Math.round(live.rawStatic.confidence * 100)}%` : ''}
            {live.rawVideo ? `   V: ${live.rawVideo.label} ${Math.round(live.rawVideo.confidence * 100)}%` : ''}
          </Text>
        ) : null}
        <Text style={styles.mainText} numberOfLines={1} adjustsFontSizeToFit>
          {mainText}
        </Text>
        {live && live.error ? <Text style={styles.errorText}>{String(live.error)}</Text> : null}

        <Text style={styles.transcript} numberOfLines={2}>
          {transcript.length ? transcript.map((l) => labelText(l, language)).join(' · ') : ' '}
        </Text>

        {/* hearing user's spoken reply (speech-to-text), for the deaf user to read */}
        <Text style={styles.meta}>{listening ? `LISTENING… (${micMode})` : starting ? 'STARTING…' : 'REPLY'}</Text>
        <Text style={styles.reply} numberOfLines={3}>
          {interim
            ? interim
            : replies.length
            ? replies.slice(-3).join(' · ')
            : listening
            ? 'Speak now…'
            : ' '}
        </Text>
        {micError ? <Text style={styles.errorText}>{micError}</Text> : null}

        <View style={styles.row}>
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => {
              setTranscript([]);
              setReplies([]);
              setInterim('');
              setMicError(null);
            }}
          >
            <Text style={styles.secondaryButtonText}>Clear</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryButton} onPress={speakAll}>
            <Text style={styles.secondaryButtonText}>🔊 Replay</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.primaryButtonSmall, (listening || starting) && styles.listeningButton]}
            onPress={toggleListening}
          >
            <Text style={styles.primaryButtonText}>
              {listening ? '⏹ Stop' : starting ? '⏹ Cancel' : '🎤 Start'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.navy },
  center: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  bigIcon: { fontSize: 44, marginBottom: 16 },
  title: { fontFamily: fonts.heading, fontSize: 22, color: colors.white, marginBottom: 8 },
  body: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.white,
    opacity: 0.85,
    textAlign: 'center',
    marginBottom: 28,
  },
  link: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.white,
    textDecorationLine: 'underline',
    marginTop: 12,
  },
  primaryButton: {
    backgroundColor: colors.gold,
    paddingVertical: 14,
    paddingHorizontal: 40,
    borderRadius: radii.pill,
  },
  primaryButtonSmall: {
    backgroundColor: colors.gold,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: radii.pill,
  },
  listeningButton: { backgroundColor: '#FF6B6B' },
  primaryButtonText: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.textDark },
  secondaryButton: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: radii.pill,
  },
  secondaryButtonText: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.white },
  topBar: {
    position: 'absolute',
    top: 52,
    left: 20,
    right: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  roundButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(27,58,107,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  roundButtonText: { fontSize: 16, color: colors.white },
  chip: {
    backgroundColor: 'rgba(27,58,107,0.75)',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: radii.pill,
  },
  chipText: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.white, letterSpacing: 1 },
  panel: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 28,
    backgroundColor: 'rgba(27,58,107,0.88)',
    borderRadius: radii.card,
    padding: 18,
  },
  meta: {
    fontFamily: fonts.bodyBold,
    fontSize: 10,
    letterSpacing: 1,
    color: colors.gold,
    marginBottom: 6,
  },
  mainText: { fontFamily: fonts.heading, fontSize: 34, color: colors.white, marginBottom: 6 },
  errorText: { fontFamily: fonts.body, fontSize: 10, color: '#FFB4B4', marginBottom: 6 },
  transcript: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.white,
    opacity: 0.9,
    minHeight: 36,
    marginBottom: 10,
  },
  reply: {
    fontFamily: fonts.bodyBold,
    fontSize: 18,
    color: colors.white,
    minHeight: 28,
    marginBottom: 10,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
});
