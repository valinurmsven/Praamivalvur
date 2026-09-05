import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";

import * as SecureStore from "expo-secure-store";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";

const API = "https://praamivalvur-api.valinurmsven.workers.dev";

const PROFILE_KEY = "praamivalvur_profile";
const CLIENT_ID_KEY = "praamivalvur_client_id";
const PUSH_TOKEN_KEY = "praamivalvur_push_token";

const ROUTES = [
  { code: "VK", name: "Virtsu → Kuivastu" },
  { code: "KV", name: "Kuivastu → Virtsu" },
  { code: "RH", name: "Rohuküla → Heltermaa" },
  { code: "HR", name: "Heltermaa → Rohuküla" },
];

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

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

  if (parts.length !== 3) {
    return date;
  }

  return `${parts[2]}.${parts[1]}`;
}

function routeName(code) {
  return ROUTES.find((route) => route.code === code)?.name || code;
}

function timeToMinutes(time) {
  if (!time || typeof time !== "string") {
    return 99999;
  }

  const [hours, minutes] = time.split(":").map(Number);

  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    return 99999;
  }

  return hours * 60 + minutes;
}

function isValidDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function sortDepartures(list) {
  return [...list].sort(
    (a, b) => timeToMinutes(a?.time) - timeToMinutes(b?.time)
  );
}

function sortWatches(list) {
  return [...list].sort((a, b) => {
    const dateA = `${a?.date || ""} ${a?.time || ""}`;
    const dateB = `${b?.date || ""} ${b?.time || ""}`;

    return dateA.localeCompare(dateB);
  });
}

function uniqueWatches(list) {
  const seen = new Set();

  return list.filter((watch) => {
    const id =
      watch?.id ||
      `${watch?.direction}-${watch?.date}-${watch?.time}`;

    if (seen.has(id)) {
      return false;
    }

    seen.add(id);
    return true;
  });
}

function createClientId() {
  return (
    "pv_" +
    Date.now().toString(36) +
    "_" +
    Math.random().toString(36).slice(2, 12)
  );
}

async function getOrCreateClientId() {
  let id = await SecureStore.getItemAsync(CLIENT_ID_KEY);

  if (!id) {
    id = createClientId();
    await SecureStore.setItemAsync(CLIENT_ID_KEY, id);
  }

  return id;
}

async function registerForPushNotifications() {
  try {
    if (!Device.isDevice) {
      return null;
    }

    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "Praamivalvur",
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        sound: "default",
      });
    }

    const currentPermissions =
      await Notifications.getPermissionsAsync();

    let finalStatus = currentPermissions.status;

    if (finalStatus !== "granted") {
      const requested =
        await Notifications.requestPermissionsAsync();

      finalStatus = requested.status;
    }

    if (finalStatus !== "granted") {
      return null;
    }

    const projectId =
      Constants?.expoConfig?.extra?.eas?.projectId ||
      Constants?.easConfig?.projectId;

    if (!projectId) {
      console.log("EAS projectId puudub.");
      return null;
    }

    const tokenData =
      await Notifications.getExpoPushTokenAsync({
        projectId,
      });

    const token = tokenData?.data || null;

    if (token) {
      await SecureStore.setItemAsync(
        PUSH_TOKEN_KEY,
        token
      );
    }

    return token;
  } catch (error) {
    console.log(
      "Push token error:",
      error?.message || error
    );

    return null;
  }
}

