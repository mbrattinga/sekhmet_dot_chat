/* eslint-disable */
import { sendToServer } from "./webSocket.js";
/* ========== the interface: ========== */

/* === please overwrite: === */

// add message to message db and re-draw interface
// send message to server via web socket
//export var sendToServer   = (message) => {console.log(message)};

export var hooks = {
	collectMessage: (message) => {
		console.log(message);
	},
	storeConnection: (personId, connection) => {},
	getConnection: (personId) => {},
	storeChannel: (chatId, personId, channel) => {},
};
// gets the local people data structure:
export var values = {
	my_id: 0,
};
/* === please implement: === */

//execute on incoming messages over web socket
export function theP2pMessageSwitch(message) {
	switch (message.messageType) {
		case "answer":
			hooks
				.getConnection(message.message.personId)
				.setRemoteDescription(message.message.answer);
			break;
		case "offer":
			receiveOffer(message.message);
			break;
		case "iceCandidate":
			receiveIceCandidate(message.message);
			break;
	}
}

/* ========== on the sender side: ==========
	send offer, confirm answer, negotiate Ice,
	create data channel at some point.
*/

// add channel to connection, or create connection first if nescecary

export function addChannel(chatId,personId){
    //gets connection by personId
    var connection = hooks.getConnection(personId)
    var channel = null;
    if (connection == null){
	var connection = myNewRtcPeerConnection(personId);
	channel = connection.createDataChannel(chatId,{"ordered" : false})
	connection.createOffer().then(
	    (offer) => {
		// puts connection in persons data structure:
		connection.setLocalDescription(offer)
		sendToServer({
		    messageType: "offer",
		    receiverId: personId,
		    message:{
			"personId": values.my_id,
			"offer": offer
		    }
		});
	    },
	    onOfferGeneratedFailure
	);
	hooks.storeConnection(personId,connection);
    } else {
	channel = connection.createDataChannel(chatId)
    }
    collectChannel(personId,channel);
}
// errors
function onOfferGeneratedFailure(error){
    console.log("generating offer failed: " + error.toString());
}
/* ========== on the receiver side: ===========
	receive offer, generate answer, negotiate ice,
	be ready for data channel
*/
function receiveOffer(serverOffer) {
	var connection = myNewRtcPeerConnection(serverOffer.personId);
	hooks.storeConnection(serverOffer.personId, connection);
	connection.setRemoteDescription(serverOffer.offer);
	connection.createAnswer().then((answer) => {
		connection.setLocalDescription(answer);
		sendToServer({
			messageType: "answer",
			receiverId: serverOffer.personId,
			message: {
				personId: values.my_id,
				answer: answer,
			},
		});
		//stores connection in db
	}, onAnswerGeneratedFailure);
}
// errors
function onAnswerGeneratedFailure(error) {
	console.log("generating answer failed: " + error.toString());
}

/* ========== For both senders and receivers: ==========
	boilerplate, ice negotiation, channel administration.
*/
function myNewRtcPeerConnection(personId) {
	//reducing boilerplate
	var connection = new RTCPeerConnection();
	connection.onicecandidate = function(event) {
		sendToServer({
			messageType: "iceCandidate",
			receiverId: personId,
			message: {
				personId: values.my_id,
				iceCandidate: event.candidate,
			},
		});
	};
	connection.ondatachannel = (event) => {
		collectChannel(personId, event.channel);
	};
	/*technically, this line is unnecessary for senders, as they should be the only ones
        creating data channels (since they are persistent and only get created along with
        the connections), but this line breaks nothing and should add flexibility*/
	return connection;
}

function receiveIceCandidate(serverIceCandidate) {
	// discussing the nature & routing of the connection
	// gets connection by serverIceCandidate.personId (switched from recipient to sender by server)
	var connection = hooks.getConnection(serverIceCandidate.personId);
	connection
		.addIceCandidate(serverIceCandidate.iceCandidate)
		.then(
			onAddIceCandidateSuccess(serverIceCandidate.personId),
			onAddIceCandidateFaliure
		);
}

function collectChannel(personId, channel) {
	// reducing boilerplate
	channel.onmessage = (event) => {
		hooks.collectMessage(event.data);
	};
	/*since data channel already is unique per person per chat, rather than reading that data from the incoming message we could pre-define those in this eventhook*/
	channel.onopen = onChannelOpen(channel.label);
	channel.onclose = onChannelClose(channel.label);
	//stores channel (I hate this)
	hooks.storeChannel(channel.label, personId, channel);
}

// fun logging shit
// just info
function onChannelOpen(label) {
	console.log("channel " + label + " now open");
}
function onChannelClose(label) {
	console.log("channel " + label + " now closed");
}
function onAddIceCandidateSuccess(personId) {
	console.log("iceCandidate for " + personId + " added");
}
// errors
function onAddIceCandidateFaliure(error) {
	console.log("adding IceCandidate failed: ${error.toString()}");
}
