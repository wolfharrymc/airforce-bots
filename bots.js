const mineflayer = require('mineflayer');
require('dotenv').config();
const { pathfinder, Movements, goals: { GoalFollow, GoalBlock } } = require('mineflayer-pathfinder');
const pvp = require('mineflayer-pvp').plugin;
const autotool = require('mineflayer-tool').plugin;
const collectBlock = require('mineflayer-collectblock').plugin;
const armorManager = require('mineflayer-armor-manager');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { WebSocketServer } = require('ws');
const path = require('path');

const SERVER = 'eternel.eu';
const PORT = 25565;
const PASS = 'testbotwolf';

const BOTS = Array.from({ length: 10 }, (_, i) => `WolfBot${i + 1}`);
const WHITE_LISTED = (process.env.WHITE_LISTED_PLAYERS || '').split(',').map(name => name.trim());

const SAVAGE_REPLIES = [
    (name) => `Listen ${name}, you're so insignificant that even the void wouldn't take you. Stop trying to talk to me.`,
    (name) => `Hey ${name}, I've seen better loot in a zombie's pocket. You're just a waste of server resources.`,
    (name) => `I'd follow you, ${name}, but I don't want to catch whatever brain deficiency you're clearly suffering from.`,
    (name) => `You want me to come? How about you go find a high place and test if fall damage is still on, ${name}.`,
    (name) => `Your presence is like a bedrock block, ${name}: annoying, useless, and everyone wishes you weren't here.`,
    (name) => `Error 404: ${name}'s worth not found. Maybe try being less of a disappointment to your spawn point.`,
    (name) => `I'm a bot and even I can feel the secondhand embarrassment from your existence, ${name}.`,
    (name) => `If stupidity was a potion effect, ${name}, you'd be a Level 255 splash bottle. Get lost.`,
    (name) => `I'd call you a 'noob', but that would be an insult to people who are actually trying, ${name}.`,
    (name) => `Are you laggy or is your brain just running on a 1.12.2 server with 0.5 TPS, ${name}?`,
    (name) => `I've seen better pathfinding in a chicken stuck in a hole than in your brain, ${name}.`,
    (name) => `You're like a 'Bane of Arthropods' enchantment, ${name}—completely useless and nobody wants you.`
];

const botList = new Array(BOTS.length).fill(null);
const manualDisconnect = new Array(BOTS.length).fill(false);
const verifiedStatus = new Array(BOTS.length).fill(false);
let alive = 0;
const systemLogs = [];

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));
app.use(express.json());

function addLog(msg, source = 'SYSTEM') {
    const entry = { time: new Date().toLocaleTimeString(), source, msg };
    systemLogs.push(entry);
    if (systemLogs.length > 50) systemLogs.shift();
    console.log(`[${source}] ${msg}`);
    io.emit('log', entry);
}

// Structured Status Broadcast
function broadcastStatus() {
    const status = BOTS.map((name, i) => {
        const bot = botList[i];
        let pos = 'OFFLINE';
        if (bot && bot.isAlive && bot.entity && bot.entity.position) {
            const { x, y, z } = bot.entity.position;
            pos = `X:${Math.floor(x)} Y:${Math.floor(y)} Z:${Math.floor(z)}`;
        }
        
        return {
            name,
            id: i+1,
            alive: !!bot?.isAlive,
            position: pos,
            health: bot?.health || 0,
            food: bot?.food || 0,
            task: bot?.currentTask || (verifiedStatus[i] ? 'IDLE' : 'VERIFYING'),
            isFollowing: !!bot?.pathfinder?.goal,
            manual: manualDisconnect[i]
        };
    });
    io.emit('status', { alive, total: BOTS.length, bots: status });
}

setInterval(broadcastStatus, 1000);

