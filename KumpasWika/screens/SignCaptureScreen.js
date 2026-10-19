import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Linking } from 'react-native';
import {
  Camera,
  useCameraDevice,
  useCameraFormat,
  useCameraPermission,
  useFrameProcessor,
  VisionCameraProxy,
} from 'react-native-vision-camera';
import { Worklets } from 'react-native-worklets-core';
import * as Speech from 'expo-speech';
import { colors, fonts, radii } from '../theme';
import { getRecognizer } from '../lib/models';
import { labelText } from '../lib/labels';
import { SEQUENCE_LENGTH } from '../lib/config';


const handPlugin = VisionCameraProxy.initFrameProcessorPlugin('handLandmarker', {});

const UI_INTERVAL_MS = 120; // on screen refresh num

export default function SignCaptureScreen({ navigation, route }) {
  const [language, setLanguage] = useState(route?.params?.language ?? 'tagalog');
  const [facing, setFacing] = useState('front');
  const [autoSpeak, setAutoSpeak] = useState(true);
  const [transcript, setTranscript] = useState([]); // committed labels
  const [live, setLive] = useState(null); // numbers for the live card

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
  languageRef.current = language;
  autoSpeakRef.current = autoSpeak;

  useEffect(() => {
    if (!hasPermission) requestPermission();
  }, [hasPermission, requestPermission]);

  useEffect(() => () => Speech.stop(), []);

  // The JS thread for every camera frame.
  const handleResult = useCallback(
    (result) => {
      if (!loaded.recognizer) return;
      const out = loaded.recognizer.process(result);

      if (out.committed) {
        const label = out.committed;
        setTranscript((t) => [...t.slice(-19), label]);
        if (autoSpeakRef.current) {
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
        <View style={styles.row}>
          <TouchableOpacity style={styles.secondaryButton} onPress={() => setTranscript([])}>
            <Text style={styles.secondaryButtonText}>Clear</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.primaryButtonSmall} onPress={speakAll}>
            <Text style={styles.primaryButtonText}>Speak</Text>
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
    paddingHorizontal: 36,
    borderRadius: radii.pill,
  },
  primaryButtonText: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.textDark },
  secondaryButton: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingVertical: 12,
    paddingHorizontal: 28,
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
  row: { flexDirection: 'row', justifyContent: 'space-between' },
});
