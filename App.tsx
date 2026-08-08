import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { initDatabase } from './src/database/db';
import { seedDefaultSettings } from './src/database/settingsRepo';
import AppNavigator from './src/navigation/AppNavigator';
import { InterventionHost } from './src/interventions/InterventionHost';

export default function App() {
  const [dbError, setDbError] = useState<string | null>(null);

  useEffect(() => {
    try {
      initDatabase();
      seedDefaultSettings();
    } catch (e: any) {
      setDbError(e?.message ?? String(e));
    }
  }, []);

  if (dbError) {
    return (
      <View style={styles.errorWrap}>
        <Text style={styles.errorText}>Couldn't start the database: {dbError}</Text>
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <AppNavigator />
      <InterventionHost />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  errorWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  errorText: { color: '#9E5750', fontSize: 15, textAlign: 'center' },
});