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
        console.log('A WebSocket connected!');
        chat.handleOpen(res);
    },

    message: (res, message, isBinary) => {
        chat.handleMessage(res, message, isBinary);
    },

    drain: (res) => {
        console.log('WebSocket backpressure: ' + res.getBufferedAmount());
    },

    close: (res, code, message) => {
        chat.handleClose(res);
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
