#!/usr/bin/env node

/* jslint node: true */

var redisCli = require("redis").createClient(),
    moment = require("moment"),
    async = require("async"),
    nconf = require("nconf"),
    fs = require("fs");

// Args
var directory = process.argv[2] || 'stats';
var jsonConfigPath = process.argv[3] || '../config.json';

nconf.file({
    file: jsonConfigPath
});

var LEADERBOARDS_END_POSITION = nconf.get('leaderboards-size') - 1;

redisCli.on("error", function (err) {
    console.error("Error " + err);
});

var today = moment().format("YYYY-MM-DD");
var filename = directory + "/linkingwords-daily-statistics-" + today + ".txt";

async.series([function (callback) {
    redisCli.get("stats:word:today_submitted_count", function (err, data) {
        if (err) {
            console.log(err);
            callback(err);
        }

        var lines = [];
        lines.push("Words:");
        lines.push("-----");
        lines.push("Submitted count: " + data);

        fs.appendFileSync(filename, lines.join("\n") + "\n");
        redisCli.del("stats:word:today_submitted_count", callback);
    });
}, function (callback) {
    redisCli.get("stats:word:today_match_count", function (err, data) {
        if (err) {
            console.log(err);
            callback(err);
        }

        fs.appendFileSync(filename, "Matched count: " + data + "\n");
        redisCli.del("stats:word:today_match_count", callback);
    });
}, function (callback) {
    redisCli.zrevrange('stats:word:today_submitted_count_by_word', 0, LEADERBOARDS_END_POSITION, function (err, data) {
        if (err) {
            console.log(err);
            callback(err);
        }

        fs.appendFileSync(filename, "Top submitted: " + data.join(" - ") + "\n");
        redisCli.del("stats:word:today_submitted_count_by_word", callback);
    });
}, function (callback) {
    redisCli.zrevrange('stats:word:today_match_count_by_word', 0, LEADERBOARDS_END_POSITION, function (err, data) {
        if (err) {
            console.log(err);
            callback(err);
        }

        fs.appendFileSync(filename, "Top matched: " + data.join(" - ") + "\n\n");
        redisCli.del("stats:word:today_match_count_by_word", callback);
    });
}, function (callback) {
    redisCli.get("stats:bottle:today_cast_count", function (err, data) {
        if (err) {
            console.log(err);
            callback(err);
        }

        var lines = [];
        lines.push("Bottles:");
        lines.push("-----");
        lines.push("Cast count: " + data);

        fs.appendFileSync(filename, lines.join("\n") + "\n");
        redisCli.del("stats:bottle:today_cast_count", callback);
    });
}, function (callback) {
    redisCli.get("stats:bottle:today_opened_count", function (err, data) {
        if (err) {
            callback(err);
        }

        fs.appendFileSync(filename, "Opened count: " + data + "\n");
        redisCli.del("stats:bottle:today_opened_count", callback);
    });
}], function () {
    process.exit(0);
});