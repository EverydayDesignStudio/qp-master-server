////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// #1. Server Setup //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

//Depedency variables for node server setup
const express = require('express')
var cors = require('cors');
var cookieParser = require('cookie-parser');
var bodyParser = require("body-parser");
var fs= require('fs');
var http=require('http');
var WebSocket = require('ws');
var socketio = require('socket.io');

// Defining the port
const port = process.env.PORT || '5000';

//Initialising the express server
const app = express();
app.use(bodyParser.json());
const { ppid } = require('process');

app.use(cors())
  .use(cookieParser());
app.get('/', (req, res) => {
  res.send("Queue Server Up!!");
});

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// #2. QP Variables //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

// ### Loaded DBs
var listeningHistoryDB = {}
var qpTrackDB = {}
var occurrencesDB = {}

var queue = [];             // the queue for the queue player system, max size 4
var currQueueOffset=0;      // the index up to which the queue player has been updated by the user and from where the new song will be added to the queue

var clientTrackAdded=["","","",""];  // array to keep a track of the song updated by a specific client exiting the queue to make it free to add new songs
var isBPMTapped = [false,false,false,false]; // boolean array for 4 slots of queueLights to indicate which entry(BPM) is newly added by a client

// ** ring light color indicates who 'initiated' the current BPM **
// array to map ringLight colors for each song in the queue
var ringLight =["","","",""];

// the current BPM playing in the queue player system
var currBPM=-1;

var currCluster=-1;
var currClusterCounter = 0
var currClusterCounterMAX = 0
var hasClusterExhausted = [false, false, false, false]

// Create a Set to store played track_ids
let playedTrackIds = new Set();

// pre-defined from the dataset
const BPM_MIN = 32
const BPM_MAX = 239

var currTrackID='';         // the song/track ID of the currently playing song
var prevTrackID='';         // the song/track ID of the previously played song
var broadcastTimestamp = -1;// the timestamp of the most recent broadcast message
var startTrackTimestamp = -1// the timestamp info when the currently played song is first broadcasted
var isUpdateStartTrackTimestamp = false

var client1Active=false;    // client state checking variables
var client2Active=false;
var client3Active=false;
var client4Active=false;

var client1Added=false;     // client updates to queue checking variables
var client2Added=false;
var client3Added=false;
var client4Added=false;

var client1Socket=false;    // stores the socket id client-server connection to properly disconnect when client becomes inactive
var client2Socket=false;
var client3Socket=false;
var client4Socket=false;

var clientState = [false, false, false, false]   // array to store all the current client states

var currQPInfo = ''     // current QueuePlayer information that is broadcasted to the clients

var cleanupTimer = null

var VERBOSE = true
var SONG_SELECTION_LOGS = false

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// #3. Create Connections //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const server = http.createServer(app);
const io = new socketio.Server(server);

// Load all databases needed for the server
loadDatabases()

// create and manage socket connection objects that contain socket.id for each client
io.on('connection', (socket) => {

  console.log(socket.id);
  console.log("Client Connected")

  socket.on('connect_user', (msg) => {
    console.log(msg.clientID);
    if(msg.clientID==1)
    {
      console.log("Socket ID registered for QP1")
      client1Socket=socket.id
    }
    else if(msg.clientID==2)
    {
      console.log("Socket ID registered for QP2")
      client2Socket=socket.id
    }
    else if(msg.clientID==3)
    {
      console.log("Socket ID registered for QP3")
      client3Socket=socket.id
    }
    else if(msg.clientID==4)
    {
      console.log("Socket ID registered for QP4")
      client4Socket=socket.id
    }

  });

  socket.on('disconnect', () => {
    console.log('Client disconnected');
    console.log(socket.id);
    if(socket.id==client1Socket)
    {
      console.log("  QP1 disconnected")
      client1Active=false
    }
    else if(socket.id==client2Socket)
    {
      console.log("  QP2 disconnected")
      client2Active=false
    }
    else if(socket.id==client3Socket)
    {
      console.log("  QP3 disconnected")
      client3Active=false
    }
    else if(socket.id==client4Socket)
    {
      console.log("  QP4 disconnected")
      client4Active=false
    }

    clientState = [client1Active, client2Active, client3Active, client4Active]

    // have a timeout before clear everything -- allow some time for a client to reconnect
    checkClientsForCleanup()

    io.emit('stateChange', JSON.stringify( { "activeUsers": clientState} ));

    console.log("Currents States of the Clients (true=Active, false=Inactive): ", JSON.stringify(clientState))

  });
});

