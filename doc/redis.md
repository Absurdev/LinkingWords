# Redis Data

## System data
* user_to_socket: (hashset): store mapping userId => socketId
* user_gc (hashset): contains userIds elligible for garbage collection. userId => time of disconnection of associated socket
* gc_count (integer): count of garbage collected users

## Data for users:
* user:{userId}:pending_words (set): set of pending words of the user
* user:{userId}:pending_bottles (set): set of ids of bottles cast by the user not opened yet
* user:{userId}:rooms (set): set of the rooms the user is currently in
* user:{userId}:chat_picture (string): "chat picture" of the user
* user:{userId}:class (integer): integer representing the class of the user
* user:{userId}:promotion_granted (set): set of users to whom the user has granted a promotion
* user:{userId}:connection_time (string): timestamp of time of connection
* user:{userId}:pull_bottle_count:{mm} (integer): number of bottles successfully pulled during the specfified minute (expires after 2 minutes)
* user:{userId}:cast_bottle_count:{mm} (integer): number of bottles cast during the specfified minute (expires after 2 minutes)

* user_hash_lookup (hashset): lookup table that associates md5 hash of userIds to userIds themselves

## Data for words:
* word:{word}:waiting_users (list): list of users waiting for this word

## Data for message in a bottle

* bottles:id_generator (integer): generate unique id for bottles
* bottles:pending_list (list): list of ids of bottles

* bottle:{id} (hashset): content => message written by a user, user => user id of the writer, direction => direction the bottle was cast

## Stats:

### Live stats

* connections (integer): number of current socket connections

* stats:word:pending_words_count (integer): current number of pending words
* stats:word:total_submitted_count (integer): number of words submitted since the begining
* stats:word:today_submitted_count (integer): number of words submitted today
* stats:word:total_match_count (integer): number of words matched since the begining
* stats:word:today_match_count (integer): number of words matched today

* stats:word:total_submitted_count_by_word (ordered set): words with their submitted count as score since the begining
* stats:word:total_match_count_by_word (ordered set): words with their match count as score since the begining
* stats:word:today_submitted_count_by_word (ordered set): words with their submitted count as score for today
* stats:word:today_match_count_by_word (ordered set): words with their match count as score for today

* stats:bottle:total_cast_count (integer): number of bottles cast since the begining
* stats:bottle:today_cast_count (integer): number of bottles cast today
* stats:bottle:total_opened_count (integer): number of bottles opened since the begining
* stats:bottle:today_opened_count (integer): number of bottles opened today
