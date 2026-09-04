import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

const API = "https://praamivalvur-api.valinurmsven.workers.dev";

const ROUTES = [
  { code: "VK", name: "Virtsu → Kuivastu" },
  { code: "KV", name: "Kuivastu → Virtsu" },
  { code: "RH", name: "Rohuküla → Heltermaa" },
  { code: "HR", name: "Heltermaa → Rohuküla" },
];

function localDate(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);

  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function shortDate(date) {
  if (!date) return "";

  const parts = date.split("-");
  if (parts.length !== 3) return date;

  return `${parts[2]}.${parts[1]}`;
}

function routeName(code) {
  return ROUTES.find((r) => r.code === code)?.name || code;
}

function timeToMinutes(time) {
  if (!time || typeof time !== "string") {
    return 99999;
  }

  const parts = time.split(":");

  if (parts.length !== 2) {
    return 99999;
  }

  const hours = Number(parts[0]);
  const minutes = Number(parts[1]);

  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    return 99999;
  }

  return hours * 60 + minutes;
}

export default function App() {
  const [direction, setDirection] = useState("VK");
  const [date, setDate] = useState(localDate(0));

  const [departures, setDepartures] = useState([]);
  const [watches, setWatches] = useState([]);

  const [loadingDepartures, setLoadingDepartures] = useState(false);
  const [loadingWatches, setLoadingWatches] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [savingId, setSavingId] = useState(null);

  const selectedRoute = useMemo(
    () => ROUTES.find((route) => route.code === direction),
    [direction]
  );

  async function loadDepartures(showError = true) {
    if (!date || date.length !== 10) {
      if (showError) {
        Alert.alert("Kontrolli kuupäeva", "Kasuta formaati YYYY-MM-DD.");
      }

      return;
    }

    try {
      setLoadingDepartures(true);

      const url =
        `${API}/?direction=${encodeURIComponent(direction)}` +
        `&date=${encodeURIComponent(date)}`;

      const response = await fetch(url);
      const data = await response.json();

      if (!response.ok || data?.ok === false) {
        throw new Error(data?.error || `HTTP ${response.status}`);
      }

      const list = Array.isArray(data?.departures)
        ? data.departures
        : Array.isArray(data)
        ? data
        : [];

      const sortedList = [...list].sort((a, b) => {
        return timeToMinutes(a?.time) - timeToMinutes(b?.time);
      });

      setDepartures(sortedList);
    } catch (error) {
      console.log(error);

      if (showError) {
        Alert.alert(
          "Ei saanud väljumisi laadida",
          String(error?.message || error)
        );
      }
    } finally {
      setLoadingDepartures(false);
    }
  }

  async function loadWatches(showError = false) {
    try {
      setLoadingWatches(true);

      const response = await fetch(`${API}/watches`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || `HTTP ${response.status}`);
      }

      let list = [];

      if (Array.isArray(data)) {
        list = data;
      } else if (Array.isArray(data?.watches)) {
        list = data.watches;
      } else if (Array.isArray(data?.items)) {
        list = data.items;
      }

      setWatches(list);
    } catch (error) {
      console.log(error);

      if (showError) {
        Alert.alert(
          "Ei saanud jälgimisi laadida",
          String(error?.message || error)
        );
      }
    } finally {
      setLoadingWatches(false);
    }
  }

  async function addWatch(departure) {
    const time = departure?.time;

    if (!time) {
      Alert.alert("Viga", "Selle väljumise kellaaega ei leitud.");
      return;
    }

    const id = `${direction}-${date}-${time}`;

    try {
      setSavingId(id);

      const response = await fetch(`${API}/watch`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          direction,
          date,
          time,
          ship: departure?.ship || null,
        }),
      });

      const data = await response.json();

      if (!response.ok || data?.ok === false) {
        throw new Error(data?.error || `HTTP ${response.status}`);
      }

      await loadWatches(false);

      Alert.alert(
        "Jälgimine lisatud",
        `${routeName(direction)}\n${date} kell ${time}`
      );
    } catch (error) {
      console.log(error);

      Alert.alert(
        "Jälgimist ei saanud lisada",
        String(error?.message || error)
      );
    } finally {
      setSavingId(null);
    }
  }

  async function removeWatch(watch) {
    const id =
      watch?.id ||
      `${watch?.direction}-${watch?.date}-${watch?.time}`;

    try {
      const response = await fetch(
        `${API}/watch?id=${encodeURIComponent(id)}`,
        {
          method: "DELETE",
        }
      );

      let data = null;

      try {
        data = await response.json();
      } catch (_) {}

      if (!response.ok || data?.ok === false) {
        throw new Error(data?.error || `HTTP ${response.status}`);
      }

      await loadWatches(false);
    } catch (error) {
      console.log(error);

      Alert.alert(
        "Ei saanud jälgimist eemaldada",
        String(error?.message || error)
      );
    }
  }

  function confirmRemove(watch) {
    Alert.alert(
      "Lõpeta jälgimine?",
      `${routeName(watch?.direction)}\n${watch?.date || ""} kell ${
        watch?.time || ""
      }`,
      [
        {
          text: "Tühista",
          style: "cancel",
        },
        {
          text: "Eemalda",
          style: "destructive",
          onPress: () => removeWatch(watch),
        },
      ]
    );
  }

  async function refreshAll() {
    setRefreshing(true);

    await Promise.all([
      loadDepartures(false),
      loadWatches(false),
    ]);

    setRefreshing(false);
  }

  useEffect(() => {
    loadWatches(false);
  }, []);

  useEffect(() => {
    loadDepartures(false);
  }, [direction]);

  const isWatched = (time) =>
    watches.some(
      (watch) =>
        watch?.direction === direction &&
        watch?.date === date &&
        watch?.time === time &&
        watch?.active !== false
    );

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refreshAll}
            tintColor="#ffffff"
          />
        }
      >
        <View style={styles.header}>
          <Text style={styles.logo}>⛴️</Text>

          <View>
            <Text style={styles.title}>Praamivalvur</Text>

            <Text style={styles.subtitle}>
              Valva autokohta, mitte brauserit
            </Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Vali suund</Text>

        <View style={styles.routeGrid}>
          {ROUTES.map((route) => {
            const selected = route.code === direction;

            return (
              <Pressable
                key={route.code}
                onPress={() => setDirection(route.code)}
                style={[
                  styles.routeButton,
                  selected && styles.routeButtonSelected,
                ]}
              >
                <Text
                  style={[
                    styles.routeCode,
                    selected && styles.routeTextSelected,
                  ]}
                >
                  {route.code}
                </Text>

                <Text
                  style={[
                    styles.routeName,
                    selected && styles.routeTextSelected,
                  ]}
                >
                  {route.name}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.sectionTitle}>Kuupäev</Text>

        <View style={styles.quickDates}>
          {[0, 1, 2, 3].map((offset) => {
            const value = localDate(offset);
            const selected = date === value;

            const label =
              offset === 0
                ? "Täna"
                : offset === 1
                ? "Homme"
                : shortDate(value);

            return (
              <Pressable
                key={value}
                onPress={() => setDate(value)}
                style={[
                  styles.quickDateButton,
                  selected && styles.quickDateButtonSelected,
                ]}
              >
                <Text
                  style={[
                    styles.quickDateText,
                    selected && styles.quickDateTextSelected,
                  ]}
                >
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.dateRow}>
          <TextInput
            value={date}
            onChangeText={setDate}
            placeholder="YYYY-MM-DD"
            placeholderTextColor="#6e7781"
            style={styles.dateInput}
            autoCapitalize="none"
            autoCorrect={false}
          />

          <Pressable
            onPress={() => loadDepartures(true)}
            style={styles.loadButton}
          >
            <Text style={styles.loadButtonText}>Laadi</Text>
          </Pressable>
        </View>

        <View style={styles.selectedInfo}>
          <Text style={styles.selectedInfoTitle}>
            {selectedRoute?.name}
          </Text>

          <Text style={styles.selectedInfoDate}>
            {date}
          </Text>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitleNoMargin}>
            Väljumised
          </Text>

          <Pressable onPress={() => loadDepartures(true)}>
            <Text style={styles.refreshText}>
              Värskenda
            </Text>
          </Pressable>
        </View>

        {loadingDepartures ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" />

            <Text style={styles.loadingText}>
              Laen väljumisi...
            </Text>
          </View>
        ) : departures.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyTitle}>
              Väljumisi ei leitud
            </Text>

            <Text style={styles.emptyText}>
              Kontrolli kuupäeva ja proovi uuesti.
            </Text>
          </View>
        ) : (
          departures.map((departure, index) => {
            const time = departure?.time || "--:--";
            const cars = Number(departure?.cars ?? 0);
            const passengers = Number(departure?.passengers ?? 0);
            const trucks = Number(departure?.trucks ?? 0);
            const watched = isWatched(time);
            const id = `${direction}-${date}-${time}`;
            const saving = savingId === id;

            return (
              <View
                key={`${time}-${index}`}
                style={styles.departureCard}
              >
                <View style={styles.departureTop}>
                  <View>
                    <Text style={styles.departureTime}>
                      {time}
                    </Text>

                    <Text style={styles.shipText}>
                      Laev: {departure?.ship || "—"}
                    </Text>
                  </View>

                  <View
                    style={[
                      styles.availabilityBadge,
                      cars > 0
                        ? styles.availabilityYes
                        : styles.availabilityNo,
                    ]}
                  >
                    <Text style={styles.availabilityText}>
                      {cars > 0 ? "KOHTI ON" : "TÄIS"}
                    </Text>
                  </View>
                </View>

                <View style={styles.capacityRow}>
                  <View style={styles.capacityBox}>
                    <Text style={styles.capacityNumber}>
                      {cars}
                    </Text>

                    <Text style={styles.capacityLabel}>
                      autot
                    </Text>
                  </View>

                  <View style={styles.capacityBox}>
                    <Text style={styles.capacityNumber}>
                      {passengers}
                    </Text>

                    <Text style={styles.capacityLabel}>
                      reisijat
                    </Text>
                  </View>

                  <View style={styles.capacityBox}>
                    <Text style={styles.capacityNumber}>
                      {trucks}
                    </Text>

                    <Text style={styles.capacityLabel}>
                      veokit
                    </Text>
                  </View>
                </View>

                <Pressable
                  disabled={watched || saving}
                  onPress={() => addWatch(departure)}
                  style={[
                    styles.watchButton,
                    watched && styles.watchButtonActive,
                    saving && styles.watchButtonDisabled,
                  ]}
                >
                  {saving ? (
                    <ActivityIndicator />
                  ) : (
                    <Text
                      style={[
                        styles.watchButtonText,
                        watched && styles.watchButtonTextActive,
                      ]}
                    >
                      {watched
                        ? "✓ Jälgimine aktiivne"
                        : "Jälgi seda väljumist"}
                    </Text>
                  )}
                </Pressable>
              </View>
            );
          })
        )}

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitleNoMargin}>
            Minu jälgimised
          </Text>

          <Pressable onPress={() => loadWatches(true)}>
            <Text style={styles.refreshText}>
              Värskenda
            </Text>
          </Pressable>
        </View>

        {loadingWatches && watches.length === 0 ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" />
          </View>
        ) : watches.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyTitle}>
              Ühtegi väljumist ei jälgita
            </Text>

            <Text style={styles.emptyText}>
              Vajuta mõne väljumise juures „Jälgi seda väljumist”.
            </Text>
          </View>
        ) : (
          watches.map((watch, index) => {
            const cars = Number(watch?.lastCars ?? 0);

            const available =
              watch?.availableNow === true || cars > 0;

            return (
              <View
                key={watch?.id || `watch-${index}`}
                style={styles.watchCard}
              >
                <View style={styles.watchCardTop}>
                  <View style={styles.watchCardInfo}>
                    <Text style={styles.watchRoute}>
                      {routeName(watch?.direction)}
                    </Text>

                    <Text style={styles.watchDate}>
                      {watch?.date || "—"} · {watch?.time || "—"}
                    </Text>
                  </View>

                  <View
                    style={[
                      styles.watchStatus,
                      available
                        ? styles.watchStatusAvailable
                        : styles.watchStatusWaiting,
                    ]}
                  >
                    <Text style={styles.watchStatusText}>
                      {available
                        ? `${cars} kohta`
                        : "Ootan"}
                    </Text>
                  </View>
                </View>

                {watch?.ship ? (
                  <Text style={styles.watchMeta}>
                    Laev: {watch.ship}
                  </Text>
                ) : null}

                {watch?.lastCheckedAt ? (
                  <Text style={styles.watchMeta}>
                    Viimane kontroll:{" "}
                    {new Date(
                      watch.lastCheckedAt
                    ).toLocaleString()}
                  </Text>
                ) : null}

                <Pressable
                  onPress={() => confirmRemove(watch)}
                  style={styles.removeButton}
                >
                  <Text style={styles.removeButtonText}>
                    Lõpeta jälgimine
                  </Text>
                </Pressable>
              </View>
            );
          })
        )}

        <Text style={styles.footer}>
          Praamivalvur kontrollib jälgimisi serveris ka siis,
          kui äpp on kinni.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#08111f",
  },

  scroll: {
    flex: 1,
  },

  content: {
    padding: 18,
    paddingBottom: 50,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 28,
    marginTop: 8,
  },

  logo: {
    fontSize: 42,
    marginRight: 12,
  },

  title: {
    color: "#ffffff",
    fontSize: 30,
    fontWeight: "900",
  },

  subtitle: {
    color: "#8c9bab",
    marginTop: 3,
    fontSize: 14,
  },

  sectionTitle: {
    color: "#ffffff",
    fontSize: 20,
    fontWeight: "800",
    marginBottom: 12,
    marginTop: 8,
  },

  sectionTitleNoMargin: {
    color: "#ffffff",
    fontSize: 20,
    fontWeight: "800",
  },

  routeGrid: {
    gap: 10,
    marginBottom: 18,
  },

  routeButton: {
    borderWidth: 1,
    borderColor: "#26384d",
    backgroundColor: "#101c2b",
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },

  routeButtonSelected: {
    backgroundColor: "#f4c400",
    borderColor: "#f4c400",
  },

  routeCode: {
    color: "#f4c400",
    fontSize: 18,
    fontWeight: "900",
    marginBottom: 2,
  },

  routeName: {
    color: "#c9d3dd",
    fontSize: 14,
    fontWeight: "600",
  },

  routeTextSelected: {
    color: "#08111f",
  },

  quickDates: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 10,
  },

  quickDateButton: {
    flex: 1,
    backgroundColor: "#101c2b",
    borderWidth: 1,
    borderColor: "#26384d",
    paddingVertical: 11,
    borderRadius: 12,
    alignItems: "center",
  },

  quickDateButtonSelected: {
    backgroundColor: "#f4c400",
    borderColor: "#f4c400",
  },

  quickDateText: {
    color: "#d7e0e8",
    fontWeight: "700",
  },

  quickDateTextSelected: {
    color: "#08111f",
  },

  dateRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 16,
  },

  dateInput: {
    flex: 1,
    backgroundColor: "#101c2b",
    color: "#ffffff",
    borderColor: "#26384d",
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 13,
    fontSize: 16,
  },

  loadButton: {
    backgroundColor: "#f4c400",
    justifyContent: "center",
    paddingHorizontal: 22,
    borderRadius: 14,
  },

  loadButtonText: {
    color: "#08111f",
    fontWeight: "900",
  },

  selectedInfo: {
    backgroundColor: "#0d1724",
    borderRadius: 14,
    padding: 14,
    marginBottom: 22,
    borderWidth: 1,
    borderColor: "#1c2a3a",
  },

  selectedInfoTitle: {
    color: "#ffffff",
    fontWeight: "800",
    fontSize: 16,
  },

  selectedInfoDate: {
    color: "#8c9bab",
    marginTop: 4,
  },

  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 10,
    marginBottom: 12,
  },

  refreshText: {
    color: "#f4c400",
    fontWeight: "800",
  },

  loadingBox: {
    padding: 28,
    alignItems: "center",
    justifyContent: "center",
  },

  loadingText: {
    color: "#9ba9b7",
    marginTop: 10,
  },

  emptyBox: {
    backgroundColor: "#101c2b",
    borderWidth: 1,
    borderColor: "#26384d",
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
  },

  emptyTitle: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "800",
  },

  emptyText: {
    color: "#8998a8",
    marginTop: 6,
    lineHeight: 20,
  },

  departureCard: {
    backgroundColor: "#101c2b",
    borderWidth: 1,
    borderColor: "#26384d",
    borderRadius: 18,
    padding: 16,
    marginBottom: 12,
  },

  departureTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },

  departureTime: {
    color: "#ffffff",
    fontSize: 28,
    fontWeight: "900",
  },

  shipText: {
    color: "#8797a7",
    marginTop: 3,
  },

  availabilityBadge: {
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 10,
  },

  availabilityYes: {
    backgroundColor: "#173d2b",
  },

  availabilityNo: {
    backgroundColor: "#4a2025",
  },

  availabilityText: {
    color: "#ffffff",
    fontSize: 11,
    fontWeight: "900",
  },

  capacityRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 16,
    marginBottom: 14,
  },

  capacityBox: {
    flex: 1,
    backgroundColor: "#0a1522",
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: "center",
  },

  capacityNumber: {
    color: "#f4c400",
    fontSize: 20,
    fontWeight: "900",
  },

  capacityLabel: {
    color: "#8292a2",
    fontSize: 12,
    marginTop: 2,
  },

  watchButton: {
    backgroundColor: "#f4c400",
    minHeight: 48,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 13,
  },

  watchButtonActive: {
    backgroundColor: "#173d2b",
  },

  watchButtonDisabled: {
    opacity: 0.7,
  },

  watchButtonText: {
    color: "#08111f",
    fontWeight: "900",
    fontSize: 15,
  },

  watchButtonTextActive: {
    color: "#dff7e9",
  },

  watchCard: {
    backgroundColor: "#101c2b",
    borderWidth: 1,
    borderColor: "#26384d",
    borderRadius: 18,
    padding: 16,
    marginBottom: 12,
  },

  watchCardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
  },

  watchCardInfo: {
    flex: 1,
  },

  watchRoute: {
    color: "#ffffff",
    fontWeight: "800",
    fontSize: 16,
  },

  watchDate: {
    color: "#f4c400",
    fontSize: 17,
    fontWeight: "900",
    marginTop: 5,
  },

  watchStatus: {
    borderRadius: 10,
    paddingVertical: 7,
    paddingHorizontal: 10,
    alignSelf: "flex-start",
  },

  watchStatusAvailable: {
    backgroundColor: "#173d2b",
  },

  watchStatusWaiting: {
    backgroundColor: "#3c3420",
  },

  watchStatusText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "900",
  },

  watchMeta: {
    color: "#8595a5",
    marginTop: 7,
    fontSize: 12,
  },

  removeButton: {
    marginTop: 14,
    borderWidth: 1,
    borderColor: "#63323a",
    borderRadius: 12,
    alignItems: "center",
    paddingVertical: 11,
  },

  removeButtonText: {
    color: "#ff8997",
    fontWeight: "800",
  },

  footer: {
    color: "#657688",
    textAlign: "center",
    lineHeight: 19,
    marginTop: 20,
  },
});
