/* jslint node: true */

(function () {
    "use strict";

    var async = require("async"),
        redisCli = require("redis").createClient(),
        nconf = require("nconf");

    redisCli.on("error", function (err) {
        console.error("Error " + err);
    });

    var LEADERS_BOARDS_STOP = nconf.get("leaderboards-size") - 1;

    function getLeadersBoards(callback) {
        var leadersBoards = {};

        async.parallel([function (callback) {
            redisCli.zrevrange('stats:word:total_submitted_count_by_word', 0, LEADERS_BOARDS_STOP, function (err, data) {
                leadersBoards.total_submitted_count = data;
                callback(err);
            });
        }, function (callback) {
            redisCli.zrevrange('stats:word:total_match_count_by_word', 0, LEADERS_BOARDS_STOP, function (err, data) {
                leadersBoards.total_match_count = data;
                callback(err);
            });
        }, function (callback) {
            redisCli.zrevrange('stats:word:today_submitted_count_by_word', 0, LEADERS_BOARDS_STOP, function (err, data) {
                leadersBoards.today_submitted_count = data;
                callback(err);
            });
        }, function (callback) {
            redisCli.zrevrange('stats:word:today_match_count_by_word', 0, LEADERS_BOARDS_STOP, function (err, data) {
                leadersBoards.today_match_count = data;
                callback(err);
            });
        }], function (err) {
            callback(err, leadersBoards);
        });
    }

    function getWordStats(callback) {
        var wordStats = {};

        async.parallel([function (callback) {
            redisCli.get('stats:word:pending_words_count', function (err, data) {
                wordStats.pending_words_count = data || 0;
                callback(err);
            });
        }, function (callback) {
            redisCli.get('stats:word:total_submitted_count', function (err, data) {
                wordStats.words_total_submitted_count = data || 0;
                callback(err);
            });
        }, function (callback) {
            redisCli.get('stats:word:today_submitted_count', function (err, data) {
                wordStats.words_today_submitted_count = data || 0;
                callback(err);
            });
        }, function (callback) {
            redisCli.get('stats:word:total_match_count', function (err, data) {
                wordStats.words_total_match_count = data || 0;
                callback(err);
            });
        }, function (callback) {
            redisCli.get('stats:word:today_match_count', function (err, data) {
                wordStats.words_today_match_count = data || 0;
                callback(err);
            });
        }], function (err) {
            callback(err, wordStats);
        });
    }

    function getBottleStats(callback) {
        var bottleStats = {};

        async.parallel([function (callback) {
            redisCli.llen('bottles:pending_list', function (err, data) {
                bottleStats.pending_bottles_count = data || 0;
                callback(err);
            });
        }, function (callback) {
            redisCli.get('stats:bottle:total_cast_count', function (err, data) {
                bottleStats.bottles_total_cast_count = data || 0;
                callback(err);
            });
        }, function (callback) {
            redisCli.get('stats:bottle:today_cast_count', function (err, data) {
                bottleStats.bottles_today_cast_count = data || 0;
                callback(err);
            });
        }, function (callback) {
            redisCli.get('stats:bottle:total_opened_count', function (err, data) {
                bottleStats.bottles_total_opened_count = data || 0;
                callback(err);
            });
        }, function (callback) {
            redisCli.get('stats:bottle:today_opened_count', function (err, data) {
                bottleStats.bottles_today_opened_count = data || 0;
                callback(err);
            });
        }], function (err) {
            callback(err, bottleStats);
        });
    }

    function getGlobalStats(callback) {
        var stats = {};

        async.parallel([function (callback) {
            getWordStats(function (err, data) {
                stats.word = data;
                callback(err);
            });
        }, function (callback) {
            getBottleStats(function (err, data) {
                stats.bottle = data;
                callback(err);
            });
        }, function (callback) {
            getLeadersBoards(function (err, data) {
                stats.leaders_boards = data;
                callback(err);
            });
        }], function (err, data) {
            callback(err, stats);
        });
    }

    /*****************
     *
     * Exported
     *
     ******************/

    module.exports.getUserGC = function (res) {
        redisCli.hgetall('user_gc', function (err, data) {
            res.json(data);
        });
    };

    module.exports.getGlobalStats = function (res) {
        getGlobalStats(function (err, data) {
            res.json(data);
        });
    };

    module.exports.getConnections = function (res) {
        redisCli.get('connections', function (err, data) {
            res.json({
                redisdb: data
            });
        });
    };

    module.exports.getGlobalStatsUi = function (res) {
        getGlobalStats(function (err, data) {
            res.render('statistics', {
                stats: data
            });
        });
    };

    module.exports.getLeadersBoards = function (res) {
        getLeadersBoards(function (err, data) {
            res.json(data);
        });
    };

    module.exports.getStatsForWord = function (word, res) {
        var stats = {};

        async.parallel([function (callback) {
            redisCli.zscore('stats:word:total_submitted_count_by_word', word, function (err, data) {
                stats.total_submitted_count = data;
                callback(err);
            });
        }, function (callback) {
            redisCli.zscore('stats:word:total_match_count_by_word', word, function (err, data) {
                stats.total_match_count = data;
                callback(err);
            });
        }, function (callback) {
            redisCli.zscore('stats:word:today_submitted_count_by_word', word, function (err, data) {
                stats.today_submitted_count = data;
                callback(err);
            });
        }, function (callback) {
            redisCli.zscore('stats:word:today_match_count_by_word', word, function (err, data) {
                stats.today_match_count = data;
                callback(err);
            });
        }], function (err) {
            res.json(stats);
        });
    };

}());
