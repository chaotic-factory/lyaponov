import asyncio, websockets, json, time, random


async def fake_device():
    uri = "ws://localhost:8000/ws/ingest/CHAOS-ESP32-01"
    async with websockets.connect(uri) as ws:
        while True:
            payload = {
                "ts": time.time(),
                "ch": [random.randint(950, 1050), random.randint(900, 1100)],
                "fs": 20000,
            }
            await ws.send(json.dumps(payload))
            await asyncio.sleep(0.05)  # 20 Hz


asyncio.run(fake_device())
