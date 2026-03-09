const { io } = require("socket.io-client");
const net = require("net");

// CONFIGURATION
const REMOTE_URL = "https://wolfharrymc-airforce-bots.hf.space";
const LOCAL_PORT = 25565;

console.log(`🚀 STARTING PROXY TUNNEL...`);
console.log(`🔗 REMOTE: ${REMOTE_URL}`);
console.log(`🏠 LOCAL: localhost:${LOCAL_PORT}`);

const socket = io(REMOTE_URL);

const server = net.createServer((localSocket) => {
    console.log("🔌 LOCAL CLIENT CONNECTED");
    
    // Tell the remote server we want to connect to Minecraft (25565)
    socket.emit('proxy-connect', { host: 'eternel.eu', port: 25565 });

    localSocket.on('data', (data) => {
        socket.emit('proxy-input', data);
    });

    socket.on('proxy-data', (data) => {
        localSocket.write(data);
    });

    socket.on('proxy-connected', () => {
        console.log("✅ TUNNEL ESTABLISHED TO ETERNEL.EU");
    });

    socket.on('proxy-error', (err) => {
        console.error("❌ PROXY ERROR:", err);
        localSocket.end();
    });

    socket.on('proxy-end', () => {
        console.log("🏁 REMOTE CONNECTION CLOSED");
        localSocket.end();
    });

    localSocket.on('end', () => {
        console.log("🔌 LOCAL CLIENT DISCONNECTED");
        socket.off('proxy-data');
    });
});

server.listen(LOCAL_PORT, () => {
    console.log(`\n✨ READY! JOIN IN MINECRAFT AT: localhost:${LOCAL_PORT}\n`);
});

socket.on("connect", () => {
    console.log("📡 CONNECTED TO HUGGING FACE");
});

socket.on("connect_error", (err) => {
    console.error("❌ CONNECTION FAILED:", err.message);
});
