import asyncio
import websockets
import threading
import json
import socket
import struct
import numpy as np

SLEEP_TIME = 0.1
UDP_IP = "0.0.0.0"
UDP_PORT = 5005
NUM_SAMPLES = 1000
NUM_CHANNELS = 3
WS_PORT = 8765

data_buffer = []


def udp_listener():
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.bind((UDP_IP, UDP_PORT))
    print(f"Listening for UDP on {UDP_IP}:{UDP_PORT}")

    while True:
        try:
            raw_data, addr = sock.recvfrom(NUM_SAMPLES * NUM_CHANNELS * 2)
            samples = struct.unpack(f"<{NUM_SAMPLES * NUM_CHANNELS}H", raw_data)
            samples = np.array(samples).reshape(NUM_SAMPLES, NUM_CHANNELS)

            json_data = {
                "source": addr[0],
                "samples": samples.tolist(),
            }
            if len(data_buffer) > 1:
                data_buffer.pop(0)
            data_buffer.append(json_data)
            print(json_data)
        except Exception as e:
            print("Error:", e)


async def websocket_server(websocket):
    print("Client connected")
    try:
        while True:
            if data_buffer:
                latest = data_buffer[-1]
                await websocket.send(json.dumps(latest))
            await asyncio.sleep(SLEEP_TIME)
    except websockets.exceptions.ConnectionClosed:
        print("Client disconnected")


async def start_websocket():
    print(f"Starting WebSocket server on ws://0.0.0.0:{WS_PORT}")
    async with websockets.serve(websocket_server, "0.0.0.0", WS_PORT):
        await asyncio.Future()  # run forever


def main():
    threading.Thread(target=udp_listener, daemon=True).start()
    asyncio.run(start_websocket())


if __name__ == "__main__":
    main()
