import React from "react";
// import "webrtc-adapter";
import faker from "faker";
import SignalingConnection from "./SignalingConnection";
import PeerConnection from "./PeerConnection";

class WebRTCDataChannel extends React.Component {
    state = {
        startDisabled: true,
        callDisabled: true,
        hangUpDisabled: true,
        localStream: null,
        clientID: new Date().getTime() % 1000,
        username: faker.internet.userName(),
        userList: []
    };

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
            // socketURL: "localhost:6503",
            socketURL: "webrtc-sample-signaling.now.sh",
            onOpen: () =>
                this.setState({
                    startDisabled: false,
                    callDisabled: false
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

            case "connection-offer": // Invitation and offer to chat
                if (msg.target === this.state.username) {
                    this.createPeerConnection(msg.name);
                    console.log(
                        "Calling connectionOffer from WebRTCDataChannel.onSignalingMessage",
                        JSON.stringify(msg)
                    );
                    this.peerConnection.connectionOffer(msg);
                }
                break;
        }
    };

    call = user => {
        this.createPeerConnection(user);
        this.peerConnection.offerConnection();
    };

    createPeerConnection = targetUsername => {
        if (this.peerConnection) return;

        console.log("creating peer connection");

        this.peerConnection = new PeerConnection({
            signalingConnection: this.signalingConnection,
            onClose: this.closeConnection,
            username: this.state.username,
            targetUsername,
            dataChannelLabel: "myDataChannel"
        });
    };

    sendData = () => {
        try {
            this.peerConnection.dataChannel.send("Hello they're");
        } catch (e) {
            console.log("Error sending");
        }
    };

    closeConnection = () => {
        this.setState({
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

                <div>
                    <button onClick={this.sendData}>Send Data</button>
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

export default WebRTCDataChannel;
