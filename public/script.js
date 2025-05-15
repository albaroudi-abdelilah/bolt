const socket = io();
const usernameInput = document.getElementById('username');
const joinBtn = document.getElementById('join-btn');
const callBtn = document.getElementById('call-btn');
const targetUsernameInput = document.getElementById('target-username');
const localVideo = document.getElementById('local-video');
const remoteVideo = document.getElementById('remote-video');

let localStream;
let remoteStream;
let peerConnection;

joinBtn.addEventListener('click', () => {
  socket.emit('join', usernameInput.value);
  callBtn.disabled = false;
});

callBtn.addEventListener('click', () => {
  socket.emit('call', targetUsernameInput.value);
});

socket.on('call', (callerUsername) => {
  if (confirm(`Incoming call from ${callerUsername}. Accept?`)) {
    socket.emit('accept-call', callerUsername);
    startCall(callerUsername);
  }
});

socket.on('call-accepted', (targetUsername) => {
  startCall(targetUsername);
});

socket.on('offer', (offer, callerUsername) => {
  handleOffer(offer, callerUsername);
});

socket.on('answer', (answer) => {
  handleAnswer(answer);
});

socket.on('ice-candidate', (candidate) => {
  handleIceCandidate(candidate);
});

function startCall(targetUsername) {
  navigator.mediaDevices.getUserMedia({ video: true, audio: true })
    .then((stream) => {
      localStream = stream;
      localVideo.srcObject = stream;

      peerConnection = new RTCPeerConnection();
      peerConnection.addStream(stream);

      peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit('ice-candidate', event.candidate, targetUsername);
        }
      };

      peerConnection.onaddstream = (event) => {
        remoteStream = event.stream;
        remoteVideo.srcObject = remoteStream;
      };

      peerConnection.createOffer()
        .then((offer) => {
          return peerConnection.setLocalDescription(new RTCSessionDescription({ type: 'offer', sdp: offer }));
        })
        .then(() => {
          socket.emit('offer', peerConnection.localDescription, targetUsername);
        })
        .catch((error) => {
          console.error('Error creating offer:', error);
        });
    })
    .catch((error) => {
      console.error('Error accessing media devices:', error);
    });
}

function handleOffer(offer, callerUsername) {
  navigator.mediaDevices.getUserMedia({ video: true, audio: true })
    .then((stream) => {
      localStream = stream;
      localVideo.srcObject = stream;

      peerConnection = new RTCPeerConnection();
      peerConnection.addStream(stream);

      peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit('ice-candidate', event.candidate, callerUsername);
        }
      };

      peerConnection.onaddstream = (event) => {
        remoteStream = event.stream;
        remoteVideo.srcObject = remoteStream;
      };

      peerConnection.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp: offer }));
      peerConnection.createAnswer()
        .then((answer) => {
          return peerConnection.setLocalDescription(new RTCSessionDescription({ type: 'answer', sdp: answer }));
        })
        .then(() => {
          socket.emit('answer', peerConnection.localDescription);
        })
        .catch((error) => {
          console.error('Error creating answer:', error);
        });
    })
    .catch((error) => {
      console.error('Error accessing media devices:', error);
    });
}

function handleAnswer(answer) {
  peerConnection.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: answer }));
}

function handleIceCandidate(candidate) {
  peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
}
