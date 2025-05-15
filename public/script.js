const socket = io();
const localVideo = document.getElementById("local-video");
const remoteVideo = document.getElementById("remote-video");
const callButton = document.getElementById("call");
const endCallButton = document.getElementById("end-btn");
const muteButton = document.getElementById("mute-btn");

let localStream, peerConnection;
let isMuted = false;

const servers = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

navigator.mediaDevices.getUserMedia({ video: true, audio: true })
  .then((stream) => {
    localStream = stream;
    localVideo.srcObject = stream;
  });

callButton.onclick = () => {
  const userId = document.getElementById("other-user-id").value;
  peerConnection = createPeerConnection(userId);

  localStream.getTracks().forEach((track) => peerConnection.addTrack(track, localStream));

  peerConnection.createOffer()
    .then((offer) => {
      peerConnection.setLocalDescription(offer);
      socket.emit("call-user", { to: userId, offer });
    });
};

muteButton.onclick = () => {
  isMuted = !isMuted;
  localStream.getAudioTracks()[0].enabled = !isMuted;
  muteButton.innerText = isMuted ? "Unmute" : "Mute";
};
socket.on("your-id", (id) => {
  document.getElementById("user-id").textContent = id;
});

endCallButton.onclick = () => {
  const userId = document.getElementById("other-user-id").value;
  socket.emit("end-call", { to: userId });
  closeCall();
};

socket.on("receive-call", async ({ from, offer }) => {
  peerConnection = createPeerConnection(from);

  localStream.getTracks().forEach((track) => peerConnection.addTrack(track, localStream));
  await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));

  const answer = await peerConnection.createAnswer();
  await peerConnection.setLocalDescription(answer);

  socket.emit("answer-call", { to: from, answer });
});

socket.on("call-answered", async ({ answer }) => {
  await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
});

socket.on("ice-candidate", ({ candidate }) => {
  peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
});

socket.on("call-ended", () => {
  closeCall();
  alert("Call ended by other user.");
});

function createPeerConnection(to) {
  const pc = new RTCPeerConnection(servers);

  pc.onicecandidate = (e) => {
    if (e.candidate) {
      socket.emit("ice-candidate", { to, candidate: e.candidate });
    }
  };

  pc.ontrack = (e) => {
    remoteVideo.srcObject = e.streams[0];
  };

  return pc;
}

function closeCall() {
  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }
  remoteVideo.srcObject = null;
}
