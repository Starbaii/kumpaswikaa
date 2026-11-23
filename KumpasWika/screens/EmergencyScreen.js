import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, FlatList, StyleSheet } from 'react-native';
import * as Speech from 'expo-speech';
import { colors, fonts, radii } from '../theme';
import { PHRASES } from '../data/phrases';

const ICONS = { 1: '🆘', 2: '🚑', 3: '🔥', 4: '🩺', 5: '📍' };

export default function EmergencyScreen({ navigation, route }) {
  const [language, setLanguage] = useState(route?.params?.language ?? 'tagalog');
  const [speakingId, setSpeakingId] = useState(null);

  const phrases = useMemo(
    () => PHRASES.filter((p) => p.isEmergency || p.category === 'Emergency'),
    []
  );

  useEffect(() => () => Speech.stop(), []);

  const isTagalog = language === 'tagalog';

  const speak = (item) => {
    if (speakingId === item.id) {
      Speech.stop();
      setSpeakingId(null);
      return;
    }
    Speech.stop();
    setSpeakingId(item.id);
    const clear = () => setSpeakingId((cur) => (cur === item.id ? null : cur));
    Speech.speak(isTagalog ? item.tagalog : item.english, {
      language: isTagalog ? 'fil-PH' : 'en-US',
      rate: 0.9,
      onDone: clear,
      onStopped: clear,
      onError: clear,
    });
  };

  const switchLanguage = () => {
    Speech.stop();
    setSpeakingId(null);
    setLanguage((l) => (l === 'tagalog' ? 'english' : 'tagalog'));
  };

  const renderItem = ({ item }) => {
    const speaking = speakingId === item.id;
    return (
      <TouchableOpacity
        style={[styles.card, speaking && styles.cardSpeaking]}
        onPress={() => speak(item)}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={`${isTagalog ? item.tagalog : item.english}. ${
          speaking ? 'Tap to stop' : 'Tap to speak'
        }`}
      >
        <Text style={styles.icon}>{ICONS[item.id] ?? '🚨'}</Text>
        <View style={styles.textWrap}>
          <Text style={styles.main}>{isTagalog ? item.tagalog : item.english}</Text>
          <Text style={styles.sub}>{isTagalog ? item.english : item.tagalog}</Text>
        </View>
        <View style={[styles.speakPill, speaking && styles.speakPillActive]}>
          <Text style={styles.speakText}>{speaking ? '⏹ Stop' : '🔊 Speak'}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.topRow}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={10}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.langChip} onPress={switchLanguage} activeOpacity={0.85}>
          <Text style={styles.langChipText}>{isTagalog ? 'TL' : 'EN'} ⇄</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.title}>🚨 Emergency</Text>
      <Text style={styles.subtitle}>Tap a phrase and the phone will say it out loud.</Text>

      <FlatList
        data={phrases}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={<Text style={styles.empty}>No emergency phrases found.</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.deepRed,
    paddingHorizontal: 16,
    paddingTop: 52,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  backText: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.white },
  langChip: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: radii.pill,
    paddingVertical: 6,
    paddingHorizontal: 14,
  },
  langChipText: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.white },
  title: { fontFamily: fonts.heading, fontSize: 26, color: colors.white },
  subtitle: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.white,
    opacity: 0.9,
    marginTop: 2,
    marginBottom: 16,
  },
  list: { paddingBottom: 24 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.cardCream,
    borderRadius: radii.card,
    padding: 16,
    marginBottom: 12,
    minHeight: 96,
  },
  cardSpeaking: { backgroundColor: colors.gold },
  icon: { fontSize: 34, marginRight: 12 },
  textWrap: { flex: 1, paddingRight: 8 },
  main: { fontFamily: fonts.bodyBold, fontSize: 20, color: colors.textDark },
  sub: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted, marginTop: 3 },
  speakPill: {
    backgroundColor: colors.navy,
    borderRadius: radii.pill,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  speakPillActive: { backgroundColor: colors.deepRed },
  speakText: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.white },
  empty: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.white,
    textAlign: 'center',
    marginTop: 40,
  },
});
