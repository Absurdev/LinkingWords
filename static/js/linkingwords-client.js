/* jslint browser: true */
/* jslint devel: true */
/* global io, $, GeoPattern, toastr, alertify, md5, moment, linkingwords */

var userId = '-xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    var r = Math.random() * 16 | 0,
        v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
}) + Date.now();

var config = linkingwords.config;
var socket = io.connect(config.server + config.port, {
    query: "user_id=" + userId
});

// User properties
var userIdHash = md5(userId);
var chatPictureUser = "X.Y.";
var userClass = 1;

var windowHasFocus = true;
var pendingNotifications = 0;
var roomsWithPendingNotification = {};
var publicInformationCache = {};
var rawPendingWords = {};
var maxWordLengthServerConfig = 100,
    maxPendingWordsServerConfig = 150,
    maxMessageBottleLengthServerConfig = 10000;
var classNames = [];

var userQuit = false;
var quit = function () {
    if (!userQuit) {
        $.ajax({
            url: '/quit',
            type: 'POST',
            // Please forgive me that...
            async: false,
            contentType: 'application/json',
            data: JSON.stringify({
                userId: userId
            }),
            success: function () {
                userQuit = true;
            }
        });
    }
};

$(window).on('beforeunload', function () {
    quit();
});

$(window).unload(function () {
    quit();
});

// Toastr global options
toastr.options.closeButton = true;

function getClassName(classValue) {
    if (classNames[classValue - 1]) {
        return classNames[classValue - 1] + " (" + classValue + ")";
    }

    return classValue;
}

// LocalStorage functions
function rememberFirstTime(action) {
    if (typeof (Storage) !== "undefined") {
        localStorage.setItem(action, true);
    }
}

function isFirstTime(action) {
    if (typeof (Storage) !== "undefined") {
        return !localStorage.getItem(action);
    }

    return false;
}

function firstTimeToast(toastType, action, message, duration, title) {
    if (isFirstTime(action)) {
        rememberFirstTime(action);
        var timeOutValue = toastr.options.timeOut;
        toastr.options.timeOut = duration;
        toastr[toastType](message, title);
        toastr.options.timeOut = timeOutValue;

        return true;
    }

    return false;
}

function showBottleContainter() {
    if (typeof (Storage) === "undefined") {
        return true;
    }
    return localStorage.getItem("peer-found");
}

function cachePublicInformation(participants) {
    for (var participantIdHash in participants) {
        if (participants.hasOwnProperty(participantIdHash)) {
            publicInformationCache[participantIdHash] = participants[participantIdHash];
            publicInformationCache[participantIdHash].connectionTime = parseInt(participants[participantIdHash].connectionTime);
        }
    }
}

function normalizeWord(word) {
    return word.toLowerCase().trim();
}

function wordFrontEndValidation(rawWord) {
    var word = normalizeWord(rawWord);
    if (word === "") {
        toastr.warning("The word cannot be empty.");
        return false;
    }

    if (word.length > maxWordLengthServerConfig) {
        toastr.warning("The word cannot be longer than " + maxWordLengthServerConfig + " characters.");
        return false;
    }

    // Word cannot be already in the pending list of user
    if (rawPendingWords[word]) {
        toastr.warning("This word is already in pending state.");
        return false;
    }

    if (Object.keys(rawPendingWords).length >= maxPendingWordsServerConfig) {
        toastr.warning("You cannot have more than " + maxPendingWordsServerConfig + " pending words. Either remove some or wait for matches.");
        return false;
    }

    return true;
}

function bottleFrontEndValidation(content) {
    var message = content.trim();

    if (message === "") {
        toastr.warning("Message cannot be empty.");
        return false;
    }

    if (message.length > maxMessageBottleLengthServerConfig) {
        toastr.warning("Message cannot be longer than " + maxMessageBottleLengthServerConfig + " characters.");
        return false;
    }

    return true;
}

function addNewPendingWordToView(word, rawWord) {
    $('#pending-words-container').css('display', 'block');

    var li = $('<li></li>')
        .attr("class", "pending-word")
        .attr("data-word", word);

    li.append($('<div></div>').text(rawWord));
    li.append($('<div></div>').attr("class", "pending-word-overlay").text("[X]"));

    $("#pending-words").append(li);
    rawPendingWords[word] = rawWord;
}

