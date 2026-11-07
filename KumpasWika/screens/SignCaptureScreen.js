import * as Speech from 'expo-speech';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  Camera,
  useCameraDevice,
  useCameraFormat,
  useCameraPermission,
  useFrameProcessor,
  VisionCameraProxy,
} from 'react-native-vision-camera';
import { Worklets } from 'react-native-worklets-core';
import { FRAME_STRIDE, SEQUENCE_LENGTH, UI_INTERVAL_MS } from '../lib/config';
import { labelText } from '../lib/labels';
import { getRecognizer, isRecognizerReady } from '../lib/models';
import { colors, fonts, radii } from '../theme';


const handPlugin = VisionCameraProxy.initFrameProcessorPlugin('handLandmarker', {});
const STRIDE = Math.max(1, FRAME_STRIDE | 0); 


const OFFLINE_ONLY = ['fil-PH'];
const LOCALE_ALIASES = { 'fil-ph': ['fil-ph', 'tl-ph'] };
const START_TIMEOUT_MS = 5000; 

const dbg = (...a) => console.log('[STT]', ...a); 
const normLocale = (l) => String(l).replace('_', '-').toLowerCase();

const withTimeout = (promise, ms, fallback) =>
  Promise.race([
    Promise.resolve(promise).catch(() => fallback),
    new Promise((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);

export default function SignCaptureScreen({ navigation, route }) {
  const [language, setLanguage] = useState(route?.params?.language ?? 'tagalog');
  const [facing, setFacing] = useState('front');
  const [autoSpeak, setAutoSpeak] = useState(true);
  const [transcript, setTranscript] = useState([]); 
  const [live, setLive] = useState(null); 
  const [micState, setMicState] = useState('idle'); 
  const [replies, setReplies] = useState([]); 
  const [interim, setInterim] = useState(''); 
  const [micError, setMicError] = useState(null);
  const [micMode, setMicMode] = useState(''); 
  const [micOpen, setMicOpen] = useState(false); 
  const replyScrollRef = useRef(null);
  const listening = micState === 'listening';
  const starting = micState === 'starting';

  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice(facing);
  const format = useCameraFormat(device, [
    { videoResolution: { width: 640, height: 480 } },
    { fps: 30 },
  ]);

  const [loaded, setLoaded] = useState(() => (isRecognizerReady() ? getRecognizer() : null));
  useEffect(() => {
    if (loaded) return undefined;
    const id = setTimeout(() => setLoaded(getRecognizer()), 50);
    return () => clearTimeout(id);
  }, [loaded]);
  const recognizerRef = useRef(null);
  recognizerRef.current = loaded && loaded.recognizer ? loaded.recognizer : null;
  const languageRef = useRef(language);
  const autoSpeakRef = useRef(autoSpeak);
  const lastUiRef = useRef(0);
  const listeningRef = useRef(false);
  const startTokenRef = useRef(0); 
  const modeRef = useRef({ lang: 'fil-PH', onDevice: false, continuous: true });
  const restartsRef = useRef([]); 
  const restartTimerRef = useRef(null);
  const interimRef = useRef('');
  const ignoreEndsRef = useRef(0); 
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

  useEffect(() => {
    if (listeningRef.current) stopListening();
  }, [language]);

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
    startWatchdogRef.current = setTimeout(onStartTimeout, START_TIMEOUT_MS);
  };

  function onStartTimeout() {
    if (!listeningRef.current) return;
    dbg('no start event within', START_TIMEOUT_MS, 'ms', JSON.stringify(modeRef.current));
    ignoreEndsRef.current += 1;
    ExpoSpeechRecognitionModule.abort();
    if (modeRef.current.continuous) {
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
    startTokenRef.current += 1; 
    clearTimeout(restartTimerRef.current);
    clearTimeout(startWatchdogRef.current);
  
    const pending = interimRef.current;
    if (pending) setReplies((r) => [...r.slice(-19), pending]);
    interimRef.current = '';
    setInterim('');
    setMicState('idle'); 
    ignoreEndsRef.current += 1;
    ExpoSpeechRecognitionModule.abort();
  };

  useSpeechRecognitionEvent('start', () => {
    dbg('event: start');
    clearTimeout(startWatchdogRef.current);
    if (!listeningRef.current) {
      ignoreEndsRef.current += 1;
      ExpoSpeechRecognitionModule.abort(); 
      return;
    }
    setMicState('listening');
  });
  useSpeechRecognitionEvent('end', () => {
    dbg('event: end');
    interimRef.current = '';
    setInterim('');
    if (ignoreEndsRef.current > 0) {
      ignoreEndsRef.current -= 1;
      if (!listeningRef.current) setMicState('idle');
      return;
    }
    if (!listeningRef.current) {
      setMicState('idle');
      return;
    }

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
    if (event.error === 'no-speech' || event.error === 'speech-timeout' || event.error === 'aborted') return;
    failMic(
      event.error === 'not-allowed'
        ? 'Microphone permission denied.'
        : event.error === 'language-not-supported'
        ? 'Speech recognition is not available for this language on this phone. For Tagalog, install the offline Filipino speech model.'
        : event.error === 'network'
        ? 'Online speech recognition needs an internet connection.'
        : event.error === 'service-not-allowed'
        ? 'The phone\'s speech recognition service is disabled or not allowed.'
        : event.message || String(event.error)
    );
  });

  const offlineModelReady = async (lang) => {
    if (!ExpoSpeechRecognitionModule.supportsOnDeviceRecognition()) return null;
    const info = await withTimeout(ExpoSpeechRecognitionModule.getSupportedLocales({}), 1500, null);
    if (!info) return null;
    const want = LOCALE_ALIASES[normLocale(lang)] ?? [normLocale(lang)];
    return (info.installedLocales ?? []).find((l) => want.includes(normLocale(l))) ?? null;
  };

  const toggleListening = async () => {
    if (listeningRef.current) {
      stopListening(); 
      return;
    }
    listeningRef.current = true;
    const token = ++startTokenRef.current;
    const cancelled = () => !listeningRef.current || token !== startTokenRef.current;
    setMicError(null);
    interimRef.current = '';
    setInterim('');
    setMicState('starting'); 

    try {
      const perm = await ExpoSpeechRecognitionModule.requestMicrophonePermissionsAsync();
      if (cancelled()) return;
      if (!perm.granted) return failMic('Microphone permission denied.');

      const lang = languageRef.current === 'tagalog' ? 'fil-PH' : 'en-US';
      const langName = lang === 'fil-PH' ? 'Tagalog' : 'English';
      const installedLocale = await offlineModelReady(lang);
      const onDevice = !!installedLocale;
      if (cancelled()) return;

      if (!onDevice) {
        if (OFFLINE_ONLY.includes(lang)) {
          const dl = await withTimeout(
            ExpoSpeechRecognitionModule.androidTriggerOfflineModelDownload({ locale: lang }),
            4000,
            null
          );
          if (cancelled()) return;
          dbg('offline model download', JSON.stringify(dl));
          const howTo =
            'Open the Google app > Settings > Voice > Offline speech recognition and download Filipino, then tap Speak again.';
          return failMic(
            !dl
              ? `The offline ${langName} speech model is not installed. ${howTo}`
              : dl.status === 'download_success'
              ? `The offline ${langName} model finished downloading. Tap Speak again - it now works without internet.`
              : dl.status === 'download_scheduled'
              ? `The offline ${langName} model is downloading (it may wait for Wi-Fi). Tap Speak again when it finishes.`
              : `Tap Download in the dialog to install the offline ${langName} model (needs internet once), then tap Speak again.`
          );
        }
        if (!ExpoSpeechRecognitionModule.isRecognitionAvailable()) {
          return failMic(
            'Speech recognition is not available on this phone. Install and enable "Speech Recognition & Synthesis" by Google.'
          );
        }
      }

      Speech.stop();
      modeRef.current = { lang: installedLocale || lang, onDevice, continuous: true };
      setMicMode(onDevice ? 'offline' : 'online');
      restartsRef.current = [];
      startRecognition(modeRef.current);
    } catch (e) {
      failMic(e?.message || 'Could not start speech recognition.');
    }
  };

  const openSpeak = () => {
    setMicOpen(true);
    if (!listeningRef.current) toggleListening();
  };
  const closeSpeak = () => {
    if (listeningRef.current) stopListening();
    setMicOpen(false);
    setMicError(null);
  };

 
  const busy = useMemo(() => Worklets.createSharedValue(false), []);
  const frameCounter = useMemo(() => Worklets.createSharedValue(0), []);
  const lastShownRef = useRef('');
  const handleResult = useCallback((result) => {
    try {
      const recognizer = recognizerRef.current;
      if (!recognizer) return;
      const now = Date.now();
      const out = recognizer.process(result, now);

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

   
      if (now - lastUiRef.current >= UI_INTERVAL_MS) {
        const c = out.candidate;
        const key = [
          out.handCount,
          out.bufferFill,
          c ? c.label + Math.round(c.confidence * 100) + c.source : '',
          out.static ? out.static.label + Math.round(out.static.confidence * 100) : '',
          out.video ? out.video.label + Math.round(out.video.confidence * 100) : '',
          result && result.error ? String(result.error) : '',
        ].join('|');
        if (key !== lastShownRef.current) {
          lastShownRef.current = key;
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
      }
    } finally {
      busy.value = false; 
    }
  }, []);

  const onResult = useMemo(() => Worklets.createRunOnJS(handleResult), [handleResult]);

  const frameProcessor = useFrameProcessor(
    (frame) => {
      'worklet';
      if (handPlugin == null) return;
      if (busy.value) return;
      frameCounter.value = frameCounter.value + 1;
      if (frameCounter.value % STRIDE !== 0) return;
      const result = handPlugin.call(frame, { pose: false, face: false });
      if (result != null) {
        busy.value = true;
        onResult(result);
      }
    },
    [onResult, busy, frameCounter]
  );


  const speakAll = () => {
    if (transcript.length === 0) return;
    Speech.stop();
    Speech.speak(transcript.map((l) => labelText(l, language)).join(' '), {
      language: language === 'tagalog' ? 'fil-PH' : 'en-US',
    });
  };

  // camera permission before start
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

  if (!loaded) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator color={colors.gold} size="large" />
        <Text style={[styles.body, { marginTop: 16, marginBottom: 0 }]}>Loading sign models…</Text>
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
        fps={format ? Math.min(30, format.maxFps) : 30}
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
            if (recognizerRef.current) recognizerRef.current.reset();
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
            onPress={openSpeak}
          >
            <Text style={styles.primaryButtonText}>🎤 Speak</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* speech-to-text pop-up: what the hearing person says shows up here */}
      <Modal visible={micOpen} transparent animationType="fade" onRequestClose={closeSpeak}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.meta}>
              {listening ? `LISTENING… (${micMode})` : starting ? 'STARTING…' : 'SPEECH TO TEXT'}
            </Text>
            <ScrollView
              ref={replyScrollRef}
              style={styles.modalScroll}
              onContentSizeChange={() => replyScrollRef.current?.scrollToEnd({ animated: true })}
            >
              {replies.map((r, i) => (
                <Text key={i} style={styles.replyLine}>
                  {r}
                </Text>
              ))}
              {interim ? <Text style={[styles.replyLine, styles.interimLine]}>{interim}</Text> : null}
              {!replies.length && !interim ? (
                <Text style={[styles.replyLine, styles.interimLine]}>
                  {listening ? 'Speak now…' : starting ? ' ' : 'Tap Speak to start listening.'}
                </Text>
              ) : null}
            </ScrollView>
            {micError ? <Text style={styles.errorText}>{micError}</Text> : null}
            <View style={styles.row}>
              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={() => {
                  setReplies([]);
                  setInterim('');
                  setMicError(null);
                }}
              >
                <Text style={styles.secondaryButtonText}>Clear</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.primaryButtonSmall, (listening || starting) && styles.listeningButton]}
                onPress={toggleListening}
              >
                <Text style={styles.primaryButtonText}>
                  {listening ? '⏹ Stop' : starting ? '⏹ Cancel' : '🎤 Speak'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.secondaryButton} onPress={closeSpeak}>
                <Text style={styles.secondaryButtonText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  modalCard: {
    backgroundColor: colors.navy,
    borderRadius: radii.card,
    padding: 20,
  },
  modalScroll: { maxHeight: 280, minHeight: 120, marginBottom: 14 },
  replyLine: { fontFamily: fonts.bodyBold, fontSize: 20, color: colors.white, marginBottom: 8 },
  interimLine: { opacity: 0.65 },
});
