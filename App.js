import React, { useEffect, useState } from 'react';
import {
  SafeAreaView,
  ScrollView,
  Text,
  Pressable,
  View,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';

import * as Notifications from 'expo-notifications';

const API = 'https://praamivalvur-api.valinurmsven.workers.dev';

const routes = [
  ['VK', 'Virtsu → Kuivastu'],
  ['KV', 'Kuivastu → Virtsu'],
  ['RH', 'Rohuküla → Heltermaa'],
  ['HR', 'Heltermaa → Rohuküla'],
];

function today() {
  return new Date().toISOString().slice(0, 10);
}

export default function App() {
  const [route, setRoute] = useState('VK');
  const [departures, setDepartures] = useState([]);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);

    try {
      const response = await fetch(
        `${API}/?direction=${route}&date=${today()}`
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || 'API error');
      }

      setDepartures(data.departures || []);
    } catch (error) {
      setDepartures([]);
      Alert.alert(
        'Viga',
        'Praamide andmeid ei õnnestunud laadida.'
      );
    } finally {
      setLoading(false);
    }
  }

  async function enableNotifications() {
    try {
      await Notifications.requestPermissionsAsync();
    } catch (error) {
      console.log('Notification permission error:', error);
    }
  }

  useEffect(() => {
    enableNotifications();
  }, []);

  useEffect(() => {
    load();
  }, [route]);

  async function watch(time) {
    try {
      const response = await fetch(`${API}/watch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          direction: route,
          date: today(),
          time,
        }),
      });

      if (!response.ok) {
        throw new Error('Watch failed');
      }

      Alert.alert(
        'Jälgimine lisatud',
        `${today()} kell ${time} on nüüd jälgimisel.`
      );
    } catch (error) {
      Alert.alert(
        'Viga',
        'Jälgimist ei õnnestunud lisada.'
      );
    }
  }

  return (
    <SafeAreaView style={styles.page}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Praamivalvur 🚢</Text>

        <Text style={styles.subtitle}>
          Vali suund ja pane sobiv väljumine jälgimisele.
        </Text>

        <View style={styles.routes}>
          {routes.map(([code, name]) => (
            <Pressable
              key={code}
              style={[
                styles.route,
                route === code && styles.selectedRoute,
              ]}
              onPress={() => setRoute(code)}
            >
              <Text style={styles.routeText}>{name}</Text>
            </Pressable>
          ))}
        </View>

        <Pressable
          style={styles.refreshButton}
          onPress={load}
        >
          <Text style={styles.refreshText}>
            Värskenda
          </Text>
        </Pressable>

        {loading ? (
          <ActivityIndicator size="large" />
        ) : (
          departures.map((departure, index) => (
            <View
              key={`${departure.time}-${index}`}
              style={styles.card}
            >
              <View style={styles.cardTop}>
                <Text style={styles.time}>
                  {departure.time}
                </Text>

                <Text style={styles.ship}>
                  {departure.ship || ''}
                </Text>
              </View>

              <Text style={styles.info}>
                🚗 Autosid: {departure.cars ?? '–'}
              </Text>

              <Text style={styles.info}>
                👤 Reisijaid: {departure.passengers ?? '–'}
              </Text>

              <Text style={styles.info}>
                🚚 Veokeid: {departure.trucks ?? '–'}
              </Text>

              <Pressable
                style={styles.watchButton}
                onPress={() => watch(departure.time)}
              >
                <Text style={styles.watchText}>
                  Jälgi
                </Text>
              </Pressable>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: '#0f172a',
  },

  content: {
    padding: 18,
    paddingBottom: 40,
  },

  title: {
    color: 'white',
    fontSize: 30,
    fontWeight: '900',
    marginBottom: 6,
  },

  subtitle: {
    color: '#94a3b8',
    marginBottom: 20,
  },

  routes: {
    gap: 10,
    marginBottom: 14,
  },

  route: {
    backgroundColor: '#1e293b',
    padding: 14,
    borderRadius: 14,
  },

  selectedRoute: {
    backgroundColor: '#2563eb',
  },

  routeText: {
    color: 'white',
    fontWeight: '700',
  },

  refreshButton: {
    backgroundColor: '#334155',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    marginBottom: 18,
  },

  refreshText: {
    color: 'white',
    fontWeight: '800',
  },

  card: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },

  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  time: {
    color: 'white',
    fontSize: 27,
    fontWeight: '900',
  },

  ship: {
    color: '#94a3b8',
    fontWeight: '700',
  },

  info: {
    color: '#cbd5e1',
    marginTop: 7,
    fontSize: 15,
  },

  watchButton: {
    marginTop: 14,
    backgroundColor: '#2563eb',
    padding: 12,
    borderRadius: 12,
    alignItems: 'center',
  },

  watchText: {
    color: 'white',
    fontWeight: '900',
  },
});
