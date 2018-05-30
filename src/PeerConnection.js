class PeerConnection {
    constructor({
        gotRemoteStream,
        gotRemoteTrack,
        signalingConnection,
        onClose,
        localStream,
        username,
        targetUsername,
        dataChannelLabel
    }) {
        this.signalingConnection = signalingConnection;
        this.onClose = onClose;
        this.localStream = localStream;
        this.username = username;
        this.targetUsername = targetUsername;
        this.dataChannelLabel = dataChannelLabel;

        this.peerConnection = new RTCPeerConnection({
            iceServers: [
                {
                    urls: `turn:${window.location.hostname}`,
                    username: "webrtc",
                    credential: "turnserver"
                }
            ]
        });
        this.peerConnection.onicecandidate = this.handleICECandidateEvent;
        this.peerConnection.oniceconnectionstatechange = this.handleICEConnectionStateChangeEvent;
        this.peerConnection.onsignalingstatechange = this.handleSignalingStateChangeEvent;
        // this.peerConnection.onnegotiationneeded = this.handleNegotiationNeededEvent;
        this.peerConnection.onaddtrack = gotRemoteTrack;
        this.peerConnection.onaddstream = gotRemoteStream;

        if (this.localStream) {
            this.peerConnection.addStream(this.localStream);
        }
        if (this.dataChannelLabel) {
            this.dataChannel = this.peerConnection.createDataChannel(
                this.dataChannelLabel,
                {
                    ordered: true,
                    maxRetransmitTime: 3000
                }
            );
            this.dataChannel.onerror = error =>
                console.error("Data channel error", error);
            this.dataChannel.onmessage = this.onDataChannelMessage;
            this.dataChannel.onopen = () => {
                console.log("Data channel open");
                this.dataChannel.send("Hello world!");
            };
            this.dataChannel.onclose = () => console.log("Data channel closed");
        }

        this.msgUnlisten = this.signalingConnection.addMsgListener(
            this.onSignalingMessage
        );

        console.log("peerconnection created", this.peerConnection);
    }

    handleICECandidateEvent = event => {
        if (event.candidate) {
            this.signalingConnection.sendToServer({
                type: "new-ice-candidate",
                target: this.targetUsername,
                candidate: event.candidate
            });
        }
    };

    handleICEConnectionStateChangeEvent = event => {
        switch (this.peerConnection.iceConnectionState) {
            case "closed":
            case "failed":
            case "disconnected":
                this.close();
        }
    };

    handleSignalingStateChangeEvent = event => {
        switch (this.peerConnection.signalingState) {
            case "closed":
                this.close();
        }
    };

    offerConnection = () => {
        const { username, targetUsername } = this;

        console.log("creating offer");
        this.peerConnection
            .createOffer()
            .then(offer => {
                console.log("attempting local description", offer);
                console.log("state", this.peerConnection.signalingState);

                return this.peerConnection.setLocalDescription(offer);
            })
            .then(() => {
                console.log(
                    "Sending offer to",
                    targetUsername,
                    "from",
                    username
                );
                this.signalingConnection.sendToServer({
                    name: username,
                    target: targetUsername,
                    type: "connection-offer",
                    sdp: this.peerConnection.localDescription
                });
            })
            .catch(err => {
                console.log("Error in handleNegotiationNeededEvent");
                console.error(err);
            });
    };

    connectionOffer = ({ sdp }) => {
        const { username, targetUsername } = this;

        this.peerConnection
            .setRemoteDescription(new RTCSessionDescription(sdp))
            .then(() => this.peerConnection.createAnswer())
            .then(answer => {
                return this.peerConnection.setLocalDescription(answer);
            })
            .then(() => {
                this.signalingConnection.sendToServer({
                    name: username,
                    targetUsername: targetUsername,
                    type: "connection-answer",
                    sdp: this.peerConnection.localDescription
                });
            })
            .catch(err => {
                console.log("Error in connectionOffer");
                console.error(err);
            });
    };

    connectionAnswer = ({ sdp }) => {
        this.peerConnection
            .setRemoteDescription(new RTCSessionDescription(sdp))
            .catch(err => {
                console.log("Error in connectionAnswer");
                console.error(err);
            });
    };

    newICECandidate = ({ candidate }) => {
        this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    };

    onSignalingMessage = msg => {
        switch (msg.type) {
            case "connection-answer": // Callee has answered our offer
                console.log(
                    "Calling connectionAnswer from PeerConnection.onSignalingMessage"
                );
                this.connectionAnswer(msg);
                break;

            case "new-ice-candidate": // A new ICE candidate has been received
                this.newICECandidate(msg);
                break;

            case "hang-up": // The other peer has hung up the call
                this.close();
                break;
        }
    };

    onDataChannelMessage = msg => {
        console.log("Data channel message received", msg);
    };

    close = () => {
        this.peerConnection.close();
        this.peerConnection = null;

        this.onClose();
    };
}

export default PeerConnection;
