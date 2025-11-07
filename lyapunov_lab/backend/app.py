import asyncio
import json
import time
from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os

app = FastAPI(
    title="Lyapunov Backend",
    description="APIs and streaming endpoints.",
    version="0.2.0",
    docs_url="/api/docs",
    redoc_url=None,
    openapi_url="/api/openapi.json",
)

# ============================================================
# CONFIGURATION
# ============================================================
UDP_IP = "0.0.0.0"
UDP_PORT = 5005
SLEEP_TIME = 0.01

# buffer and websocket clients
data_buffer = []
clients = set()

# ============================================================
# CORS
# ============================================================
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # adjust for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================
# UDP SERVER PROTOCOL
# ============================================================
class UDPServerProtocol:
    def connection_made(self, transport):
        self.transport = transport
        print(f"Listening for UDP packets on {UDP_IP}:{UDP_PORT}")

    def datagram_received(self, data, addr):
        try:
            msg = data.decode().strip()
            parsed = json.loads(msg)
        except Exception as e:
            print(f"Invalid UDP packet from {addr}: {e}")
            return

        # expected format: list of {x,y,z} objects
        if not isinstance(parsed, list):
            print(f"Unexpected data format from {addr}: {parsed}")
            return

        # keep only latest
        if len(data_buffer) > 1:
            data_buffer.pop(0)
        data_buffer.append(parsed)


# ============================================================
# FASTAPI STARTUP EVENT
# ============================================================
@app.on_event("startup")
async def start_udp_listener():
    loop = asyncio.get_running_loop()
    await loop.create_datagram_endpoint(
        lambda: UDPServerProtocol(),
        local_addr=(UDP_IP, UDP_PORT),
    )
    print(f"UDP listener started on {UDP_IP}:{UDP_PORT}")


# ============================================================
# WEBSOCKET STREAM ENDPOINT
# ============================================================
@app.websocket("/api/stream")
async def websocket_stream(websocket: WebSocket):
    await websocket.accept()
    clients.add(websocket)
    print(f"WebSocket client connected ({len(clients)} total)")

    try:
        while True:
            if data_buffer:
                latest = data_buffer[-1]
                message = {"samples": latest, "timestamp": time.time()}
                await websocket.send_text(json.dumps(message))
            await asyncio.sleep(SLEEP_TIME)
    except Exception:
        print("WebSocket client disconnected")
    finally:
        clients.discard(websocket)


# ============================================================
# HEALTH CHECK
# ============================================================
@app.get("/api/health")
def health():
    return {"status": "ok"}


# ============================================================
# STATIC FRONTEND
# ============================================================
frontend_path = os.path.join(os.path.dirname(__file__), "..", "frontend", "out")
if os.path.exists(frontend_path):
    app.mount("/", StaticFiles(directory=frontend_path, html=True), name="static")
