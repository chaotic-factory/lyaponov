# lyapunov

### How to Build & Run\*\*

```bash
 setup.py sdist bdist_wheel
```

1. **Install frontend dependencies & build:**

   ```sh
   cd lyapunov/frontend
   pnpm install
   pnpm run build
   ```

   (This puts built files in `dist/`.)

2. **Install Python package:**

   ```sh
   pip install .
   ```

3. **Run:**
   ```sh
   lyapunov --port 3000
   ```
   (Backend serves frontend at `/`, API at `/api/*`, WebSockets at `/ws/*`.), api docs at `/api/docs`

---

### 6. **Device Streaming Example (ESP32 Arduino)**

```cpp
// ESP32 Arduino pseudocode
#include <WiFi.h>
#include <WebSocketsClient.h>

WebSocketsClient ws;

void setup() {
  WiFi.begin("SSID", "PASS");
  while (WiFi.status() != WL_CONNECTED) delay(500);
  ws.begin("backend_ip", 3000, "/ws/ingest/CHAOS-ESP32-01");
}

void loop() {
  int ch[2] = {analogRead(0), analogRead(1)};
  String payload = "{\"ts\": " + String(millis()/1000.0) + ", \"ch\": [" + String(ch[0]) + "," + String(ch[1]) + "], \"fs\": 20000}";
  ws.sendTXT(payload);
  ws.loop();
  delay(50);
}
```

---

### Patching and Releases

```
bump2version patch # → 0.2.2
bump2version minor # → 0.3.0
bump2version major # → 1.0.0
```

## **Summary**

- Just run `lyapunov --port 3000`: backend + frontend, ready for device streaming.
- Frontend served by backend (no need for a separate Node server in prod).
- Devices stream JSON over WebSocket, frontend displays live data.
- Flashing, device discovery, and streaming all included.

**Ask for any extension: graphs, auth, advanced UI, STM32 code, etc!**
