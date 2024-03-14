import json
from collections import defaultdict

with open('qp_data_multiuser_min.json', 'r') as songDB:
    # Use the json.load() method to load the JSON data from the file
    json_songdata = json.load(songDB)

# Example JSON data
json_data = [
{"user_id": [1], "track_name": "Circles", "track_id": 
"21jGcNKet2qwijlDFuPiPb", "Z_Danceability": 0.681, "Z_Energy": 0.866, 
"Z_Liveness": -0.624, "Z_Valence": 0.639, "tempo": 120, "danceability": 
0.695, "energy": 0.762, "liveness": 0.0863, "valence": 0.553, 
"cluster_number": 0, "cluster_type": "HDHV"},
{"user_id": [2], "track_name": "Circles", "track_id": 
"21jGcNKet2qwijlDFuPiPb", "Z_Danceability": 0.681, "Z_Energy": 0.866, 
"Z_Liveness": -0.624, "Z_Valence": 0.639, "tempo": 120, "danceability": 
0.695, "energy": 0.762, "liveness": 0.0863, "valence": 0.553, 
"cluster_number": 0, "cluster_type": "HDHV"},
{"user_id": [3], "track_name": "Witch House", "track_id": 
"0RoJGJA3g0Oop7xDfsbTw9", "Z_Danceability": -1.461, "Z_Energy": 1.5, 
"Z_Liveness": -0.602, "Z_Valence": -0.075, "tempo": 170, "danceability": 
0.313, "energy": 0.932, "liveness": 0.0895, "valence": 0.379, 
"cluster_number": 3, "cluster_type": "LDLV"}
]

# Create a dictionary to store user_id's listening history for each track_id
listening_history = {}

# Populate the dictionary
for song in json_songdata:
    track_id = song["track_id"]
    user_ids = song["user_id"]
    for user_id in user_ids:
        if track_id not in listening_history:
            listening_history[track_id] = set()
        listening_history[track_id].add(user_id)

# Convert sets to lists for serialization
listening_history_serializable = {}
for track_id, user_ids in listening_history.items():
    listening_history_serializable[track_id] = list(user_ids)

print(listening_history)

with open('qp_data_listening_history_per_track.json', 'w') as file:
    json.dump(listening_history_serializable, file, indent=2)
