# uWebSockets Chat Demo

A high-performance WebSocket chat application demonstration using [uWebSockets.js](https://github.com/uNetworking/uWebSockets.js).

> [!IMPORTANT]
> **Demo Only**: This application is a proof-of-concept demonstration.
> - **No Persistence**: All data (users, messages, groups) is stored in-memory and will be lost when the server restarts.
> - **Insecure Auth**: Authentication is simulated. Anyone can login with any mobile number.
> - **Not for Production**: Do not use this code as-is in a production environment.

## Features

- **Real-time Messaging**: Instant message delivery using WebSockets.
- **User Registration**: Simple in-memory user registration with name and mobile number.
- **Group Chat**: Create and join topic-based groups.
- **Direct Messaging**: Send private messages to other users directly.
- **Live Updates**:
    - Real-time user list updates (join/leave).
    - Real-time group list updates.
- **High Performance**: Built on top of `uWebSockets.js` for efficiency.

## Prerequisites

- [Node.js](https://nodejs.org/) (v14 or newer recommended)

## Installation

1.  Clone the repository:
    ```bash
    git clone <repository-url>
    cd uwebsocket-demo
    ```

2.  Install dependencies:
    ```bash
    npm install
    ```

## Usage

### Running the Server

Start the WebSocket server and the static file server:

```bash
node server.js
```

The server will start on port `9001`.

### Accessing the Demo

Open your browser and navigate to:

```
http://localhost:9001/
```

Open multiple tabs or browsers to test the chat functionality between different users.

1.  **Login**: Enter a Display Name and a Mobile Number (used as ID) to register.
2.  **Chat**:
    - Select a user from the **Users** list to send a Direct Message.
    - Select a group from the **Groups** list to join and chat in that group.
    - Enter a group name in the "New Group" input to create or join a new group.

## Library API (`uMessage.js`)

The `uMessage` class handles the core chat logic. It is designed to be integrated with a WebSocket server.

### detailed Protocol

The communication uses JSON payloads.

**Client actions:**

-   **Register**:
    ```json
    { "type": "register", "name": "Alice", "mobile": "1234567890" }
    ```
-   **Join Group**:
    ```json
    { "type": "join_group", "groupName": "General" }
    ```
-   **Send Message**:
    ```json
    { "type": "message", "to": "1234567890", "content": "Hello!" }
    ```
    (Use group name for `to` to send to a group)

**Server events:**

-   `registered`: Registration success.
-   `user_list`: List of currently online users.
-   `group_list`: List of available groups.
-   `user_joined`: A new user registered.
-   `user_left`: A user disconnected.
-   `message`: Incoming message.
-   `joined_group`: You joined a group.
-   `group_created`: A new group was created.

## Project Structure

-   `lib/uMessage.js`: Core chat logic class.
-   `server.js`: Server entry point. Sets up uWebSockets and serves static files.
-   `ui/vanilla-js/`: Frontend demo application (HTML/CSS/JS).

## Production Recommendations

To take this application to production, consider implementing the following:

1.  **Persistent Storage**: Use a database (Redis, MongoDB, PostgreSQL) to store user profiles, chat history, and group metadata.
2.  **Authentication**: Implement proper JWT-based authentication or OAuth (Google/Facebook) to secure user identities.
3.  **Scalability**: Use Redis Pub/Sub to scale across multiple server instances.
4.  **Validation**: Add strict input validation for all WebSocket messages.
5.  **SSL/TLS**: Serve over WSS (WebSocket Secure) using Nginx or a load balancer.