function loginBot(name, id) {
    console.log(`${id}. ${name} connecting (Verified: ${verifiedStatus[id-1]})`);
    
    const bot = mineflayer.createBot({
        host: SERVER,
        port: PORT,
        username: name,
        version: '1.20.1', 
        checkTimeoutInterval: 60000 
    });

    bot.loadPlugin(pathfinder);
    bot.loadPlugin(pvp);
    bot.loadPlugin(autotool);
    bot.loadPlugin(collectBlock);
    bot.loadPlugin(armorManager);
    
    bot.currentTask = verifiedStatus[id-1] ? 'INITIALIZING' : 'VERIFYING_ANTIBOT';
    botList[id-1] = bot;  
    
    bot.on('spawn', () => {
        // If not verified yet, DO NOT MOVE OR DO ANYTHING
        if (!verifiedStatus[id-1]) {
            addLog(`🛡️ ANTIBOT: Standing still for verification...`, name);
            return;
        }

        // Normal activity AFTER verification
        setTimeout(() => {
            if (!bot.isAlive) {
                bot.isAlive = true;
                alive++;
                bot.currentTask = 'IDLE';
                addLog(`✅ UNIT ONLINE`, name);
                
                const movements = new Movements(bot);
                movements.canDig = true;
                movements.allowParkour = true;
                movements.allowSprinting = true;
                movements.allow1by1towers = true;
                movements.canPlaceOn = true;
                movements.climb = true;
                
                bot.on('inventoryUpdate', () => {
                    const scaf = bot.inventory.items().filter(i => i.name.includes('cobble') || i.name.includes('dirt') || i.name.includes('stone') || i.name.includes('wood')).map(i => i.type);
                    if (scaf.length > 0) movements.scafoldingBlocks = scaf;
                });
                
                bot.pathfinder.setMovements(movements);
            }
        }, 3000);
    });

    bot.on('stopped_collecting', () => {
        addLog(`⛏️ COLLECTION_COMPLETE`, name);
    });

    bot.on('attacked_target', () => {
        // Log combat activity occasionally
        // addLog(`⚔️ COMBAT_ENGAGED`, name);
    });

    bot.on('health', () => {
        // Auto-eat logic
        if (bot.food < 15) {
            const food = bot.inventory.items().find(item => item.name.includes('apple') || item.name.includes('bread') || item.name.includes('steak') || item.name.includes('porkchop'));
            if (food) {
                bot.eat(food).catch(() => {});
            }
        }
    });

    bot.on('death', () => {
        if (bot.isAlive) {
            bot.isAlive = false;
            alive = Math.max(0, alive - 1);
        }
        addLog(`💀 UNIT TERMINATED! RE-SPAWNING...`, name);
        bot.respawn();
    });
    
    bot.on('kicked', (reason) => {
        addLog(`🚪 UNIT EJECTED: ${reason}`, name);
    });
    
    bot.on('chat', (username, message) => {
        // Only the first online bot logs global chat to prevent 5x duplicates
        const firstOnlineIndex = botList.findIndex(b => b && b.isAlive);
        if (username !== name && firstOnlineIndex === (id - 1)) {
            addLog(`${username}: ${message}`, 'SERVER');
        }
        
        // Command logic: !tpa and !come
        const chatMsg = message.trim();
        const parts = chatMsg.split(' ');
        const command = parts[0];
        const targetBotName = parts[1];

        if ((command === '!tpa' || command === '!come') && targetBotName === name) {
            if (WHITE_LISTED.includes(username)) {
                if (command === '!tpa') {
                    bot.chat(`/tpahere ${username}`);
                    addLog(`📍 EXECUTING !tpa: /tpahere ${username}`, name);
                } else if (command === '!come') {
                    bot.chat(`/tpa ${username}`);
                    addLog(`📍 EXECUTING !come: /tpa ${username}`, name);
                }
            } else {
                const randomReply = SAVAGE_REPLIES[Math.floor(Math.random() * SAVAGE_REPLIES.length)];
                bot.chat(randomReply(username));
                addLog(`🔥 SAVAGE_REPLY: Roasted ${username}`, name);
            }
        }

        // Auto-login logic (ALL bots should handle their own login)
        const msg = message.toLowerCase();
        if (msg.includes('login') || msg.includes('register') || msg.includes('log in') || msg.includes('password')) {
            setTimeout(() => {
                if (bot.isAlive) {
                    bot.chat(`/login ${PASS}`);
                    addLog(`🔑 AUTO_LOGIN: Sending password...`, name);
                }
            }, 1000);
        }
    });

    bot.on('message', (jsonMsg) => {
        const text = jsonMsg.toString().trim();
        if (!text) return;

        // Log system messages (permissions, login success, errors)
        const firstOnlineIndex = botList.findIndex(b => b && b.isAlive);
        if (firstOnlineIndex === (id - 1)) {
            // Check for common system messages that aren't chat
            const isSystemMsg = !text.includes(':') && !text.includes('<') && !text.includes('>');
            if (isSystemMsg) {
                addLog(text, 'SYSTEM');
            }
        }

        // Auto-login for non-standard message formats
        const lowerText = text.toLowerCase();
        if (lowerText.includes('/login') || lowerText.includes('/register')) {
            if (bot.isAlive) {
                bot.chat(`/login ${PASS}`);
                addLog(`🔑 AUTH_TRIGGER: Sending password...`, name);
            }
        }
    });

    bot.on('entitySpawn', (entity) => {
        if (entity.type === 'player' && entity.username !== name) {
            // Hive mind: only the first bot logs player sightings
            const firstOnlineIndex = botList.findIndex(b => b && b.isAlive);
            if (firstOnlineIndex === (id - 1)) {
                // addLog(`👁️ PLAYER_DETECTED: ${entity.username}`, 'HIVE');
            }
        }
    });

    bot.on('error', (err) => {
        if (err.code === 'ECONNRESET') {
            addLog(`⚠️ CONNECTION RESET (ECONNRESET)`, name);
        } else if (err.message.includes('protocol')) {
            addLog(`❌ PROTOCOL ERR: 1.20.1`, name);
        } else {
            addLog(`❌ ERROR: ${err.message}`, name);
        }
    });
    
    bot.on('end', (reason) => {
        if (bot.isAlive) {
            bot.isAlive = false;
            alive = Math.max(0, alive - 1);
        }
        addLog(`❌ UNIT DISCONNECTED: ${reason}`, name);
        
        // AntiBot Logic: If we get kicked while not verified, assume it's the verification kick
        if (!verifiedStatus[id-1]) {
            addLog(`🛡️ ANTIBOT: Verification kick detected. Marking as verified.`, name);
            verifiedStatus[id-1] = true;
        }

        // Only auto-reconnect if NOT manually disconnected
        if (!manualDisconnect[id-1]) {
            // AntiBot bypass: Staggered reconnection with longer random delay
            // If we just got verified, wait a bit longer before rejoining as "real" bot
            const retryDelay = verifiedStatus[id-1] ? 30000 : (15000 + Math.random() * 15000); 
            setTimeout(() => loginBot(name, id), retryDelay);
        }
    });
}

