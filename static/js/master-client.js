/* jslint browser: true */
/* jslint devel: true */
/* global io, $, toastr, linkingwords */

var config = linkingwords.config;
var socket = io.connect(config.server + config.port, {
    query: "connection_type=master",
});

$('#master-broadcast-form').submit(function (event) {

    var data = {
        masterKey: $('#master-key').val() || "",
        message: $('#master-message').val() || "",
        type: $('input[name=message-type]:checked', '#master-broadcast-form').val()
    };
    socket.emit('master-broadcast', data);

    return false;
});

$('#master-update-class-names-form').submit(function (event) {

    var data = {
        masterKey: $('#master-key').val() || "",
        classNames: $('#class-names').val() || ""
    };
    socket.emit('master-update-class-names', data);

    return false;
});

$('#master-grant-class-form').submit(function (event) {

    var data = {
        masterKey: $('#master-key').val() || "",
        userId: $('#user-id-to-promote').val() || "",
        class: $('#grant-class-level').val() || ""
    };
    socket.emit('master-grant-class', data);

    return false;
});

socket.on("master-action-failed", function (reason) {
    toastr.error(reason);
});

socket.on("master-action-success", function (message) {
    toastr.success(message);
});

socket.on("class-names", function (data) {
    $("#class-names").val(JSON.stringify(data));
});