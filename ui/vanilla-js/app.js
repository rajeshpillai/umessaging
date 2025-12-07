const state = {
    user: null,
    ws: null,
    activeChat: null,
    chats: new Map(), // chatId -> { messages: [], type: 'dm'|'group', name: '...' }
    knownGroups: new Set(),
    unknownGroups: new Set(), // Groups that exist but I haven't joined
    onlineUsers: new Map() // mobile -> { name, mobile }
};

// DOM Elements
const loginScreen = document.getElementById('login-screen');
const chatScreen = document.getElementById('chat-screen');
const loginForm = document.getElementById('login-form');
const chatList = document.getElementById('chat-list');
const availableGroupsList = document.getElementById('available-groups-list');
const onlineUsersList = document.getElementById('online-users-list');
const messagesContainer = document.getElementById('messages-container');
const messageInput = document.getElementById('message-input');
const sendBtn = document.getElementById('send-btn');
const inputArea = document.getElementById('input-area');
const currentChatHeader = document.getElementById('current-chat-header');
const chatTitle = document.getElementById('chat-title');
const btnNewGroup = document.getElementById('btn-new-group');

// Navigation / Modals
const modalNewChat = document.getElementById('modal-new-chat'); // Just logic, simpler to prompt or use modal
const btnStartChat = document.getElementById('btn-start-chat');
const newChatMobile = document.getElementById('new-chat-mobile');
const modalNewGroup = document.getElementById('modal-new-group');
const btnCreateGroup = document.getElementById('btn-create-group');
const newGroupName = document.getElementById('new-group-name');
const btnLogout = document.getElementById('btn-logout');
const closeModals = document.querySelectorAll('.close-modal');

// --- Initialization ---

function init() {
    loginForm.addEventListener('submit', handleLogin);
    sendBtn.addEventListener('click', sendMessage);
    messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
    });

    btnNewGroup.addEventListener('click', () => {
        modalNewGroup.classList.add('active');
    });

    closeModals.forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.modal').forEach(m => m.classList.remove('active'));
        });
    });

    btnCreateGroup.addEventListener('click', () => {
        const name = newGroupName.value.trim();
        if (name) {
            joinGroup(name);
            modalNewGroup.classList.remove('active');
            newGroupName.value = '';
        }
    });

    // We also need a "New Chat" button maybe, or just reuse the "+" for both? 
    // The HTML had a search bar, let's use search bar Enter to start chat for simplicity or add a specific button.
    // Actually the HTML has `modal-new-chat` but no button triggering it in sidebar header (only new group).
    // Let's add a listener to the "+" button to offer options or just default to Group. 
    // To make it easy, I'll add a "Start Chat" button or just let `search-input` act as "Jump to / Start chat".

    document.getElementById('search-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            const val = e.target.value.trim();
            if (val) {
                startChat(val); // Treat as mobile number or existing
                e.target.value = '';
            }
        }
    });

    btnLogout.addEventListener('click', () => {
        localStorage.removeItem('uchat_user');
        window.location.reload();
    });

    // Check localStorage
    const saved = localStorage.getItem('uchat_user');
    if (saved) {
        const { name, mobile } = JSON.parse(saved);
        document.getElementById('username').value = name;
        document.getElementById('mobile').value = mobile;
        handleLogin({ preventDefault: () => { } });
    }
}

// --- WebSocket ---

function connect(name, mobile) {
    // Determine protocol (ws vs wss)
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;

    const ws = new WebSocket(wsUrl);
    state.ws = ws;

    ws.onopen = () => {
        console.log('Connected');
        ws.send(JSON.stringify({
            type: 'register',
            name: name,
            mobile: mobile
        }));
    };

    ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        handleMessage(msg);
    };

    ws.onclose = () => {
        console.log('Disconnected');
        alert('Connection lost. Please refresh.');
    };
}

