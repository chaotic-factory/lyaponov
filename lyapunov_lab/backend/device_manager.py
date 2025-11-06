import asyncio, subprocess, sys, json, time
from pathlib import Path
from typing import Dict, Optional
import serial.tools.list_ports

class TaskStore:
    def __init__(self):
        self._tasks: Dict[str, Dict] = {}
    def create(self, kind: str):
        tid = f"{int(time.time()*1000)}"
        self._tasks[tid] = {"id": tid, "kind": kind, "status": "queued", "log": []}
        return tid
    def update(self, tid: str, status: str, line: Optional[str] = None):
        if tid in self._tasks:
            self._tasks[tid]["status"] = status
            if line: self._tasks[tid]["log"].append(line)
    def get(self, tid: str):
        return self._tasks.get(tid, None)

TASKS = TaskStore()

def list_serial_devices():
    devs = []
    for p in serial.tools.list_ports.comports():
        devs.append({
            "port": p.device,
            "desc": p.description,
            "vid": p.vid, "pid": p.pid,
            "hwid": p.hwid
        })
    return devs

async def flash_esp32(port: str, baud: int, firmware_path: str, tid: str):
    TASKS.update(tid, "running", f"Flashing ESP32 on {port}...")
    cmd = [sys.executable, "-m", "esptool", "--chip", "esp32s3", "--port", port, "--baud", str(baud), "write_flash", "-e", "0x0000", firmware_path]
    proc = await asyncio.create_subprocess_exec(*cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT)
    async for line in proc.stdout:
        TASKS.update(tid, "running", line.decode().rstrip())
    rc = await proc.wait()
    TASKS.update(tid, "done" if rc==0 else "error", f"Return code: {rc}")

async def flash_stm32_dfu(firmware_path: str, tid: str):
    TASKS.update(tid, "running", "Flashing STM32 via dfu-util...")
    cmd = ["dfu-util", "-a", "0", "-s", "0x08000000:leave", "-D", firmware_path]
    proc = await asyncio.create_subprocess_exec(*cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT)
    async for line in proc.stdout:
        TASKS.update(tid, "running", line.decode().rstrip())
    rc = await proc.wait()
    TASKS.update(tid, "done" if rc==0 else "error", f"Return code: {rc}")