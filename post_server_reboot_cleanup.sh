# clean up redis db after server reboot
redis-cli KEYS user:* | xargs redis-cli DEL
redis-cli KEYS word:* | xargs redis-cli DEL
redis-cli KEYS bottle:* | xargs redis-cli DEL
redis-cli KEYS bottles:pending_list | xargs redis-cli DEL
redis-cli DEL user_to_socket
redis-cli DEL user_gc
redis-cli DEL connections
redis-cli DEL user_hash_lookup

redis-cli DEL stats:word:pending_words_count
redis-cli DEL stats:word:today_submitted_count
redis-cli DEL stats:word:today_match_count
redis-cli DEL stats:bottle:today_opened_count
redis-cli DEL stats:bottle:today_cast_count
redis-cli DEL stats:word:today_submitted_count_by_word
redis-cli DEL stats:word:today_match_count_by_word
