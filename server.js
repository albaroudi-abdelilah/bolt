const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// مجلد الملفات الثابتة (frontend files)
app.use(express.static(path.join(__dirname, "public")));

let users = [];

io.on("connection", (socket) => {
  console.log(`🔌 User connected: ${socket.id}`);
  users.push(socket.id);

  // إرسال قائمة المستخدمين للعميل (اختياري)
  io.emit("users", users);

  // استقبال طلب اتصال
  socket.on("call-user", (data) => {
    io.to(data.to).emit("receive-call", {
      from: socket.id,
      offer: data.offer,
    });
  });

  // استقبال رد الاتصال
  socket.on("answer-call", (data) => {
    io.to(data.to).emit("call-answered", {
      answer: data.answer,
    });
  });

  // استقبال مرشحات ICE
  socket.on("ice-candidate", (data) => {
    io.to(data.to).emit("ice-candidate", {
      candidate: data.candidate,
    });
  });

  // قطع الاتصال
  socket.on("disconnect", () => {
    console.log(`❌ User disconnected: ${socket.id}`);
    users = users.filter((id) => id !== socket.id);
    io.emit("users", users);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`WebSocket endpoint: /socket.io/`);
  console.log(`PeerJS endpoint: /peerjs`);
});
