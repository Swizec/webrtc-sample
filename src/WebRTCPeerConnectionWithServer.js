import React from "react";
import "webrtc-adapter";
import faker from "faker";
import SignalingConnection from "./SignalingConnection";
import PeerConnection from "./PeerConnection";

class WebRTCPeerConnectionWithServer extends React.Component {
    state = {
        startDisabled: true,
        callDisabled: true,
        hangUpDisabled: true,
        pc1: null,
        pc2: null,
        localStream: null,
        clientID: new Date().getTime() % 1000,
        username: faker.internet.userName(),
        userList: []
    };

    localVideoRef = React.createRef();
    remoteVideoRef = React.createRef();
    peerConnection = null;
    signalingConnection = null;

    setUsername = () => {
        const { username, clientID } = this.state;
        this.signalingConnection.sendToServer({
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
        this.signalingConnection = new SignalingConnection({
            socketURL: "localhost:6503",
            onOpen: () =>
                this.setState({
                    startDisabled: false
                }),
            onMessage: this.onSignalingMessage
        });
    }

    onSignalingMessage = msg => {
        switch (msg.type) {
            case "id":
                this.setState({
                    clientID: msg.id
                });
                this.setUsername();
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
                this.createPeerConnection();
                this.peerConnection.videoOffer(msg);
                break;
        }
    };

    gotStream = stream => {
        this.localVideoRef.current.srcObject = stream;
        this.setState({
            callDisabled: false,
            localStream: stream
        });
    };
    gotRemoteTrack = event => {
        let remoteVideo = this.remoteVideoRef.current;

        if (remoteVideo.srcObject !== event.streams[0]) {
            remoteVideo.srcObject = event.streams[0];
        }

        this.setState({
            hangUpDisabled: false
        });
    };
    gotRemoteStream = event => {
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
    };

    hangUp = () => {
        this.signalingConnection.sendToServer({
            name: this.state.username,
            target: this.state.targetUsername,
            type: "hang-up"
        });
        this.peerConnection.close();
    };

    createPeerConnection = () => {
        if (this.peerConnection) return;

        this.peerConnection = new PeerConnection({
            gotRemoteStream: this.gotRemoteStream,
            gotRemoteTrack: this.gotRemoteTrack,
            signalingConnection: this.signalingConnection,
            onClose: this.closeVideoCall,
            localStream: this.state.localStream,
            username: this.state.username,
            targetUsername: this.state.targetUsername
        });
    };

    closeVideoCall = () => {
        this.remoteVideoRef.current.srcObject &&
            this.remoteVideoRef.current.srcObject
                .getTracks()
                .forEach(track => track.stop());
        this.remoteVideoRef.current.src = null;

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
                    <button onClick={this.setUsername}> Set Username </button>
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
                            <li key={user}>
                                {user}
                                {"  "}
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
