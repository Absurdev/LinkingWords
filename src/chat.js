/* jslint node: true */

/******************************************************
 * Events sent:
 * -----
 * chat-message: chat message received from a client
 * chat-status: status message for a given room
 * chat-picture: the user chat picture for the session
 ******************************************************/

module.exports = function (io) {
    "use strict";

    var module = {};
    var userManagement = require("../src/user.js")(io);
    var redisCli = require("redis").createClient(),
        wait = require('wait.for');

    redisCli.on("error", function (err) {
        console.error("Error " + err);
    });

    /*****************
     *
     * Exported
     *
     ******************/

    module.connectUsers = function (userId, peerId, roomName) {
        // Get sockets
        var socket = io.sockets.connected[userManagement.getSocketForUser(userId)];
        var peerSocket = io.sockets.connected[userManagement.getSocketForUser(peerId)];

        if (!socket) {
            console.error("Unexpected eror: user (" + userId + ") has no socket associated...");
            return;
        }

        if (!peerSocket) {
            console.error("Unexpected eror: peer (" + peerId + ") has no socket associated...");
            socket.emit("server-error", "Unexpected error while trying to match you...");
            return;
        }

        // Join common room
        socket.join(roomName);
        peerSocket.join(roomName);

        // Add room to current rooms for participants
        redisCli.sadd("user:" + userId + ":rooms", roomName);
        redisCli.sadd("user:" + peerId + ":rooms", roomName);
    };

    module.broadcastChatMessage = function (socket, userIdHash, roomName, message) {
        var data = {
            sender: userIdHash,
            roomName: roomName,
            message: message
        };
        socket.broadcast.in(roomName).emit('chat-message', data);
    };

    module.leaveRoomForUser = function (userId, room) {
        redisCli.srem('user:' + userId + ':rooms', room);

        // Leave room
        var socketId = userManagement.getSocketForUser(userId);
        // SocketId is null in case of garbage collection
        if (socketId) {
            var socket = io.sockets.connected[socketId];
            socket.leave(room);
        }

        // Notify other(s)
        io.sockets.in(room).emit('chat-status', {
            message: 'Your wordmate has left the discussion!',
            roomName: room
        });
    };

    module.init = function () {

    };

    module.rejoinRooms = function (socket, userId) {
        console.log("Reconnection of user " + userId + " - " + socket.id);
        redisCli.smembers("user:" + userId + ":rooms", function (err, rooms) {
            if (err) {
                console.error(err);
                return;
            }

            // Rejoin each room
            var i;
            for (i = 0; i < rooms.length; ++i) {
                socket.join(rooms[i]);
            }
        });
    };

    module.leaveRooms = function (userId) {
        redisCli.smembers("user:" + userId + ":rooms", function (err, rooms) {
            if (err) {
                console.error(err);
                return;
            }

            var i;
            for (i = 0; i < rooms.length; ++i) {
                wait.launchFiber(module.leaveRoomForUser, userId, rooms[i]);
            }
            redisCli.del("user:" + userId + ":rooms");
        });
    };

    return module;
};