// screens/IcebreakerScreen.js
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors, fonts, radii } from '../theme';

export default function IcebreakerScreen({ navigation }) {
  return (
    <View style={styles.container}>
      <View style={styles.sunWrap}>
        <Text style={styles.sunEmoji}>☀️</Text>
      </View>

      <Text style={styles.message}>
        I communicate using{'\n'}Filipino Sign Language.
      </Text>
      <Text style={styles.subMessage}>
        Please speak your reply, I will read it{'\n'}on my screen.
      </Text>

      <TouchableOpacity
        style={styles.beginButton}
        onPress={() => navigation.navigate('SignCapture')}
        activeOpacity={0.85}
      >
        <Text style={styles.beginButtonText}>Begin signing</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.deepRed,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  sunWrap: {
    marginBottom: 32,
  },
  sunEmoji: {
    fontSize: 48,
  },
  message: {
    fontFamily: fonts.heading,
    fontSize: 22,
    color: colors.white,
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 30,
  },
  subMessage: {
    fontFamily: fonts.body,
    fontSize: 11,
    letterSpacing: 0.5,
    color: colors.white,
    opacity: 0.85,
    textAlign: 'center',
    marginBottom: 56,
    lineHeight: 18,
  },
  beginButton: {
    backgroundColor: colors.navy,
    paddingVertical: 16,
    paddingHorizontal: 48,
    borderRadius: radii.pill,
  },
  beginButtonText: {
    fontFamily: fonts.bodyBold,
    fontSize: 15,
    color: colors.white,
  },
});
