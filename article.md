# Building a High-Performance WebSocket Chat App with Node.js and uWebSockets.js

In this tutorial, we will build a real-time chat application from scratch using **Node.js** and **uWebSockets.js**. We will focus on performance and simplicity, creating a full-featured chat with features like direct messaging, group chats, and real-time updates.

By the end of this guide, you will have a working chat application that handles multiple connections efficiently.

## Prerequisites

-   **Node.js**: Installed on your machine (v14+ recommended).
-   **Text Editor**: VS Code or any editor of your choice.
-   **Terminal**: To run commands.

## Step 1: Project Setup

First, let's create a new directory for our project and initialize it.

1.  Open your terminal and run:
    ```bash
    mkdir uwebsocket-chat
    cd uwebsocket-chat
    npm init -y
    ```

2.  Install the required dependency. We will use `uWebSockets.js` for handling WebSockets handling.
    ```bash
    npm install uWebSockets.js@github:uNetworking/uWebSockets.js#v20.48.0
    ```


### Why uWebSockets.js?

[uWebSockets.js](https://github.com/uNetworking/uWebSockets.js) is a Node.js wrapper around uWebSockets, a C++ implementation of the WebSocket protocol.
-   **Performance**: It is significantly faster than the native Node.js `ws` library and `socket.io` because the heavy lifting is done in C++.
-   **Memory Efficiency**: It uses less memory per connection, allowing you to handle thousands of concurrent users on a single thread.
-   **Standard Compliant**: It fully supports RFC 6455 (The WebSocket Protocol) and passes the Autobahn test suite.

## Step 2: Backend Implementation

We need a server that handles WebSocket connections and chat logic. We'll split this into two files:
1.  `lib/uMessage.js`: The class managing users, groups, and message routing.
2.  `server.js`: The entry point setting up the server.

### 2.1 Create the Chat Controller (`lib/uMessage.js`)

Create a folder named `lib` and a file named `uMessage.js` inside it.

```javascript
// lib/uMessage.js
class uMessage {
    constructor() {
        this.users = new Map(); // socket -> { name, mobile }
        this.groups = new Map(); // groupId -> Set<socket>
    }

    handleOpen(ws) {
        // Called when a connection opens
    }

    handleMessage(ws, message, isBinary) {
        try {
            const buffer = Buffer.from(message);
            const text = buffer.toString();
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
        // Clean up user
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

        if (isNew) {
            const newGroupPayload = JSON.stringify({ type: 'group_created', groupName });
            this.users.forEach((userData, socket) => {
                socket.send(newGroupPayload, false, true);
            });
        }
    }

    _handleChatMessage(ws, json) {
        const { to, content } = json;
        // Check if sending to a group
        if (this.groups.has(to)) {
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
            // Direct Message
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
```


### How it Works: State Management

In `uMessage.js`, we use native JavaScript `Map` and `Set` data structures for O(1) performance:
-   **`this.users`**: A `Map` linking the WebSocket connection (`ws`) to user metadata. This allows us to instantly retrieve user info when a message arrives.
-   **`this.groups`**: A `Map` where the key is the group name and the value is a `Set` of WebSockets. This makes broadcasting to a group extremely efficient—we just iterate over the `Set`.

> **Note**: In a production scalable app, this in-memory state would be replaced by a Redis store to share state across multiple server instances.

### 2.2 Create the Server (`server.js`)

Create a `server.js` file in the root. This file will set up the uWebSockets app and serve static files for our frontend.

```javascript
// server.js
const uWS = require('uWebSockets.js');
const fs = require('fs');
const path = require('path');
const uMessage = require('./lib/uMessage');

const chat = new uMessage();

const getContentType = (ext) => {
    switch (ext) {
        case '.html': return 'text/html';
        case '.css': return 'text/css';
        case '.js': return 'text/javascript';
        default: return 'text/plain';
    }
};

const app = uWS.App().ws('/*', {
    compression: uWS.SHARED_COMPRESSOR,
    maxPayloadLength: 16 * 1024 * 1024,
    idleTimeout: 60,

    open: (res, req, context) => {
        chat.handleOpen(res);
    },

    message: (res, message, isBinary) => {
        chat.handleMessage(res, message, isBinary);
    },

    close: (res, code, message) => {
        chat.handleClose(res);
    }

}).any('/*', (res, req) => {
    /* Simple Static File Server */
    const url = req.getUrl();
    // We will put our frontend code in ui/vanilla-js
    const filePath = path.join(__dirname, 'ui', 'vanilla-js', url === '/' ? 'index.html' : url);

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
```

```

### Understanding the Server Hooks

The `uWS.App()` triggers specific hooks during the lifecycle of a WebSocket connection:

1.  **`upgrade`**: (Implicitly handled here by `ws('/*', ...)`). The handshake request where HTTP is upgraded to WebSocket. You can use this hook for initial authentication (e.g., checking headers/cookies) before the WebSocket connection is established.
2.  **`open`**: Triggered when the connection is successfully established. We use this to initialize any per-socket state.
3.  **`message`**: The core event loop. Triggered whenever data is received.
    -   `res`: The WebSocket object itself (in uWS terms).
    -   `message`: An `ArrayBuffer` containing the raw data.
    -   `isBinary`: A boolean indicating if the frame was binary or text.
4.  **`drain`**: (Not used in this simple demo) Triggered when the socket is ready to receive more data after backpressure (when you send faster than the network can handle). Critical for high-throughput apps.
5.  **`close`**: Triggered on disconnection (client closes or network error). We use this to clean up our `Map` and `Set` entries to prevent memory leaks.

## Step 3: Frontend Implementation

We will create a modern, dark-themed UI. Create the directory structure: `ui/vanilla-js`.

### 3.1 Create HTML (`ui/vanilla-js/index.html`)

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>uChat</title>
    <link rel="stylesheet" href="style.css">
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
</head>
<body>
    <!-- Login Screen -->
    <div id="login-screen" class="screen active">
        <div class="login-container">
            <h1>uChat</h1>
            <form id="login-form">
                <input type="text" id="username" placeholder="Your Name" required>
                <input type="tel" id="mobile" placeholder="Mobile Number" required>
                <button type="submit">Start Messaging</button>
            </form>
        </div>
    </div>

    <!-- Chat Screen -->
    <div id="chat-screen" class="screen">
        <div class="sidebar">
            <div class="sidebar-header">
                <span id="my-name">Me</span>
                <button id="btn-new-group">+</button>
            </div>
            <div class="chat-list" id="chat-list"></div>
            <div class="section-header">Online Users</div>
            <div class="chat-list" id="online-users-list"></div>
        </div>
        <div class="main-chat">
            <div class="messages-container" id="messages-container"></div>
            <div class="input-area" id="input-area">
                <input type="text" id="message-input" placeholder="Write a message...">
                <button id="send-btn">➤</button>
            </div>
        </div>
    </div>

    <!-- Modal for New Group -->
    <div id="modal-new-group" class="modal">
        <div class="modal-content">
            <span class="close-modal">&times;</span>
            <input type="text" id="new-group-name" placeholder="Group Name">
            <button id="btn-create-group">Create</button>
        </div>
    </div>

    <script src="app.js"></script>
</body>
</html>
```

### 3.2 Create CSS (`ui/vanilla-js/style.css`)

We'll use a dark theme inspired by Telegram.

```css
:root {
    --bg-color: #0e1621;
    --sidebar-bg: #17212b;
    --accent: #5288c1;
    --text-primary: #f5f5f5;
    --input-bg: #242f3d;
    --message-out: #2b5278;
    --message-in: #182533;
}

body {
    background-color: var(--bg-color);
    color: var(--text-primary);
    font-family: 'Inter', sans-serif;
    margin: 0;
    height: 100vh;
    display: flex;
}

.screen { display: none; width: 100%; height: 100%; }
.screen.active { display: flex; }

/* Login */
#login-screen { justify-content: center; align-items: center; }
.login-container { background: var(--sidebar-bg); padding: 2rem; border-radius: 12px; text-align: center; }
input { width: 100%; padding: 10px; margin-bottom: 10px; background: var(--input-bg); border: none; color: white; border-radius: 8px; }
button { width: 100%; padding: 10px; background: var(--accent); color: white; border: none; border-radius: 8px; cursor: pointer; }

/* Chat Layout */
.sidebar { width: 300px; background: var(--sidebar-bg); display: flex; flex-direction: column; border-right: 1px solid black; }
.main-chat { flex: 1; display: flex; flex-direction: column; }
.messages-container { flex: 1; padding: 20px; overflow-y: auto; display: flex; flex-direction: column; gap: 10px; }
.input-area { padding: 20px; background: var(--sidebar-bg); display: flex; gap: 10px; }
.chat-item { padding: 10px; cursor: pointer; transition: background 0.2s; }
.chat-item:hover { background: #202b36; }
.message { padding: 8px 12px; border-radius: 8px; max-width: 60%; }
.message.sent { align-self: flex-end; background: var(--message-out); }
.message.received { align-self: flex-start; background: var(--message-in); }

/* Modal */
.modal { display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); justify-content: center; align-items: center; }
.modal.active { display: flex; }
.modal-content { background: var(--sidebar-bg); padding: 20px; border-radius: 10px;}
```

### 3.3 Create Client Logic (`ui/vanilla-js/app.js`)

This file handles WebSocket connection and DOM updates.

```javascript
// ui/vanilla-js/app.js
const state = { user: null, ws: null, activeChat: null, chats: new Map(), knownGroups: new Set() };

// DOM Elements
const loginScreen = document.getElementById('login-screen');
const chatScreen = document.getElementById('chat-screen');
const messagesContainer = document.getElementById('messages-container');
const messageInput = document.getElementById('message-input');

function init() {
    document.getElementById('login-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const name = document.getElementById('username').value;
        const mobile = document.getElementById('mobile').value;
        state.user = { name, mobile };
        connect(name, mobile);
    });

    document.getElementById('send-btn').addEventListener('click', sendMessage);
    
    // UI Helpers
    document.getElementById('btn-new-group').addEventListener('click', () => {
        document.getElementById('modal-new-group').classList.add('active');
    });
    
    document.getElementById('btn-create-group').addEventListener('click', () => {
        const name = document.getElementById('new-group-name').value;
        if(name) {
             state.ws.send(JSON.stringify({ type: 'join_group', groupName: name }));
             document.getElementById('modal-new-group').classList.remove('active');
        }
    });

    document.querySelectorAll('.close-modal').forEach(e => e.onclick = () => {
        document.getElementById('modal-new-group').classList.remove('active');
    });
}

function connect(name, mobile) {
    const ws = new WebSocket(`ws://${window.location.host}`);
    state.ws = ws;

    ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'register', name, mobile }));
    };

    ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        handleMessage(msg);
    };
}

