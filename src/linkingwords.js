/* jslint node: true */

module.exports = function (io) {
    "use strict";

    var wait = require('wait.for'),
        nconf = require("nconf");

    var module = {};

    // Modules
    var userManagement = require("./user.js")(io);
    var gc = require("./user-gc.js")();
    var chat = require("./chat.js")(io);
    var master = require("./master.js")(io);
    var wordMatcher = require("./word")(io);
    var bottleMatcher = require("./bottle")(io);

    module.releaseResourceForUser = function (userId) {
        userManagement.isUserAlive(userId, function (err, isAlive) {
            if (isAlive) {
                userManagement.disconnectUser(userId);
                bottleMatcher.destroyBottlesForUser(userId);
                wordMatcher.cleanWordsPendingListForUser(userId);
                chat.leaveRooms(userId);
                userManagement.delSocketForUser(userId);
                gc.removeFromGarbageCollection(userId);
            }
        });
    };

    // Start garbage collector
    gc.start(module.releaseResourceForUser);

    /******************************************************
     *
     * List of Events from server side:
     * -------------------------------
     * Received:
     * ---------
     * request-promotion: an user request the promotion of an other user
     * -
     * word: word tossed by client
     * remove-pending-word: user removed a word from her pending list
     * -
     * cast-bottle: user cast a bottle with a message
     * wander-shore: user is looking for a bottle
     * -
     * chat-message: chat message received from a client
     * leave-room: user left the room by clicking the top right cross
     * -
     * master-broadcast: message to broadcast received from a master
     *
     ******************************************************/

    io.sockets.on('connection', function (socket) {
        var connectionType = socket.handshake.query.connection_type;
        var userId = socket.handshake.query.user_id;

        if (connectionType === "master") {
            initMasterConnection(socket);
        } else {
            wait.launchFiber(initRegularUserConnection, socket, userId);
        }
    });

    function initRegularUserConnection(socket, userId) {

        if (!userManagement.hasSocketAssociated(userId)) {
            // First connection
            userManagement.init(socket, userId);
            //chat.init();
            wordMatcher.init(socket);
            bottleMatcher.init(socket, userId);
        } else {
            // Reconnect
            chat.rejoinRooms(socket, userId);
            gc.removeFromGarbageCollection(userId);
        }

        userManagement.setSocketForUser(userId, socket.id);

        /***********************
         *
         * User related
         *
         ***********************/

        socket.on('disconnect', function () {
            console.log("Socket disconnection of: " + socket.id);
            wait.launchFiber(gc.addForGarbageCollection, userId);
            userManagement.delSocketForUser(userId);
        });

        socket.on("request-promotion", function (data) {
            wait.launchFiber(userManagement.promoteUser, socket, data.userId, data.userToPromoteHash);
        });

        /***********************
         *
         * Word related
         *
         ***********************/

        // On word received
        socket.on('word', function (data) {
            wait.launchFiber(wordMatcher.validateWordAndTryToMatch, data.word, data.userId, socket);
        });

        // On user removing a word from her pending list
        socket.on('remove-pending-word', function (data) {
            wordMatcher.removePendingWord(data.word, data.userId);
        });

        /***********************
         *
         * Bottle related
         *
         ***********************/

        // On bottle received
        socket.on('cast-bottle', function (data) {
            wait.launchFiber(bottleMatcher.validateAndStoreBottle, data.bottle, socket, data.userId);
        });

        socket.on('wander-shore', function (data) {
            wait.launchFiber(bottleMatcher.searchForABottle, data.userId, socket);
        });

        /***********************
         *
         * Chat related
         *
         ***********************/

        // Broadcast message to room members
        socket.on('chat-message', function (data) {
            chat.broadcastChatMessage(socket, data.userIdHash, data.roomName, data.message);
        });

        // On user leaving a chat room
        socket.on('leave-room', function (data) {
            wait.launchFiber(chat.leaveRoomForUser, data.userId, data.roomName);
        });
    }

    function initMasterConnection(socket) {
        console.log("A master has connected...");

        socket.emit("class-names", nconf.get("class-names"));

        socket.on('master-broadcast', function (data) {
            console.log('Master message to broadcast: ' + data.message);
            wait.launchFiber(master.broadcastMessage, socket, data);
        });

        socket.on('master-update-class-names', function (data) {
            wait.launchFiber(master.updateClassNames, socket, data);
        });

        socket.on('master-grant-class', function (data) {
            wait.launchFiber(master.grantClass, socket, data);
        });
    }

    return module;

};
