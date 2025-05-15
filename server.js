const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { ExpressPeerServer } = require('peer');
const path = require('path');
const fs = require('fs');

// إنشاء تطبيق Express
const app = express();
const server = http.createServer(app);

// إعداد Socket.io
const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});

// إعداد خادم PeerJS
const peerServer = ExpressPeerServer(server, {
    debug: true,
    path: '/peerjs'
});

// استخدام خادم PeerJS كـ middleware
app.use('/peerjs', peerServer);

// تقديم الملفات الثابتة من مجلد "public"
app.use(express.static(path.join(__dirname, 'public')));

// المستخدمين المتصلين
const connectedUsers = new Map();
// قائمة انتظار للمطابقة العشوائية
const waitingForRandomMatch = new Set();

// عندما يتصل مستخدم جديد
io.on('connection', (socket) => {
    console.log('مستخدم جديد متصل:', socket.id);

    // تسجيل المستخدم
    socket.on('register', ({ id }) => {
        console.log('تم تسجيل المستخدم:', id);
        connectedUsers.set(socket.id, id);
        
        // إرسال قائمة المستخدمين المتصلين
        io.emit('users-update', Array.from(connectedUsers.values()));
    });

    // البحث عن مطابقة عشوائية
    socket.on('find-random-match', ({ id }) => {
        console.log('البحث عن مطابقة عشوائية للمستخدم:', id);
        
        // إزالة المستخدم من قائمة الانتظار إذا كان موجودًا
        waitingForRandomMatch.delete(id);
        
        // البحث عن مستخدم آخر في قائمة الانتظار
        let match = null;
        for (const waitingUser of waitingForRandomMatch) {
            if (waitingUser !== id) {
                match = waitingUser;
                waitingForRandomMatch.delete(waitingUser);
                break;
            }
        }
        
        if (match) {
            // إرسال معلومات المطابقة لكلا المستخدمين
            socket.emit('random-match', { peerId: match });
            
            // البحث عن Socket ID للمستخدم المطابق
            let matchSocketId = null;
            for (const [socketId, peerId] of connectedUsers.entries()) {
                if (peerId === match) {
                    matchSocketId = socketId;
                    break;
                }
            }
            
            if (matchSocketId) {
                io.to(matchSocketId).emit('random-match', { peerId: id });
            }
            
            console.log('تم العثور على مطابقة بين', id, 'و', match);
        } else {
            // إضافة المستخدم إلى قائمة الانتظار
            waitingForRandomMatch.add(id);
            console.log('تمت إضافة المستخدم', id, 'إلى قائمة الانتظار');
        }
    });

    // عندما يقطع المستخدم الاتصال
    socket.on('disconnect', () => {
        const userId = connectedUsers.get(socket.id);
        if (userId) {
            console.log('انقطع اتصال المستخدم:', userId);
            
            // إزالة المستخدم من قائمة المستخدمين المتصلين
            connectedUsers.delete(socket.id);
            
            // إزالة المستخدم من قائمة الانتظار
            waitingForRandomMatch.delete(userId);
            
            // إرسال قائمة محدثة بالمستخدمين المتصلين
            io.emit('users-update', Array.from(connectedUsers.values()));
        }
    });

    // إشعار عند انتهاء المكالمة
    socket.on('call-ended', ({ peerId }) => {
        console.log('انتهت المكالمة مع:', peerId);
        
        // البحث عن Socket ID للطرف الآخر
        let peerSocketId = null;
        for (const [socketId, id] of connectedUsers.entries()) {
            if (id === peerId) {
                peerSocketId = socketId;
                break;
            }
        }
        
        if (peerSocketId) {
            io.to(peerSocketId).emit('call-ended');
        }
    });
});

// التعامل مع طلب الصفحة الرئيسية
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// بدء الخادم
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`الخادم يعمل على المنفذ ${PORT}`);
});

// التأكد من وجود مجلد public
const publicDir = path.join(__dirname, 'public');
if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir);
}

// نسخ ملف الواجهة الأمامية إلى مجلد public
// تأكد من وجود ملف index.html في مجلد المشروع الرئيسي أولاً
const indexPath = path.join(__dirname, 'index.html');
if (fs.existsSync(indexPath)) {
    fs.writeFileSync(
        path.join(publicDir, 'index.html'),
        fs.readFileSync(indexPath, 'utf8')
    );
} else {
    console.error('لم يتم العثور على ملف index.html! يرجى التأكد من إنشاء الملف أولاً.');
}

console.log('تم إعداد خادم PeerJS بنجاح!');
console.log('يمكنك الآن فتح المتصفح على http://localhost:3000 لاستخدام التطبيق');
