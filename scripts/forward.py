import json
import asyncio
import websockets
import time
import pandas as pd

# ============================================================
# CONFIGURATION
# ============================================================
SLEEP_TIME = 0.01
WS_PORT = 8765
REMOTE_WS_URL = "wss://nonincorporative-eun-irrefutably.ngrok-free.dev/stream"
MODE = "remote"  # Options: "remote" or "test"

import os
print(os.listdir())
CSV_PATH = "scripts/logs/lorenz_sample_output.csv"

data_buffer = []


# ============================================================
# REMOTE WEBSOCKET CLIENT
# ============================================================
async def remote_ws_client():
    """Fetch JSON data from remote WebSocket and put into local buffer."""
    print(f"\n{'='*60}")
    print(f"🌐 CONNECTING TO REMOTE WEBSOCKET SOURCE")
    print(f"{'='*60}")
    print(f"URL: {REMOTE_WS_URL}")
    print(f"{'='*60}\n")

    while True:
        try:
            print(f"🔌 Attempting connection to {REMOTE_WS_URL} ...")
            async with websockets.connect(REMOTE_WS_URL) as ws:
                print("✅ Connected to remote WebSocket!")
                packet_count = 0

                async for msg in ws:
                    packet_count += 1
                    try:
                        data = json.loads(msg)
                    except Exception as e:
                        print(f"⚠️ JSON parse error: {e}")
                        continue

                    if not isinstance(data, list):
                        print("⚠️ Unexpected data format (expected list of {x,y,z})")
                        continue

                    print(f"\n📦 Remote packet #{packet_count}")
                    print(f"   Samples: {len(data)}")
                    if len(data) > 0:
                        print(f"   First sample: {data[0]}")

                    # Keep latest only
                    if len(data_buffer) > 1:
                        data_buffer.pop(0)
                    data_buffer.append(data)

        except websockets.exceptions.WebSocketException as e:
            print(f"❌ WebSocket error: {e}")
            print("🔄 Reconnecting in 5 seconds...")
            await asyncio.sleep(5)
        except Exception as e:
            print(f"❌ Unexpected error: {e}")
            print("🔄 Reconnecting in 5 seconds...")
            await asyncio.sleep(5)


# ============================================================
# TEST MODE DATA FEEDER
# ============================================================
async def test_data_feeder():
    """Simulate data feed from CSV for testing."""
    print(f"\n{'='*60}")
    print(f"🧪 RUNNING IN TEST MODE (CSV SIMULATION)")
    print(f"{'='*60}")
    print(f"Reading CSV from: {CSV_PATH}\n")

    df = pd.read_csv(CSV_PATH)
    samples = df[["x", "y", "z"]].to_dict(orient="records")

    while True:
        for sample in samples:
            # mimic a list of one or more samples per packet
            packet = [sample]
            if len(data_buffer) > 1:
                data_buffer.pop(0)
            data_buffer.append(packet)
            await asyncio.sleep(SLEEP_TIME)  # pacing


# ============================================================
# LOCAL WEBSOCKET SERVER
# ============================================================
async def websocket_server(websocket):
    client_addr = websocket.remote_address
    print(f"✅ Local client connected: {client_addr}")
    try:
        while True:
            if data_buffer:
                latest = data_buffer[-1]
                message = {"samples": latest, "timestamp": time.time()}
                await websocket.send(json.dumps(message))
            await asyncio.sleep(SLEEP_TIME)
    except websockets.exceptions.ConnectionClosed:
        print(f"❌ Local client disconnected: {client_addr}")


async def start_local_websocket_server():
    print(f"\n{'='*60}")
    print(f"🖥️  STARTING LOCAL WEBSOCKET SERVER")
    print(f"{'='*60}")
    print(f"Address: ws://0.0.0.0:{WS_PORT}")
    print(f"{'='*60}\n")
    async with websockets.serve(websocket_server, "0.0.0.0", WS_PORT):
        await asyncio.Future()  # run forever


# ============================================================
# MAIN
# ============================================================
async def main_async():
    """Run selected mode and local WebSocket server concurrently."""
    if MODE == "remote":
        await asyncio.gather(remote_ws_client(), start_local_websocket_server())
    elif MODE == "test":
        await asyncio.gather(test_data_feeder(), start_local_websocket_server())
    else:
        print(f"❌ Invalid MODE: {MODE}")


def main():
    print("\n" + "=" * 60)
    print("🚀 FORWARD.PY STARTING")
    print("=" * 60)
    print(f"Mode: {MODE.upper()}")

    asyncio.run(main_async())


if __name__ == "__main__":
    main()
