from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Form, UploadFile
from fastapi.staticfiles import StaticFiles
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from .device_manager import list_serial_devices, TASKS, flash_esp32, flash_stm32_dfu
from .streamer import HUB
import asyncio
import os

app = FastAPI(
    title="Lyapunov Backend",
    description="APIs and streaming endpoints.",
    version="0.1.0",
    docs_url="/api/docs",
    redoc_url=None,
    openapi_url="/api/openapi.json",
)

# CORS (adjust for your frontend origin in dev if needed)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten this in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health():
    return {"hello": "world"}


@app.get("/api/devices")
def get_devices():
    return {"serial": list_serial_devices()}


@app.post("/api/flash")
async def flash(
    target: str = Form(...),
    firmware: UploadFile = None,
    port: str = Form(None),
    baud: int = Form(921600),
):
    blob = await firmware.read()
    path = f"/tmp/{firmware.filename}"
    with open(path, "wb") as f:
        f.write(blob)
    tid = TASKS.create(kind=f"flash:{target}")
    if target == "esp32":
        if not port:
            return {"error": "port required for esp32"}
        asyncio.create_task(flash_esp32(port, baud, path, tid))
    elif target == "stm32":
        asyncio.create_task(flash_stm32_dfu(path, tid))
    else:
        return {"error": "unknown target"}
    return {"task_id": tid}


@app.get("/api/tasks/{tid}")
def task_status(tid: str):
    t = TASKS.get(tid)
    if not t:
        return {"error": "not found"}
    return t


@app.websocket("/ws/ingest/{device_id}")
async def ingest(device_id: str, ws: WebSocket):
    await ws.accept()
    try:
        while True:
            raw = await ws.receive_text()
            await HUB.send(device_id, raw)
    except WebSocketDisconnect:
        pass


@app.websocket("/ws/stream/{device_id}")
async def stream(device_id: str, ws: WebSocket):
    await ws.accept()
    q = asyncio.Queue()
    HUB.join(device_id, q)
    try:
        while True:
            msg = await q.get()
            await ws.send_text(msg)
    except WebSocketDisconnect:
        pass
    finally:
        HUB.leave(device_id, q)


@app.get("/api/sse/stream/{device_id}")
async def sse_stream(device_id: str):
    async def event_gen():
        q = asyncio.Queue()
        HUB.join(device_id, q)
        try:
            while True:
                msg = await q.get()
                yield f"data: {msg}\n\n"
        finally:
            HUB.leave(device_id, q)

    return StreamingResponse(event_gen(), media_type="text/event-stream")


# --- Mount static files LAST so it doesn't shadow /api/* ---
frontend_path = os.path.join(os.path.dirname(__file__), "..", "frontend", "out")
app.mount("/", StaticFiles(directory=frontend_path, html=True), name="static")
