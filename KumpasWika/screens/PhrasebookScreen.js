// screens/PhrasebookScreen.js
// Offline Phrasebook (FR-7): everything is bundled with the app, no network needed.
//   Letters tab  -> card grid of the FSL alphabet (picture + letter)
//   Phrases tab  -> text-only phrases; the Speak button reads them aloud (device TTS)
import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  Image,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import * as Speech from 'expo-speech';
import { colors, fonts, radii } from '../theme';
import { LETTERS } from '../data/letters';
import { PHRASES, CATEGORIES } from '../data/phrases';

const COLUMNS = 3;

const CATEGORY_COLORS = {
  Emergency: colors.deepRed,
  Travel: '#2F6FB5',
  Food: colors.gold,
  Shopping: '#2F7D5B',
};


// Pad the letter list so the last row keeps the same card width (26 is not divisible by 3)
const PADDED_LETTERS = (() => {
  const items = [...LETTERS];
  while (items.length % COLUMNS !== 0) {
    items.push({ letter: `spacer-${items.length}`, spacer: true });
  }
  return items;
})();

export default function PhrasebookScreen({ navigation, route }) {
  const language = route?.params?.language ?? 'tagalog';
  const { width: screenWidth } = useWindowDimensions();
  const cardWidth = (screenWidth - 32) / COLUMNS - 10; // 32 = screen padding, 10 = card margins
  const [tab, setTab] = useState('letters'); // 'letters' | 'phrases'
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('Emergency');
  const [speakingId, setSpeakingId] = useState(null);

  // Stop any speech when leaving the screen
  useEffect(() => () => Speech.stop(), []);

  const phrases = useMemo(() => {
    const q = query.trim().toLowerCase();
    return PHRASES.filter(
      (p) =>
        p.category === activeCategory &&
        (q.length === 0 ||
          p.tagalog.toLowerCase().includes(q) ||
          p.english.toLowerCase().includes(q))
    );
  }, [query, activeCategory]);

  const speak = (item) => {
    // Tapping the button again while it is speaking stops it
    if (speakingId === item.id) {
      Speech.stop();
      setSpeakingId(null);
      return;
    }
    Speech.stop();
    const isTagalog = language === 'tagalog';
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

  const renderLetter = ({ item }) => {
  if (item.spacer) return <View style={{ width: cardWidth, margin: 5 }} />;
  return (
    <View style={[styles.letterCard, { width: cardWidth }]}>
      <Image
        source={item.image}
        style={{ width: cardWidth - 20, height: cardWidth - 20 }}
        resizeMode="contain"
      />
      <Text style={styles.letterLabel}>{item.letter}</Text>
    </View>
    );
  };

  const renderPhrase = ({ item }) => {
    const isSpeaking = speakingId === item.id;
    const main = language === 'tagalog' ? item.tagalog : item.english;
    const sub = language === 'tagalog' ? item.english : item.tagalog;
    return (
      <View style={[styles.phraseCard, item.isEmergency && styles.phraseCardEmergency]}>
        <View style={styles.phraseTextWrap}>
          <Text style={styles.phraseMain}>{main}</Text>
          <Text style={styles.phraseSub}>{sub}</Text>
        </View>
        <TouchableOpacity
          style={[styles.speakButton, isSpeaking && styles.speakButtonActive]}
          onPress={() => speak(item)}
          activeOpacity={0.85}
        >
          <Text style={styles.speakButtonText}>{isSpeaking ? '⏹ Stop' : '🔊 Speak'}</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
        <Text style={styles.backText}>← Back</Text>
      </TouchableOpacity>
      <Text style={styles.title}>Offline Phrasebook</Text>

      {/* Tab switch */}
      <View style={styles.tabRow}>
        {[
          { key: 'letters', label: 'Letters' },
          { key: 'phrases', label: 'Phrases' },
        ].map((t) => (
          <TouchableOpacity
            key={t.key}
            style={[styles.tab, tab === t.key && styles.tabActive]}
            onPress={() => setTab(t.key)}
            activeOpacity={0.85}
          >
            <Text style={[styles.tabText, tab === t.key && styles.tabTextActive]}>
              {t.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {tab === 'letters' ? (
        <FlatList
          key="letters" // separate key because numColumns is set
          data={PADDED_LETTERS}
          keyExtractor={(item) => item.letter}
          numColumns={COLUMNS}
          renderItem={renderLetter}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        />
      ) : (
        <>
          <View style={styles.searchBar}>
            <Text style={styles.searchIcon}>🔍</Text>
            <TextInput
              style={styles.searchInput}
              placeholder="Search Phrases"
              placeholderTextColor={colors.textMuted}
              value={query}
              onChangeText={setQuery}
            />
          </View>

          <View style={styles.categoryRow}>
            {CATEGORIES.map((cat) => (
              <TouchableOpacity
                key={cat}
                style={[
                  styles.categoryPill,
                  { backgroundColor: CATEGORY_COLORS[cat] },
                  activeCategory === cat && styles.categoryPillActive,
                ]}
                onPress={() => setActiveCategory(cat)}
                activeOpacity={0.85}
              >
                <Text
                  style={[
                    styles.categoryPillText,
                    cat === 'Food' && { color: colors.textDark },
                  ]}
                >
                  {cat}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <FlatList
            key="phrases"
            data={phrases}
            keyExtractor={(item) => String(item.id)}
            renderItem={renderPhrase}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={<Text style={styles.emptyText}>No phrases found.</Text>}
          />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.navy,
    paddingHorizontal: 16,
    paddingTop: 52,
  },
  backButton: {
    alignSelf: 'flex-start',
    paddingVertical: 4,
    marginBottom: 4,
  },
  backText: {
    fontFamily: fonts.bodyBold,
    fontSize: 13,
    color: colors.gold,
  },
  title: {
    fontFamily: fonts.heading,
    fontSize: 20,
    color: colors.white,
    marginBottom: 14,
  },

  // Tabs
  tabRow: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: radii.pill,
    padding: 4,
    marginBottom: 16,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: radii.pill,
    alignItems: 'center',
  },
  tabActive: {
    backgroundColor: colors.gold,
  },
  tabText: {
    fontFamily: fonts.bodyBold,
    fontSize: 13,
    color: colors.white,
  },
  tabTextActive: {
    color: colors.textDark,
  },

  list: {
    paddingBottom: 24,
  },

  // Letters grid
  letterCard: {
  margin: 5,
  backgroundColor: colors.cardCream,
  borderRadius: radii.card,
  padding: 10,
  alignItems: 'center',
  overflow: 'hidden',
  },
  letterSpacer: {
    flex: 1,
    margin: 5,
  },
  letterImage: {
    width: '100%',
    aspectRatio: 1,
    marginBottom: 6,
  },
  letterLabel: {
    fontFamily: fonts.heading,
    fontSize: 22,
    color: colors.deepRed,
  },

  // Phrases
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: radii.pill,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginBottom: 14,
  },
  searchIcon: {
    fontSize: 14,
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.textDark,
  },
  categoryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  categoryPill: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: radii.pill,
    opacity: 0.75,
  },
  categoryPillActive: {
    opacity: 1,
    borderWidth: 1.5,
    borderColor: colors.white,
  },
  categoryPillText: {
    fontFamily: fonts.heading,
    fontSize: 12,
    fontStyle: 'italic',
    color: colors.white,
  },
  phraseCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.cardCream,
    borderRadius: radii.card,
    padding: 14,
    marginBottom: 12,
  },
  phraseCardEmergency: {
    borderLeftWidth: 5,
    borderLeftColor: colors.deepRed,
  },
  phraseTextWrap: {
    flex: 1,
    paddingRight: 10,
  },
  phraseMain: {
    fontFamily: fonts.bodyBold,
    fontSize: 15,
    color: colors.textDark,
  },
  phraseSub: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 3,
  },
  speakButton: {
    backgroundColor: colors.navy,
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: radii.pill,
  },
  speakButtonActive: {
    backgroundColor: colors.deepRed,
  },
  speakButtonText: {
    fontFamily: fonts.bodyBold,
    fontSize: 12,
    color: colors.white,
  },
  emptyText: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.white,
    opacity: 0.7,
    textAlign: 'center',
    marginTop: 40,
  },
});
