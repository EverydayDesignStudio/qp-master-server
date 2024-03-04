import json

with open('qp_multiuser_update_pretty.json', 'r') as songDB:
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

def merge_items(song_data):
    print("# of items in the JSON list:", len(json_songdata))
    track_dict = {}

    one_user = 0
    two_users = 0
    three_users = 0
    four_users = 0


    for item in song_data:
        track_id = item['track_id']
        if track_id in track_dict:
            # Merge user_ids in increasing order
            track_dict[track_id]['user_id'] = sorted(list(set(track_dict[track_id]['user_id'] + item['user_id'])))
            # If there's a discrepancy in track_name, prioritize the item with more user_ids
            if track_dict[track_id]['track_name'] != item['track_name']:
                if len(item['user_id']) > len(track_dict[track_id]['user_id']):
                    track_dict[track_id] = item
        else:
            track_dict[track_id] = item

    # Convert the dictionary back to a list
    print("Length of the dictionary:", len(track_dict))

    # After merging, count the number of user_ids for each item
    for item in track_dict.values():
        user_count = len(item['user_id'])
        if user_count == 1:
            one_user += 1
        elif user_count == 2:
            two_users += 1
        elif user_count == 3:
            print("  ## Shared by 3 users: ", item['track_name'])
            three_users += 1
        elif user_count == 4:
            print("  $$$$ Shared by all users: ", item['track_name'])
            four_users += 1
        # Add more conditions here if there can be more than 4 users

    # Print the counts
    print("1 user:", one_user)
    print("2 users:", two_users)
    print("3 users:", three_users)
    print("4 users:", four_users)

    merged_data = list(track_dict.values())
    return merged_data

# Merging items

merged_items = merge_items(json_songdata)

# Print or use the merged data
# print(json.dumps(merged_items, indent=4))


with open('qp_multiuser_min.json', 'w') as file:
    json.dump(merged_items, file, indent=2)
