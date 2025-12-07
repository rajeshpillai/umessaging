class uMessage {
    constructor() {
        this.users = new Map(); // socket -> { name, mobile }
        this.groups = new Map(); // groupId -> Set<socket>
    }

    handleOpen(ws) {
        // No-op or init logic
    }

    handleMessage(ws, message, isBinary) {
        try {
            const buffer = Buffer.from(message);
            const text = buffer.toString();
            console.log('Received: ' + text);
            const json = JSON.parse(text);

            if (json.type === 'register') {
                this._handleRegister(ws, json);
            }
            else if (json.type === 'join_group') {
                this._handleJoinGroup(ws, json);
            }
            else if (json.type === 'message') {
                this._handleChatMessage(ws, json);
            }

        } catch (e) {
            console.error('Error processing message:', e);
        }
    }

    handleClose(ws) {
        console.log('WebSocket closed');
        const user = this.users.get(ws);
        if (user) {
            const userLeftPayload = JSON.stringify({ type: 'user_left', mobile: user.mobile });
            this.users.forEach((u, socket) => {
                if (socket !== ws) socket.send(userLeftPayload, false, true);
            });
        }
        this.users.delete(ws);
        this.groups.forEach(group => group.delete(ws));
    }

    // --- Private Handlers ---

    _handleRegister(ws, json) {
        const { name, mobile } = json;
        this.users.set(ws, { name, mobile });
        ws.send(JSON.stringify({ type: 'registered', success: true }), false, true);
        console.log(`User registered: ${name} (${mobile})`);

        // Send existing groups
        const groupList = Array.from(this.groups.keys());
        ws.send(JSON.stringify({ type: 'group_list', groups: groupList }), false, true);

        // Send online users
        const userList = [];
        for (const [socket, u] of this.users.entries()) {
            if (socket !== ws) userList.push(u);
        }
        ws.send(JSON.stringify({ type: 'user_list', users: userList }), false, true);

        // Broadcast user joined
        const userJoinedPayload = JSON.stringify({ type: 'user_joined', user: { name, mobile } });
        this.users.forEach((u, socket) => {
            if (socket !== ws) socket.send(userJoinedPayload, false, true);
        });
    }

    _handleJoinGroup(ws, json) {
        const { groupName } = json;
        let isNew = false;
        if (!this.groups.has(groupName)) {
            this.groups.set(groupName, new Set());
            isNew = true;
        }
        const group = this.groups.get(groupName);
        group.add(ws);

        ws.send(JSON.stringify({ type: 'joined_group', groupName }), false, true);
        console.log(`User joined group: ${groupName}`);

        if (isNew) {
            const newGroupPayload = JSON.stringify({ type: 'group_created', groupName });
            this.users.forEach((userData, socket) => {
                socket.send(newGroupPayload, false, true);
            });
        }
    }

    _handleChatMessage(ws, json) {
        const { to, content } = json;
        if (this.groups.has(to)) {
            // Group Message
            const group = this.groups.get(to);
            const sender = this.users.get(ws);
            const payload = JSON.stringify({
                type: 'message',
                from: sender ? sender.name : 'Anonymous',
                fromMobile: sender ? sender.mobile : '?',
                to: to,
                content: content
            });
            group.forEach(socket => {
                socket.send(payload, false, true);
            });
        } else {
            // DM
            let targetSocket = null;
            for (const [socket, userData] of this.users.entries()) {
                if (userData.mobile === to) {
                    targetSocket = socket;
                    break;
                }
            }

            if (targetSocket) {
                const sender = this.users.get(ws);
                targetSocket.send(JSON.stringify({
                    type: 'message',
                    from: sender ? sender.name : 'Anonymous',
                    fromMobile: sender ? sender.mobile : '?',
                    to: to,
                    content: content
                }), false, true);
            }
        }
    }
}

module.exports = uMessage;