function removePendingWordFromView(element) {
    // If argument is the word string find the DOM element corresponding
    if (typeof element === "string") {
        element = $("#pending-words").find('li[data-word="' + element + '"]').last();
    }

    element.fadeOut(100, function () {
        delete rawPendingWords[$(this).attr("data-word")];
        $(this).remove();
        if ($('#pending-words li').length === 0) {
            $('#pending-words-container').css('display', 'none');
        }
    });
}

function getPicTooltip(userToGetInfoHash) {
    var publicInformation = publicInformationCache[userToGetInfoHash];
    var connectionFromNow = moment(publicInformation.connectionTime).fromNow();

    var result = [];
    result.push("Hash: " + userToGetInfoHash);
    result.push("Connection: " + connectionFromNow);
    result.push("Class: " + getClassName(publicInformation.class));

    if (publicInformation.class < userClass && userToGetInfoHash !== userIdHash) {
        result.push('<a href="#" onclick=\'requestPromotion("' + userToGetInfoHash + '")\'>Promote</a>');
    }

    return result.join("<br>");
}

function requestPromotion(userToPromoteHash) {
    socket.emit("request-promotion", {
        userId: userId,
        userToPromoteHash: userToPromoteHash
    });
}

/******************************
 *
 * UI interactions
 *
 ******************************/

$(document).ready(function () {

    var username = "linkingwords.absurdev";
    var hostname = "gmail";
    $("#email").text(username + "@" + hostname + ".com");

    if (showBottleContainter()) {
        $("#bottle-container").show();
    }

    // First time on the website
    firstTimeToast("info", "on-site", "You can start by tossing a word.", 5000, "Welcome to Linking Words!");

    $(window).focus(function () {
        document.title = "Linking Words";
        pendingNotifications = 0;
        roomsWithPendingNotification = {};
        windowHasFocus = true;
    }).blur(function () {
        windowHasFocus = false;
    });

    // Send message
    $("#chat-windows-container").on('click', 'a.send', function (event) {
        var chatWindow = $(this).parents('div[class="chat-window"]');
        var roomName = chatWindow.attr('data-room-name');
        var input = chatWindow.find('.message-input');
        var message = input.val().trim();
        input.val('').focus();

        if (message) {
            socket.emit('chat-message', {
                userIdHash: userIdHash,
                roomName: roomName,
                message: message
            });

            insertMessageFromUser(chatWindow, message);
        }
        event.stopPropagation();
    });

    $("#shore-button").click($.debounce(1000, true, function (event) {

        socket.emit("wander-shore", {
            userId: userId
        });
        event.stopPropagation();
    }));

    // Focus the input when clicking anywhere in the chat window
    $("#chat-windows-container").on('click', '.chat-window', function () {
        $(this).find('.message-input').focus();
    });

    // Leave room
    $("#chat-windows-container").on('click', 'a.leave-room', function (event) {
        var chatWindow = $(this).parents('div[class="chat-window"]');
        var roomName = chatWindow.attr('data-room-name');
        socket.emit('leave-room', {
            roomName: roomName,
            userId: userId
        });
        chatWindow.remove();
        event.stopPropagation();
    });

    // Send chat message on 'enter' key pressed
    $("#chat-windows-container").on('keyup', '.message-input', function (event) {
        if (event.keyCode === 13) {
            // Click send button
            $(this).next().click();
        }
    });

    // Toss word
    $('#toss-word-form').submit(function (event) {
        var word = $('#word').val();

        if (!wordFrontEndValidation(word)) {
            return false;
        }

        // Display pending word even before it has been validated by server side (for user xp)
        // If it was rejected by server afterwards (should never happen if front/back end validation are in sync)
        // the pending word will be removed from view upon reception of error validation notification
        addNewPendingWordToView(normalizeWord(word), word);

        socket.emit('word', {
            word: word,
            userId: userId
        });
        $('#word').val('').focus();

        return false;
    });

    // Seal message in a bottle
    $("#seal-button").click(function (event) {
        var message = $('#bottle-message').val();

        if (!bottleFrontEndValidation(message)) {
            return false;
        }

        var bottle = {
            content: message
        };

        socket.emit('cast-bottle', {
            bottle: bottle,
            userId: userId
        });
        $('#bottle-message').val('').focus();

        return false;
    });

    // Remove pending word
    $("#pending-words").on('click', 'li.pending-word', function () {
        var data = {
            word: $(this).attr("data-word"),
            userId: userId
        };
        socket.emit("remove-pending-word", data);
        removePendingWordFromView($(this));
    });

    /**************
     * Header icons
     ***************/

    function displayAlertWithLargeContent(title, content, width, height) {
        if ($(window).width() < 768) {
            alertify.lwSmallScreenAlert(title, content);
        } else {
            alertify.lwAlert(title, content).resizeTo(width + "px", height + "px");
        }
    }

    $("#stats-icon").click($.debounce(1000, true, function () {
        $("body").append('<div id="loading"></div>');

        $.ajax({
            url: "api/v1/stats/ui",
            success: function (data) {
                displayAlertWithLargeContent("Stats", data, 400, 700);
            },
            error: function () {
                toastr.error("Failed to retrieve statistics from the server");
            },
            complete: function () {
                $("#loading").remove();
            }
        });
    }));

    $("#hiring-icon").click(function () {
        alertify.lwAlert("Hiring", $("#cheese-job").html());
    });

    $("#quote-icon").click(function () {
        displayAlertWithLargeContent("Collection de mots", $("#quote").html(), 400, 500);
    });

    $("#nyaq-icon").click(function () {
        displayAlertWithLargeContent("Not Yet Asked Questions", $("#nyaq").html(), 600, 600);
    });
});

