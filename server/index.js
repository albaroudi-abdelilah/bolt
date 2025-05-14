import express from 'express';
import http from 'node:http';
import { Server } from 'socket.io';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Active users in the system
const activeUsers = new Map();
// Current calls (both random and specific)
const activeCalls = new Map();
// Group calls
const groupCalls = new Map();
// Users in the random call queue
const randomCallQueue = [];

io.on('connection', (socket) => {
  console.log('New user connected:', socket.id);
  
  // Register user with their unique ID
  socket.on('register', (userId) => {
    console.log(`User ${userId} registered with socket ${socket.id}`);
    activeUsers.set(userId, { socketId: socket.id, inCall: false });
    
    // Send current active status back to user
    socket.emit('registered', { userId, activeUsers: Array.from(activeUsers.keys()) });
  });

  // Handle random call request
  socket.on('requestRandomCall', (userData) => {
    const { userId } = userData;
    const userInfo = activeUsers.get(userId);
    
    if (!userInfo || userInfo.inCall) {
      socket.emit('callError', { message: 'You are already in a call or not properly registered.' });
      return;
    }
    
    // Add user to random call queue
    randomCallQueue.push(userId);
    console.log(`User ${userId} added to random call queue. Queue length: ${randomCallQueue.length}`);
    
    // Check if we can match with another user
    if (randomCallQueue.length >= 2) {
      const caller = randomCallQueue.shift();
      const callee = randomCallQueue.shift();
      
      if (caller !== userId) {
        // Ensure the current user is the caller
        [caller, callee] = [callee, caller];
      }
      
      const callerSocket = io.sockets.sockets.get(activeUsers.get(caller).socketId);
      const calleeSocket = io.sockets.sockets.get(activeUsers.get(callee).socketId);
      
      if (!callerSocket || !calleeSocket) {
        // Handle missing socket
        if (callerSocket) randomCallQueue.unshift(caller);
        if (calleeSocket) randomCallQueue.unshift(callee);
        socket.emit('callError', { message: 'Connection issue with matched user.' });
        return;
      }
      
      // Create a call ID
      const callId = `${caller}-${callee}-${Date.now()}`;
      activeCalls.set(callId, { participants: [caller, callee], type: 'random' });
      
      // Update user status
      activeUsers.set(caller, { ...activeUsers.get(caller), inCall: true, callId });
      activeUsers.set(callee, { ...activeUsers.get(callee), inCall: true, callId });
      
      // Notify both users about the match
      callerSocket.emit('callMatched', { callId, userId: callee, isInitiator: true });
      calleeSocket.emit('callMatched', { callId, userId: caller, isInitiator: false });
      
      console.log(`Random call matched: ${caller} and ${callee} in call ${callId}`);
    } else {
      socket.emit('waitingForMatch');
    }
  });
  
  // Handle direct call request
  socket.on('callUser', ({ callerId, calleeId }) => {
    const caller = activeUsers.get(callerId);
    const callee = activeUsers.get(calleeId);
    
    if (!caller || !callee) {
      socket.emit('callError', { message: 'User not found or not online.' });
      return;
    }
    
    if (caller.inCall) {
      socket.emit('callError', { message: 'You are already in a call.' });
      return;
    }
    
    if (callee.inCall) {
      socket.emit('callError', { message: 'User is already in another call.' });
      return;
    }
    
    // Create a call request
    const callId = `${callerId}-${calleeId}-${Date.now()}`;
    
    // Notify the callee about incoming call
    io.to(callee.socketId).emit('incomingCall', {
      callId,
      from: callerId,
      callType: 'direct'
    });
    
    // Notify caller that we're calling
    socket.emit('calling', { callId, userId: calleeId });
    
    console.log(`Direct call request: ${callerId} to ${calleeId}, call ID: ${callId}`);
  });
  
  // Handle call acceptance
  socket.on('acceptCall', ({ callId, userId }) => {
    const callerInfo = activeCalls.get(callId) || 
                       { participants: callId.split('-').slice(0, 2), type: 'direct' };
                      
    if (!callerInfo) {
      socket.emit('callError', { message: 'Call not found.' });
      return;
    }
    
    const [callerId, calleeId] = callerInfo.participants;
    const caller = activeUsers.get(callerId);
    const callee = activeUsers.get(calleeId);
    
    if (!caller || !callee) {
      socket.emit('callError', { message: 'One of the participants is not available.' });
      return;
    }
    
    // Update call in active calls if not already there
    if (!activeCalls.has(callId)) {
      activeCalls.set(callId, callerInfo);
    }
    
    // Update user status
    activeUsers.set(callerId, { ...caller, inCall: true, callId });
    activeUsers.set(calleeId, { ...callee, inCall: true, callId });
    
    // Notify both parties that call is established
    io.to(caller.socketId).emit('callAccepted', { callId, userId: calleeId });
    io.to(callee.socketId).emit('callAccepted', { callId, userId: callerId });
    
    console.log(`Call ${callId} accepted between ${callerId} and ${calleeId}`);
  });
  
  // Handle call rejection
  socket.on('rejectCall', ({ callId, userId }) => {
    const [callerId, calleeId] = callId.split('-');
    const caller = activeUsers.get(callerId);
    
    if (caller) {
      io.to(caller.socketId).emit('callRejected', { callId, userId: calleeId });
      console.log(`Call ${callId} rejected by ${calleeId}`);
    }
  });
  
  // Handle WebRTC signaling
  socket.on('signal', ({ callId, userId, signal }) => {
    const callInfo = activeCalls.get(callId) || groupCalls.get(callId);
    
    if (!callInfo) {
      console.log(`Signal for unknown call ${callId}`);
      return;
    }
    
    if (callInfo.type === 'group') {
      // For group calls, broadcast to all other participants
      callInfo.participants.forEach(participantId => {
        if (participantId !== userId) {
          const participant = activeUsers.get(participantId);
          if (participant) {
            io.to(participant.socketId).emit('signal', {
              callId,
              userId,
              signal
            });
          }
        }
      });
    } else {
      // For direct or random calls, find the other participant
      const otherUserId = callInfo.participants.find(id => id !== userId);
      if (otherUserId) {
        const otherUser = activeUsers.get(otherUserId);
        if (otherUser) {
          io.to(otherUser.socketId).emit('signal', {
            callId,
            userId,
            signal
          });
        }
      }
    }
  });
  
  // Create group call
  socket.on('createGroupCall', ({ userId }) => {
    const user = activeUsers.get(userId);
    
    if (!user) {
      socket.emit('callError', { message: 'User not registered.' });
      return;
    }
    
    if (user.inCall) {
      socket.emit('callError', { message: 'You are already in a call.' });
      return;
    }
    
    // Create a new group call
    const callId = `group-${userId}-${Date.now()}`;
    groupCalls.set(callId, {
      creator: userId,
      participants: [userId],
      type: 'group'
    });
    
    // Update user status
    activeUsers.set(userId, { ...user, inCall: true, callId });
    
    // Notify creator about the new group call
    socket.emit('groupCallCreated', { callId });
    
    console.log(`Group call ${callId} created by ${userId}`);
  });
  
  // Join group call
  socket.on('joinGroupCall', ({ callId, userId }) => {
    const groupCall = groupCalls.get(callId);
    const user = activeUsers.get(userId);
    
    if (!groupCall) {
      socket.emit('callError', { message: 'Group call not found.' });
      return;
    }
    
    if (!user) {
      socket.emit('callError', { message: 'User not registered.' });
      return;
    }
    
    if (user.inCall && user.callId !== callId) {
      socket.emit('callError', { message: 'You are already in another call.' });
      return;
    }
    
    // If user is already in this call, do nothing
    if (groupCall.participants.includes(userId)) {
      return;
    }
    
    // Add user to group call
    groupCall.participants.push(userId);
    
    // Update user status
    activeUsers.set(userId, { ...user, inCall: true, callId });
    
    // Notify all participants about the new user
    groupCall.participants.forEach(participantId => {
      if (participantId !== userId) {
        const participant = activeUsers.get(participantId);
        if (participant) {
          io.to(participant.socketId).emit('userJoinedCall', { callId, userId });
        }
      }
    });
    
    // Send the new user information about all existing participants
    socket.emit('groupCallJoined', {
      callId,
      participants: groupCall.participants.filter(id => id !== userId)
    });
    
    console.log(`User ${userId} joined group call ${callId}`);
  });
  
  // Leave call (works for all call types)
  socket.on('leaveCall', ({ callId, userId }) => {
    handleUserLeaveCall(userId, callId);
  });
  
  // Handle disconnections
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    
    // Find and clean up the disconnected user
    for (const [userId, userInfo] of activeUsers.entries()) {
      if (userInfo.socketId === socket.id) {
        if (userInfo.inCall) {
          handleUserLeaveCall(userId, userInfo.callId);
        }
        
        // Remove from random call queue if present
        const queueIndex = randomCallQueue.indexOf(userId);
        if (queueIndex !== -1) {
          randomCallQueue.splice(queueIndex, 1);
        }
        
        activeUsers.delete(userId);
        console.log(`User ${userId} removed from active users due to disconnect`);
        break;
      }
    }
  });
  
  // Helper function to handle a user leaving any type of call
  function handleUserLeaveCall(userId, callId) {
    if (!callId) return;
    
    const user = activeUsers.get(userId);
    if (!user || !user.inCall) return;
    
    // Check if it's a group call
    const groupCall = groupCalls.get(callId);
    
    if (groupCall) {
      // Remove user from group call
      const participantIndex = groupCall.participants.indexOf(userId);
      if (participantIndex !== -1) {
        groupCall.participants.splice(participantIndex, 1);
      }
      
      // If no participants left, remove the group call
      if (groupCall.participants.length === 0) {
        groupCalls.delete(callId);
        console.log(`Group call ${callId} ended - no participants left`);
      } else {
        // Notify other participants
        groupCall.participants.forEach(participantId => {
          const participant = activeUsers.get(participantId);
          if (participant) {
            io.to(participant.socketId).emit('userLeftCall', { callId, userId });
          }
        });
        console.log(`User ${userId} left group call ${callId}`);
      }
    } else {
      // Handle regular call
      const call = activeCalls.get(callId);
      if (call) {
        const otherUserId = call.participants.find(id => id !== userId);
        
        // Notify the other user
        if (otherUserId) {
          const otherUser = activeUsers.get(otherUserId);
          if (otherUser) {
            io.to(otherUser.socketId).emit('callEnded', { callId, userId });
            // Update other user's status
            activeUsers.set(otherUserId, { ...otherUser, inCall: false, callId: null });
          }
        }
        
        // Remove the call
        activeCalls.delete(callId);
        console.log(`Call ${callId} ended - user ${userId} left`);
      }
    }
    
    // Update user status
    activeUsers.set(userId, { ...user, inCall: false, callId: null });
  }
});

const PORT = process.env.PORT || 2000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});