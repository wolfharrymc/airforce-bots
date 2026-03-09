const WebSocket = require("ws");
const net = require("net");

// CONFIGURATION
const REMOTE_URL = "wss://wolfharrymc-airforce-bots.hf.space/proxy";
const LOCAL_PORT = 25565;

console.log(`🚀 STARTING TURBO PROXY TUNNEL...`);
console.log(`🔗 REMOTE: ${REMOTE_URL}`);
console.log(`🏠 LOCAL: localhost:${LOCAL_PORT}`);

const server = net.createServer((localSocket) => {
    console.log("🔌 LOCAL CLIENT CONNECTED");
    
    const ws = new WebSocket(REMOTE_URL);

    ws.on('open', () => {
        // Tell the remote server we want to connect to the REAL Minecraft host (java.eternel.eu)
        ws.send(JSON.stringify({ host: 'java.eternel.eu', port: 25565 }));
    });

    ws.on('message', (data) => {
        // Check if it's a JSON status message or raw binary
        try {
            const msg = JSON.parse(data.toString());
            if (msg.type === 'connected') {
                console.log("✅ TUNNEL ESTABLISHED TO ETERNEL.EU");
                return;
            }
            if (msg.type === 'error') {
                console.error("❌ REMOTE ERROR:", msg.message);
                localSocket.end();
                return;
            }
        } catch (e) {
            // It's raw binary data (Minecraft packet)
            if (localSocket.writable) localSocket.write(data);
        }
    });

    localSocket.on('data', (data) => {
        if (ws.readyState === WebSocket.OPEN) ws.send(data);
    });

    ws.on('close', () => {
        console.log("🏁 REMOTE CONNECTION CLOSED");
        localSocket.end();
    });

    ws.on('error', (err) => {
        console.error("❌ WS ERROR:", err.message);
        localSocket.end();
    });

    localSocket.on('end', () => {
        console.log("🔌 LOCAL CLIENT DISCONNECTED");
        ws.close();
    });
});

server.listen(LOCAL_PORT, () => {
    console.log(`\n✨ TURBO READY! JOIN IN MINECRAFT AT: localhost:${LOCAL_PORT}\n`);
});
