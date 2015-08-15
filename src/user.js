/* jslint node: true */

/******************************************************
 * Events sent:
 * -----
 * chat-picture: send to the user her "chat picture"
 * promoted: send notification that user class has been incremented
 * promotion-refused: notify user requesting a promotion that this was refused
 * update-class-info: send updated value of class for a given user
 * promotion-accepted: tell user that the promotion she asked was accepted
 * class-names: send the list of the class names
 ******************************************************/

module.exports = function (io) {
    "use strict";

    var module = {};
    var redisCli = require("redis").createClient(),
        crypto = require("crypto"),
        wait = require("wait.for"),
        nconf = require("nconf");

    var CLASS_NAMES = nconf.get("class-names");

    redisCli.on("error", function (err) {
        console.error("Error " + err);
    });

    function generateChatPicture() {
        var upperCaseLetters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
        var chatPicture = [];

        chatPicture.push(upperCaseLetters.charAt(Math.floor(Math.random() * upperCaseLetters.length)));
        chatPicture.push(".");
        chatPicture.push(upperCaseLetters.charAt(Math.floor(Math.random() * upperCaseLetters.length)));
        chatPicture.push(".");

        return chatPicture.join("");
    }

    function canPromote(userGrantingPromotion, userToPromote, socketUserGrantingPromotion) {
        // User can promote an other given user only once during the session
        if (wait.forMethod(redisCli, 'sismember', "user:" + userGrantingPromotion + ":promotion_granted", userToPromote)) {
            socketUserGrantingPromotion.emit("promotion-refused", "You can promote a given user only once.");
            return false;
        }

        var classUserGrantingPromotion = wait.forMethod(redisCli, 'get', "user:" + userGrantingPromotion + ":class");
        var classUserToBePromoted = wait.forMethod(redisCli, 'get', "user:" + userToPromote + ":class");

        // Promoting user must have a higher class than the promoted
        if (classUserGrantingPromotion <= classUserToBePromoted) {
            socketUserGrantingPromotion.emit("promotion-refused", "You must have an higher class than the person you want to promote.");
            return false;
        }

        return true;
    }

    /*****************
     *
     * Exported
     *
     ******************/

    module.init = function (socket, userId) {
        console.log("Connection of " + userId + " - " + socket.id);

        var chatPicture = generateChatPicture();

        redisCli.incr("connections");
        redisCli.set("user:" + userId + ":chat_picture", chatPicture);
        redisCli.set("user:" + userId + ":connection_time", Date.now());
        redisCli.hset("user_hash_lookup", crypto.createHash('md5').update(userId).digest('hex'), userId);
        redisCli.set("user:" + userId + ":class", 1);

        socket.emit("chat-picture", chatPicture);
        socket.emit("class-names", CLASS_NAMES);
    };

    module.disconnectUser = function (userId) {
        console.log("Disconnection of user " + userId);
        redisCli.decr("connections");
        redisCli.del("user:" + userId + ":chat_picture");
        redisCli.del("user:" + userId + ":connection_time");
        redisCli.del("user:" + userId + ":class");
        redisCli.del("user:" + userId + ":promotion_granted");
        redisCli.hdel("user_hash_lookup", crypto.createHash('md5').update(userId).digest('hex'));
    };

    module.isUserAlive = function (userId, callback) {
        redisCli.get("user:" + userId + ":chat_picture", function (err, data) {
            return callback(err, data !== null);
        });
    };

    module.getSocketForUser = function (userId) {
        return wait.forMethod(redisCli, 'hget', "user_to_socket", userId);
    };

    module.setSocketForUser = function (userId, socketId) {
        redisCli.hset("user_to_socket", userId, socketId);
    };

    module.delSocketForUser = function (userId) {
        if (userId) {
            redisCli.hdel("user_to_socket", userId);
        }
    };

    module.hasSocketAssociated = function (userId) {
        return wait.forMethod(redisCli, 'hget', "user_to_socket", userId) !== null;
    };

    module.getPublicUsersInformation = function () {
        var result = {};
        var i = 0;
        for (i = 0; i < arguments.length; ++i) {
            var publicId = crypto.createHash('md5').update(arguments[i]).digest('hex');

            result[publicId] = {
                chatPicture: wait.forMethod(redisCli, 'get', 'user:' + arguments[i] + ':chat_picture'),
                connectionTime: wait.forMethod(redisCli, 'get', 'user:' + arguments[i] + ':connection_time'),
                class: wait.forMethod(redisCli, 'get', 'user:' + arguments[i] + ':class')
            };
        }

        return result;
    };

    module.promoteUser = function (socketUserGrantingPromotion, userGrantingPromotion, userToPromoteHash) {
        var userToPromote = wait.forMethod(redisCli, 'hget', "user_hash_lookup", userToPromoteHash);

        if (canPromote(userGrantingPromotion, userToPromote, socketUserGrantingPromotion)) {
            redisCli.incr("user:" + userToPromote + ":class");
            redisCli.sadd("user:" + userGrantingPromotion + ":promotion_granted", userToPromote);

            var socketUserPromoted = io.sockets.connected[module.getSocketForUser(userToPromote)];

            var classValue = wait.forMethod(redisCli, 'get', "user:" + userToPromote + ":class");

            if (socketUserPromoted) {
                // Notify user of promotion
                socketUserPromoted.emit("promoted", {
                    value: classValue,
                    userGrantingPromotion: crypto.createHash('md5').update(userGrantingPromotion).digest('hex')
                });
            }

            // Notify user granting the promotion that it was accepted
            socketUserGrantingPromotion.emit("promotion-accepted", {
                userPromotedHash: userToPromoteHash,
                newClass: classValue
            });

            // Update public information for users in relation with the promoted user
            redisCli.smembers("user:" + userToPromote + ":rooms", function (err, rooms) {
                if (err) {
                    console.error(err);
                    return;
                }

                // Notify each room
                var i;
                for (i = 0; i < rooms.length; ++i) {
                    io.in(rooms[i]).emit('update-class-info', {
                        userIdHash: userToPromoteHash,
                        class: classValue
                    });
                }
            });
        }

    };

    return module;
};
