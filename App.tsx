import React, {useEffect, useState} from 'react';
import {View, Text, StyleSheet, Button, ScrollView} from 'react-native';

import {UsageStatsService} from './src/services/UsageStats';
import {sessionize} from './src/detection/sessionize';
import {AppSession} from './src/services/usageTypes';
import {initDatabase} from './src/database/db';
import {saveSessions, getSessionCount} from './src/database/sessionsRepo';
import {seedDefaultSettings, getSetting} from './src/database/settingsRepo';

export default function App() {
  const [status, setStatus] = useState('Starting…');
  const [sessions, setSessions] = useState<AppSession[]>([]);
  const [dbCount, setDbCount] = useState<number>(0);
  const [goal, setGoal] = useState<string | null>(null);

useEffect(() => {
    try {
      initDatabase();
      seedDefaultSettings();
      setGoal(getSetting('daily_goal_minutes'));
    } catch (e: any) {
      setStatus('DB init failed: ' + (e?.message ?? String(e)));
      return;
    }
    runTest();
  }, []);

  async function runTest() {
      const granted = await UsageStatsService.hasUsageAccess();
      if (!granted) {
        setStatus('Permission not granted — tap "Grant access", then Re-run.');
        return;
      }
      const end = Date.now();
      const begin = end - 24 * 60 * 60 * 1000;
      const events = await UsageStatsService.queryEvents(begin, end);
      const built = sessionize(events, end);
      setSessions(built);
       try {
             const {getDb} = require('./src/database/db');
             const probe = getDb().execute('SELECT 1 AS ok');
             setStatus('probe: ' + JSON.stringify(probe));
             return;
           } catch (e: any) {
             setStatus('probe failed: ' + (e?.message ?? String(e)));
             return;
           }
      let inserted = 0;
      let total = 0;
      try {
        inserted = saveSessions(built);
        total = getSessionCount();
      } catch (e: any) {
        setStatus('DB write failed: ' + (e?.message ?? String(e)));
        return;
      }
      setDbCount(total);
      setStatus(
        `events: ${events.length} · sessions: ${built.length} · saved now: ${inserted} · in DB: ${total}`,
      );
    }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Azm — DB test</Text>
      <Text style={styles.status}>{status}</Text>
      <Text style={styles.meta}>daily goal setting: {goal ?? '—'} min</Text>

      <View style={styles.row}>
        <Button title="Grant access" onPress={() => UsageStatsService.openUsageAccessSettings()} />
        <View style={{width: 12}} />
        <Button title="Re-run" onPress={runTest} />
      </View>

      {sessions.slice(0, 8).map((s, i) => (
        <Text key={i} style={styles.session}>
          {s.packageName} — {Math.round(s.durationMs / 1000)}s{s.open ? ' (open)' : ''}
        </Text>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {padding: 24, paddingTop: 64},
  title: {fontSize: 20, fontWeight: '600', marginBottom: 12},
  status: {fontSize: 14, marginBottom: 8},
  meta: {fontSize: 13, color: '#555', marginBottom: 16},
  row: {flexDirection: 'row', marginBottom: 24},
  session: {fontSize: 13, marginBottom: 6, color: '#333'},
});