"use client";
import React, { useState, useEffect, useRef } from "react";

function App() {
  const [devices, setDevices] = useState<any[]>([]);
  const [selectedPort, setSelectedPort] = useState("");
  const [flashTarget, setFlashTarget] = useState("esp32");
  const [baud, setBaud] = useState(921600);
  const [flashStatus, setFlashStatus] = useState("");
  const [deviceId, setDeviceId] = useState("");
  const [streamData, setStreamData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  // Fetch devices
  const fetchDevices = async () => {
    setLoading(true);
    try {
      const resp = await fetch("/api/devices");
      const data = await resp.json();
      setDevices(data.serial || []);
      if (data.serial && data.serial.length > 0)
        setSelectedPort(data.serial[0].port);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  // Flash firmware
  const handleFlash = async (evt: React.FormEvent<HTMLFormElement>) => {
    evt.preventDefault();
    const firmware = (evt.target as HTMLFormElement).firmware.files[0];
    if (!firmware) return alert("Please select a firmware file first.");

    const form = new FormData();
    form.append("target", flashTarget);
    form.append("port", selectedPort);
    form.append("baud", baud.toString());
    form.append("firmware", firmware);

    setFlashStatus("⚡ Flashing in progress...");
    const resp = await fetch("/api/flash", { method: "POST", body: form });
    const data = await resp.json();

    if (data.task_id) {
      let done = false;
      for (let i = 0; i < 60 && !done; i++) {
        const tResp = await fetch(`/api/tasks/${data.task_id}`);
        const tData = await tResp.json();
        setFlashStatus(`${tData.status}\n${(tData.log || []).join("\n")}`);
        if (tData.status === "done" || tData.status === "error") done = true;
        await new Promise((r) => setTimeout(r, 1000));
      }
    } else {
      setFlashStatus("❌ Error: " + (data.error || "Unknown"));
    }
  };

  // Handle live stream
  const handleStream = () => {
    if (!deviceId) return alert("Enter a device ID first.");
    if (wsRef.current) wsRef.current.close();
    wsRef.current = new WebSocket(
      `ws://${window.location.host}/ws/stream/${deviceId}`
    );
    wsRef.current.onmessage = (evt) => {
      try {
        const data = JSON.parse(evt.data);
        setStreamData(data.ch || []);
      } catch {}
    };
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-sans p-6">
      <div className="max-w-4xl mx-auto space-y-8">
        <header className="text-center">
          <h1 className="text-3xl font-bold text-indigo-700">
            Chaos Analyzer Dashboard
          </h1>
          <p className="text-gray-500 mt-1">
            Manage device firmware and monitor real-time data
          </p>
        </header>

        <section className="bg-white rounded-2xl shadow p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">Connected Devices</h2>
            <button
              onClick={fetchDevices}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition"
            >
              {loading ? "Refreshing..." : "Refresh"}
            </button>
          </div>
          <ul className="divide-y divide-gray-200">
            {devices.length === 0 && !loading && (
              <li className="py-2 text-gray-500">No devices detected</li>
            )}
            {devices.map((d) => (
              <li key={d.port} className="py-2 flex justify-between">
                <span>{d.port}</span>
                <span className="text-gray-500 text-sm">{d.desc}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="bg-white rounded-2xl shadow p-6 space-y-4">
          <h2 className="text-xl font-semibold">Flash Firmware</h2>
          <form onSubmit={handleFlash} className="grid gap-4 md:grid-cols-2">
            <label className="flex flex-col">
              <span className="font-medium">Target</span>
              <select
                value={flashTarget}
                onChange={(e) => setFlashTarget(e.target.value)}
                className="mt-1 border rounded-lg p-2"
              >
                <option value="esp32">ESP32</option>
                <option value="stm32">STM32</option>
              </select>
            </label>

            <label className="flex flex-col">
              <span className="font-medium">Serial Port</span>
              <select
                value={selectedPort}
                onChange={(e) => setSelectedPort(e.target.value)}
                className="mt-1 border rounded-lg p-2"
              >
                {devices.map((d) => (
                  <option key={d.port} value={d.port}>
                    {d.port}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col">
              <span className="font-medium">Baud Rate</span>
              <input
                type="number"
                value={baud}
                onChange={(e) => setBaud(Number(e.target.value))}
                className="mt-1 border rounded-lg p-2"
              />
            </label>

            <label className="flex flex-col">
              <span className="font-medium">Firmware File</span>
              <input
                type="file"
                name="firmware"
                className="mt-1 border rounded-lg p-2"
              />
            </label>

            <div className="col-span-2 flex justify-end">
              <button
                type="submit"
                className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition"
              >
                Flash
              </button>
            </div>
          </form>
          <pre className="bg-gray-100 rounded-lg p-3 text-sm whitespace-pre-wrap">
            {flashStatus}
          </pre>
        </section>

        <section className="bg-white rounded-2xl shadow p-6 space-y-4">
          <h2 className="text-xl font-semibold">Live Stream</h2>
          <div className="flex flex-col md:flex-row gap-4">
            <input
              value={deviceId}
              onChange={(e) => setDeviceId(e.target.value)}
              placeholder="Enter Device ID"
              className="flex-1 border rounded-lg p-2"
            />
            <button
              onClick={handleStream}
              className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition"
            >
              Start Stream
            </button>
          </div>
          <div className="bg-gray-100 rounded-lg p-3 overflow-auto max-h-64">
            <h3 className="font-medium text-gray-700 mb-2">Channel Data</h3>
            <pre className="text-sm">{JSON.stringify(streamData, null, 2)}</pre>
          </div>
        </section>
      </div>
    </div>
  );
}

export default App;

// "use client";

// // @ts-nocheck
// import React, { useState, useEffect, useRef } from "react";

// function App() {
//   const [devices, setDevices] = useState([]);
//   const [selectedPort, setSelectedPort] = useState("");
//   const [flashTarget, setFlashTarget] = useState("esp32");
//   const [baud, setBaud] = useState(921600);
//   const [flashStatus, setFlashStatus] = useState("");
//   const [deviceId, setDeviceId] = useState("");
//   const [streamData, setStreamData] = useState([]);
//   const [loading, setLoading] = useState(false);
//   const wsRef = useRef(null);

//   // Fetch devices
//   const fetchDevices = async () => {
//     setLoading(true);
//     try {
//       const resp = await fetch("/api/devices");
//       const data = await resp.json();
//       setDevices(data.serial || []);
//       if (data.serial && data.serial.length > 0)
//         setSelectedPort(data.serial[0].port);
//     } catch (err) {
//       console.error(err);
//     }
//     setLoading(false);
//   };

//   // Flash firmware
//   const handleFlash = async (evt) => {
//     evt.preventDefault();
//     const firmware = evt.target.firmware.files[0];
//     if (!firmware) return alert("Please select a firmware file first.");

//     const form = new FormData();
//     form.append("target", flashTarget);
//     form.append("port", selectedPort);
//     form.append("baud", baud);
//     form.append("firmware", firmware);

//     setFlashStatus("⚡ Flashing in progress...");
//     const resp = await fetch("/api/flash", { method: "POST", body: form });
//     const data = await resp.json();

//     if (data.task_id) {
//       let done = false;
//       for (let i = 0; i < 60 && !done; i++) {
//         const tResp = await fetch(`/api/tasks/${data.task_id}`);
//         const tData = await tResp.json();
//         setFlashStatus(`${tData.status}\n${(tData.log || []).join("\n")}`);
//         if (tData.status === "done" || tData.status === "error") done = true;
//         await new Promise((r) => setTimeout(r, 1000));
//       }
//     } else {
//       setFlashStatus("❌ Error: " + (data.error || "Unknown"));
//     }
//   };

//   // Handle live stream
//   const handleStream = () => {
//     if (!deviceId) return alert("Enter a device ID first.");
//     if (wsRef.current) wsRef.current.close();
//     wsRef.current = new WebSocket(
//       `ws://${window.location.host}/ws/stream/${deviceId}`
//     );
//     wsRef.current.onmessage = (evt) => {
//       try {
//         const data = JSON.parse(evt.data);
//         setStreamData(data.ch || []);
//       } catch {}
//     };
//   };

//   return (
//     <div className="min-h-screen bg-gray-50 text-gray-900 font-sans p-6">
//       <div className="max-w-4xl mx-auto space-y-8">
//         <header className="text-center">
//           <h1 className="text-3xl font-bold text-indigo-700">
//             Chaos Analyzer Dashboard
//           </h1>
//           <p className="text-gray-500 mt-1">
//             Manage device firmware and monitor real-time data
//           </p>
//         </header>

//         <section className="bg-white rounded-2xl shadow p-6">
//           <div className="flex justify-between items-center mb-4">
//             <h2 className="text-xl font-semibold">Connected Devices</h2>
//             <button
//               onClick={fetchDevices}
//               className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition"
//             >
//               {loading ? "Refreshing..." : "Refresh"}
//             </button>
//           </div>
//           <ul className="divide-y divide-gray-200">
//             {devices.length === 0 && !loading && (
//               <li className="py-2 text-gray-500">No devices detected</li>
//             )}
//             {devices.map((d) => (
//               <li key={d.port} className="py-2 flex justify-between">
//                 <span>{d.port}</span>
//                 <span className="text-gray-500 text-sm">{d.desc}</span>
//               </li>
//             ))}
//           </ul>
//         </section>

//         <section className="bg-white rounded-2xl shadow p-6 space-y-4">
//           <h2 className="text-xl font-semibold">Flash Firmware</h2>
//           <form onSubmit={handleFlash} className="grid gap-4 md:grid-cols-2">
//             <label className="flex flex-col">
//               <span className="font-medium">Target</span>
//               <select
//                 value={flashTarget}
//                 onChange={(e) => setFlashTarget(e.target.value)}
//                 className="mt-1 border rounded-lg p-2"
//               >
//                 <option value="esp32">ESP32</option>
//                 <option value="stm32">STM32</option>
//               </select>
//             </label>

//             <label className="flex flex-col">
//               <span className="font-medium">Serial Port</span>
//               <select
//                 value={selectedPort}
//                 onChange={(e) => setSelectedPort(e.target.value)}
//                 className="mt-1 border rounded-lg p-2"
//               >
//                 {devices.map((d) => (
//                   <option key={d.port} value={d.port}>
//                     {d.port}
//                   </option>
//                 ))}
//               </select>
//             </label>

//             <label className="flex flex-col">
//               <span className="font-medium">Baud Rate</span>
//               <input
//                 type="number"
//                 value={baud}
//                 onChange={(e) => setBaud(e.target.value)}
//                 className="mt-1 border rounded-lg p-2"
//               />
//             </label>

//             <label className="flex flex-col">
//               <span className="font-medium">Firmware File</span>
//               <input
//                 type="file"
//                 name="firmware"
//                 className="mt-1 border rounded-lg p-2"
//               />
//             </label>

//             <div className="col-span-2 flex justify-end">
//               <button
//                 type="submit"
//                 className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition"
//               >
//                 Flash
//               </button>
//             </div>
//           </form>
//           <pre className="bg-gray-100 rounded-lg p-3 text-sm whitespace-pre-wrap">
//             {flashStatus}
//           </pre>
//         </section>

//         <section className="bg-white rounded-2xl shadow p-6 space-y-4">
//           <h2 className="text-xl font-semibold">Live Stream</h2>
//           <div className="flex flex-col md:flex-row gap-4">
//             <input
//               value={deviceId}
//               onChange={(e) => setDeviceId(e.target.value)}
//               placeholder="Enter Device ID"
//               className="flex-1 border rounded-lg p-2"
//             />
//             <button
//               onClick={handleStream}
//               className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition"
//             >
//               Start Stream
//             </button>
//           </div>
//           <div className="bg-gray-100 rounded-lg p-3 overflow-auto max-h-64">
//             <h3 className="font-medium text-gray-700 mb-2">Channel Data</h3>
//             <pre className="text-sm">{JSON.stringify(streamData, null, 2)}</pre>
//           </div>
//         </section>
//       </div>
//     </div>
//   );
// }

// export default App;
