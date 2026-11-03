import React from 'react';
import { ActivityIndicator, View, useColorScheme } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts, BricolageGrotesque_400Regular, BricolageGrotesque_600SemiBold, BricolageGrotesque_800ExtraBold } from '@expo-google-fonts/bricolage-grotesque';
import { AuthProvider } from '../src/state/auth';
import { DialogProvider } from '../src/ui/dialogs';
import { OverlayProvider } from '../src/ui/overlay';
import { dark, light } from '../src/ui/theme';

export default function RootLayout() {
  const scheme = useColorScheme();
  const p = scheme === 'dark' ? dark : light;
  const [fontsLoaded] = useFonts({ BricolageGrotesque_400Regular, BricolageGrotesque_600SemiBold, BricolageGrotesque_800ExtraBold });
  if (!fontsLoaded) return <View style={{ flex: 1, backgroundColor: p.bg, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={p.acc} /></View>;
  return (
    <SafeAreaProvider>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <AuthProvider>
        <OverlayProvider>
          <DialogProvider>
            <View style={{ flex: 1, backgroundColor: p.bg }}>
              <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: p.bg } }} />
            </View>
          </DialogProvider>
        </OverlayProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