//start our server
server.listen(port, () => {
    console.log(`Server started on port ${server.address().port} :)`);
});


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// #4. HTTP methods //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/*
Input: clientID via the req.body
Output: server variable client{ID}Active set to true
Description or Flow: A client sends its respective client id to the server and the respective client{ID}Active variable of
the server is set to true. The clientState array is also updated with the new values of all the clients.
*/
app.post('/setClientActive',(req, res)=>{

  prevClientState = clientState.concat()    // shallow copy

  console.log('Client Active');
  if(req.body.clientID==1)
  {
    console.log("  QP1 is set active");
    client1Active=true;
  }
  else if(req.body.clientID==2)
  {
    console.log("  QP2 is set active");
    client2Active=true;
  }
  else if(req.body.clientID==3)
  {
    console.log("  QP3 is set active");
    client3Active=true;
  }
  else if(req.body.clientID==4)
  {
    console.log("  QP4 is set active");
    client4Active=true;
  }

  if (VERBOSE) {
    console.log("  [setClientActive]@@ ", req.body)
  }

  console.log("Previous States of the Clients (true=Active, false=Inactive): ", JSON.stringify(prevClientState))
  clientState = [client1Active, client2Active, client3Active, client4Active]
  console.log("Currents States of the Clients (true=Active, false=Inactive): ", JSON.stringify(clientState))
  io.emit('stateChange', JSON.stringify( { "activeUsers": clientState} ));

  // not used -- just checking
  res.send( {"Client 1":client1Active, "Client 2":client2Active, "Client 3":client3Active, "Client 4":client4Active} )

  // if only one client joins, populate the queue, starting with the first song, owned by the active client
  //  ** but, only when the cleanup timer is null -- otherwise, it means the client is reconnected
  if (numActiveClients() == 1 && cleanupTimer == null) {
    console.log("Client ", req.body.clientID, " has started the session.")
    tmpBPM = getRandomIntInclusive(BPM_MIN, BPM_MAX);
    tmpCluster = getRandomIntInclusive(0, 3);

    if (queue.length == 0) {
      isUpdateStartTrackTimestamp = true
    }

    console.log("Randomly choosing BPM and cluster. BPM: ", tmpBPM, ", Cluster: ", tmpCluster)
    fillQueue(tmpBPM, tmpCluster, req.body.clientID)

    currTrackID = queue[0].track_id;
    currBPM = queue[0].tempo;
    currCluster = queue[0].cluster_number;
    currClusterCounter = 0;

  } else {
    // when a client is reconnected, remove the cleanupTimer
    if (VERBOSE) {
      console.log("  [setClientActive]@@ Connection restored for Client ", req.body.clientID)
    }
    checkClientsForCleanup()
  }

  broadcastQueue()

})

/*
Input: clientID via the req.body
Output: server variable client{ID}Active set to false
Description or Flow: A client sends its respective client id to the server and the respective client{ID}Active variable of
the server is set to false. The clientState array is also updated with the new values of all the clients.And a json is sent to
all the clients with the updated clientState array
*/
app.post('/setClientInactive',(req, res)=>{

  console.log('Client Inactive');
  if(req.body.clientID==1)
  {
    console.log("  QP1 is set inactive");
    client1Active=false;
  }
  else if(req.body.clientID==2)
  {
    console.log("  QP2 is set inactive");
    client2Active=false;
  }
  else if(req.body.clientID==3)
  {
    console.log("  QP3 is set inactive");
    client3Active=false;
  }
  else if(req.body.clientID==4)
  {
    console.log("  QP4 is set inactive");
    client4Active=false;
  }

  clientState = [client1Active, client2Active, client3Active, client4Active]
  console.log("Client States is now (true=Active, false=Inactive): ", JSON.stringify(clientState));

  // no cleanupTimer here as users would turn off the client intentionally
  if (numActiveClients() == 0) {
    console.log("All clients are inactive. Ending the listening session. Clear all variables.");
    clearVariables()
  }

  io.emit('stateChange', JSON.stringify( { "activeUsers": clientState} ));

  // Just checking
  res.send({"Client 1":client1Active, "Client 2":client2Active, "Client 3":client3Active, "Client 4":client4Active})
})

