/* jslint node: true */

/******************************************************
 * Events sent:
 * -----------
 * bottle-validation-error: error during validation of the bottle
 * bottle-drifting-in-sea: confirmation sent to the client that the bottle has been accepted
 * bottle-found: notify user that a bottle was found
 * no-bottle-found: notify user that no bottle was found
 * bottle-server-conf: send configuration variables related to bottles
 ******************************************************/

module.exports = function (io) {
    "use strict";

    var module = {};
    var userManagement = require("../src/user.js")(io);
    var chat = require("../src/chat.js")(io);
    var redisCli = require("redis").createClient(),
        crypto = require("crypto"),
        wait = require("wait.for"),
        nconf = require("nconf"),
        moment = require("moment");

    var FIRST_PUSH_TIME_MS = nconf.get("first-bottle-push-time"),
        MIN_PUSH_TIME_MS = nconf.get("min-bottle-push-time"),
        MAX_PUSH_TIME_MS = nconf.get("max-bottle-push-time"),
        MAX_CAST_BOTTLE_COUNT_PER_MIN = nconf.get("max-cast-bottle-count-per-minute"),
        MAX_MESSAGE_BOTTLE_LENGTH = nconf.get("max-bottle-message-length");

    redisCli.on("error", function (err) {
        console.error("Error " + err);
    });

    function isValidBottle(bottle, socket, userId) {
        if (bottle.content.trim() === "") {
            socket.emit("bottle-validation-error", "Message cannot be empty.");
            return false;
        }

        if (bottle.content.length > MAX_MESSAGE_BOTTLE_LENGTH) {
            socket.emit("bottle-validation-error", "Message cannot be longer than " + MAX_MESSAGE_BOTTLE_LENGTH + " characters.");
            return false;
        }

        var castCountCurrentMinute = wait.forMethod(redisCli, 'get', "user:" + userId + ":cast_bottle_count:" + moment().format('mm'));

        if (castCountCurrentMinute >= MAX_CAST_BOTTLE_COUNT_PER_MIN) {
            socket.emit("bottle-validation-error", "You cannot cast more than " + MAX_CAST_BOTTLE_COUNT_PER_MIN + " bottles per minute for safety reasons (you could end up hurting an octopus)");
            return false;
        }

        return true;
    }

    function generateRoomNameForBottle(user1Id, user2Id, bottle) {
        var user1IdHash = crypto.createHash('md5').update(user1Id).digest('hex');
        var user2IdHash = crypto.createHash('md5').update(user2Id).digest('hex');

        return "B:" + bottle.id + ":" + user1IdHash + ":" + user2IdHash + ":" + Date.now();
    }

    function matchUsersForBottle(userId, peerId, bottle) {
        var bottleId = bottle.id;

        // Connect users together
        var roomName = generateRoomNameForBottle(userId, peerId, bottle);
        chat.connectUsers(userId, peerId, roomName);

        // Increment number of bottles opened by user during current minute (expire after 2min)
        var keyname = "user:" + userId + ":pull_bottle_count:" + moment().format('mm');
        redisCli.multi().incr(keyname)
            .expire(keyname, 120)
            .exec();

        // Stats
        redisCli.incr("stats:bottle:total_opened_count");
        redisCli.incr("stats:bottle:today_opened_count");
        // Clean up
        redisCli.srem("user:" + bottle.user + ":pending_bottles", bottleId);
        redisCli.del("bottle:" + bottleId);

        return roomName;
    }

    function pushBottleToTheShore(userId) {
        // User may be disconnected since the last setTimeout
        var socketId = userManagement.getSocketForUser(userId);
        if (io.sockets.connected[socketId]) {
            var bottle = getBottle(userId);

            if (bottle) {
                openBottle(userId, bottle, false);
            }

            // Next time to push a bottle to user
            var nextPushTime = Math.floor(MIN_PUSH_TIME_MS + (MAX_PUSH_TIME_MS - MIN_PUSH_TIME_MS) * Math.random());
            setTimeout(function () {
                wait.launchFiber(pushBottleToTheShore, userId);
            }, nextPushTime);
        }
    }

    function getBottle(userId, isPullAction) {
        var bottleId = wait.forMethod(redisCli, 'rpop', 'bottles:pending_list');

        if (bottleId) {
            var bottle = wait.forMethod(redisCli, 'hgetall', "bottle:" + bottleId);

            if (bottle.user !== userId) {
                bottle.id = bottleId;

                return bottle;
            } else {
                // Repush the bottle id in the pending list
                redisCli.rpush("bottles:pending_list", bottleId);
            }
        }
    }

    function openBottle(userId, bottle, isPullAction) {
        var roomName = matchUsersForBottle(userId, bottle.user, bottle);

        var participants = userManagement.getPublicUsersInformation(userId, bottle.user);

        // Hash sender id before sending the bottle
        bottle.user = crypto.createHash('md5').update(bottle.user).digest('hex');

        // Notify bottle found
        io.sockets.in(roomName).emit('bottle-found', {
            'bottle': bottle,
            'roomName': roomName,
            'pull': isPullAction,
            'participants': participants
        });
    }

    function getProbabilityToFindABottle(userId) {
        var connectionsCount = wait.forMethod(redisCli, 'get', 'connections');
        var pendingBottlesCount = wait.forMethod(redisCli, 'llen', 'bottles:pending_list');
        var ratio = pendingBottlesCount / connectionsCount;

        if (ratio >= 1) {
            return 1;
        }

        var currentMinute = moment().format('mm');
        var pullBottleCount = wait.forMethod(redisCli, 'get', 'user:' + userId + ':pull_bottle_count:' + currentMinute);
        var r = 1 - Math.min(pullBottleCount / 3, 1);

        return (1 - r) * ratio + r;
    }

    function canTakeABottle(userId) {
        var p = getProbabilityToFindABottle(userId);

        if (Math.random() < p) {
            return true;
        }

        return false;
    }

    /*****************
     *
     * Exported
     *
     ******************/

    module.searchForABottle = function (userId, socket) {

        if (!canTakeABottle(userId)) {
            // Tell the user that no bottle was found during wandering
            socket.emit("no-bottle-found", "Sorry but no bottle was found around. (you may want to wait a bit)");
            return;
        }

        // Get a bottle if some is available
        var bottle = getBottle(userId);

        if (bottle) {
            openBottle(userId, bottle, true);
        } else {
            // No bottle available
            socket.emit("no-bottle-found", "Sorry but no bottle was found around.");
        }
    };

    module.destroyBottlesForUser = function (userId) {
        redisCli.smembers("user:" + userId + ":pending_bottles", function (err, pendingBottlesIds) {
            if (err) {
                console.error(err);
                return;
            }

            var i;
            for (i = 0; i < pendingBottlesIds.length; ++i) {
                // Remove bottle from general pending list
                redisCli.lrem("bottles:pending_list", 1, pendingBottlesIds[i]);

                // Remove bottle entry
                redisCli.del("bottle:" + pendingBottlesIds[i]);
            }

            // Delete list of pending bottles of user
            redisCli.del("user:" + userId + ":pending_bottles");
        });
    };

    module.validateAndStoreBottle = function (bottle, socket, userId) {
        if (isValidBottle(bottle, socket, userId)) {
            // Increment counters
            redisCli.incr("stats:bottle:total_cast_count");
            redisCli.incr("stats:bottle:today_cast_count");

            // Get new id for the bottle
            redisCli.incr("bottles:id_generator");
            redisCli.get("bottles:id_generator", function (err, bottleId) {
                if (err) {
                    console.error(err);
                    return;
                }

                // Store bottle
                redisCli.hmset("bottle:" + bottleId, "content", bottle.content, "user", userId);
                redisCli.sadd("user:" + userId + ":pending_bottles", bottleId);
                redisCli.lpush("bottles:pending_list", bottleId);

                // Increment count of bottles cast during this minute
                var keyname = "user:" + userId + ":cast_bottle_count:" + moment().format('mm');
                redisCli.multi().incr(keyname)
                    .expire(keyname, 120)
                    .exec();

                socket.emit("bottle-drifting-in-sea", {
                    id: bottleId
                });
            });
        }
    };

    module.init = function (socket, userId) {
        setTimeout(function () {
            wait.launchFiber(pushBottleToTheShore, userId);
        }, FIRST_PUSH_TIME_MS);

        socket.emit("bottle-server-conf", {
            maxMessageBottleLength: MAX_MESSAGE_BOTTLE_LENGTH
        });
    };

    return module;
};