function insertMessageFromUser(chatWindow, message) {
    insertMessage(chatWindow, message, "right", userIdHash, chatPictureUser);
}

function insertMessageFromPeer(chatWindow, peerIdHash, message) {
    insertMessage(chatWindow, message, "left", peerIdHash, publicInformationCache[peerIdHash].chatPicture);
}

function insertMessage(chatWindow, message, side, userHash, chatPicture) {
    var messagesElement = chatWindow.find(".messages");
    var messageClass = "message-box " + side + "-img";
    var tooltipSide, tooltipTheme;

    if (side === "left") {
        tooltipSide = "right";
        tooltipTheme = "tooltipster-green";
    } else {
        tooltipSide = "left";
        tooltipTheme = "tooltipster-blue";
    }

    messagesElement.loadTemplate("template/chat_message.html", {
        messageClass: messageClass,
        message: message,
        chatPicture: chatPicture
    }, {
        append: true,
        beforeInsert: function (element) {
            element.linkify();

            element.find('.img').tooltipster({
                content: getPicTooltip.bind(this, userHash),
                theme: tooltipTheme,
                position: tooltipSide,
                interactive: true
            });
        },
        success: function () {
            messagesElement.scrollTop(messagesElement[0].scrollHeight);
        }
    });
}

function insertStatus(chatWindow, statusMessage) {
    var messagesElement = chatWindow.find(".messages");
    var divStatus = $("<div></div>")
        .attr("class", "chat-status")
        .text(statusMessage)
        .linkify();
    messagesElement.append(divStatus);
    messagesElement.scrollTop(messagesElement[0].scrollHeight);
}

// If window is not focused notify user by updating title
function notifyInWindowTitle(roomName) {
    if (!windowHasFocus) {
        // Do not increment notification count if this room already had a pending notification
        if (!roomsWithPendingNotification[roomName]) {
            roomsWithPendingNotification[roomName] = true;
            pendingNotifications++;
            document.title = ["(", pendingNotifications, ") Linking Words"].join('');
        }
    }
}

function createNewChatWindow(roomName, title, geoPatternSeed, callback) {
    $("#chat-windows-container").loadTemplate("template/chat_window.html", {
        roomName: roomName,
        title: title
    }, {
        append: true,
        success: function () {
            var pattern = GeoPattern.generate(geoPatternSeed);
            // Set header and send button background image to generated pattern
            var chatWindow = $('[data-room-name="' + roomName + '"]');
            chatWindow.find('.header').css('background-image', pattern.toDataUrl());
            chatWindow.find('a.send').css('background-image', pattern.toDataUrl());

            if (callback) {
                callback(chatWindow);
            }
        }
    });
}

function displayStatusAllRooms(status) {
    $(".chat-window").each(function () {
        insertStatus($(this), status);
        notifyInWindowTitle($(this).attr("data-room-name"));
    });
}

/******************************
 *
 * Socket.io events handling
 *
 ******************************/

// Word validation error
socket.on("word-data-validation-error", function (message) {
    toastr.error(message);
});
socket.on("word-string-validation-error", function (data) {
    toastr.warning(data.message);
    removePendingWordFromView(data.word);
});
socket.on("bottle-validation-error", function (message) {
    toastr.warning(message);
});
socket.on("server-error", function (message) {
    toastr.error(message);
});

