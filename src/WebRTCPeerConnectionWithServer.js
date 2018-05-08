import React from "react";
import "webrtc-adapter";

// copied from common.js https://github.com/webrtc/samples/blob/gh-pages/src/js/common.js
function trace(arg) {
    var now = (window.performance.now() / 1000).toFixed(3);
    console.log(now + ": ", arg);
}

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
        username: "",
        userList: []
    };

    localVideoRef = React.createRef();
    remoteVideoRef = React.createRef();

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

                // case "video-answer": // Callee has answered our offer
                //     handleVideoAnswerMsg(msg);
                //     break;

                // case "new-ice-candidate": // A new ICE candidate has been received
                //     handleNewICECandidateMsg(msg);
                //     break;

                // case "hang-up": // The other peer has hung up the call
                //     handleHangUpMsg(msg);
                //     break;

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

    handleVideoOfferMsg = msg => {};

    start = () => {
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
    gotStream = stream => {
        this.localVideoRef.current.srcObject = stream;
        this.setState({
            callDisabled: false,
            localStream: stream
        });
    };
    gotRemoteStream = event => {
        let remoteVideo = this.remoteVideoRef.current;

        if (remoteVideo.srcObject !== event.streams[0]) {
            remoteVideo.srcObject = event.streams[0];
        }
    };

    call = () => {
        this.setState({
            callDisabled: true,
            hangUpDisabled: false
        });
        let { localStream } = this.state;

        // Ah, servers needs to be some sort of iceServer thing
        // https://developer.mozilla.org/en-US/docs/Web/API/RTCIceServer
        let servers = null,
            pc1 = new RTCPeerConnection(servers), // what is servers??
            pc2 = new RTCPeerConnection(servers);

        pc1.onicecandidate = e => this.onIceCandidate(pc1, e);
        pc1.oniceconnectionstatechange = e => this.onIceStateChange(pc1, e);

        pc2.onicecandidate = e => this.onIceCandidate(pc2, e);
        pc2.oniceconnectionstatechange = e => this.onIceStateChange(pc2, e);
        pc2.ontrack = this.gotRemoteStream;

        localStream
            .getTracks()
            .forEach(track => pc1.addTrack(track, localStream));

        pc1
            .createOffer({
                offerToReceiveAudio: 1,
                offerToReceiveVideo: 1
            })
            .then(this.onCreateOfferSuccess, error =>
                console.error(
                    "Failed to create session description",
                    error.toString()
                )
            );

        console.log("servers after call", servers);

        this.setState({
            pc1,
            pc2,
            localStream
        });
    };

    onCreateOfferSuccess = desc => {
        let { pc1, pc2 } = this.state;

        pc1
            .setLocalDescription(desc)
            .then(
                () =>
                    console.log("pc1 setLocalDescription complete createOffer"),
                error =>
                    console.error(
                        "pc1 Failed to set session description in createOffer",
                        error.toString()
                    )
            );

        pc2.setRemoteDescription(desc).then(
            () => {
                console.log("pc2 setRemoteDescription complete createOffer");
                pc2
                    .createAnswer()
                    .then(this.onCreateAnswerSuccess, error =>
                        console.error(
                            "pc2 Failed to set session description in createAnswer",
                            error.toString()
                        )
                    );
            },
            error =>
                console.error(
                    "pc2 Failed to set session description in createOffer",
                    error.toString()
                )
        );
    };

    onCreateAnswerSuccess = desc => {
        let { pc1, pc2 } = this.state;

        pc1.setRemoteDescription(desc).then(
            () => {
                console.log("pc1 setRemoteDescription complete createAnswer");
            },
            error =>
                console.error(
                    "pc1 Failed to set session description in onCreateAnswer",
                    error.toString()
                )
        );

        pc2
            .setLocalDescription(desc)
            .then(
                () =>
                    console.log(
                        "pc2 setLocalDescription complete createAnswer"
                    ),
                error =>
                    console.error(
                        "pc2 Failed to set session description in onCreateAnswer",
                        error.toString()
                    )
            );
    };

    onIceCandidate = (pc, event) => {
        let { pc1, pc2 } = this.state;

        let otherPc = pc === pc1 ? pc2 : pc1;

        otherPc
            .addIceCandidate(event.candidate)
            .then(
                () => console.log("addIceCandidate success"),
                error =>
                    console.error(
                        "failed to add ICE Candidate",
                        error.toString()
                    )
            );
    };

    onIceStateChange = (pc, event) => {
        console.log("ICE state:", pc.iceConnectionState);
    };

    hangUp = () => {
        let { pc1, pc2 } = this.state;

        pc1.close();
        pc2.close();

        this.setState({
            pc1: null,
            pc2: null,
            hangUpDisabled: true,
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
                    style={{
                        width: "240px",
                        height: "180px"
                    }}
                />
                <div>
                    <button onClick={this.start} disabled={startDisabled}>
                        Start
                    </button>
                    <button onClick={this.call} disabled={callDisabled}>
                        Call
                    </button>
                    <button onClick={this.hangUp} disabled={hangUpDisabled}>
                        Hang Up
                    </button>
                </div>
                <div>
                    <ul>{userList.map(user => <li>{user}</li>)}</ul>
                </div>
            </div>
        );
    }
}

export default WebRTCPeerConnectionWithServer;