export default function App() {
  const [direction, setDirection] = useState("VK");
  const [date, setDate] = useState(localDate(0));

  const [departures, setDepartures] = useState([]);
  const [watches, setWatches] = useState([]);

  const [loadingDepartures, setLoadingDepartures] =
    useState(false);

  const [loadingWatches, setLoadingWatches] =
    useState(false);

  const [refreshing, setRefreshing] =
    useState(false);

  const [savingId, setSavingId] =
    useState(null);

  const [removingId, setRemovingId] =
    useState(null);

  const [profileOpen, setProfileOpen] =
    useState(true);

  const [profileSaved, setProfileSaved] =
    useState(false);

  const [profileLoading, setProfileLoading] =
    useState(true);

  const [personalCode, setPersonalCode] =
    useState("");

  const [email, setEmail] =
    useState("");

  const [carRegistration, setCarRegistration] =
    useState("");

  const [residentDiscount, setResidentDiscount] =
    useState(false);

  const [clientId, setClientId] =
    useState(null);

  const [pushToken, setPushToken] =
    useState(null);

  const [pushReady, setPushReady] =
    useState(false);

  const selectedRoute = useMemo(
    () =>
      ROUTES.find(
        (route) => route.code === direction
      ),
    [direction]
  );

  async function initialiseDevice() {
    try {
      const id = await getOrCreateClientId();

      setClientId(id);

      const oldPushToken =
        await SecureStore.getItemAsync(
          PUSH_TOKEN_KEY
        );

      if (oldPushToken) {
        setPushToken(oldPushToken);
      }

      const newPushToken =
        await registerForPushNotifications();

      if (newPushToken) {
        setPushToken(newPushToken);
        setPushReady(true);
      } else if (oldPushToken) {
        setPushReady(true);
      }
    } catch (error) {
      console.log(
        "Device init error:",
        error?.message || error
      );
    }
  }

  async function loadProfile() {
    try {
      setProfileLoading(true);

      const raw =
        await SecureStore.getItemAsync(
          PROFILE_KEY
        );

      if (!raw) {
        return;
      }

      const profile = JSON.parse(raw);

      setPersonalCode(
        profile?.personalCode || ""
      );

      setEmail(
        profile?.email || ""
      );

      setCarRegistration(
        profile?.carRegistration || ""
      );

      setResidentDiscount(
        profile?.residentDiscount === true
      );

      setProfileSaved(true);
    } catch (error) {
      console.log(
        "Profile load error:",
        error?.message || error
      );
    } finally {
      setProfileLoading(false);
    }
  }

  async function loadDepartures(
    showError = true
  ) {
    if (!isValidDate(date)) {
      setDepartures([]);

      if (showError) {
        Alert.alert(
          "Kontrolli kuupäeva",
          "Kasuta formaati YYYY-MM-DD."
        );
      }

      return;
    }

    try {
      setLoadingDepartures(true);

      const url =
        `${API}/?direction=${encodeURIComponent(
          direction
        )}` +
        `&date=${encodeURIComponent(date)}`;

      const response =
        await fetch(url);

      const data =
        await response.json();

      if (
        !response.ok ||
        data?.ok === false
      ) {
        throw new Error(
          data?.error ||
            `HTTP ${response.status}`
        );
      }

      const list =
        Array.isArray(data?.departures)
          ? data.departures
          : Array.isArray(data)
          ? data
          : [];

      setDepartures(
        sortDepartures(list)
      );
    } catch (error) {
      console.log(error);

      setDepartures([]);

      if (showError) {
        Alert.alert(
          "Ei saanud väljumisi laadida",
          String(
            error?.message || error
          )
        );
      }
    } finally {
      setLoadingDepartures(false);
    }
  }

  async function loadWatches(
    showError = false
  ) {
    try {
      setLoadingWatches(true);

      let url = `${API}/watches`;

      if (clientId) {
        url +=
          `?clientId=${encodeURIComponent(
            clientId
          )}`;
      }

      const response =
        await fetch(url);

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error ||
            `HTTP ${response.status}`
        );
      }

      let list = [];

      if (Array.isArray(data)) {
        list = data;
      } else if (
        Array.isArray(data?.watches)
      ) {
        list = data.watches;
      } else if (
        Array.isArray(data?.items)
      ) {
        list = data.items;
      }

      setWatches(
        sortWatches(
          uniqueWatches(list)
        )
      );
    } catch (error) {
      console.log(error);

      if (showError) {
        Alert.alert(
          "Ei saanud jälgimisi laadida",
          String(
            error?.message || error
          )
        );
      }
    } finally {
      setLoadingWatches(false);
    }
  }

  async function addWatch(departure) {
    const time = departure?.time;

    if (!time) {
      Alert.alert(
        "Viga",
        "Selle väljumise kellaaega ei leitud."
      );

      return;
    }

    const id =
      `${direction}-${date}-${time}`;

    if (isWatched(time)) {
      return;
    }

    try {
      setSavingId(id);

      let currentClientId =
        clientId;

      if (!currentClientId) {
        currentClientId =
          await getOrCreateClientId();

        setClientId(
          currentClientId
        );
      }

      let currentPushToken =
        pushToken;

      if (!currentPushToken) {
        currentPushToken =
          await registerForPushNotifications();

        if (currentPushToken) {
          setPushToken(
            currentPushToken
          );

          setPushReady(true);
        }
      }

      const response =
        await fetch(`${API}/watch`, {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify({
            direction,
            date,
            time,
            ship:
              departure?.ship || null,

            clientId:
              currentClientId,

            pushToken:
              currentPushToken || null,
          }),
        });

      const data =
        await response.json();

      if (
        !response.ok ||
        data?.ok === false
      ) {
        throw new Error(
          data?.error ||
            `HTTP ${response.status}`
        );
      }

      await loadWatches(false);

      Alert.alert(
        "Jälgimine lisatud",
        `${routeName(
          direction
        )}\n${date} kell ${time}`
      );
    } catch (error) {
      console.log(error);

      Alert.alert(
        "Jälgimist ei saanud lisada",
        String(
          error?.message || error
        )
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
      setRemovingId(id);

      let url =
        `${API}/watch?id=` +
        encodeURIComponent(id);

      if (clientId) {
        url +=
          `&clientId=${encodeURIComponent(
            clientId
          )}`;
      }

      const response =
        await fetch(url, {
          method: "DELETE",
        });

      let data = null;

      try {
        data =
          await response.json();
      } catch (_) {}

      if (
        !response.ok ||
        data?.ok === false
      ) {
        throw new Error(
          data?.error ||
            `HTTP ${response.status}`
        );
      }

      setWatches((current) =>
        current.filter((item) => {
          const itemId =
            item?.id ||
            `${item?.direction}-${item?.date}-${item?.time}`;

          return itemId !== id;
        })
      );
    } catch (error) {
      console.log(error);

      Alert.alert(
        "Ei saanud jälgimist eemaldada",
        String(
          error?.message || error
        )
      );

      await loadWatches(false);
    } finally {
      setRemovingId(null);
    }
  }

  function confirmRemove(watch) {
    Alert.alert(
      "Lõpeta jälgimine?",
      `${routeName(
        watch?.direction
      )}\n${
        watch?.date || ""
      } kell ${
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
          onPress: () =>
            removeWatch(watch),
        },
      ]
    );
  }

  async function saveProfile() {
    const cleanPersonalCode =
      personalCode.trim();

    const cleanEmail =
      email.trim();

    const cleanRegistration =
      carRegistration
        .trim()
        .toUpperCase()
        .replace(/\s/g, "");

    if (
      cleanPersonalCode &&
      !/^\d{11}$/.test(
        cleanPersonalCode
      )
    ) {
      Alert.alert(
        "Kontrolli isikukoodi",
        "Isikukood peab olema 11 numbrit."
      );

      return;
    }

    if (
      cleanEmail &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
        cleanEmail
      )
    ) {
      Alert.alert(
        "Kontrolli e-posti",
        "Sisesta korrektne e-posti aadress."
      );

      return;
    }

    try {
      const profile = {
        personalCode:
          cleanPersonalCode,

        email:
          cleanEmail,

        carRegistration:
          cleanRegistration,

        residentDiscount:
          residentDiscount === true,
      };

      await SecureStore.setItemAsync(
        PROFILE_KEY,
        JSON.stringify(profile)
      );

      setPersonalCode(
        cleanPersonalCode
      );

      setEmail(
        cleanEmail
      );

      setCarRegistration(
        cleanRegistration
      );

      setProfileSaved(true);

      Alert.alert(
        "Andmed salvestatud",
        "Isikukood, e-post ja auto andmed on turvaliselt telefoni salvestatud."
      );
    } catch (error) {
      console.log(error);

      Alert.alert(
        "Salvestamine ebaõnnestus",
        String(
          error?.message || error
        )
      );
    }
  }

  async function refreshAll() {
    try {
      setRefreshing(true);

      await Promise.all([
        loadDepartures(false),
        loadWatches(false),
      ]);
    } finally {
      setRefreshing(false);
    }
  }

  const isWatched = (time) =>
    watches.some(
      (watch) =>
        watch?.direction ===
          direction &&
        watch?.date === date &&
        watch?.time === time &&
        watch?.active !== false
    );

  useEffect(() => {
    initialiseDevice();
    loadProfile();
  }, []);

  useEffect(() => {
    loadWatches(false);
  }, [clientId]);

  useEffect(() => {
    if (isValidDate(date)) {
      loadDepartures(false);
    }
  }, [direction, date]);

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar
        barStyle="light-content"
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={
          styles.content
        }
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refreshAll}
            tintColor="#ffffff"
          />
        }
      >
        <View style={styles.header}>
          <Text style={styles.logo}>
            ⛴️
          </Text>

          <View
            style={styles.headerText}
          >
            <Text style={styles.title}>
              Praamivalvur
            </Text>

            <Text
              style={styles.subtitle}
            >
              Valva autokohta, mitte
              brauserit
            </Text>
          </View>
        </View>

        <Pressable
          onPress={() =>
            setProfileOpen(
              (value) => !value
            )
          }
          style={styles.profileHeader}
        >
          <View>
            <Text
              style={
                styles.sectionTitleNoMargin
              }
            >
              Minu andmed
            </Text>

            <Text
              style={
                styles.profileSubtitle
              }
            >
              Pileti vormi
              eeltäitmiseks
            </Text>
          </View>

          <View
            style={
              styles.profileHeaderRight
            }
          >
            {profileSaved ? (
              <View
                style={styles.savedBadge}
              >
                <Text
                  style={
                    styles.savedBadgeText
                  }
                >
                  ✓ SALVESTATUD
                </Text>
              </View>
            ) : null}

            <Text
              style={styles.chevron}
            >
              {profileOpen
                ? "▲"
                : "▼"}
            </Text>
          </View>
        </Pressable>

        {profileOpen ? (
          <View
            style={styles.profileCard}
          >
            {profileLoading ? (
              <View
                style={
                  styles.profileLoading
                }
              >
                <ActivityIndicator />

                <Text
                  style={
                    styles.loadingText
                  }
                >
                  Laen salvestatud
                  andmeid...
                </Text>
              </View>
            ) : (
              <>
                <Text
                  style={
                    styles.inputLabel
                  }
                >
                  Isikukood
                </Text>

                <TextInput
                  value={personalCode}
                  onChangeText={(
                    value
                  ) => {
                    setPersonalCode(
                      value
                        .replace(
                          /[^0-9]/g,
                          ""
                        )
                        .slice(0, 11)
                    );

                    setProfileSaved(
                      false
                    );
                  }}
                  placeholder="11-kohaline isikukood"
                  placeholderTextColor="#6e7781"
                  style={
                    styles.profileInput
                  }
                  keyboardType="number-pad"
                  maxLength={11}
                />

                <Text
                  style={
                    styles.inputLabel
                  }
                >
                  E-posti aadress
                </Text>

                <TextInput
                  value={email}
                  onChangeText={(
                    value
                  ) => {
                    setEmail(value);

                    setProfileSaved(
                      false
                    );
                  }}
                  placeholder="nimi@email.ee"
                  placeholderTextColor="#6e7781"
                  style={
                    styles.profileInput
                  }
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                />

                <Text
                  style={
                    styles.inputLabel
                  }
                >
                  Auto
                  registreerimisnumber
                </Text>

                <TextInput
                  value={
                    carRegistration
                  }
                  onChangeText={(
                    value
                  ) => {
                    setCarRegistration(
                      value
                        .toUpperCase()
                        .replace(
                          /\s/g,
                          ""
                        )
                    );

                    setProfileSaved(
                      false
                    );
                  }}
                  placeholder="123ABC"
                  placeholderTextColor="#6e7781"
                  style={
                    styles.profileInput
                  }
                  autoCapitalize="characters"
                  autoCorrect={false}
                />

                <View
                  style={
                    styles.switchRow
                  }
                >
                  <View
                    style={
                      styles.switchTextBox
                    }
                  >
                    <Text
                      style={
                        styles.switchTitle
                      }
                    >
                      Püsielaniku
                      soodustus
                    </Text>

                    <Text
                      style={
                        styles.switchSubtitle
                      }
                    >
                      Kasuta püsielaniku
                      soodustust pileti
                      vormistamisel
                    </Text>
                  </View>

                  <Switch
                    value={
                      residentDiscount
                    }
                    onValueChange={(
                      value
                    ) => {
                      setResidentDiscount(
                        value
                      );

                      setProfileSaved(
                        false
                      );
                    }}
                  />
                </View>

                <Pressable
                  onPress={
                    saveProfile
                  }
                  style={
                    styles.saveProfileButton
                  }
                >
                  <Text
                    style={
                      styles.saveProfileButtonText
                    }
                  >
                    Salvesta andmed
                  </Text>
                </Pressable>
              </>
            )}
          </View>
        ) : null}

        <View
          style={
            styles.notificationCard
          }
        >
          <View style={{ flex: 1 }}>
            <Text
              style={
                styles.notificationTitle
              }
            >
              Teavitused
            </Text>

            <Text
              style={
                styles.notificationSubtitle
              }
            >
              {pushReady
                ? "Telefon on push-teavitusteks valmis."
                : "Push-teavituse luba või token pole veel saadaval."}
            </Text>
          </View>

          <View
            style={[
              styles.notificationBadge,
              pushReady
                ? styles.notificationBadgeReady
                : styles.notificationBadgeOff,
            ]}
          >
            <Text
              style={
                styles.notificationBadgeText
              }
            >
              {pushReady
                ? "✓ VALMIS"
                : "POLE VALMIS"}
            </Text>
          </View>
        </View>

        <Text
          style={styles.sectionTitle}
        >
          Vali suund
        </Text>

        <View
          style={styles.routeGrid}
        >
          {ROUTES.map((route) => {
            const selected =
              route.code === direction;

            return (
              <Pressable
                key={route.code}
                onPress={() =>
                  setDirection(
                    route.code
                  )
                }
                style={[
                  styles.routeButton,
                  selected &&
                    styles.routeButtonSelected,
                ]}
              >
                <Text
                  style={[
                    styles.routeCode,
                    selected &&
                      styles.routeTextSelected,
                  ]}
                >
                  {route.code}
                </Text>

                <Text
                  style={[
                    styles.routeName,
                    selected &&
                      styles.routeTextSelected,
                  ]}
                >
                  {route.name}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text
          style={styles.sectionTitle}
        >
          Kuupäev
        </Text>

        <View
          style={styles.quickDates}
        >
          {[0, 1, 2, 3].map(
            (offset) => {
              const value =
                localDate(offset);

              const selected =
                date === value;

              const label =
                offset === 0
                  ? "Täna"
                  : offset === 1
                  ? "Homme"
                  : shortDate(value);

              return (
                <Pressable
                  key={value}
                  onPress={() =>
                    setDate(value)
                  }
                  style={[
                    styles.quickDateButton,
                    selected &&
                      styles.quickDateButtonSelected,
                  ]}
                >
                  <Text
                    style={[
                      styles.quickDateText,
                      selected &&
                        styles.quickDateTextSelected,
                    ]}
                  >
                    {label}
                  </Text>
                </Pressable>
              );
            }
          )}
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
            maxLength={10}
          />

          <Pressable
            onPress={() =>
              loadDepartures(true)
            }
            style={styles.loadButton}
          >
            <Text
              style={
                styles.loadButtonText
              }
            >
              Laadi
            </Text>
          </Pressable>
        </View>

        <View
          style={styles.selectedInfo}
        >
          <Text
            style={
              styles.selectedInfoTitle
            }
          >
            {selectedRoute?.name}
          </Text>

          <Text
            style={
              styles.selectedInfoDate
            }
          >
            {date}
          </Text>
        </View>

        <View
          style={styles.sectionHeader}
        >
          <Text
            style={
              styles.sectionTitleNoMargin
            }
          >
            Väljumised
          </Text>

          <Pressable
            onPress={() =>
              loadDepartures(true)
            }
          >
            <Text
              style={
                styles.refreshText
              }
            >
              Värskenda
            </Text>
          </Pressable>
        </View>

        {loadingDepartures ? (
          <View
            style={styles.loadingBox}
          >
            <ActivityIndicator
              size="large"
            />

            <Text
              style={styles.loadingText}
            >
              Laen väljumisi...
            </Text>
          </View>
        ) : departures.length === 0 ? (
          <View
            style={styles.emptyBox}
          >
            <Text
              style={styles.emptyTitle}
            >
              Väljumisi ei leitud
            </Text>

            <Text
              style={styles.emptyText}
            >
              Kontrolli kuupäeva ja
              proovi uuesti.
            </Text>
          </View>
        ) : (
          departures.map(
            (departure, index) => {
              const time =
                departure?.time ||
                "--:--";

              const cars = Number(
                departure?.cars ?? 0
              );

              const passengers =
                Number(
                  departure?.passengers ??
                    0
                );

              const trucks = Number(
                departure?.trucks ?? 0
              );

              const watched =
                isWatched(time);

              const id =
                `${direction}-${date}-${time}`;

              const saving =
                savingId === id;

              return (
                <View
                  key={`${time}-${index}`}
                  style={
                    styles.departureCard
                  }
                >
                  <View
                    style={
                      styles.departureTop
                    }
                  >
                    <View>
                      <Text
                        style={
                          styles.departureTime
                        }
                      >
                        {time}
                      </Text>

                      <Text
                        style={
                          styles.shipText
                        }
                      >
                        Laev:{" "}
                        {departure?.ship ||
                          "—"}
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
                      <Text
                        style={
                          styles.availabilityText
                        }
                      >
                        {cars > 0
                          ? "KOHTI ON"
                          : "TÄIS"}
                      </Text>
                    </View>
                  </View>

                  <View
                    style={
                      styles.capacityRow
                    }
                  >
                    <View
                      style={
                        styles.capacityBox
                      }
                    >
                      <Text
                        style={
                          styles.capacityNumber
                        }
                      >
                        {cars}
                      </Text>

                      <Text
                        style={
                          styles.capacityLabel
                        }
                      >
                        autot
                      </Text>
                    </View>

                    <View
                      style={
                        styles.capacityBox
                      }
                    >
                      <Text
                        style={
                          styles.capacityNumber
                        }
                      >
                        {passengers}
                      </Text>

                      <Text
                        style={
                          styles.capacityLabel
                        }
                      >
                        reisijat
                      </Text>
                    </View>

                    <View
                      style={
                        styles.capacityBox
                      }
                    >
                      <Text
                        style={
                          styles.capacityNumber
                        }
                      >
                        {trucks}
                      </Text>

                      <Text
                        style={
                          styles.capacityLabel
                        }
                      >
                        veokit
                      </Text>
                    </View>
                  </View>

                  <Pressable
                    disabled={
                      watched || saving
                    }
                    onPress={() =>
                      addWatch(
                        departure
                      )
                    }
                    style={[
                      styles.watchButton,
                      watched &&
                        styles.watchButtonActive,
                      saving &&
                        styles.watchButtonDisabled,
                    ]}
                  >
                    {saving ? (
                      <ActivityIndicator />
                    ) : (
                      <Text
                        style={[
                          styles.watchButtonText,
                          watched &&
                            styles.watchButtonTextActive,
                        ]}
                      >
                        {watched
                          ? "✓ Jälgimine aktiivne"
                          : cars > 0
                          ? "Jälgi seda väljumist"
                          : "Jälgi ja teata kui koht tekib"}
                      </Text>
                    )}
                  </Pressable>
                </View>
              );
            }
          )
        )}

        <View
          style={styles.sectionHeader}
        >
          <Text
            style={
              styles.sectionTitleNoMargin
            }
          >
            Minu jälgimised
          </Text>

          <Pressable
            onPress={() =>
              loadWatches(true)
            }
          >
            <Text
              style={
                styles.refreshText
              }
            >
              Värskenda
            </Text>
          </Pressable>
        </View>

        {loadingWatches &&
        watches.length === 0 ? (
          <View
            style={styles.loadingBox}
          >
            <ActivityIndicator
              size="large"
            />
          </View>
        ) : watches.length === 0 ? (
          <View
            style={styles.emptyBox}
          >
            <Text
              style={styles.emptyTitle}
            >
              Ühtegi väljumist ei
              jälgita
            </Text>

            <Text
              style={styles.emptyText}
            >
              Vajuta soovitud
              väljumise juures
              jälgimise nuppu.
            </Text>
          </View>
        ) : (
          watches.map(
            (watch, index) => {
              const id =
                watch?.id ||
                `${watch?.direction}-${watch?.date}-${watch?.time}`;

              const cars = Number(
                watch?.lastCars ?? 0
              );

              const available =
                watch?.availableNow ===
                  true || cars > 0;

              const removing =
                removingId === id;

              return (
                <View
                  key={
                    id ||
                    `watch-${index}`
                  }
                  style={
                    styles.watchCard
                  }
                >
                  <View
                    style={
                      styles.watchCardTop
                    }
                  >
                    <View
                      style={
                        styles.watchCardInfo
                      }
                    >
                      <Text
                        style={
                          styles.watchRoute
                        }
                      >
                        {routeName(
                          watch?.direction
                        )}
                      </Text>

                      <Text
                        style={
                          styles.watchDate
                        }
                      >
                        {watch?.date ||
                          "—"}{" "}
                        ·{" "}
                        {watch?.time ||
                          "—"}
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
                      <Text
                        style={
                          styles.watchStatusText
                        }
                      >
                        {available
                          ? `${cars} kohta`
                          : "Ootan"}
                      </Text>
                    </View>
                  </View>

                  {watch?.ship ? (
                    <Text
                      style={
                        styles.watchMeta
                      }
                    >
                      Laev:{" "}
                      {watch.ship}
                    </Text>
                  ) : null}

                  {watch?.lastCheckedAt ? (
                    <Text
                      style={
                        styles.watchMeta
                      }
                    >
                      Viimane kontroll:{" "}
                      {new Date(
                        watch.lastCheckedAt
                      ).toLocaleString()}
                    </Text>
                  ) : null}

                  <Pressable
                    disabled={removing}
                    onPress={() =>
                      confirmRemove(
                        watch
                      )
                    }
                    style={[
                      styles.removeButton,
                      removing &&
                        styles.removeButtonDisabled,
                    ]}
                  >
                    {removing ? (
                      <ActivityIndicator />
                    ) : (
                      <Text
                        style={
                          styles.removeButtonText
                        }
                      >
                        Lõpeta
                        jälgimine
                      </Text>
                    )}
                  </Pressable>
                </View>
              );
            }
          )
        )}

        <Text style={styles.footer}>
          Praamivalvur kontrollib
          jälgimisi serveris ka siis,
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
    paddingBottom: 60,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 24,
    marginTop: 8,
  },

  headerText: {
    flex: 1,
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
    marginTop: 16,
  },

  sectionTitleNoMargin: {
    color: "#ffffff",
    fontSize: 20,
    fontWeight: "800",
  },

  profileHeader: {
    backgroundColor: "#101c2b",
    borderColor: "#26384d",
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },

  profileHeaderRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  profileSubtitle: {
    color: "#8292a2",
    marginTop: 4,
  },

  savedBadge: {
    backgroundColor: "#173d2b",
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 9,
  },

  savedBadgeText: {
    color: "#dff7e9",
    fontSize: 10,
    fontWeight: "900",
  },

  chevron: {
    color: "#f4c400",
    fontSize: 16,
    fontWeight: "900",
  },

  profileCard: {
    backgroundColor: "#0d1724",
    borderColor: "#1c2a3a",
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },

  profileLoading: {
    paddingVertical: 12,
    alignItems: "center",
  },

  inputLabel: {
    color: "#c9d3dd",
    fontSize: 13,
    fontWeight: "800",
    marginBottom: 7,
  },

  profileInput: {
    backgroundColor: "#101c2b",
    color: "#ffffff",
    borderColor: "#26384d",
    borderWidth: 1,
    borderRadius: 13,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 16,
    marginBottom: 16,
  },

  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 18,
    gap: 14,
  },

  switchTextBox: {
    flex: 1,
  },

  switchTitle: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "800",
  },

  switchSubtitle: {
    color: "#8292a2",
    fontSize: 12,
    marginTop: 4,
    lineHeight: 17,
  },

  saveProfileButton: {
    backgroundColor: "#f4c400",
    borderRadius: 13,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
  },

  saveProfileButtonText: {
    color: "#08111f",
    fontWeight: "900",
    fontSize: 15,
  },

  notificationCard: {
    backgroundColor: "#101c2b",
    borderColor: "#26384d",
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 8,
  },

  notificationTitle: {
    color: "#ffffff",
    fontWeight: "800",
    fontSize: 15,
  },

  notificationSubtitle: {
    color: "#8292a2",
    fontSize: 12,
    marginTop: 4,
    lineHeight: 17,
  },

  notificationBadge: {
    borderRadius: 9,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },

  notificationBadgeReady: {
    backgroundColor: "#173d2b",
  },

  notificationBadgeOff: {
    backgroundColor: "#4a2025",
  },

  notificationBadgeText: {
    color: "#ffffff",
    fontSize: 10,
    fontWeight: "900",
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
    paddingHorizontal: 10,
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
    fontSize: 14,
    textAlign: "center",
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
    justifyContent: "center",
    minHeight: 44,
  },

  removeButtonDisabled: {
    opacity: 0.6,
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
