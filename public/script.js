const socket = io();
const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");
const muteBtn = document.getElementById("muteBtn");
const endCallBtn = document.getElementById("endCallBtn");
const myIdSpan = document.getElementById("myId");

let localStream;
let isMuted = false;

const peerConnection = new RTCPeerConnection({
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
});

// Get media stream
navigator.mediaDevices.getUserMedia({ video: true, audio: true })
  .then((stream) => {
    localStream = stream;
    localVideo.srcObject = stream;

    stream.getTracks().forEach((track) => {
      peerConnection.addTrack(track, stream);
    });
  });

peerConnection.ontrack = (event) => {
  remoteVideo.srcObject = event.streams[0];
};

peerConnection.onicecandidate = (event) => {
  if (event.candidate) {
    socket.emit("ice-candidate", event.candidate);
  }
};

// Socket events
socket.on("connect", () => {
  myIdSpan.textContent = socket.id;

  // Send offer if first to connect
  peerConnection.createOffer()
    .then((offer) => {
      return peerConnection.setLocalDescription(offer);
    })
    .then(() => {
      socket.emit("offer", peerConnection.localDescription);
    });
});

socket.on("offer", async (offer) => {
  await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
  const answer = await peerConnection.createAnswer();
  await peerConnection.setLocalDescription(answer);
  socket.emit("answer", answer);
});

socket.on("answer", async (answer) => {
  await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
});

socket.on("ice-candidate", async (candidate) => {
  try {
    await peerConnection.addIceCandidate(candidate);
  } catch (e) {
    console.error("Error adding ice candidate", e);
  }
});

// Buttons
muteBtn.addEventListener("click", () => {
  if (!localStream) return;

  isMuted = !isMuted;
  localStream.getAudioTracks().forEach(track => {
    track.enabled = !isMuted;
  });

  muteBtn.textContent = isMuted ? "Unmute" : "Mute";
});

endCallBtn.addEventListener("click", () => {
  // Close connection
  peerConnection.close();
  localStream.getTracks().forEach(track => track.stop());

  // Clear video
  localVideo.srcObject = null;
  remoteVideo.srcObject = null;

  // Reload page (simple reset)
  location.reload();
});