function handleMessage(msg) {
    if (msg.type === 'registered') {
        loginScreen.classList.remove('active');
        chatScreen.classList.add('active');
        document.getElementById('my-name').textContent = state.user.name;
    } else if (msg.type === 'message') {
        renderMessage(msg);
    } else if (msg.type === 'user_list') {
        renderOnlineUsers(msg.users);
    }
    // ... Handle other types (user_joined, etc.) similarly
}

function renderMessage(msg) {
    // Only render if it belongs to active chat, or store it
    const div = document.createElement('div');
    const isMe = msg.from === state.user.name; // Simplistic check
    div.className = `message ${isMe ? 'sent' : 'received'}`;
    div.textContent = msg.content;
    messagesContainer.appendChild(div);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function sendMessage() {
    const text = messageInput.value;
    if (!text || !state.activeChat) return;
    
    // For this tutorial simplicity, assume activeChat is set
    // You would need to implement chat selection logic here
    
    state.ws.send(JSON.stringify({
        type: 'message',
        to: state.activeChat, 
        content: text
    }));
    messageInput.value = '';
}

function renderOnlineUsers(users) {
    const list = document.getElementById('online-users-list');
    list.innerHTML = '';
    users.forEach(u => {
        if(u.mobile === state.user.mobile) return;
        const div = document.createElement('div');
        div.className = 'chat-item';
        div.textContent = u.name;
        div.onclick = () => {
            state.activeChat = u.mobile;
            document.getElementById('messages-container').innerHTML = ''; // Clear for new chat
            alert(`Chatting with ${u.name}`);
        };
        list.appendChild(div);
    });
}

init();
```

*(Note: The `app.js` above is a simplified version of the full logic to keep the tutorial concise. In a full implementation, you would manage state for multiple chats as done in the source code.)*


### Client-Side WebSocket API

The code uses the native browser [WebSocket API](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket).
-   **`new WebSocket(url)`**: Initiates the TCP handshake and HTTP upgrade.
-   **`ws.onopen`**: Fires when the connection is "READY". We immediately send a registration packet here.
-   **`ws.onmessage`**: Fires for every packet received from the server.
-   **Robustness**: In a real-world app, you should add logic to `ws.onclose` to automatically attempt reconnection after a delay (Exponential Backoff).

## Step 4: Running the App

1.  Start the server:
    ```bash
    node server.js
    ```

2.  Open `http://localhost:9001` in your browser.

3.  Open a second incognito window or another browser to simulate a second user.

## Conclusion

You have successfully built a high-performance WebSocket chat application. This project demonstrates how to use `uWebSockets.js` for efficient real-time communication and how to structure a simple vanilla JS frontend to interact with it.

From here, you can expand by adding database persistence, authentication, or media sharing.
