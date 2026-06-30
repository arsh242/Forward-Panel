const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const { NewMessage } = require('telegram/events');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Aapke API Credentials
const apiId = 39333184; 
const apiHash = '8f29ddca96113a83e685352a33b543fb'; 
const stringSession = new StringSession(''); 
let client;
let isScriptRunning = false;

// Source and Target Channels
const SOURCE_CHANNEL = -1003241729218;
const TARGET_CHANNEL = -1004424729721;

app.use(express.static(__dirname));

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

io.on('connection', (socket) => {
    socket.on('request_login', async (phoneNumber) => {
        client = new TelegramClient(stringSession, apiId, apiHash, { connectionRetries: 5 });
        await client.connect();
        
        try {
            await client.sendCode({ apiId, apiHash }, phoneNumber);
            socket.emit('log', 'OTP has been sent to your Telegram account.');
            socket.emit('ask_otp');
        } catch (error) {
            socket.emit('log', `Error: ${error.message}`);
        }
    });

    socket.on('submit_otp', async ({ phone, otp }) => {
        try {
            await client.signInUser({ apiId, apiHash }, {
                phoneNumber: phone,
                phoneCode: otp,
                onError: (err) => socket.emit('log', `Login Error: ${err.message}`)
            });
            socket.emit('log', 'Authentication Successful! Session is active.');
            socket.emit('login_success');
        } catch (error) {
            socket.emit('log', `OTP Error: ${error.message}`);
        }
    });

    socket.on('start_script', () => {
        if (!client || !client.connected) {
            return socket.emit('log', 'Please authenticate first.');
        }
        isScriptRunning = true;
        socket.emit('status_change', true);
        socket.emit('log', 'Automation Activated: Monitoring 500-BOSSRUMMY codes...');

        client.addEventHandler(async (event) => {
            if (!isScriptRunning) return;
            
            const message = event.message;
            if (message.peerId && message.peerId.channelId == Math.abs(SOURCE_CHANNEL)) {
                const text = message.message || "";
                
                // Matches "500-BOSSRUMMY-" followed by numbers
                const codeMatch = text.match(/500-BOSSRUMMY-\d+/);
                
                if (codeMatch) {
                    const startTime = Date.now();
                    const extractedCode = codeMatch[0];
                    
                    try {
                        await client.sendMessage(TARGET_CHANNEL, { message: extractedCode });
                        const timeTaken = Date.now() - startTime;
                        socket.emit('log', `[FORWARDED] Code: ${extractedCode} | From: Source | To: Target | Latency: ${timeTaken}ms`);
                    } catch (err) {
                        socket.emit('log', `[ERROR] Transmission failed: ${err.message}`);
                    }
                }
            }
        }, new NewMessage({}));
    });

    socket.on('stop_script', () => {
        isScriptRunning = false;
        socket.emit('status_change', false);
        socket.emit('log', 'Automation Deactivated.');
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