// SPAWN ALL with delay
BOTS.forEach((name, i) => {
    setTimeout(() => {
        loginBot(name, i + 1);
    }, i * 60000); // 60 second delay between each bot to be extremely safe with AntiBot
});

// 🌐 WEB API
app.get('/health', (req, res) => {
    res.status(200).send('OK');
});

app.get('/status', (req, res) => {
    const status = BOTS.map((name, i) => {
        const bot = botList[i];
        let pos = 'OFFLINE';
        if (bot && bot.isAlive && bot.entity && bot.entity.position) {
            const { x, y, z } = bot.entity.position;
            pos = `X:${Math.floor(x)} Y:${Math.floor(y)} Z:${Math.floor(z)}`;
        }
        
        return {
            name,
            id: i+1,
            alive: !!bot?.isAlive,
            position: pos,
            health: bot?.health || 0,
            food: bot?.food || 0,
            isFollowing: !!bot?.pathfinder?.goal,
            manual: manualDisconnect[i]
        };
    });
    res.json({ alive, total: BOTS.length, bots: status });
});

app.post('/bot/:id/follow', (req, res) => {
    const id = req.params.id;
    const { player, action } = req.body;
    const { goals: { GoalFollow } } = require('mineflayer-pathfinder');

    if (id === 'all') {
        let count = 0;
        botList.forEach((bot, i) => {
            if (bot && bot.isAlive) {
                if (action === 'stop') {
                    bot.pathfinder.setGoal(null);
                } else if (player) {
                    const target = bot.players[player]?.entity;
                    if (target) {
                        count++;
                        bot.pathfinder.setGoal(new GoalFollow(target, 2), true);
                    }
                }
            }
        });
        return res.json({ success: true, count });
    }

    const botId = parseInt(id);
    const bot = botList[botId-1];

    if (!bot || !bot.isAlive) {
        return res.status(400).json({ error: 'Bot offline' });
    }

    if (action === 'stop') {
        bot.pathfinder.setGoal(null);
        return res.json({ success: true });
    }

    if (player) {
        const target = bot.players[player]?.entity;
        if (target) {
            bot.pathfinder.setGoal(new GoalFollow(target, 2), true);
            return res.json({ success: true });
        }
        return res.status(400).json({ error: 'Player not found nearby' });
    }

    res.status(400).json({ error: 'Invalid follow request' });
});

