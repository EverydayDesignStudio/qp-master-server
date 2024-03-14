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

def count_occurrences(json_data):
    # Initialize an empty dictionary to store counts and track ids
    res = {}

    # Initialize all possible cluster numbers
    all_cluster_numbers = set(range(4))

    # Iterate through the JSON data
    for item in json_data:
        tempo = item["tempo"]
        cluster_number = item["cluster_number"]
        track_id = item["track_id"]

        # If the tempo key doesn't exist in res, create it
        if tempo not in res:
            res[tempo] = {}

        # If the cluster number key doesn't exist under tempo, create it
        if cluster_number not in res[tempo]:
            res[tempo][cluster_number] = {
                "count": 0,
                "track_ids": []
            }

        # Increment the count for the current combination
        res[tempo][cluster_number]["count"] += 1

        # Add the track id to the list of track ids for the current cluster
        res[tempo][cluster_number]["track_ids"].append(track_id)

    # Fill in missing cluster numbers for each tempo
    for tempo in res:
        for cluster_number in all_cluster_numbers:
            if cluster_number not in res[tempo]:
                res[tempo][cluster_number] = {"count": 0, "track_ids": []}

    # Sort the tempo keys in increasing order
    sorted_tempo = sorted(res.keys())

    # Iterate through sorted tempo and sort cluster numbers for each tempo
    for tempo in sorted_tempo:
        res[tempo] = dict(sorted(res[tempo].items()))

    return dict(sorted(res.items()))


result_list = count_occurrences(json_songdata)
print(result_list)

with open('qp_data_song_count_trackID.json', 'w') as file:
    json.dump(result_list, file, indent=2)
