document.addEventListener('DOMContentLoaded', () => {
    // Elements
    const localVideo = document.getElementById('localVideo');
    const remoteVideo = document.getElementById('remoteVideo');
    const userIdSpan = document.getElementById('userId');
    const copyIdBtn = document.getElementById('copyId');
    const randomConnectBtn = document.getElementById('randomConnect');
    const directConnectBtn = document.getElementById('directConnect');
    const targetIdInput = document.getElementById('targetId');
    const endCallBtn = document.getElementById('endCall');
    const toggleVideoBtn = document.getElementById('toggleVideo');
    const toggleAudioBtn = document.getElementById('toggleAudio');
    const callControls = document.querySelector('.call-controls');

    // State
    let userId = '';
    let socket;
    let peerConnection;
    let localStream;
    let isVideoOn = true;
    let isAudioOn = true;

    // Initialize
    init();

    async function init() {
        // Connect to signaling server
        socket = io('http://localhost:3000');

        // Generate user ID (in production, this should come from the server)
        userId = generateUserId();
        userIdSpan.textContent = userId;

        // Set up socket events
        socket.on('connect', () => {
            console.log('Connected to signaling server');
            socket.emit('register', userId);
        });

        socket.on('callRequest', handleCallRequest);
        socket.on('callResponse', handleCallResponse);
        socket.on('iceCandidate', handleICECandidate);
        socket.on('endCall', handleEndCall);
        socket.on('userNotFound', handleUserNotFound);

        // Set up button events
        copyIdBtn.addEventListener('click', copyUserId);
        randomConnectBtn.addEventListener('click', startRandomCall);
        directConnectBtn.addEventListener('click', startDirectCall);
        endCallBtn.addEventListener('click', endCall);
        toggleVideoBtn.addEventListener('click', toggleVideo);
        toggleAudioBtn.addEventListener('click', toggleAudio);

        // Get user media
        try {
            localStream = await navigator.mediaDevices.getUserMedia({
                video: true,
                audio: true
            });
            localVideo.srcObject = localStream;
        } catch (err) {
            console.error('Error accessing media devices:', err);
            alert('لا يمكن الوصول إلى الكاميرا أو الميكروفون. يرجى التحقق من الأذونات.');
        }
    }

    function generateUserId() {
        return Math.random().toString(36).substring(2, 10);
    }

    function copyUserId() {
        navigator.clipboard.writeText(userId);
        alert('تم نسخ المعرف إلى الحافظة');
    }

    async function startRandomCall() {
        socket.emit('randomCall', userId);
        showCallControls();
    }

    async function startDirectCall() {
        const targetId = targetIdInput.value.trim();
        if (!targetId) {
            alert('الرجاء إدخال معرف المستخدم');
            return;
        }

        if (targetId === userId) {
            alert('لا يمكنك الاتصال بنفسك');
            return;
        }

        // Create peer connection
        createPeerConnection();

        // Add local stream to connection
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });

        // Create and send offer
        try {
            const offer = await peerConnection.createOffer();
            await peerConnection.setLocalDescription(offer);
            socket.emit('callRequest', {
                from: userId,
                to: targetId,
                offer: offer
            });
            showCallControls();
        } catch (err) {
            console.error('Error creating offer:', err);
        }
    }

    function handleCallRequest(data) {
        const accept = confirm(`طلب اتصال من ${data.from}. هل تقبل؟`);
        
        if (accept) {
            // Create peer connection
            createPeerConnection();

            // Add local stream to connection
            localStream.getTracks().forEach(track => {
                peerConnection.addTrack(track, localStream);
            });

            // Set remote description and create answer
            peerConnection.setRemoteDescription(data.offer)
                .then(() => peerConnection.createAnswer())
                .then(answer => {
                    return peerConnection.setLocalDescription(answer);
                })
                .then(() => {
                    socket.emit('callResponse', {
                        to: data.from,
                        from: userId,
                        answer: peerConnection.localDescription
                    });
                    showCallControls();
                })
                .catch(err => {
                    console.error('Error handling call request:', err);
                });
        } else {
            socket.emit('callResponse', {
                to: data.from,
                from: userId,
                answer: null
            });
        }
    }

    function handleCallResponse(data) {
        if (data.answer) {
            peerConnection.setRemoteDescription(data.answer)
                .catch(err => {
                    console.error('Error setting remote description:', err);
                });
        } else {
            alert('تم رفض طلب الاتصال');
            resetConnection();
        }
    }

    function handleICECandidate(data) {
        if (peerConnection) {
            peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate))
                .catch(err => {
                    console.error('Error adding ICE candidate:', err);
                });
        }
    }

    function handleEndCall() {
        alert('تم إنهاء الاتصال من الطرف الآخر');
        resetConnection();
    }

    function handleUserNotFound() {
        alert('المستخدم غير موجود');
        resetConnection();
    }

    function createPeerConnection() {
        const configuration = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                // Add your TURN servers here if needed
            ]
        };

        peerConnection = new RTCPeerConnection(configuration);

        // Set up ICE candidate handling
        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                socket.emit('iceCandidate', {
                    to: remoteUserId,
                    from: userId,
                    candidate: event.candidate
                });
            }
        };

        // Set up remote stream handling
        peerConnection.ontrack = (event) => {
            remoteVideo.srcObject = event.streams[0];
        };

        // Handle connection state changes
        peerConnection.onconnectionstatechange = () => {
            if (peerConnection.connectionState === 'disconnected' || 
                peerConnection.connectionState === 'failed') {
                resetConnection();
            }
        };
    }

    function endCall() {
        socket.emit('endCall', { to: remoteUserId, from: userId });
        resetConnection();
    }

    function resetConnection() {
        if (peerConnection) {
            peerConnection.close();
            peerConnection = null;
        }
        remoteVideo.srcObject = null;
        hideCallControls();
    }

    function toggleVideo() {
        isVideoOn = !isVideoOn;
        localStream.getVideoTracks().forEach(track => {
            track.enabled = isVideoOn;
        });
        toggleVideoBtn.textContent = isVideoOn ? 'إيقاف الفيديو' : 'تشغيل الفيديو';
    }

    function toggleAudio() {
        isAudioOn = !isAudioOn;
        localStream.getAudioTracks().forEach(track => {
            track.enabled = isAudioOn;
        });
        toggleAudioBtn.textContent = isAudioOn ? 'إيقاف الصوت' : 'تشغيل الصوت';
    }

    function showCallControls() {
        callControls.classList.remove('hidden');
        randomConnectBtn.disabled = true;
        directConnectBtn.disabled = true;
    }

    function hideCallControls() {
        callControls.classList.add('hidden');
        randomConnectBtn.disabled = false;
        directConnectBtn.disabled = false;
    }
});