// when an active client taps, all songs after the cursor are discarded and re-populated with the given bpm/cluster
app.post('/getTrackToQueue',(req, res)=>{
  console.log("## Client " , req.body.clientID, " TAPPED a bpm of: ", req.body.bpm, " at cluster ", req.body.cln)

  let bpm_check = req.body.bpm
  if (bpm_check > BPM_MAX) {
    console.log("## Extreme BPM detected. Setting it to BPM_MAX: 239")
    bpm_check = BPM_MAX
  }
  
  // first, check if the client can add new BPM
  if(userCheck(req.body.clientID)) {
    // only if the currQueueOffset is 0 --> regenerate the queue
    if (currQueueOffset == 0) {
      if (VERBOSE) {
        console.log("  [getTrackToQueue]@@ Replaying the entire queue.")
      }
      prevTrackID = currTrackID
    }

    // Skip the current one and work on the one after
    currQueueOffset++;
    if (VERBOSE) {
      console.log("  [getTrackToQueue]@@ Queue offset is now: ", currQueueOffset, ". Slicing and dropping the rest..")
    }

    // when tapped, remove the rest of queue from the current cursor(offset),
    queue.splice(currQueueOffset);


    if (VERBOSE) {
      console.log("  [getTrackToQueue]@@ Gotta fill the rest.")
    }
    // fill the rest (could be the entire queue) with the tapped BPM,
    fillQueue(bpm_check, req.body.cln, req.body.clientID, true)

    currTrackID = queue[0].track_id;
    currBPM = queue[0].tempo
    currCluster = queue[0].cluster_number;
    currClusterCounter = 0;
    playedTrackIds.clear();
    playedTrackIds.add(currTrackID);

    if (VERBOSE) {
      console.log("  [getTrackToQueue]@@ Next up: ", queue[0].track_name, " ('", currTrackID ,"') @ ", currBPM, " bpm in cluster ", currCluster)
    }

    // then broadcast the queue
    if (VERBOSE) {
      console.log("  [getTrackToQueue]@@ Queue modified and now broadcasting..")
    }
    broadcastQueue()

    res.send({"queue": queue});

  // when the client is 'locked',
  } else {
    console.log("##   Skipping.. Client ", req.body.clientID, " is not yet available to add a new bpm.")
    res.send({"queue":"Already added song"})
  }

})


app.post('/trackFinished',(req,res)=>{

  console.log("## trackFinished Request Received from client ", req.body.clientID)

  if (VERBOSE) {
    console.log(req.body)
  }

  console.log("  ## currTrackID: ", currTrackID)
  console.log("  ## receivedTrackID: ", req.body.trackID)
  console.log("  ## Current Queue size: ", queue.length)
  console.log("  ## TrackIDs in the queue: [", queue[0].track_id, ", ", queue[1].track_id, ", ", queue[2].track_id, ", ", queue[3].track_id, "]")

  // When the current song is finished (received by the first client)
  if (currTrackID == req.body.trackID) {

    if (VERBOSE) {
      console.log("  [trackFinished]@@ Current song is finished. Shifting the queue..")
    }
    shiftQueue_NextSong(currBPM, currCluster);

    // // short pause -- allow other clients to finish before broadcasting the next track
    // console.log('Waiting for 5 seconds...');
    // // blocking sleep
    // sleep(5000);

  // Repeated request for the same song from other clients
  } else if (prevTrackID == req.body.trackID) {
    // ignore the request
      console.log('  But,, this track is a previous one.');
  // edge case - this client may be in a significant delay >> just send out an updated queue with the current song
  } else {
    console.log('  ... cannot remember this track. This client may be in a significant delay..');
  }

  isUpdateStartTrackTimestamp = true
  broadcastQueue()

  res.end();
})


