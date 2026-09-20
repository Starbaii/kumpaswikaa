// screens/SignCaptureScreen.js
// Placeholder — camera/gesture capture UI not yet built.
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, fonts } from '../theme';

export default function SignCaptureScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Sign Capture screen — coming next</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.navy,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    fontFamily: fonts.body,
    color: colors.white,
  },
});
