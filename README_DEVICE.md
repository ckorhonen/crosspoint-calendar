# CrossPoint Calendar Mode - Firmware Modification

Custom firmware modification for the Xteink X4 / CrossPoint Reader to enable automated calendar display updates.

---

## Overview

This modification adds a **Calendar Mode** to the CrossPoint firmware that:

1. Wakes from deep sleep on a configurable timer (default: 4 hours)
2. Automatically connects to saved WiFi credentials
3. Fetches a BMP image from a configured HTTP URL
4. Saves it as the sleep screen
5. Displays the image and returns to deep sleep

**No user interaction required** after initial setup.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      Normal Boot Flow                           │
│  Power Button → setup() → BootActivity → HomeActivity           │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    Calendar Mode Boot Flow                       │
│  Timer Wake → setup() → CalendarActivity →                       │
│    → WiFi Connect → HTTP Fetch → Save BMP →                      │
│    → Render Sleep Screen → Set Timer → Deep Sleep               │
└─────────────────────────────────────────────────────────────────┘
```

### Wake Sources

| Source | Behavior |
|--------|----------|
| **Power Button** | Normal boot → Home screen (user can access settings, read books) |
| **RTC Timer** | Calendar mode → Fetch image → Sleep (no UI interaction) |

---

## Implementation Plan

### Phase 1: Core Infrastructure

#### 1.1 Add Calendar Settings to `CrossPointSettings`

**File:** `src/settings/CrossPointSettings.h`

```cpp
// Add to CrossPointSettings class
bool calendarModeEnabled = false;
uint8_t calendarRefreshHours = 4;  // 1-24 hours
char calendarServerUrl[256] = "";  // e.g., "http://192.168.1.100:8080/calendar.bmp"
char calendarWifiSsid[64] = "";    // Dedicated WiFi SSID (optional, uses saved creds if empty)
```

**File:** `src/settings/CrossPointSettings.cpp`

- Add serialization in `saveToFile()` and `loadFromFile()`
- Increment settings version

#### 1.2 Create CalendarActivity

**File:** `src/activities/CalendarActivity.h`

```cpp
#pragma once
#include "Activity.h"
#include <WiFi.h>
#include <HTTPClient.h>

enum class CalendarState {
    CONNECTING_WIFI,
    FETCHING_IMAGE,
    SAVING_IMAGE,
    RENDERING,
    SCHEDULING_SLEEP,
    ERROR
};

class CalendarActivity : public Activity {
public:
    CalendarActivity(GfxRenderer& renderer, MappedInputManager& input);
    void onEnter() override;
    void loop() override;
    bool preventAutoSleep() override { return true; }

private:
    CalendarState state = CalendarState::CONNECTING_WIFI;
    unsigned long stateStartTime = 0;

    void connectToWifi();
    bool fetchImage();
    void saveAndRender();
    void scheduleWakeAndSleep();
    void handleError(const char* message);

    static constexpr unsigned long WIFI_TIMEOUT_MS = 30000;
    static constexpr unsigned long HTTP_TIMEOUT_MS = 60000;
};
```

**File:** `src/activities/CalendarActivity.cpp`

```cpp
#include "CalendarActivity.h"
#include "settings/CrossPointSettings.h"
#include "SleepActivity.h"
#include "store/WifiCredentialStore.h"

extern WifiCredentialStore WIFI_STORE;
extern void enterDeepSleep();
extern void enterNewActivity(Activity* activity);

void CalendarActivity::onEnter() {
    Activity::onEnter();
    state = CalendarState::CONNECTING_WIFI;
    stateStartTime = millis();
    connectToWifi();
}

void CalendarActivity::connectToWifi() {
    // Load saved credentials
    WIFI_STORE.loadFromFile();

    WiFi.mode(WIFI_STA);

    // Use dedicated SSID if configured, otherwise first saved network
    const char* ssid = SETTINGS.calendarWifiSsid[0] != '\0'
        ? SETTINGS.calendarWifiSsid
        : WIFI_STORE.getFirstSsid();

    if (ssid == nullptr) {
        handleError("No WiFi credentials");
        return;
    }

    const char* password = WIFI_STORE.findCredential(ssid);

    if (password) {
        WiFi.begin(ssid, password);
    } else {
        WiFi.begin(ssid);  // Open network
    }
}