function handleLogin(e) {
    e.preventDefault();
    const name = document.getElementById('username').value.trim();
    const mobile = document.getElementById('mobile').value.trim();

    if (name && mobile) {
        state.user = { name, mobile };
        localStorage.setItem('uchat_user', JSON.stringify(state.user));
        connect(name, mobile);

        // Request Notification Permission
        if (Notification.permission === 'default') {
            Notification.requestPermission();
        }
    }
}

function handleMessage(msg) {
    if (msg.type === 'registered') {
        loginScreen.classList.remove('active');
        chatScreen.classList.add('active');
        document.getElementById('my-name').textContent = state.user.name;
        document.getElementById('my-avatar').textContent = getInitials(state.user.name);
    }
    else if (msg.type === 'joined_group') {
        const groupName = msg.groupName;
        state.knownGroups.add(groupName);
        state.unknownGroups.delete(groupName);
        getOrCreateChat(groupName, 'group');
        selectChat(groupName);
        renderAvailableGroups(); // Remove from "Available"
    }
    else if (msg.type === 'group_list') {
        const groups = msg.groups;
        groups.forEach(g => {
            if (!state.knownGroups.has(g)) {
                state.unknownGroups.add(g);
            }
        });
        renderAvailableGroups();
    }
    else if (msg.type === 'group_created') {
        const groupName = msg.groupName;
        if (!state.knownGroups.has(groupName)) {
            state.unknownGroups.add(groupName);
            renderAvailableGroups();
        }
    }
    else if (msg.type === 'user_list') {
        const users = msg.users;
        users.forEach(u => {
            state.onlineUsers.set(u.mobile, u);
        });
        renderOnlineUsers();
    }
    else if (msg.type === 'user_joined') {
        const user = msg.user;
        state.onlineUsers.set(user.mobile, user);
        renderOnlineUsers();
        // Optional: notification
    }
    else if (msg.type === 'user_left') {
        state.onlineUsers.delete(msg.mobile);
        renderOnlineUsers();
    }
    else if (msg.type === 'message') {
        // Determine Chat ID
        let chatId;
        let isGroup = false;

        // If to == me, it's DM from someone
        // If to != me, it's a group message
        if (msg.to === state.user.mobile) {
            chatId = msg.fromMobile; // The other person
        } else {
            chatId = msg.to; // The group
            isGroup = true;
        }

        const chat = getOrCreateChat(chatId, isGroup ? 'group' : 'dm', isGroup ? chatId : msg.from);

        const messageData = {
            id: Date.now(),
            text: msg.content,
            sender: msg.from, // Name
            isMe: false,
            time: new Date()
        };

        chat.messages.push(messageData);

        if (state.activeChat === chatId) {
            renderMessage(messageData);
            scrollToBottom();
        } else {
            // Unread
            // Maybe play sound?
        }

        renderChatList();

        // Notification
        if (document.hidden || state.activeChat !== chatId) {
            sendNotification(`New message from ${msg.from}`, msg.content);
        }
    }
}

// --- Logic ---

function startChat(mobileOrName) {
    // Heuristic: If it looks like a number, it's DM. 
    // Since we don't have a user discovery, we just initiate a DM.
    // If it's already a known group, open it.

    if (state.knownGroups.has(mobileOrName)) {
        selectChat(mobileOrName);
    } else {
        // Assume DM
        getOrCreateChat(mobileOrName, 'dm', mobileOrName); // Name defaulting to Number temporarily
        selectChat(mobileOrName);
    }
}

function getOrCreateChat(id, type, name) {
    if (!state.chats.has(id)) {
        state.chats.set(id, {
            id,
            type,
            name: name || id,
            messages: []
        });
    }
    renderChatList();
    return state.chats.get(id);
}

function selectChat(id) {
    state.activeChat = id;
    const chat = state.chats.get(id);

    // UI Update
    chatTitle.textContent = chat.name || id;
    currentChatHeader.style.display = 'flex';
    inputArea.style.display = 'flex';

    // Render messages
    messagesContainer.innerHTML = '';
    chat.messages.forEach(renderMessage);
    scrollToBottom();

    renderChatList(); // To update active state styling
}

