// screens/LanguageSetupScreen.js
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors, fonts, radii } from '../theme';

export default function LanguageSetupScreen({ navigation }) {
  const [selected, setSelected] = useState('tagalog');

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Choose Your Language</Text>
      <Text style={styles.subtitle}>
        Set your primary output — you can switch anytime with the toggle.
      </Text>

      <TouchableOpacity
        style={[
          styles.langButton,
          { backgroundColor: colors.deepRed },
          selected === 'tagalog' && styles.langButtonActive,
        ]}
        onPress={() => setSelected('tagalog')}
        activeOpacity={0.85}
      >
        <Text style={styles.langButtonText}>Tagalog</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[
          styles.langButton,
          { backgroundColor: colors.navy },
          selected === 'english' && styles.langButtonActive,
        ]}
        onPress={() => setSelected('english')}
        activeOpacity={0.85}
      >
        <Text style={styles.langButtonText}>English</Text>
      </TouchableOpacity>

      <View style={styles.permissionsCard}>
        <Text style={styles.permissionsText}>
          Camera and microphone access are needed for sign capture and voice.
        </Text>
      </View>

      <TouchableOpacity
        style={styles.continueButton}
        onPress={() => navigation.navigate('HomeDashboard', { language: selected })}
        activeOpacity={0.85}
      >
        <Text style={styles.continueButtonText}>Continue</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.cream,
    paddingHorizontal: 28,
    paddingTop: 80,
  },
  title: {
    fontFamily: fonts.heading,
    fontSize: 24,
    color: colors.textDark,
    marginBottom: 8,
  },
  subtitle: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.textMuted,
    marginBottom: 32,
    lineHeight: 18,
  },
  langButton: {
    paddingVertical: 16,
    borderRadius: radii.pill,
    alignItems: 'center',
    marginBottom: 16,
    opacity: 0.9,
  },
  langButtonActive: {
    opacity: 1,
    borderWidth: 2,
    borderColor: colors.gold,
  },
  langButtonText: {
    fontFamily: fonts.heading,
    fontSize: 18,
    fontStyle: 'italic',
    color: colors.white,
  },
  permissionsCard: {
    backgroundColor: colors.cardCream,
    borderRadius: radii.card,
    padding: 16,
    marginTop: 'auto',
    marginBottom: 20,
  },
  permissionsText: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.textMuted,
    textAlign: 'center',
  },
  continueButton: {
    backgroundColor: colors.deepRed,
    paddingVertical: 16,
    borderRadius: radii.pill,
    alignItems: 'center',
    marginBottom: 40,
  },
  continueButtonText: {
    fontFamily: fonts.bodyBold,
    fontSize: 16,
    color: colors.white,
  },
});
