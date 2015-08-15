/* jslint node: true */

module.exports = function () {
    "use strict";

    var module = {};

    var redisCli = require("redis").createClient(),
        nconf = require("nconf"),
        moment = require("moment");

    var userManagement = require("./user.js")();

    var resourceFun = function () {};
    var intervalObject = null;
    var CLEAR_THRESHOLD_MN = nconf.get("gc-clear-threshold");
    var INTERVAL_BETWEEN_RUNS_MN = nconf.get("gc-interval-between-runs");

    function run() {
        console.log(new Date() + " - GC running...");
        redisCli.hgetall('user_gc', function (err, data) {

            if (data) {
                Object.keys(data).forEach(function (userId) {
                    var diff = moment().diff(parseInt(data[userId]), 'minutes');
                    console.log(userId + " is " + diff + " mn old");

                    if (diff >= CLEAR_THRESHOLD_MN) {
                        console.log("GC: free resource for " + userId);
                        redisCli.incr("gc_count");
                        resourceFun(userId);
                    }
                });
            }
        });
    }

    /*****************
     *
     * Exported
     *
     ******************/

    module.start = function (resourceReleaser) {
        if (!intervalObject) {
            console.log("GC started");
            resourceFun = resourceReleaser;
            intervalObject = setInterval(run, INTERVAL_BETWEEN_RUNS_MN * 60000);
        }
    };

    module.stop = function () {
        console.log("GC stoped");
        clearInterval(intervalObject);
        intervalObject = null;
    };

    module.addForGarbageCollection = function (userId) {
        if (userManagement.hasSocketAssociated(userId)) {
            console.log("Add for GC " + userId);
            redisCli.hset("user_gc", userId, Date.now());
        }
    };

    module.removeFromGarbageCollection = function (userId) {
        if (userId) {
            console.log("Remove from GC:" + userId);
            redisCli.hdel("user_gc", userId);
        }
    };

    return module;
};