void CalendarActivity::loop() {
    switch (state) {
        case CalendarState::CONNECTING_WIFI:
            if (WiFi.status() == WL_CONNECTED) {
                state = CalendarState::FETCHING_IMAGE;
                stateStartTime = millis();
            } else if (millis() - stateStartTime > WIFI_TIMEOUT_MS) {
                handleError("WiFi timeout");
            }
            break;

        case CalendarState::FETCHING_IMAGE:
            if (fetchImage()) {
                state = CalendarState::RENDERING;
            } else if (millis() - stateStartTime > HTTP_TIMEOUT_MS) {
                handleError("HTTP timeout");
            }
            break;

        case CalendarState::RENDERING:
            saveAndRender();
            state = CalendarState::SCHEDULING_SLEEP;
            break;

        case CalendarState::SCHEDULING_SLEEP:
            scheduleWakeAndSleep();
            break;

        case CalendarState::ERROR:
            // Show error briefly, then sleep anyway
            if (millis() - stateStartTime > 3000) {
                scheduleWakeAndSleep();
            }
            break;
    }
}

bool CalendarActivity::fetchImage() {
    HTTPClient http;
    http.begin(SETTINGS.calendarServerUrl);
    http.setTimeout(30000);

    int httpCode = http.GET();

    if (httpCode == HTTP_CODE_OK) {
        // Stream directly to SD card
        File file = SD.open("/sleep.bmp", FILE_WRITE);
        if (file) {
            http.writeToStream(&file);
            file.close();
            http.end();
            return true;
        }
    }

    http.end();
    return false;
}

void CalendarActivity::saveAndRender() {
    // Force sleep screen to CUSTOM mode to use our downloaded image
    SETTINGS.sleepScreen = SLEEP_SCREEN_MODE::CUSTOM;

    // Enter SleepActivity to render the image
    enterNewActivity(new SleepActivity(renderer, input));
}

void CalendarActivity::scheduleWakeAndSleep() {
    WiFi.disconnect(true);
    WiFi.mode(WIFI_OFF);

    // Calculate sleep duration in microseconds
    uint64_t sleepDurationUs = (uint64_t)SETTINGS.calendarRefreshHours * 60 * 60 * 1000000ULL;

    // Enable timer wakeup
    esp_sleep_enable_timer_wakeup(sleepDurationUs);

    // Also keep GPIO wakeup for power button (normal boot)
    esp_sleep_enable_gpio_wakeup();

    // Enter deep sleep
    esp_deep_sleep_start();
}

void CalendarActivity::handleError(const char* message) {
    Serial.printf("Calendar Error: %s\n", message);
    state = CalendarState::ERROR;
    stateStartTime = millis();

    // TODO: Display error message on screen
    renderer.drawText(10, 200, message, FONT_SIZE_MEDIUM);
    renderer.render();
}
```

### Phase 2: Boot Flow Modification

#### 2.1 Detect Wake Cause in `setup()`

**File:** `src/main.cpp`

```cpp
#include "esp_sleep.h"
#include "activities/CalendarActivity.h"