// A simple POST function to broadcast the current QP info without modifying anything.
// Need for reconnected clients to get an updated QP info.
app.post('/requestQPInfo',(req,res)=>{
  console.log("## requestQPInfo Request Received from client ", req.body.clientID)
  broadcastQueue()
  res.end();
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// #5. QP Server Auxiliary Functions //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

function userControl(id) {
  if(id==1)
  {
    if(client1Added)
    {
      client1Added = false;
    }
    else
    {
      client1Added = true;
    }
  }
  else if(id==2)
  {
    if(client2Added)
    {
      client2Added = false;
    }
    else
    {
      client2Added = true;
    }
  }
  else if(id==3)
  {
    if(client3Added)
    {
      client3Added = false;
    }
    else
    {
      client3Added = true;
    }
  }
  else if(id==4)
  {
    if(client4Added)
    {
      client4Added = false;
    }
    else
    {
      client4Added = true;
    }
  }
}

function userCheck(id) {
  if(id==1 && client1Added)
  {
    return false;
  }
  else if(id==2 && client2Added)
  {
    return false;
  }
  else if(id==3 && client3Added)
  {
    return false;
  }
  else if(id==4 && client4Added)
  {
    return false;
  }
  return true;
}

function colorFromUser(user) {
  if(user==1)
  {
    return [150,75,0,0];
  }
  else if(user==2)
  {
    return [130,204,0,5];
  }
  else if(user==3)
  {
    return [150,40,215,0];
  }
  else if(user==4)
  {
    return [200, 45,0,0];
  }
}

function getRGBColors(qElement) {
   colorArr={};
   let i=0;
   let n=1;
   while(i<qElement.user_id.length)
   {
     if(qElement.user_id[i]==1)
     {
       colorArr[n]={"r":150, "g":75,"b":0,"w":0};
       n++;
     }
     else if(qElement.user_id[i]==2)
     {
       colorArr[n]={"r":130, "g":204,"b":0,"w":5};
       n++;
     }
     else if(qElement.user_id[i]==3)
     {
       colorArr[n]={"r":150, "g":40,"b":215,"w":0};
       n++;
     }
     else if(qElement.user_id[i]==4)
     {
       colorArr[n]={"r":200, "g":45,"b":0,"w":0};
       n++;
     }
     i++;
   }
   return colorArr;
}

function sleep(milliseconds) {
  const start = Date.now();
  while (Date.now() - start < milliseconds) {}
}

function clearVariables() {
  console.log("Ending the session. Cleaning up the variables.")

  queue = [];

  clientTrackAdded=["","","",""];
  client1Added = false
  client2Added = false
  client3Added = false
  client4Added = false

  isBPMTapped = [false,false,false,false];
  ringLight =["","","",""];

  currBPM=-1;
  currCluster=-1;
  currQueueOffset=0;
  currTrackID='';
  prevTrackID='';
  broadcastTimestamp = -1;
  startTrackTimestamp = -1;
  isUpdateStartTrackTimestamp = false
}

function checkClientsForCleanup() {
  // Check if all clients are disconnected
  const allDisconnected = clientState.every(active => !active);

  if (queue.length == 0) {
    console.log("Queue is empty. Nothing to clean up.")
  }
  
  if (allDisconnected && queue.length > 0) {
    // Start a timer if it's not already running
    if (cleanupTimer === null) {
      console.log("All clients disconnected. Starting cleanup timer.");
      cleanupTimer = setTimeout(() => {
        // This function will run after 10 seconds
        clearVariables();
        cleanupTimer = null; // Reset the timer reference
      }, 10000); // 10 seconds
    }
  } else {
    // If any client is still connected but the timer is running, stop the timer
    if (cleanupTimer !== null) {
      console.log("A client reconnected. Stopping the cleanup timer.");
      clearTimeout(cleanupTimer);
      cleanupTimer = null;
    }
  }
}

function numActiveClients() {
  state = clientState
  const activeCount = state.filter(value => value === true).length;
  return activeCount;
}

function getRandomIntInclusive(min, max) {
  // the maximum and the minimum is inclusive
  return Math.floor(Math.random() * (max - min + 1) + min);
}

// function to shuffle an array
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]]; // Swap elements
    }
}

function hasListened(track_id, user_id) {
    // Check if the track_id exists in the listeningHistory object
    if (listeningHistoryDB.hasOwnProperty(track_id)) {
        // Check if the user_id exists in the array of user_ids for the track_id
        return listeningHistoryDB[track_id].includes(user_id);
    } else {
        // If track_id does not exist, user has not listened
        return false;
    }
}

