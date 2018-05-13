import React from "react";
import "webrtc-adapter";
import faker from "faker";

class WebRTCPeerConnectionWithServer extends React.Component {
    state = {
        startDisabled: true,
        callDisabled: true,
        hangUpDisabled: true,
        pc1: null,
        pc2: null,
        localStream: null,
        signalingConnection: null,
        clientID: new Date().getTime() % 1000,
        username: faker.internet.userName(),
        userList: []
    };

    localVideoRef = React.createRef();
    remoteVideoRef = React.createRef();
    peerConnection = null;

    sendToServer = msg => {
        const msgJSON = JSON.stringify(msg);

        console.log("Sending", msg.type, msgJSON);
        this.state.signalingConnection.send(msgJSON);
    };

    setUsername = () => {
        const { username, clientID } = this.state;
        this.sendToServer({
            name: username,
            date: Date.now(),
            id: clientID,
            type: "username"
        });
    };

    changeUsername = event =>
        this.setState({
            username: event.target.value
        });

    componentDidMount() {
        this.connectToSocket();
    }
    connectToSocket = () => {
        let serverUrl = `wss://localhost:6503`;

        let signalingConnection = new WebSocket(serverUrl, "json");
        signalingConnection.onopen = () =>
            this.setState({
                startDisabled: false
            });

        signalingConnection.onmessage = event => {
            let text = "";
            let msg = JSON.parse(event.data);
            console.log("Message received: ");
            console.dir(msg);
            const time = new Date(msg.date),
                timeStr = time.toLocaleTimeString();

            switch (msg.type) {
                case "id":
                    this.setState({
                        clientID: msg.id
                    });
                    this.setUsername();
                    break;

                case "username":
                    console.log(`${msg.name} signed in at ${timeStr}`);
                    break;

                case "message":
                    console.log(`${timeStr}:: ${msg.name} -> ${msg.text}`);
                    break;

                case "rejectusername":
                    this.setState({
                        username: msg.name
                    });
                    console.log(
                        `Your username has been set to <${
                            msg.name
                        }> because the name you chose is in use`
                    );
                    break;

                case "userlist": // Received an updated user list
                    this.setState({
                        userList: msg.users
                    });
                    break;

                // // Signaling messages: these messages are used to trade WebRTC
                // // signaling information during negotiations leading up to a video
                // // call.

                case "video-offer": // Invitation and offer to chat
                    this.handleVideoOfferMsg(msg);
                    break;

                case "video-answer": // Callee has answered our offer
                    this.handleVideoAnswerMsg(msg);
                    break;

                case "new-ice-candidate": // A new ICE candidate has been received
                    this.handleNewICECandidateMsg(msg);
                    break;

                case "hang-up": // The other peer has hung up the call
                    this.handleHangUpMsg(msg);
                    break;

                // Unknown message; output to console for debugging.

                default:
                    console.error("Unknown message received:");
                    console.error(msg);
            }
        };

        this.setState({
            signalingConnection
        });
    };

    handleVideoOfferMsg = msg => {
        this.createPeerConnection();

        this.peerConnection
            .setRemoteDescription(new RTCSessionDescription(msg.sdp))
            .then(() => this.peerConnection.createAnswer())
            .then(answer => this.peerConnection.setLocalDescription(answer))
            .then(() => {
                this.sendToServer({
                    name: this.state.username,
                    targetUsername: this.state.targetUsername,
                    type: "video-answer",
                    sdp: this.peerConnection.localDescription
                });
            });
    };

    handleVideoAnswerMsg = msg => {
        console.log("handleVideoAnswerMsg", msg);

        this.peerConnection
            .setRemoteDescription(new RTCSessionDescription(msg.sdp))
            .catch(console.error);
    };

    handleNewICECandidateMsg = msg => {
        this.peerConnection.addIceCandidate(new RTCIceCandidate(msg.candidate));
    };

    handleHangUpMsg = msg => {
        console.log("handleHangUpMsg", msg);

        this.closeVideoCall();
    };

