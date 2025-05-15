const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Store connected users
const users = new Map();
// Store random call queue
const callQueue = [];

io.on('connection', (socket) => {
    console.log('New client connected:', socket.id);

    // Handle user registration
    socket.on('register', (userId) => {
        users.set(userId, socket.id);
        socket.userId = userId;
        console.log(`User registered: ${userId}`);
    });

    // Handle random call request
    socket.on('randomCall', (userId) => {
        if (callQueue.length > 0) {
            // Pair with someone in the queue
            const otherUserId = callQueue.pop();
            const otherSocketId = users.get(otherUserId);
            
            if (otherSocketId && io.sockets.sockets.get(otherSocketId)) {
                // Notify both users
                io.to(otherSocketId).emit('callRequest', {
                    from: userId,
                    to: otherUserId,
                    offer: null // They will create their own offer
                });
                
                io.to(socket.id).emit('callRequest', {
                    from: otherUserId,
                    to: userId,
                    offer: null
                });
            } else {
                // Other user disconnected, add to queue
                callQueue.push(userId);
            }
        } else {
            // Add to queue
            callQueue.push(userId);
        }
    });

    // Handle direct call request
    socket.on('callRequest', (data) => {
        const targetSocketId = users.get(data.to);
        
        if (targetSocketId && io.sockets.sockets.get(targetSocketId)) {
            io.to(targetSocketId).emit('callRequest', data);
        } else {
            io.to(socket.id).emit('userNotFound');
        }
    });

    // Handle call response
    socket.on('callResponse', (data) => {
        const targetSocketId = users.get(data.to);
        
        if (targetSocketId && io.sockets.sockets.get(targetSocketId)) {
            io.to(targetSocketId).emit('callResponse', data);
        }
    });

    // Handle ICE candidates
    socket.on('iceCandidate', (data) => {
        const targetSocketId = users.get(data.to);
        
        if (targetSocketId && io.sockets.sockets.get(targetSocketId)) {
            io.to(targetSocketId).emit('iceCandidate', data);
        }
    });

    // Handle end call
    socket.on('endCall', (data) => {
        const targetSocketId = users.get(data.to);
        
        if (targetSocketId && io.sockets.sockets.get(targetSocketId)) {
            io.to(targetSocketId).emit('endCall');
        }
    });

    // Handle disconnection
    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
        if (socket.userId) {
            users.delete(socket.userId);
            
            // Remove from call queue if present
            const index = callQueue.indexOf(socket.userId);
            if (index !== -1) {
                callQueue.splice(index, 1);
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
