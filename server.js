const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const path = require("path");
const users = []; 
const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static(path.join(__dirname, "public")));

io.on("connection", (socket) => {
  console.log("User connected: " + socket.id);
  users.push(socket.id);

  socket.emit("your-id", socket.id);
  socket.on("call-user", (data) => {
    io.to(data.to).emit("receive-call", {
      from: socket.id,
      offer: data.offer,
    });
  });

  socket.on("answer-call", (data) => {
    io.to(data.to).emit("call-answered", {
      answer: data.answer,
    });
  });

  socket.on("ice-candidate", (data) => {
    io.to(data.to).emit("ice-candidate", {
      candidate: data.candidate,
    });
  });

  socket.on("end-call", (data) => {
    io.to(data.to).emit("call-ended");
  });

  socket.on("disconnect", () => {
    console.log("User disconnected: " + socket.id);
  });
});

const PORT = process.env.PORT || 3000; // استخدام PORT من البيئة
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