socket.on("bottle-drifting-in-sea", function () {
    toastr.info("Your message now drifts away into the sea... Hope you'll get an answer!");
});
socket.on("no-bottle-found", function () {
    toastr.info("Sorry but there was no bottle around...");
});

socket.on("promotion-refused", function (message) {
    toastr.warning(message);
});

socket.on("promoted", function (data) {
    userClass = data.value;
    toastr.success("Congratulations! You have been promoted to class '" + getClassName(userClass) + "' by " + data.userGrantingPromotion);
});

socket.on("update-class-info", function (data) {
    publicInformationCache[data.userIdHash].class = data.class;
});

socket.on("promotion-accepted", function (data) {
    toastr.success("You successfully promoted " + data.userPromotedHash + " to class " + getClassName(data.newClass));
});

socket.on("class-names", function (classNamesList) {
    classNames = classNamesList;
});

// Peer found: open chat window
// data: {roomName, word}
socket.on("peer-found", function (data) {
    var title = rawPendingWords[data.word];
    // Remove from pending words list
    removePendingWordFromView(data.word);

    cachePublicInformation(data.participants);
    createNewChatWindow(data.roomName, title, data.word);

    notifyInWindowTitle(data.roomName);
    var firstTimePeerFound = firstTimeToast("success", "peer-found", "We found a peer you can talk with! A good starting point is to share your common passion about this word...", 8000);

    if (firstTimePeerFound) {
        setTimeout(function () {
            $("#bottle-container").show();
            firstTimeToast("success", "bottle-container-shown", "You can now throw a message in a bottle into the sea! Hopefully somebody will find it (otherwise it'd make you another despicable polluter).You can also look for bottles from others on the shore. Good luck!", 12000);
        }, 10000);
    }
});

// Bottle found: open chat window
socket.on("bottle-found", function (data) {
    var bottle = data.bottle,
        bottleFromYou = (bottle.user === userIdHash);

    cachePublicInformation(data.participants);

    notifyInWindowTitle(data.roomName);
    createNewChatWindow(data.roomName, "Bottle " + bottle.id, bottle.content, function (chatWindow) {

        if (bottleFromYou) {
            insertMessageFromUser(chatWindow, bottle.content);
            firstTimeToast("success", "bottle-from-you-found", "You're lucky! Somebody found your bottle...", 6000);
        } else {
            insertMessageFromPeer(chatWindow, bottle.user, bottle.content);

            if (data.pull) {
                firstTimeToast("success", "bottle-from-other-found", "Oh, while looking at the sand you found a message in a bottle, what does it say...", 6000);
            } else {
                firstTimeToast("success", "bottle-pushed", "You stumbled upon a message in a bottle. I know you didn't ask for anything but ${quote_about_fate_here}...", 7000);
            }
        }
    });
});

// Word has been validated server side
socket.on('word-validated', function (data) {
    // If it's first time a word is added display an explaining toast
    firstTimeToast("success", "word-tossed", "You word has been tossed. We'll work hard to connect you with somebody liking the same word.", 8000);

});

// Receive server conf
socket.on("word-server-conf", function (data) {
    maxPendingWordsServerConfig = data.maxPendingWordsPerUser || maxPendingWordsServerConfig;
    maxWordLengthServerConfig = data.maxWordLength || maxWordLengthServerConfig;
});
socket.on("bottle-server-conf", function (data) {
    maxMessageBottleLengthServerConfig = data.maxMessageBottleLength || maxMessageBottleLengthServerConfig;
});

// Save chatPicture for the user
socket.on("chat-picture", function (data) {
    chatPictureUser = data;
});

// Receive message
socket.on('chat-message', function (data) {
    var chatWindow = $('[data-room-name="' + data.roomName + '"]');
    insertMessageFromPeer(chatWindow, data.sender, data.message);

    notifyInWindowTitle(data.roomName);
});

// status
socket.on("chat-status", function (data) {
    var chatWindow = $('[data-room-name="' + data.roomName + '"]');
    insertStatus(chatWindow, data.message);

    notifyInWindowTitle(data.roomName);
});

socket.on("master-message", function (data) {
    if (data.type === "toastr") {
        toastr.info(data.message);
    } else if (data.type === "status") {
        displayStatusAllRooms(data.message);
    }
});