app.post('/bot/:id/control', (req, res) => {
    const id = parseInt(req.params.id);
    const { action } = req.body;
    const bot = botList[id-1];
    const name = BOTS[id-1];

    if (action === 'connect') {
        manualDisconnect[id-1] = false;
        if (!bot || !bot.isAlive) {
            loginBot(name, id);
            return res.json({ success: true, message: 'Connecting...' });
        }
        return res.status(400).json({ error: 'Already connected' });
    }

    if (action === 'disconnect') {
        manualDisconnect[id-1] = true;
        if (bot && bot.isAlive) {
            bot.quit('Manual disconnect');
            return res.json({ success: true, message: 'Disconnecting...' });
        }
        return res.status(400).json({ error: 'Already offline' });
    }

    res.status(400).json({ error: 'Invalid action' });
});

app.post('/bot/:id/move', (req, res) => {
    const id = req.params.id;
    const { direction } = req.body;
    let control = '';
    
    switch(direction) {
        case 'up': control = 'forward'; break;
        case 'down': control = 'back'; break;
        case 'left': control = 'left'; break;
        case 'right': control = 'right'; break;
        case 'jump': control = 'jump'; break;
    }

    if (!control) return res.status(400).json({ error: 'Invalid direction' });

    if (id === 'all') {
        let count = 0;
        botList.forEach(bot => {
            if (bot && bot.isAlive && bot.entity) {
                count++;
                bot.setControlState(control, true);
                setTimeout(() => {
                    bot.setControlState(control, false);
                }, 500);
            }
        });
        return res.json({ success: true, count });
    }

    const botId = parseInt(id);
    const bot = botList[botId-1];

    if (!bot || !bot.isAlive || !bot.entity) {
        return res.status(400).json({ error: 'Bot not ready for movement' });
    }

    bot.setControlState(control, true);
    setTimeout(() => {
        bot.setControlState(control, false);
    }, 500);
    return res.json({ success: true });
});

app.get('/logs', (req, res) => {
    res.json(systemLogs);
});

app.post('/chat/:botId', (req, res) => {
    const { botId } = req.params;
    const { message } = req.body;
    
    const id = parseInt(botId);
    const bot = botList[id-1];
    const botName = BOTS[id-1];
    
    if (bot && bot.isAlive && message) {
        addLog(`CMD EXECUTED: "${message}"`, botName);
        try {
            // Ensure the bot is in a state where it can chat
            if (bot.entity) {
                bot.chat(message);
                res.json({ success: true, bot: botName });
            } else {
                addLog(`⚠️ UNIT NOT FULLY SPAWNED YET`, botName);
                res.status(400).json({ error: 'Unit not fully spawned' });
            }
        } catch (err) {
            addLog(`❌ CHAT FAILED: ${err.message}`, botName);
            res.status(500).json({ error: 'Internal chat error' });
        }
    } else {
        const reason = !bot ? 'Bot not found' : !bot.isAlive ? 'Bot is offline' : 'Message is empty';
        res.status(400).json({ error: reason });
    }
});

app.post('/chat-all', (req, res) => {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: 'Message empty' });

    addLog(`📢 SWARM BROADCAST: "${message}"`, 'SYSTEM');
    
    let count = 0;
    botList.forEach((bot, i) => {
        if (bot && bot.isAlive) {
            count++;
            // Staggering chat to prevent being kicked for spam
            setTimeout(() => {
                try {
                    if (bot.entity) {
                        bot.chat(message);
                    } else {
                        addLog(`⚠️ UNIT NOT READY`, BOTS[i]);
                    }
                } catch (err) {
                    addLog(`❌ FAILED: ${err.message}`, BOTS[i]);
                }
            }, i * 500); // 0.5s gap between bots
        }
    });
    
    res.json({ success: true, count });
});

app.post('/bot/:id/goto', (req, res) => {
    const id = req.params.id;
    const { coords } = req.body;
    const [x, y, z] = coords.split(' ').map(Number);

    if (isNaN(x) || isNaN(y) || isNaN(z)) {
        return res.status(400).json({ error: 'Invalid coordinates' });
    }

    const executeGoto = (bot, name) => {
        addLog(`📍 PATHFINDING: ${x} ${y} ${z}`, name);
        bot.currentTask = `MOVING_TO_${x}_${y}_${z}`;
        bot.pathfinder.setGoal(new GoalBlock(x, y, z));
        return true;
    };

    if (id === 'all') {
        let count = 0;
        botList.forEach((bot, i) => {
            if (bot && bot.isAlive) {
                count++;
                // Stagger pathfinding to avoid bots colliding/blocking each other
                setTimeout(() => {
                    executeGoto(bot, BOTS[i]);
                }, i * 1500); 
            }
        });
        return res.json({ success: true, count });
    }

    const botId = parseInt(id);
    const bot = botList[botId-1];
    if (bot && bot.isAlive) {
        if (executeGoto(bot, BOTS[botId-1])) return res.json({ success: true });
    }
    res.status(400).json({ error: 'Bot offline' });
});

