// App.js
import React, { useCallback } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import * as SplashScreenExpo from 'expo-splash-screen';
import {
  useFonts,
  PlayfairDisplay_700Bold,
} from '@expo-google-fonts/playfair-display';
import {
  Poppins_400Regular,
  Poppins_600SemiBold,
} from '@expo-google-fonts/poppins';

import SplashScreen from './screens/SplashScreen';
import LanguageSetupScreen from './screens/LanguageSetupScreen';
import HomeDashboardScreen from './screens/HomeDashboardScreen';
import IcebreakerScreen from './screens/IcebreakerScreen';
import PhrasebookScreen from './screens/PhrasebookScreen';
import { View, Text } from 'react-native';
import { preloadRecognizer } from './lib/models';

let SignCaptureScreen;
try {
  SignCaptureScreen = require('./screens/SignCaptureScreen').default;
} catch (e) {
  SignCaptureScreen = () => (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <Text style={{ textAlign: 'center' }}>
        Sign capture needs a development build, not Expo Go.
      </Text>
    </View>
  );
}

SplashScreenExpo.preventAutoHideAsync();

preloadRecognizer(1500);

const Stack = createNativeStackNavigator();

export default function App() {
  const [fontsLoaded] = useFonts({
    PlayfairDisplay_700Bold,
    Poppins_400Regular,
    Poppins_600SemiBold,
  });

  const onLayoutRootView = useCallback(async () => {
    if (fontsLoaded) {
      await SplashScreenExpo.hideAsync();
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) {
    return null;
  }

  return (
    <NavigationContainer onReady={onLayoutRootView}>
      <Stack.Navigator
        initialRouteName="Splash"
        screenOptions={{ headerShown: false }}
      >
        <Stack.Screen name="Splash" component={SplashScreen} />
        <Stack.Screen name="LanguageSetup" component={LanguageSetupScreen} />
        <Stack.Screen name="HomeDashboard" component={HomeDashboardScreen} />
        <Stack.Screen name="Icebreaker" component={IcebreakerScreen} />
        <Stack.Screen name="Phrasebook" component={PhrasebookScreen} />
        <Stack.Screen name="SignCapture" component={SignCaptureScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
