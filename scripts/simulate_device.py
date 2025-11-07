import asyncio
import json
import socket
import pandas as pd

# ============================================================
# CONFIGURATION
# ============================================================
UDP_IP = "127.0.0.1"  # Change if FastAPI runs elsewhere
UDP_PORT = 5005
CSV_PATH = "scripts/logs/lorenz_sample_output.csv"
SEND_INTERVAL = 0.01  # seconds between packets


# ============================================================
# MAIN
# ============================================================
async def main():
    print(f"📡 Sending UDP packets to {UDP_IP}:{UDP_PORT}")
    print(f"📄 Loading data from: {CSV_PATH}")

    try:
        df = pd.read_csv(CSV_PATH)
    except Exception as e:
        print(f"❌ Could not load CSV: {e}")
        return

    if not {"x", "y", "z"}.issubset(df.columns):
        print(f"❌ CSV must contain columns: x, y, z (found {df.columns})")
        return

    samples = df[["x", "y", "z"]].to_dict(orient="records")

    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    packet_count = 0

    print(f"✅ Loaded {len(samples)} samples. Starting UDP transmission...\n")

    while True:
        for i in range(0, len(samples), 5):  # send 5 samples per packet
            chunk = samples[i : i + 5]
            message = json.dumps(chunk).encode("utf-8")
            sock.sendto(message, (UDP_IP, UDP_PORT))
            packet_count += 1

            print(f"📦 Sent packet #{packet_count}: {chunk[0]} (+{len(chunk)-1} more)")
            await asyncio.sleep(SEND_INTERVAL)


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n🛑 Stopped UDP streaming.")
