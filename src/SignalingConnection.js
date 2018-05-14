class SignalingConnection {
    connection = null;
    messageListeners = []

    constructor({
        socketURL,
        onOpen,
        onMessage
    }) {
        this.socketURL = socketURL;
        this.onOpen = onOpen;
        this.messageListeners = [onMessage]
        this.connectToSocket();
    }

    sendToServer = msg => {
        const msgJSON = JSON.stringify(msg);

        console.log("Sending", msg.type, msgJSON);
        this.connection.send(msgJSON);
    };

    connectToSocket = () => {
        let serverUrl = `wss://${this.socketURL}`;

        this.connection = new WebSocket(serverUrl, "json");
        this.connection.onopen = () => this.onOpen()

        this.connection.onmessage = event => {
            let msg = JSON.parse(event.data);

            console.log("Message received: ");
            console.dir(msg);

            this.messageListeners.forEach(func => func(msg))
        }
    };

    addMsgListener = func => {
        this.messageListeners = [...this.messageListeners, func]
        return () => {
            this.messageListeners = this.messageListeners.filter(f => f !== func)
        }
    }
};


export default SignalingConnection;