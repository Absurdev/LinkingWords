/* jslint node: true */

/******************************************************
 * Events sent:
 * -----
 * word-data-validation-error: error during validation of the data
 * word-string-validation-error: error during validation of the string
 * peer-found: used to notified users that a peer has been found for a given word
 * word-validated: used to notify user that her word has been validated
 * word-server-conf: send configuration variables related to words
 ******************************************************/

module.exports = function (io) {
    "use strict";

    var module = {};
    var userManagement = require("../src/user.js")(io);
    var chat = require("../src/chat.js")(io);
    var redisCli = require("redis").createClient(),
        wait = require('wait.for'),
        crypto = require("crypto"),
        nconf = require("nconf");

    var MAX_PENDING_WORDS_PER_USER = nconf.get("max-pending-words-per-user");
    var MAX_WORD_LENGTH = nconf.get("max-word-length");

    redisCli.on("error", function (err) {
        console.error("Error " + err);
    });

    function isValidWordData(data, socket) {
        var typeData = typeof data;
        if (typeData === "undefined" || data === null) {
            socket.emit("word-data-validation-error", "The word cannot be null or undefined.");
            return false;
        }

        if (typeData !== "string" && typeData !== "number") {
            socket.emit("word-data-validation-error", "The word must be a string or a number.");
            return false;
        }

        return true;
    }

    function isValidWordString(word, userId, socket) {
        var errorObj = {
            word: word
        };
        // Empty word is forbidden
        if (word === "") {
            errorObj.message = "The word cannot be empty.";
            socket.emit("word-string-validation-error", errorObj);
            return false;
        }

        if (word.length > MAX_WORD_LENGTH) {
            errorObj.message = "The word cannot be longer than " + MAX_WORD_LENGTH + " characters.";
            socket.emit("word-string-validation-error", errorObj);
            return false;
        }

        // Word cannot be already in the pending list of user
        var isAlreadyPending = wait.forMethod(redisCli, 'sismember', 'user:' + userId + ':pending_words', word);

        if (isAlreadyPending) {
            errorObj.message = "This word is already in pending state.";
            socket.emit("word-string-validation-error", errorObj);
            return false;
        }

        // User cannot have more than MAX_PENDING_WORDS_PER_USER pending words
        var pendingWordsCount = wait.forMethod(redisCli, 'scard', 'user:' + userId + ':pending_words');
        if (pendingWordsCount >= MAX_PENDING_WORDS_PER_USER) {
            errorObj.message = "You cannot have more than " + MAX_PENDING_WORDS_PER_USER + " pending words. Either remove some or wait for matches.";
            socket.emit("word-string-validation-error", errorObj);
            return false;
        }

        return true;
    }

    function insertPendingWord(userId, word) {
        redisCli.lpush("word:" + word + ":waiting_users", userId);
        redisCli.sadd("user:" + userId + ":pending_words", word);
        redisCli.incr("stats:word:pending_words_count");
    }

    function generateRoomNameForWord(user1Id, user2Id, word) {
        var user1IdHash = crypto.createHash('md5').update(user1Id).digest('hex');
        var user2IdHash = crypto.createHash('md5').update(user2Id).digest('hex');
        return "W:" + word + ":" + user1IdHash + ":" + user2IdHash + ":" + Date.now();
    }

    function matchUsersForWord(userId, peerId, word) {
        var roomName = generateRoomNameForWord(userId, peerId, word);
        // Connect users in the same room
        chat.connectUsers(userId, peerId, roomName);

        // Remove pending word for the peer
        redisCli.srem("user:" + peerId + ":pending_words", 0, word);
        // Stats
        redisCli.zincrby("stats:word:total_match_count_by_word", 1, word);
        redisCli.zincrby("stats:word:today_match_count_by_word", 1, word);
        redisCli.incr("stats:word:total_match_count");
        redisCli.incr("stats:word:today_match_count");
        redisCli.decr("stats:word:pending_words_count");

        var participants = userManagement.getPublicUsersInformation(userId, peerId);

        // Notify peer found
        io.sockets.in(roomName).emit('peer-found', {
            'word': word,
            'roomName': roomName,
            'participants': participants
        });
    }

    function tryToMatchForWord(userId, word) {
        redisCli.rpop("word:" + word + ":waiting_users", function (err, peerId) {
            if (peerId === null) {
                // No peer found yet
                insertPendingWord(userId, word);
            } else {
                // Match users
                wait.launchFiber(matchUsersForWord, userId, peerId, word);
            }
        });
    }

    /*****************
     *
     * Exported
     *
     ******************/

    module.init = function (socket) {
        socket.emit('word-server-conf', {
            maxPendingWordsPerUser: MAX_PENDING_WORDS_PER_USER,
            maxWordLength: MAX_WORD_LENGTH
        });
    };

    module.validateWordAndTryToMatch = function (data, userId, socket) {
        if (isValidWordData(data, socket)) {
            // Normalize data to string
            var word = String(data).toLowerCase().trim();

            if (isValidWordString(word, userId, socket)) {
                // Notify user that word has been validated
                socket.emit('word-validated', {
                    word: word,
                    rawWord: data
                });

                tryToMatchForWord(userId, word);

                // Update stats
                redisCli.zincrby("stats:word:total_submitted_count_by_word", 1, word);
                redisCli.zincrby("stats:word:today_submitted_count_by_word", 1, word);
                redisCli.incr("stats:word:total_submitted_count");
                redisCli.incr("stats:word:today_submitted_count");
            }
        }
    };

    module.removePendingWord = function (word, userId) {
        redisCli.srem("user:" + userId + ":pending_words", word);
        redisCli.lrem("word:" + word + ":waiting_users", 1, userId);
        redisCli.decr("stats:word:pending_words_count");
    };

    module.cleanWordsPendingListForUser = function (userId) {
        redisCli.smembers("user:" + userId + ":pending_words", function (err, pendingWords) {
            if (err) {
                console.error(err);
                return;
            }

            // Remove user from the wait lists of words
            var i, pendingWordsLength = pendingWords.length;
            for (i = 0; i < pendingWordsLength; ++i) {
                redisCli.lrem("word:" + pendingWords[i] + ":waiting_users", 1, userId);
            }

            // Delete list of pending words of user
            redisCli.del("user:" + userId + ":pending_words");

            redisCli.decrby("stats:word:pending_words_count", pendingWordsLength);
        });
    };

    return module;
};