const uWS = require('uWebSockets.js');
const fs = require('fs');
const path = require('path');

const users = new Map(); // socket -> { name, mobile }
const groups = new Map(); // groupId -> Set<socket>

const getContentType = (ext) => {
    switch (ext) {
        case '.html': return 'text/html';
        case '.css': return 'text/css';
        case '.js': return 'text/javascript';
        case '.json': return 'application/json';
        case '.png': return 'image/png';
        case '.jpg': return 'image/jpeg';
        default: return 'text/plain';
    }
};

const app = uWS.App().ws('/*', {
    compression: uWS.SHARED_COMPRESSOR,
    maxPayloadLength: 16 * 1024 * 1024,
    idleTimeout: 60,

    open: (res, req, context) => {
        /* On open we just let them connect */
        console.log('A WebSocket connected!');
    },

    message: (res, message, isBinary) => {
        /* Parse the message */
        try {
            const buffer = Buffer.from(message);
            const text = buffer.toString();
            console.log('Received: ' + text);
            const json = JSON.parse(text);

            if (json.type === 'register') {
                const { name, mobile } = json;
                users.set(res, { name, mobile });
                res.send(JSON.stringify({ type: 'registered', success: true }), false, true);
                console.log(`User registered: ${name} (${mobile})`);

                // Send existing groups to the new user
                const groupList = Array.from(groups.keys());
                res.send(JSON.stringify({ type: 'group_list', groups: groupList }), false, true);

                // Send online users to the new user
                const userList = [];
                for (const [ws, u] of users.entries()) {
                    if (ws !== res) userList.push(u);
                }
                res.send(JSON.stringify({ type: 'user_list', users: userList }), false, true);

                // Broadcast user joined to ALL connected users (except self, usually, but uWS doesn't have "broadcast except")
                // We'll iterate manually or just send to all, frontend can filter self if needed.
                const userJoinedPayload = JSON.stringify({ type: 'user_joined', user: { name, mobile } });
                users.forEach((u, ws) => {
                    if (ws !== res) ws.send(userJoinedPayload, false, true);
                });
            }
            else if (json.type === 'join_group') {
                const { groupName } = json;
                let isNew = false;
                if (!groups.has(groupName)) {
                    groups.set(groupName, new Set());
                    isNew = true;
                }
                const group = groups.get(groupName);
                group.add(res);

                // Notify group
                res.send(JSON.stringify({ type: 'joined_group', groupName }), false, true);
                console.log(`User joined group: ${groupName}`);

                if (isNew) {
                    // Broadcast new group to ALL connected users
                    const newGroupPayload = JSON.stringify({ type: 'group_created', groupName });
                    users.forEach((userData, ws) => {
                        ws.send(newGroupPayload, false, true);
                    });
                }
            }
            else if (json.type === 'message') {
                const { to, content } = json;
                if (groups.has(to)) {
                    // It's a group
                    const group = groups.get(to);
                    const sender = users.get(res);
                    const payload = JSON.stringify({
                        type: 'message',
                        from: sender ? sender.name : 'Anonymous',
                        fromMobile: sender ? sender.mobile : '?',
                        to: to, // group name
                        content: content
                    });
                    group.forEach(ws => {
                        ws.send(payload, false, true);
                    });
                } else {
                    // It's a direct message (try to find by mobile)
                    let targetSocket = null;
                    for (const [ws, userData] of users.entries()) {
                        if (userData.mobile === to) {
                            targetSocket = ws;
                            break;
                        }
                    }

                    if (targetSocket) {
                        const sender = users.get(res);
                        targetSocket.send(JSON.stringify({
                            type: 'message',
                            from: sender ? sender.name : 'Anonymous',
                            fromMobile: sender ? sender.mobile : '?',
                            to: to, // receiver mobile
                            content: content
                        }), false, true);
                    }
                }
            }

        } catch (e) {
            console.error('Error processing message:', e);
        }
    },

    drain: (res) => {
        console.log('WebSocket backpressure: ' + res.getBufferedAmount());
    },

    close: (res, code, message) => {
        console.log('WebSocket closed');
        const user = users.get(res);
        if (user) {
            // Broadcast user left
            const userLeftPayload = JSON.stringify({ type: 'user_left', mobile: user.mobile });
            users.forEach((u, ws) => {
                if (ws !== res) ws.send(userLeftPayload, false, true);
            });
        }
        users.delete(res);
        groups.forEach(group => group.delete(res));
    }

}).any('/*', (res, req) => {
    /* Serve static files */
    const url = req.getUrl();
    const filePath = path.join(__dirname, 'ui', 'vanilla-js', url === '/' ? 'index.html' : url);

    if (!filePath.startsWith(path.join(__dirname, 'ui', 'vanilla-js'))) {
        res.writeStatus('403 Forbidden').end();
        return;
    }

    if (fs.existsSync(filePath) && fs.lstatSync(filePath).isFile()) {
        const ext = path.extname(filePath);
        const content = fs.readFileSync(filePath);
        res.writeHeader('Content-Type', getContentType(ext));
        res.end(content);
    } else {
        res.writeStatus('404 Not Found').end();
    }
});

const port = 9001;
app.listen(port, (token) => {
    if (token) {
        console.log('Listening to port ' + port);
    } else {
        console.log('Failed to listen to port ' + port);
    }
});
