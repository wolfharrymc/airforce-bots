const WebSocket = require("ws");
const net = require("net");

// CONFIGURATION
const REMOTE_URL = "wss://wolfharrymc-airforce-bots.hf.space/proxy";
const LOCAL_PORT = 25565;

console.log(`🚀 STARTING ZERO-LOSS TUNNEL...`);
console.log(`🔗 REMOTE: ${REMOTE_URL}`);
console.log(`🏠 LOCAL: localhost:${LOCAL_PORT}`);

const server = net.createServer((localSocket) => {
    console.log("🔌 LOCAL CLIENT CONNECTED");
    
    const ws = new WebSocket(REMOTE_URL);
    let remoteReady = false;
    let localQueue = [];

    ws.on('open', () => {
        // Step 1: Send configuration immediately
        ws.send(JSON.stringify({ host: 'eternel.eu', port: 25565 }));
    });

    ws.on('message', (data) => {
        try {
            const msg = JSON.parse(data.toString());
            if (msg.type === 'connected') {
                console.log("✅ TUNNEL ESTABLISHED TO ETERNEL.EU");
                remoteReady = true;
                // Send queued data from Minecraft client
                while (localQueue.length > 0) {
                    ws.send(localQueue.shift());
                }
                return;
            }
        } catch (e) {
            // Raw binary from server -> Minecraft client
            if (localSocket.writable) localSocket.write(data);
        }
    });

    localSocket.on('data', (data) => {
        if (remoteReady && ws.readyState === WebSocket.OPEN) {
            ws.send(data);
        } else {
            localQueue.push(data);
        }
    });

    ws.on('close', () => {
        console.log("🏁 REMOTE CONNECTION CLOSED");
        localSocket.end();
    });

    localSocket.on('end', () => {
        console.log("🔌 LOCAL CLIENT DISCONNECTED");
        ws.close();
    });

    ws.on('error', (err) => console.error("❌ WS ERROR:", err.message));
    localSocket.on('error', (err) => console.error("❌ LOCAL ERROR:", err.message));
});

server.listen(LOCAL_PORT, () => {
    console.log(`\n✨ READY! JOIN AT: localhost:${LOCAL_PORT}\n`);
});