function findMatchingTrack(trackID) {
  // iterate the song database to find the matching track
  let trackItem = {};
  for (let i = 0; i < qpTrackDB.length; i++) {
      if (qpTrackDB[i].track_id === trackID) {
          // add the matching track to the back of the queue
          trackItem = qpTrackDB[i]
          break;
      }
  }
  return trackItem
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// #6. QP Server Functions //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

function loadDatabases() {
  qpTrackDB = require("./Final Database/qp_data_multiuser_min.json");
  listeningHistoryDB = require("./Final Database/qp_data_listening_history_per_track.json");
  occurrencesDB = require("./Final Database/qp_data_song_count_trackID.json");
}


function pickNextTrack(bpm, cluster, clientID = -1) {
  if (VERBOSE && SONG_SELECTION_LOGS) {
    console.log("  [pickNextTrack]@@ Picking the next track.")
  }

  if (!occurrencesDB.hasOwnProperty(bpm)) {
    if (VERBOSE && SONG_SELECTION_LOGS) {
      console.log("  [pickNextTrack]@@ BPM ", bpm ," does not exist. Exiting..")
    }
    return "";
  }

  // check how many songs are in the given bpm-cluster
  let trackCount = occurrencesDB[bpm][cluster].count;

  if (VERBOSE) {
    console.log("  [pickNextTrack]@@ Checking the total track count: ", trackCount, " [@", bpm, "-", cluster, "]")
  }

  // if no song is available, return an empty string,
  //   indicating that there is no available song
  if (trackCount == 0) {
    if (VERBOSE && SONG_SELECTION_LOGS) {
      console.log("  [pickNextTrack]@@ No available tracks in this bpm-cluster.")
    }
    return "";
  }

  // creating a list of random indices
  let randomTrackIndices = [];
  for (let i = 0; i < trackCount; i++) {
      randomTrackIndices.push(i);
  }
  // shuffling the list of indices
  shuffleArray(randomTrackIndices);

  // try picking songs at a random index
  for (let i = 0; i < trackCount; i++) {
    let randomTrackIndex = randomTrackIndices[i];
    let randomTrackID = occurrencesDB[bpm][cluster].track_ids[randomTrackIndex];

    if (VERBOSE && SONG_SELECTION_LOGS) {
      console.log("  [pickNextTrack]@@ Checking a random track ID: ", randomTrackID)
    }
    // if the chosen track is already played, skip
    if (playedTrackIds.has(randomTrackID)) {
      if (VERBOSE && SONG_SELECTION_LOGS) {
        console.log("  [pickNextTrack]@@@@ 1. This track is already played. Skip")
      }
      continue;

    // if the chosen track is already in the queue, skip
    } else if (queue.some(track => track.track_id === randomTrackID)) {
      if (VERBOSE && SONG_SELECTION_LOGS) {
        console.log("  [pickNextTrack]@@@@ 2. This track is already in the queue. Skip")
      }
      continue;

    // (only when the client ID is provided as a param)
    // if the chosen track is not owned by the client, skip
    } else if (clientID > 0 && !listeningHistoryDB[randomTrackID].includes(clientID)) {
      if (VERBOSE && SONG_SELECTION_LOGS) {
        console.log("  [pickNextTrack]@@@@ 3. This track is not owned by Client ", clientID, ". Skip")
      }
      continue;

    } else {
      if (VERBOSE && SONG_SELECTION_LOGS) {
        console.log("  [pickNextTrack]@@@@ This track is ready to be played. TrackID: ", randomTrackID, ". (bpm: ", bpm, ", cln: ", cluster ,")")
      }
      return randomTrackID
    }
  } // for loop

  if (VERBOSE) {
    console.log("  [pickNextTrack]@@ No available songs found for cluster ", cluster, ", bpm ", bpm)
  }

  return ""
}


// Finds the next available cluster in the given BPM.
// Returns -1 if there is no available cluster.
// Unavailable clusters are:
//  - A cluster has no songs
//  - All songs in the cluster are already played
function pickNextCluster(bpm, clusterNow = -1) {

  if (VERBOSE) {
    console.log("  [pickNextCluster]@@ Picking the next cluster at bpm ", bpm)
  }

  if (!occurrencesDB.hasOwnProperty(bpm)) {
    if (VERBOSE && SONG_SELECTION_LOGS) {
      console.log("  [pickNextCluster]@@ BPM ", bpm ," does not exist. Exiting..")
    }
    return -1;
  }

  // if all clusters in this bpm are done, simply there is no available cluster
  if (bpm == currBPM) {
    let depletedClusterCount = hasClusterExhausted.filter(value => value === true).length;
    if (depletedClusterCount == 4) {
      if (VERBOSE && SONG_SELECTION_LOGS) {
        console.log("  [pickNextCluster]@@@@ All clusters are exhausted for bpm ", bpm, ". No available cluster.")
      }
      return -1;
    }
  }

  let randomClusterIndices = [];
  // Create a random list of clusters to check
  //   when we have the cluster param, push it first, then randomly add the rest
  if (clusterNow > 0) {
    randomClusterIndices = [clusterNow]

    // fill the array with numbers 0 to 3 (excluding the initialNumber)
    for (let i = 0; i < 4; i++) {
        if (i !== clusterNow) {
            randomClusterIndices.push(i);
        }
    }

    //   shuffle the array to randomize the order
    for (let i = randomClusterIndices.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [randomClusterIndices[i], randomClusterIndices[j]] = [randomClusterIndices[j], randomClusterIndices[i]];
    }

  } else {
    // creating a list of indices
    for (let i = 0; i < 4; i++) {
        randomClusterIndices.push(i);
    }

    // shuffling the list of indices
    shuffleArray(randomClusterIndices);
  }

  // check clusters in the randomly created order in the given bpm
  for (let i = 0; i < 4; i++) {
    let randomCluster = randomClusterIndices[i];
    let randomClusterSize = occurrencesDB[bpm][randomCluster].count
    let playedSongsCount = 0
    let songsInTheQueueCount = 0

    if (VERBOSE && SONG_SELECTION_LOGS) {
      console.log("  [pickNextCluster]@@ Checking a random cluster ", randomCluster, ", size: ", randomClusterSize)
    }

    // this is when the cluster is empty (no songs)
    if (randomClusterSize == 0) {
      if (VERBOSE && SONG_SELECTION_LOGS) {
        console.log("  [pickNextCluster]@@@@ 1. This cluster is empty. Skip")
      }
      continue;
    }

    // if the given bpm is the current bpm, check for depleted clusters
    if (bpm == currBPM && hasClusterExhausted[randomCluster]) {
      if (VERBOSE && SONG_SELECTION_LOGS) {
        console.log("  [pickNextCluster]@@@@ 2. All songs in this cluster (@ bpm", bpm, ") are already played. Skip")
      }
      continue;
    }

    if (VERBOSE && SONG_SELECTION_LOGS) {
      console.log("  [pickNextCluster]@@@@@@ Counting how many songs are played/queued..")
    }
    // count how many tracks in this cluster are played
    for (let trackID of playedTrackIds) {
      let trackIDs = occurrencesDB[bpm][randomCluster]["track_ids"];
      if (trackIDs.includes(trackID)) {
          playedSongsCount++;
      }
    }
    if (VERBOSE) {
      console.log("  [pickNextCluster]@@@@@@ ", playedSongsCount, " songs are played in this cluster.")
    }

    // also count how many tracks in this cluster are in the queue
    //   -- songs in the queue are soon to be played, so considered them as 'played'
    queue.forEach((track) => {
      songsInTheQueueCount += occurrencesDB[bpm][randomCluster]["track_ids"].filter(trackID => trackID === track.track_id).length;
    });
    if (VERBOSE && SONG_SELECTION_LOGS) {
      console.log("  [pickNextCluster]@@@@@@ ", songsInTheQueueCount, " songs are in the queue.")
    }

    // if the number of songs in the cluster are more than the played and queued songs, choose this cluster
    // otherwise, continue searching
    if (randomClusterSize > playedSongsCount + songsInTheQueueCount) {
      if (VERBOSE) {
        console.log("  [pickNextCluster]@@ Found one! There are songs can be played in this cluster ", randomCluster)
      }
      return randomCluster;
    }

  } // for loop

  if (VERBOSE && SONG_SELECTION_LOGS) {
    console.log("  [pickNextCluster]@@ No available cluster found for bpm ", bpm)
  }

  return -1
}

function chooseNextSong(bpm, cluster, clientID = -1) {
  let trackID = ""

  if (VERBOSE) {
    if (clientID > 0) {
      console.log("  [chooseNextSong]@@ Gotta choose a song for bpm-cluster: ", bpm, "-", cluster, " for Client ", clientID)
    } else {
      console.log("  [chooseNextSong]@@ Gotta choose a song for bpm-cluster: ", bpm, "-", cluster)
    }
  }

  while (trackID == "") {
    let searchCluster = cluster
    if (VERBOSE) {
      console.log("  [chooseNextSong]@@@@ Searching for cluster ", cluster, " at bpm ", bpm)
    }
    trackID = pickNextTrack(bpm, searchCluster, clientID);
    if (VERBOSE) {
      console.log("  [chooseNextSong]@@@@ Retrieved trackID: ", trackID)
    }

    if (trackID == "") {
      if (VERBOSE) {
        console.log("  [chooseNextSong]@@@@ Oops, no available tracks. Trying again..")
      }
      searchCluster = pickNextCluster(bpm, searchCluster);
      if (VERBOSE && SONG_SELECTION_LOGS) {
        console.log("  [chooseNextSong]@@@@ Next cluster to try: ", searchCluster)
      }
      if (searchCluster < 0) {
        if (VERBOSE) {
          console.log("  [chooseNextSong]@@@@ Oh.. no cluster is found for bpm ", bpm, ". Trying one bpm lower..")
        }
        bpm--;
      } else {
        trackID = pickNextTrack(bpm, searchCluster, clientID);
        if (VERBOSE) {
          if (trackID == "") {
            console.log("  [chooseNextSong]@@@@@@ NOOOO.. moving on..")
          } else {
            console.log("  [chooseNextSong]@@@@@@ Retrieved trackID: ", trackID)
          }

        }
      }
    }

    // if the search hits the very bottom, go back to the highest bpm
    if (bpm < BPM_MIN) {
      if (VERBOSE) {
        console.log("  [chooseNextSong]@@ Minimum bpm reached. Circulating back to max bpm of ", BPM_MAX)
      }
      bpm = BPM_MAX;
    }

  } // while loop

  return trackID
}

// Fill the queue with next available songs in the dataset
//   !! NOT responsible for cursor/offset management
function fillQueue(bpm, cluster, clientID = -1, tapped = false) {

  // fill the queue until it reaches the max length of 4

  if (VERBOSE) {
    console.log("  [fillQueue]@@ Filling the queue!")
  }

  while (queue.length < 4) {

    if (VERBOSE) {
      console.log("  [fillQueue]@@@@ Queue length now: ", queue.length)
    }

    // case 1) if queue is empty, populate the queue
    if (queue.length == 0 && numActiveClients() == 1) {
      if (VERBOSE) {
        console.log("  [fillQueue]@@@@ Case 1: Populating the queue!")
      }
      currBPM = bpm
      currCluster = cluster
      isBPMTapped = isBPMTapped.concat([false]);
      ringLight.fill(colorFromUser(clientID), currQueueOffset, ringLight.length);

      let trackIDToBeAdded = chooseNextSong(bpm, cluster, clientID)
      let trackItem = findMatchingTrack(trackIDToBeAdded)
      if (VERBOSE) {
        console.log("  [fillQueue]@@@@@@ Pushing a track to the queue: ", trackItem.track_name, " (", trackIDToBeAdded, ")")
      }
      queue.push(trackItem)

    // case 2) if tapped, lock the client until the added track is finished and fill the ring light
    } else if (tapped) {
      if (VERBOSE) {
        console.log("  [fillQueue]@@@@ Case 2: Tapped!")
      }
      isBPMTapped[currQueueOffset] = true;
      ringLight.fill(colorFromUser(clientID), currQueueOffset, ringLight.length);

      // TODO: may need to add an error handling logic
      let trackIDToBeAdded = chooseNextSong(bpm, cluster, clientID)
      let trackItem = findMatchingTrack(trackIDToBeAdded)
      queue.push(trackItem)

      if (VERBOSE) {
        console.log("  [fillQueue]@@@@@@ Pushing a track to the queue: ", trackItem.track_name, " (", trackIDToBeAdded, ")")
      }

      // lock the client from frequently adding other bpms
      clientTrackAdded[clientID-1] = trackIDToBeAdded;
      userControl(clientID);

      // reverse the flag so that next song and onward can not be caught in this case
      tapped = false;

      if (VERBOSE) {
        console.log("  [fillQueue]@@@@@@ Locking client ", clientID, ", and 'Tapped' unflagged")
      }

    // case 3) populate the queue with the regular song selection algo
    } else {
      if (VERBOSE) {
        console.log("  [fillQueue]@@@@ Case 3: Normal song selection")
      }
      isBPMTapped = isBPMTapped.concat([false]);
      ringLight = ringLight.concat([ringLight[ringLight.length-1]]);

      // TODO: may need to add an error handling logic
      let trackIDToBeAdded = chooseNextSong(bpm, cluster)
      let trackItem = findMatchingTrack(trackIDToBeAdded)

      if (VERBOSE) {
        console.log("  [fillQueue]@@@@@@ Pushing a track to the queue: ", trackItem.track_name, " (", trackIDToBeAdded, ")")
      }

      queue.push(trackItem)

    }

  } // while loop

}

// when the currently playing song is finished, modify the queue with a next new song
function shiftQueue_NextSong(bpm, cluster) {
  prevTrackID = currTrackID

  // queue should not be empty
  if (queue.length > 1) {
    // move the offset cursor
    currQueueOffset--;
    if (VERBOSE) {
      console.log("  [shiftQueue_NextSong]@@ move to the next song in the queue.. currQueueOffset: ", currQueueOffset)
    }
    if (currQueueOffset < 0)
    {
      if (VERBOSE) {
        console.log("  [shiftQueue_NextSong]@@ Oops.. Adjusting the offset back to 0..")
      }
      currQueueOffset = 0;
    }

    var deletedFromQueue = queue.shift();
    prevTrackID = deletedFromQueue.track_id
    if (VERBOSE) {
      console.log("  [shiftQueue_NextSong]@@ Removed track: ", deletedFromQueue.track_name, " (", prevTrackID, ")")
    }

    // shift the list that contains TAP info
    var tapped = isBPMTapped.shift();

    // if the played song is a tapped song, unlock the client
    if (tapped) {
      if (VERBOSE) {
        console.log("  [shiftQueue_NextSong]@@ This track is tapped by Client ", indx+1, ". Unlocking the Client!")
      }
      var indx = clientTrackAdded.indexOf(deletedFromQueue["track_id"]);
      clientTrackAdded[indx] = "";
      // this client is now available for tap
      userControl(indx + 1);
    }

    if (VERBOSE) {
      console.log("  [shiftQueue_NextSong]@@ Shifting the ring..")
    }
    // shift the ring light list
    ringLight.shift();


    currTrackID = queue[0].track_id;
    currBPM = queue[0].tempo
    if (VERBOSE) {
      console.log("  [shiftQueue_NextSong]@@ Now, ''", queue[0].track_name, "' (", currTrackID ,") is at the front of the queue at bpm ", currBPM)
    }

    if (currCluster != queue[0].cluster_number) {
      if (VERBOSE) {
        console.log("  [shiftQueue_NextSong]@@@@ Cluster changed from ", currCluster, " -> ", queue[0].cluster_number)
        console.log("  [shiftQueue_NextSong]@@@@ Resetting the playedTracks bucket. (So far, ", currClusterCounter, " tracks played cluster ", currCluster ,")")
      }
      currCluster = queue[0].cluster_number;
      playedTrackIds.clear();
      currClusterCounter = 0;
    }

    currClusterCounter++;
    playedTrackIds.add(currTrackID);
  }
  // when the queue size is 0, nothing to shift
  else {
    if (VERBOSE) {
      console.log("  [shiftQueue_NextSong]@@ The queue seems to be empty..")
    }
  }

  if (VERBOSE) {
    console.log("  [shiftQueue_NextSong]@@ Filling the rest of the queue.")
  }
  // fill the queue with bpm/cluster of the song at the cursor
  fillQueue(queue[currQueueOffset].tempo, queue[currQueueOffset].cluster_number)
}


function printFilteredTrack(track) {
    const filteredTrack = {
        track_name: track.track_name,
        user_id: track.user_id,
        track_id: track.track_id,
        tempo: track.tempo,
        cluster_number: track.cluster_number,
        cluster_type: track.cluster_type
    };

    console.log(JSON.stringify(filteredTrack, null, 2));
}


function broadcastQueue() {

  // at this point, the queue should be full (length = 4)
  broadcastTimestamp = Math.floor(Date.now() / 1000);

  if (isUpdateStartTrackTimestamp) {
    startTrackTimestamp = broadcastTimestamp
    isUpdateStartTrackTimestamp = false
  }

  currQPInfo=JSON.stringify(
    {
      "currentTrack":{
        "trackID": queue[0].track_id,
        "track_name": queue[0].track_name,
        "broadcastTimestamp": broadcastTimestamp,
        "startTrackTimestamp": startTrackTimestamp,
        "bpm": currBPM,
        "cluster_number": queue[0].cluster_number
      },

      "canUserAddBPM":[!client1Added,!client2Added,!client3Added,!client4Added],

      "queuedTrackIDs":[queue[0].track_id, queue[1].track_id, queue[2].track_id, queue[3].track_id],
      "queuedTrackNames":[queue[0].track_name, queue[1].track_name, queue[2].track_name, queue[3].track_name],

      "lightInfo":{
        "queueLight1":{
          "isNewBPM": isBPMTapped[0],
          "ringLight":ringLight[0],
          "bpm": queue[0].tempo,
          "colors":getRGBColors(queue[0])
          },
          "queueLight2":{
            "isNewBPM": isBPMTapped[1],
            "ringLight":ringLight[1],
            "bpm": queue[1].tempo,
            "colors":getRGBColors(queue[1])
          },
          "queueLight3":{
            "isNewBPM": isBPMTapped[2],
            "ringLight":ringLight[2],
            "bpm": queue[2].tempo,
            "colors":getRGBColors(queue[2])
          },
          "queueLight4":{
            "isNewBPM": isBPMTapped[3],
            "ringLight":ringLight[3],
            "bpm": queue[3].tempo,
            "colors":getRGBColors(queue[3])
          },
        } // lightInfo
      } // currQPInfo
    )// JSON.stringify

  console.log("#### Broadcasting the queue to the clients");
  console.log("  ## Current Client States is (true=Active, false=Inactive): ", JSON.stringify(clientState));
  console.log("  ## Printing the first four songs in the queue.");
  printFilteredTrack(queue[0]);
  printFilteredTrack(queue[1]);
  printFilteredTrack(queue[2]);
  printFilteredTrack(queue[3]);
  console.log("  ## Printing the QP info.");
  console.log(currQPInfo);
  console.log("  ## Printing user-added tracks.");
  console.log(clientTrackAdded);
  console.log("////////////////////////////////////////////////////////////////////////////////////////////////////")

  io.emit('broadcast', currQPInfo)
}
