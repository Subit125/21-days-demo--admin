const http = require('http');
const { Server } = require('socket.io');

// Create a basic HTTP server
const server = http.createServer((req, res) => {
    res.writeHead(200);
    res.end('Socket.io Sync Server is Running');
});

// Initialize Socket.io
const io = new Server(server, {
    cors: {
        origin: "*", // Allow all origins for the dashboard
        methods: ["GET", "POST"]
    }
});

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // Listen for data updates from any dashboard
    socket.on('data_updated', (data) => {
        console.log('Data update received for table:', data.table);
        // Broadcast the update to EVERYONE ELSE
        socket.broadcast.emit('sync_update', {
            table: data.table,
            timestamp: new Date().toISOString(),
            message: `Table ${data.table} was updated.`
        });
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
    });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`Socket.io Sync Server running on port ${PORT}`);
    console.log(`Live Fallback: Disabled (Using Socket-Primary mode)`);
});