function joinGroup(groupName) {
    state.ws.send(JSON.stringify({
        type: 'join_group',
        groupName: groupName
    }));
}

function sendMessage() {
    if (!state.activeChat) return;
    const text = messageInput.value.trim();
    if (!text) return;

    const chat = state.chats.get(state.activeChat);

    // Send to WS
    state.ws.send(JSON.stringify({
        type: 'message',
        to: chat.id,
        content: text
    }));

    // Optimistic Update
    const msgData = {
        id: Date.now(),
        text: text,
        sender: state.user.name,
        isMe: true,
        time: new Date()
    };

    chat.messages.push(msgData);
    renderMessage(msgData);
    scrollToBottom();

    messageInput.value = '';
    renderChatList();
}

// --- Rendering ---

function renderChatList() {
    chatList.innerHTML = '';
    state.chats.forEach(chat => {
        const numMessages = chat.messages.length;
        const lastMsg = numMessages > 0 ? chat.messages[numMessages - 1].text : 'No messages';

        const div = document.createElement('div');
        div.className = `chat-item ${state.activeChat === chat.id ? 'active' : ''}`;
        div.innerHTML = `
            <div class="avatar">${getInitials(chat.name)}</div>
            <div class="chat-info-preview">
                <div class="chat-name">${chat.name}</div>
                <div class="last-message">${lastMsg}</div>
            </div>
        `;
        div.onclick = () => selectChat(chat.id);
        chatList.appendChild(div);
    });
}

function renderAvailableGroups() {
    availableGroupsList.innerHTML = '';
    state.unknownGroups.forEach(groupName => {
        const div = document.createElement('div');
        div.className = 'chat-item';
        div.innerHTML = `
            <div class="avatar">${getInitials(groupName)}</div>
            <div class="chat-info-preview">
                <div class="chat-name">${groupName}</div>
                <div class="last-message">Click to join</div>
            </div>
        `;
        div.onclick = () => {
            joinGroup(groupName);
        };
        availableGroupsList.appendChild(div);
    });
}

function renderOnlineUsers() {
    onlineUsersList.innerHTML = '';
    state.onlineUsers.forEach(user => {
        if (state.user && user.mobile === state.user.mobile) return; // Don't show self

        const div = document.createElement('div');
        div.className = 'chat-item';
        div.innerHTML = `
            <div class="avatar" style="background: #e17055">${getInitials(user.name)}</div>
            <div class="chat-info-preview">
                <div class="chat-name">${user.name}</div>
                <div class="last-message">Online</div>
            </div>
        `;
        div.onclick = () => {
            startChat(user.mobile);
            // Optionally set name
            const chat = state.chats.get(user.mobile);
            if (chat) {
                chat.name = user.name;
                renderChatList();
                // Update header if active
                if (state.activeChat === user.mobile) {
                    chatTitle.textContent = user.name;
                }
            }
        };
        onlineUsersList.appendChild(div);
    });
}

function renderMessage(msg) {
    const div = document.createElement('div');
    const isGroup = state.chats.get(state.activeChat).type === 'group';

    div.className = `message ${msg.isMe ? 'sent' : 'received'}`;

    let senderHtml = '';
    if (isGroup && !msg.isMe) {
        senderHtml = `<div class="sender-name">${msg.sender}</div>`;
    }

    div.innerHTML = `
        ${senderHtml}
        ${escapeHtml(msg.text)}
    `;
    messagesContainer.appendChild(div);
}

// --- Utils ---

function getInitials(name) {
    return (name || '?').substring(0, 2).toUpperCase();
}

function scrollToBottom() {
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function sendNotification(title, body) {
    if (Notification.permission === 'granted') {
        new Notification(title, { body });
    }
}

// Start
init();
