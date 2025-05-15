const express = require('express');
const app = express();
const server = require('http').createServer(app);
const io = require('socket.io')(server);

app.use(express.static('public'));

let users = {};
let sockets = {};

io.on('connection', (socket) => {
  console.log('New connection');

  socket.on('join', (username) => {
    users[socket.id] = username;
    sockets[username] = socket.id;
    io.emit('user-joined', username);
  });

  socket.on('call', (targetUsername) => {
    const targetSocketId = sockets[targetUsername];
    if (targetSocketId) {
      io.to(targetSocketId).emit('call', users[socket.id]);
    }
  });

  socket.on('accept-call', (callerUsername) => {
    const callerSocketId = sockets[callerUsername];
    if (callerSocketId) {
      io.to(callerSocketId).emit('call-accepted', users[socket.id]);
    }
  });

  socket.on('offer', (offer, targetUsername) => {
    const targetSocketId = sockets[targetUsername];
    if (targetSocketId) {
      io.to(targetSocketId).emit('offer', offer, users[socket.id]);
    }
  });

  socket.on('answer', (answer, targetUsername) => {
    const targetSocketId = sockets[targetUsername];
    if (targetSocketId) {
      io.to(targetSocketId).emit('answer', answer);
    }
  });

  socket.on('ice-candidate', (candidate, targetUsername) => {
    const targetSocketId = sockets[targetUsername];
    if (targetSocketId) {
      io.to(targetSocketId).emit('ice-candidate', candidate);
    }
  });

  socket.on('disconnect', () => {
    delete users[socket.id];
    for (let username in sockets) {
      if (sockets[username] === socket.id) {
        delete sockets[username];
      }
    }
    io.emit('user-left', socket.id);
  });
});

server.listen(3000, () => {
  console.log('Server listening on port 3000');
});
