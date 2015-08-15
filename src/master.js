/* jslint node: true */

module.exports = function (io) {
    "use strict";

    var module = {};
    var crypto = require("crypto"),
        wait = require("wait.for"),
        userManagement = require('./user.js')(),
        redisCli = require("redis").createClient();

    redisCli.on("error", function (err) {
        console.error("Error " + err);
    });

    function authenticateMasterMessage(socket, masterKey) {
        var refMasterKeyHash = wait.forMethod(redisCli, 'get', "master_key_hash");

        if (!refMasterKeyHash) {
            socket.emit("master-action-failed", "Master key isn't present in Redis db");
            return false;
        }

        var sha512 = crypto.createHash('sha512');
        sha512.update(masterKey);

        if (sha512.digest('base64') !== refMasterKeyHash) {
            socket.emit("master-action-failed", "Master key doesn't match.");
            return false;
        }

        return true;
    }

    /*****************
     *
     * Exported
     *
     ******************/

    module.broadcastMessage = function (socket, data) {
        console.log(JSON.stringify(data));

        if (authenticateMasterMessage(socket, data.masterKey)) {
            socket.broadcast.emit("master-message", data);
            socket.emit("master-action-success", "Message successfully broadcasted to the world.");
        }
    };

    module.updateClassNames = function (socket, data) {

        if (authenticateMasterMessage(socket, data.masterKey)) {
            try {
                var classNamesArray = JSON.parse(data.classNames);
                socket.broadcast.emit("class-names", classNamesArray);
                socket.emit("master-action-success", "Class names update succesfully sent.");
            } catch (e) {
                socket.emit("master-action-failed", "Failed to update class names: " + e);
            }
        }
    };

    module.grantClass = function (socket, data) {

        if (authenticateMasterMessage(socket, data.masterKey)) {
            var userId = data.userId,
                classValue = data.class;

            redisCli.set("user:" + userId + ":class", classValue);

            var socketUserPromoted = io.sockets.connected[userManagement.getSocketForUser(userId)];

            if (socketUserPromoted) {
                // Notify user of promotion
                socketUserPromoted.emit("promoted", {
                    value: classValue,
                    userGrantingPromotion: 'Admin'
                });
            }

            // Update public information for users in relation with the promoted user
            redisCli.smembers("user:" + userId + ":rooms", function (err, rooms) {
                if (err) {
                    console.error(err);
                    return;
                }

                var userIdHash = crypto.createHash('md5').update(userId).digest('hex');

                // Rejoin each room
                var i;
                for (i = 0; i < rooms.length; ++i) {
                    io.in(rooms[i]).emit('update-class-info', {
                        userIdHash: userIdHash,
                        class: classValue
                    });
                }
            });

            socket.emit("master-action-success", "User granted class " + classValue);

        }
    };

    return module;
};