void setup() {
    // ... existing initialization ...

    // After settings are loaded, check wake cause
    esp_sleep_wakeup_cause_t wakeupCause = esp_sleep_get_wakeup_cause();

    if (wakeupCause == ESP_SLEEP_WAKEUP_TIMER && SETTINGS.calendarModeEnabled) {
        // Timer wake + calendar mode enabled → Calendar flow
        enterNewActivity(new CalendarActivity(gfxRenderer, mappedInput));
        return;  // Skip normal boot flow
    }

    // GPIO wake (power button) or first boot → Normal flow
    // ... existing BootActivity → HomeActivity flow ...
}
```

### Phase 3: Settings UI

#### 3.1 Add Calendar Settings Menu

**File:** `src/activities/SettingsActivity.cpp`

Add new settings category for Calendar Mode:

```cpp
// In buildSettingsMenu()
settingsMenu.push_back({
    "Calendar Mode",
    SETTING_TYPE::SUBMENU,
    nullptr,
    {
        {"Enabled", SETTING_TYPE::BOOL, &SETTINGS.calendarModeEnabled},
        {"Refresh Hours", SETTING_TYPE::NUMBER, &SETTINGS.calendarRefreshHours, 1, 24},
        {"Server URL", SETTING_TYPE::TEXT, SETTINGS.calendarServerUrl, 256},
        {"Test Now", SETTING_TYPE::ACTION, testCalendarMode},
    }
});
```

### Phase 4: Fallback & Error Handling

#### 4.1 Graceful Degradation

| Scenario | Behavior |
|----------|----------|
| WiFi fails to connect | Use cached `/sleep.bmp` if exists, schedule retry |
| HTTP fetch fails | Use cached `/sleep.bmp` if exists |
| No cached image | Show "No calendar data" message |
| Server returns error | Log error, use cached image |
| First boot with calendar mode | Prompt user to configure URL in settings |

#### 4.2 Status Indicator (Optional)

Show small status in corner of sleep screen:
- `✓ 14:32` - Last successful update time
- `⚠ 14:32` - Using cached image (fetch failed)
- `✗ No data` - No image available

---

## File Changes Summary

| File | Change Type | Description |
|------|-------------|-------------|
| `src/settings/CrossPointSettings.h` | Modify | Add calendar settings fields |
| `src/settings/CrossPointSettings.cpp` | Modify | Serialize new settings |
| `src/activities/CalendarActivity.h` | **New** | Calendar mode activity header |
| `src/activities/CalendarActivity.cpp` | **New** | Calendar mode implementation |
| `src/activities/SettingsActivity.cpp` | Modify | Add calendar settings UI |
| `src/main.cpp` | Modify | Wake cause detection, calendar boot path |

---

## Configuration

### Device Settings (via CrossPoint UI)

1. Navigate to **Settings → Calendar Mode**
2. Configure:
   - **Enabled**: On
   - **Refresh Hours**: 4 (or desired interval)
   - **Server URL**: `http://192.168.1.100:8080/calendar.bmp`
3. Ensure WiFi credentials are saved (via File Upload screen)

### Server Requirements

The server must:
- Serve a BMP image at the configured URL
- BMP format: 800x480 (or device resolution), 1-bit or grayscale
- Respond within 30 seconds
- Be reachable from device's WiFi network

---

## Build Instructions

```bash
cd firmware/crosspoint-reader

# Install PlatformIO if needed
pip install platformio

# Build firmware
pio run

# Flash to device (connect via USB-C)
pio run --target upload
```

---

## Testing Checklist

- [ ] Settings persist across reboots
- [ ] Timer wake triggers CalendarActivity
- [ ] Power button wake triggers normal HomeActivity
- [ ] WiFi connects using saved credentials
- [ ] HTTP fetch downloads image successfully
- [ ] Image displays correctly as sleep screen
- [ ] Device returns to deep sleep after update
- [ ] Graceful handling when WiFi unavailable
- [ ] Graceful handling when server unavailable
- [ ] Battery consumption within expected range

---

## Power Budget

| Phase | Duration | Current | Energy |
|-------|----------|---------|--------|
| Wake + init | 1s | 50 mA | 0.014 mAh |
| WiFi connect | 5s | 150 mA | 0.21 mAh |
| HTTP fetch | 5s | 180 mA | 0.25 mAh |
| E-ink render | 2s | 20 mA | 0.01 mAh |
| **Total/cycle** | ~13s | - | **~0.5 mAh** |
| Deep sleep (4hr) | 4hr | 10 µA | 0.04 mAh |

**Daily (6 cycles):** ~3 mAh → **~6 months on 500mAh battery**

---

## Future Enhancements

1. **Multiple image rotation** - Download several images, rotate through them
2. **Partial refresh** - Only update changed regions for faster updates
3. **Status endpoint** - Device reports battery level, last update to server
4. **Push notifications** - Server triggers immediate refresh via wake-on-LAN
5. **Weather overlay** - Fetch weather data separately, composite on device