    gotStream = stream => {
        this.localVideoRef.current.srcObject = stream;
        this.setState({
            callDisabled: false,
            localStream: stream
        });
    };
    gotRemoteTrack = event => {
        console.log("got remote track", event);
        let remoteVideo = this.remoteVideoRef.current;

        if (remoteVideo.srcObject !== event.streams[0]) {
            remoteVideo.srcObject = event.streams[0];
        }

        this.setState({
            hangUpDisabled: false
        });
    };
    gotRemoteStream = event => {
        console.log("got remote stream", event);
        this.remoteVideoRef.current.srcObject = event.stream;
        this.setState({
            hangUpDisabled: false
        });
    };

    initMedia = () => {
        this.setState({
            startDisabled: true
        });
        navigator.mediaDevices
            .getUserMedia({
                audio: true,
                video: true
            })
            .then(this.gotStream)
            .catch(e => alert("getUserMedia() error:" + e.name));
    };

    call = user => {
        this.setState({
            targetUsername: user
        });
        this.createPeerConnection();
        if (this.state.localStream) {
            console.log("ADDING LOCAL");
            this.peerConnection.addStream(this.state.localStream);
        }
    };

    hangUp = () => {
        this.sendToServer({
            name: this.state.username,
            target: this.state.targetUsername,
            type: "hang-up"
        });
        this.closeVideoCall();
    };

    createPeerConnection = () => {
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
        // peerConnection.onicegatheringstatechange = this.handleICEGatheringStateChangeEvent;
        this.peerConnection.onsignalingstatechange = this.handleSignalingStateChangeEvent;
        this.peerConnection.onnegotiationneeded = this.handleNegotiationNeededEvent;
        this.peerConnection.ontrack = this.gotRemoteTrack;
        this.peerConnection.onaddstream = this.gotRemoteStream;

        console.log("peerconnection created", this.peerConnection);
    };

    handleICECandidateEvent = event => {
        if (event.candidate) {
            this.sendToServer({
                type: "new-ice-candidate",
                target: this.state.targetUsername,
                candidate: event.candidate
            });
        }
    };

    handleICEConnectionStateChangeEvent = event => {
        switch (this.peerConnection.iceConnectionState) {
            case "closed":
            case "failed":
            case "disconnected":
                this.closeVideoCall();
        }
    };

    handleSignalingStateChangeEvent = event => {
        switch (this.peerConnection.signalingState) {
            case "closed":
                this.closeVideoCall();
        }
    };

    handleNegotiationNeededEvent = () => {
        const { username, targetUsername } = this;
        this.peerConnection
            .createOffer()
            .then(offer => this.peerConnection.setLocalDescription(offer))
            .then(() =>
                this.sendToServer({
                    name: username,
                    target: targetUsername,
                    type: "video-offer",
                    sdp: this.peerConnection.localDescription
                })
            )
            .catch(console.error);
    };

    closeVideoCall = () => {
        this.remoteVideoRef.current.srcObject
            .getTracks()
            .forEach(track => track.stop());
        this.remoteVideoRef.current.src = null;
        this.peerConnection.close();
        this.peerConnection = null;

        this.setState({
            targetUsername: null,
            callDisabled: false
        });
    };

    render() {
        const {
            startDisabled,
            callDisabled,
            hangUpDisabled,
            username,
            userList
        } = this.state;

        return (
            <div>
                <div>
                    Username:{" "}
                    <input
                        type="text"
                        value={username}
                        onChange={this.changeUsername}
                    />
                    <button onClick={this.setUsername}>Set Username</button>
                </div>
                <video
                    ref={this.localVideoRef}
                    autoPlay
                    muted
                    style={{
                        width: "240px",
                        height: "180px"
                    }}
                />
                <video
                    ref={this.remoteVideoRef}
                    autoPlay
                    muted
                    style={{
                        width: "240px",
                        height: "180px"
                    }}
                />
                <div>
                    <button onClick={this.initMedia} disabled={startDisabled}>
                        Init Media
                    </button>

                    <button onClick={this.hangUp} disabled={hangUpDisabled}>
                        Hang Up
                    </button>
                </div>
                <div>
                    <ul>
                        {userList.map(user => (
                            <li>
                                {user}{" "}
                                {user !== username ? (
                                    <button
                                        onClick={() => this.call(user)}
                                        disabled={callDisabled}
                                    >
                                        Call
                                    </button>
                                ) : null}
                            </li>
                        ))}
                    </ul>
                </div>
            </div>
        );
    }
}

export default WebRTCPeerConnectionWithServer;
