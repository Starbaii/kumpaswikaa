// screens/SplashScreen.js
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ImageBackground } from 'react-native';
import { colors, fonts, radii } from '../theme';

export default function SplashScreen({ navigation }) {
  return (
    <View style={styles.container}>
      <View style={styles.sunWrap}>
        <Text style={styles.sunEmoji}>☀️</Text>
      </View>

      <Text style={styles.brand}>
        Kumpas<Text style={styles.brandAccent}>Wika</Text>
      </Text>
      <Text style={styles.tagline}>ISANG KUMPAS, ISANG BAYAN</Text>

      <TouchableOpacity
        style={styles.startButton}
        onPress={() => navigation.navigate('LanguageSetup')}
        activeOpacity={0.85}
      >
        <Text style={styles.startButtonText}>Start</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.cream,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  sunWrap: {
    marginBottom: 24,
  },
  sunEmoji: {
    fontSize: 64,
  },
  brand: {
    fontFamily: fonts.heading,
    fontSize: 34,
    color: colors.navy,
    marginBottom: 4,
  },
  brandAccent: {
    color: colors.deepRed,
  },
  tagline: {
    fontFamily: fonts.bodyBold,
    fontSize: 11,
    letterSpacing: 1.5,
    color: colors.textMuted,
    marginBottom: 64,
  },
  startButton: {
    backgroundColor: colors.navy,
    paddingVertical: 16,
    paddingHorizontal: 72,
    borderRadius: radii.pill,
  },
  startButtonText: {
    fontFamily: fonts.bodyBold,
    fontSize: 16,
    color: colors.white,
  },
});
