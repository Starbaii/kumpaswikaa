// screens/HomeDashboardScreen.js
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors, fonts, radii } from '../theme';

export default function HomeDashboardScreen({ navigation, route }) {
  const language = route?.params?.language ?? 'tagalog';

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.brand}>
          Kumpas<Text style={styles.brandAccent}>Wika</Text>
        </Text>
        <TouchableOpacity>
          <Text style={styles.settingsIcon}>⚙️</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.statusText}>
        {language === 'tagalog' ? 'TL' : 'EN'} ACTIVE · READY TO SIGN
      </Text>

      <View style={styles.mainCard}>
        <Text style={styles.mainCardTitle}>Start a conversation</Text>
        <Text style={styles.mainCardSubtitle}>Open the camera and begin signing</Text>
        <TouchableOpacity
          style={styles.startVideoButton}
          onPress={() => navigation.navigate('SignCapture')}
          activeOpacity={0.85}
        >
          <Text style={styles.startVideoIcon}>📹</Text>
          <Text style={styles.startVideoText}>Start Video</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.tileRow}>
        <TouchableOpacity
          style={styles.tile}
          onPress={() => navigation.navigate('Icebreaker')}
          activeOpacity={0.85}
        >
          <Text style={styles.tileIcon}>🏝️</Text>
          <Text style={styles.tileTitle}>Icebreaker</Text>
          <Text style={styles.tileSubtitle}>Set context first</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.tile}
          onPress={() => navigation.navigate('Phrasebook')}
          activeOpacity={0.85}
        >
          <Text style={styles.tileIcon}>📖</Text>
          <Text style={styles.tileTitle}>Phrasebook</Text>
          <Text style={styles.tileSubtitle}>Offline phrases</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.cream,
    paddingHorizontal: 24,
    paddingTop: 56,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  brand: {
    fontFamily: fonts.heading,
    fontSize: 22,
    color: colors.navy,
  },
  brandAccent: {
    color: colors.deepRed,
  },
  settingsIcon: {
    fontSize: 20,
  },
  statusText: {
    fontFamily: fonts.bodyBold,
    fontSize: 11,
    letterSpacing: 1,
    color: colors.textMuted,
    marginTop: 4,
    marginBottom: 24,
  },
  mainCard: {
    backgroundColor: colors.navy,
    borderRadius: radii.card,
    padding: 24,
    marginBottom: 20,
  },
  mainCardTitle: {
    fontFamily: fonts.heading,
    fontSize: 20,
    color: colors.white,
    marginBottom: 4,
  },
  mainCardSubtitle: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.white,
    opacity: 0.8,
    marginBottom: 18,
  },
  startVideoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.gold,
    borderRadius: radii.pill,
    paddingVertical: 14,
    gap: 8,
  },
  startVideoIcon: {
    fontSize: 16,
  },
  startVideoText: {
    fontFamily: fonts.bodyBold,
    fontSize: 14,
    color: colors.textDark,
  },
  tileRow: {
    flexDirection: 'row',
    gap: 14,
  },
  tile: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: radii.card,
    padding: 18,
    alignItems: 'center',
  },
  tileIcon: {
    fontSize: 28,
    marginBottom: 8,
  },
  tileTitle: {
    fontFamily: fonts.heading,
    fontSize: 15,
    fontStyle: 'italic',
    color: colors.textDark,
  },
  tileSubtitle: {
    fontFamily: fonts.body,
    fontSize: 10,
    color: colors.textMuted,
    marginTop: 2,
    textAlign: 'center',
  },
});