app.post('/bot/:id/attack', (req, res) => {
    const id = req.params.id;
    const { targetName } = req.body;

    const executeAttack = (bot, name) => {
        const target = bot.nearestEntity(e => e.type === 'player' && e.username === targetName);
        if (target) {
            bot.currentTask = `ATTACKING_${targetName}`;
            bot.pvp.attack(target);
            addLog(`⚔️ ENGAGING_TARGET: ${targetName}`, name);
            return true;
        }
        return false;
    };

    if (id === 'all') {
        let count = 0;
        botList.forEach((bot, i) => {
            if (bot && bot.isAlive) {
                if (executeAttack(bot, BOTS[i])) count++;
            }
        });
        return res.json({ success: true, count });
    }

    const botId = parseInt(id);
    const bot = botList[botId-1];
    if (bot && bot.isAlive) {
        if (executeAttack(bot, BOTS[botId-1])) return res.json({ success: true });
        return res.status(404).json({ error: 'Target not found in range' });
    }
    res.status(400).json({ error: 'Bot offline' });
});

app.post('/bot/:id/mine', (req, res) => {
    const id = req.params.id;
    const { blockName } = req.body;
    const mcData = require('minecraft-data')('1.20.1');

    const executeMine = (bot, name) => {
        const blockType = mcData.blocksByName[blockName];
        if (!blockType) return false;
        
        const block = bot.findBlock({
            matching: blockType.id,
            maxDistance: 64
        });

        if (block) {
            bot.currentTask = `MINING_${blockName.toUpperCase()}`;
            addLog(`⛏️ MINING: ${blockName}`, name);
            bot.collectBlock.collect(block).then(() => {
                bot.currentTask = 'IDLE';
            }).catch(err => {
                bot.currentTask = 'IDLE';
                addLog(`❌ MINING_ERR: ${err.message}`, name);
            });
            return true;
        }
        return false;
    };

    if (id === 'all') {
        let count = 0;
        const mcData = require('minecraft-data')('1.20.1');
        const blockType = mcData.blocksByName[blockName];
        if (!blockType) return res.status(400).json({ error: 'Invalid block' });

        // Find all nearby blocks of this type
        const bots = botList.filter(b => b && b.isAlive);
        const blocks = bots[0].findBlocks({
            matching: blockType.id,
            maxDistance: 64,
            count: bots.length
        });

        bots.forEach((bot, i) => {
            if (blocks[i]) {
                count++;
                bot.currentTask = `MINING_${blockName.toUpperCase()}`;
                addLog(`⛏️ SWARM_MINING: ${blockName}`, BOTS[i]);
                bot.collectBlock.collect(bot.blockAt(blocks[i])).then(() => {
                    bot.currentTask = 'IDLE';
                }).catch(() => {
                    bot.currentTask = 'IDLE';
                });
            }
        });
        return res.json({ success: true, count });
    }

    const botId = parseInt(id);
    const bot = botList[botId-1];
    if (bot && bot.isAlive) {
        if (executeMine(bot, BOTS[botId-1])) return res.json({ success: true });
        return res.status(404).json({ error: 'Block not found nearby' });
    }
    res.status(400).json({ error: 'Bot offline' });
});

app.post('/bot/:id/stop', (req, res) => {
    const id = req.params.id;
    
    const stopBot = (bot) => {
        bot.currentTask = 'IDLE';
        bot.pathfinder.setGoal(null);
        bot.pvp.stop();
        if (bot.collectBlock && typeof bot.collectBlock.stop === 'function') {
            bot.collectBlock.stop();
        }
    };

    if (id === 'all') {
        botList.forEach(bot => bot && bot.isAlive && stopBot(bot));
        return res.json({ success: true });
    }

    const botId = parseInt(id);
    const bot = botList[botId-1];
    if (bot && bot.isAlive) {
        stopBot(bot);
        return res.json({ success: true });
    }
    res.status(400).json({ error: 'Bot offline' });
});


const WEB_PORT = process.env.PORT || 3000;
server.listen(WEB_PORT, () => {
    console.log(`🌐 DASHBOARD: http://localhost:${WEB_PORT}`);
    console.log('📊 WebSocket Stream Active');
    
    // Log the Hugging Face IP for the user
    require('http').get('http://ifconfig.me/ip', (res) => {
        res.on('data', (ip) => console.log(`🌍 HUGGING FACE IP: ${ip.toString().trim()}`));
    });
});
