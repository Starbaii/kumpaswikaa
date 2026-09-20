// screens/PhrasebookScreen.js
import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
} from 'react-native';
import { colors, fonts, radii } from '../theme';

// TODO: replace with data pulled from PhrasebookRepository (SQLite) once
// the data layer is wired up. Mirrors the PhrasebookEntry shape from the ERD.
const MOCK_ENTRIES = [
  { entryId: 1, category: 'Travel', tagalogText: 'Saan ang bus stop?', englishText: "Where's the bus stop?" },
  { entryId: 2, category: 'Shopping', tagalogText: 'Tulong po', englishText: 'Help me' },
  { entryId: 3, category: 'Travel', tagalogText: 'Ilang minuto pa', englishText: 'How many more minutes' },
];

const CATEGORIES = ['Travel', 'Food', 'Shopping'];
const CATEGORY_COLORS = {
  Travel: colors.navy,
  Food: colors.gold,
  Shopping: colors.deepRed,
};

export default function PhrasebookScreen({ navigation }) {
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('Travel');

  const filtered = MOCK_ENTRIES.filter((e) => {
    const matchesCategory = e.category === activeCategory;
    const matchesQuery =
      query.length === 0 ||
      e.tagalogText.toLowerCase().includes(query.toLowerCase()) ||
      e.englishText.toLowerCase().includes(query.toLowerCase());
    return matchesCategory && matchesQuery;
  });

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Offline Phrasebook</Text>

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
            <Text style={styles.categoryPillText}>{cat}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => String(item.entryId)}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View style={styles.entryCard}>
            <Text style={styles.entryIcon}>🗣️</Text>
            <View style={styles.entryTextWrap}>
              <Text style={styles.entryTagalog}>{item.tagalogText}</Text>
              <Text style={styles.entryEnglish}>{item.englishText}</Text>
            </View>
            <TouchableOpacity style={styles.sendButton} activeOpacity={0.85}>
              <Text style={styles.sendButtonText}>Send</Text>
            </TouchableOpacity>
          </View>
        )}
        ListEmptyComponent={
          <Text style={styles.emptyText}>No phrases found.</Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.navy,
    paddingHorizontal: 20,
    paddingTop: 56,
  },
  title: {
    fontFamily: fonts.heading,
    fontSize: 20,
    color: colors.white,
    marginBottom: 16,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: radii.pill,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginBottom: 16,
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
    gap: 10,
    marginBottom: 20,
  },
  categoryPill: {
    paddingVertical: 8,
    paddingHorizontal: 16,
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
  list: {
    paddingBottom: 24,
  },
  entryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.cardCream,
    borderRadius: radii.card,
    padding: 14,
    marginBottom: 12,
  },
  entryIcon: {
    fontSize: 18,
    marginRight: 10,
  },
  entryTextWrap: {
    flex: 1,
  },
  entryTagalog: {
    fontFamily: fonts.bodyBold,
    fontSize: 13,
    fontStyle: 'italic',
    color: colors.deepRed,
  },
  entryEnglish: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
  },
  sendButton: {
    backgroundColor: colors.navy,
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: radii.pill,
  },
  sendButtonText: {
    fontFamily: fonts.bodyBold,
    fontSize: 11,
    fontStyle: 'italic',
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
