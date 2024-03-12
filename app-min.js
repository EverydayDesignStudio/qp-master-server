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
var broadcastTimestamp = -1;// the timestamp info when the currently played song is first broadcasted

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

var clientState=[client1Active,client2Active,client3Active,client4Active]   // array to store all the current client states

var currQPInfo = ''     // current QueuePlayer information that is broadcasted to the clients

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

  console.log(req.body)
  console.log("Previous States of the Clients (true=Active, false=Inactive): ", JSON.stringify(prevClientState))
  console.log("Currents States of the Clients (true=Active, false=Inactive): ", JSON.stringify(clientState))
  io.emit('stateChange', JSON.stringify( { "activeUsers": clientState} ));

  // not used -- just checking
  res.send( {"Client 1":client1Active, "Client 2":client2Active, "Client 3":client3Active, "Client 4":client4Active} )

  // if only one client joins, populate the queue,
  // starting with the first song, owned by the active client
  if (numActiveClients() == 1) {
    tmpBPM = getRandomIntInclusive(BPM_MIN, BPM_MAX);
    tmpCluster = getRandomIntInclusive(0, 3);
    fillQueue(tmpBPM, tmpCluster, req.body.clientID)
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
    continueState[0]=false;
  }
  else if(req.body.clientID==2)
  {
    console.log("  QP2 is set inactive");
    client2Active=false;
    continueState[1]=false;
  }
  else if(req.body.clientID==3)
  {
    console.log("  QP3 is set inactive");
    client3Active=false;
    continueState[2]=false;
  }
  else if(req.body.clientID==4)
  {
    console.log("  QP4 is set inactive");
    client4Active=false;
    continueState[3]=false;
  }

  if (numActiveClients() == 0) {
    clearVariables()
  }

  console.log("Client States is now (true=Active, false=Inactive): ", JSON.stringify(clientState));
  io.emit('stateChange', JSON.stringify( { "activeUsers": clientState} ));

  // Just checking
  res.send({"Client 1":client1Active, "Client 2":client2Active, "Client 3":client3Active, "Client 4":client4Active})
})

// when an active client taps, all songs after the cursor are discarded and re-populated with the given bpm/cluster
app.post('/getTrackToQueue',(req, res)=>{
  console.log("## Client " , req.body.clientID, " TAPS a bpm of: ", req.body.bpm)

  // first, check if the client can add new BPM
  if(userCheck(req.body.clientID)) {
    // only if the currQueueOffset is 0 --> regenerate the queue
    if (currQueueOffset == 0 && currTrackID != song.track_id) {
      prevTrackID = currTrackID
    }

    currQueueOffset++;

    // when tapped, remove the rest of queue from the current cursor(offset),
    queue.splice(currQueueOffset);

    // fill the rest (could be the entire queue) with the tapped BPM,
    fillQueue(req.body.bpm, req.body.cln, req.body.clientID, true)

    console.log("##   Queue modified and now broadcasting..")

    currTrackID = queue[0].track_id;
    currBPM = queue[0].tempo
    currCluster = queue[0].cluster_number;
    currClusterCounter = 0;
    playedTrackIds.clear();
    playedTrackIds.add(currtrackID);

    // then broadcast the queue
    broadcastQueue()

    res.send({"queue": updatedQueue});

  // when the client is 'locked',
  } else {
    console.log("##   Skipping.. Client ", req.body.clientID, " is not yet available to add a new bpm.")
    res.send({"queue":"Already added song"})
  }

})


app.get('/trackFinished',(req,res)=>{

  console.log("## trackFinished Request Received from client ", req.body.clientID)
  console.log(req.body)

  // When the current song is finished (received by the first client)
  if (currTrackID == req.body.trackID) {

    shiftQueue_NextSong();

    // possible pause
    console.log('Waiting for 5 seconds...');
    setTimeout(function() {
        console.log('Now broadcasting the next song..');
    }, 5000);

  // Repeated request for the same song from other clients
  } else if (prevTrackID == req.body.trackID) {
    // ignore the request

  // edge case - this client may be in a significant delay >> just send out an updated queue with the current song
  }

  broadcastQueue()

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

function clearVariables() {
  queue = [];
  clientTrackAdded=["","","",""];
  isBPMTapped = [false,false,false,false];
  ringLight =["","","",""];

  currBPM=-1;
  currCluster=-1;
  currQueueOffset=0;
  currTrackID='';
  prevTrackID='';
  broadcastTimestamp = -1;
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
  var trackCount = occurrencesDB[bpm][cluster].count;

  if (trackCount == 0) {
    return "";
  }

  let randomTrackIndices = [];

  // creating a list of indices
  for (let i = 0; i <= trackCount-1; i++) {
      randomTrackIndices.push(i);
  }
  // shuffling the list of indices
  shuffleArray(randomTrackIndices);

  for (let i = 0; i <= trackCount-1; i++) {
    let randomTrackIndex = randomTrackIndices[i];
    let randomTrackID = occurrencesDB[bpm][cluster].track_ids[randomTrackIndex];

    // if the chosen track is already played, skip
    if (playedTrackIds.has(randomTrackID)) {
      continue;

    // if the chosen track is already in the queue, skip
    } else if (queue.some(track => track.track_id === randomTrackID)) {
      continue;

    // if the client ID is provided, but the chosen track is now owned by the client, skip
    } else if (clientID > 0 && !listeningHistoryDB[randomTrackID].includes(clientID)) {
      continue;

    } else {
      return randomTrackID
    }
  } // for loop

  return ""
}


function pickNextCluster(bpm, clusterNow = -1) {
  let randomClusterIndices = [];

  // when we have the cluster param, push it first, then randomly add the rest
  if (clusterNow > 0) {
    randomClusterIndices = [clusterNow]

    // fill the array with numbers 0 to 3 (excluding the initialNumber)
    for (let i = 0; i < 4; i++) {
        if (i !== clusterNow) {
            randomClusterIndices.push(i);
        }
    }

    // shuffle the array to randomize the order
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

  // choosing a next cluster in the given bpm
  for (let i = 0; i < 4; i++) {
    let randomCluster = randomClusterIndices[i];
    let randomClusterSize = occurrencesDB[bpm][randomCluster].count
    let playedSongsCount = 0
    let songsInTheQueueCount = 0

    if (randomClusterSize == 0) {
      continue;
    }

    // if the given bpm is the current bpm
    if (bpm == currBPM) {
      let depletedClusterCount = hasClusterExhausted.filter(value => value === true).length;
      if (depletedClusterCount == 4) {
        return -1;
      }

      if (hasClusterExhausted[randomCluster]) {
        continue;
      }

    } // if currBPM

    for (let trackID of playedTrackIds) {
      let track = occurrencesDB[bpm][clusterNumber];
      if (track.track_ids.includes(trackID)) {
          playedSongsCount++;
      }
    }

    queue.forEach((track) => {
      songsInTheQueueCount += occurrencesDB[bpm][randomCluster].track_ids.filter(trackID => trackID === track.track_id).length;
    });

    if (randomClusterSize > playedSongsCount + songsInTheQueueCount) {
      return randomCluster;
    }

  } // for loop

  return -1
}

function chooseNextSong(bpm, cluster, clientID = -1) {
  let trackID = ""

  while (trackID == "") {
    let searchCluster = cluster
    trackID = pickNextTrack(bpm, searchCluster, clientID);

    if (trackID == "") {
      searchCluster = pickNextCluster(bpm, searchCluster);
      if (searchCluster < 0) {
        bpm--;
        // TODO: revisit the logic
      } else {
        trackID = pickNextTrack(bpm, searchCluster, clientID);
      }
    }

    // if the search hits the very bottom, go back to the highest bpm
    if (bpm < BPM_MIN) {
      bpm = BPM_MAX;
    }

  } // while loop

  return trackID
}

// Fill the queue with next available songs in the dataset
//   !! NOT responsible for cursor/offset management
function fillQueue(bpm, cluster, clientID = -1, tapped = false) {

  // fill the queue until it reaches the max length of 4
  while (queue.length < 4) {

    // case 1) if queue is empty, populate the queue
    if (queue.length == 0 and numActiveClients() == 1) {
      isBPMTapped = isBPMTapped.concat([false]);
      ringLight.fill(colorFromUser(clientID), currQueueOffset, ringLight.length);

      let trackIDToBeAdded = chooseNextSong(bpm, cluster, clientID)
      let trackItem = findMatchingTrack(trackIDToBeAdded)
      queue.push(trackItem)

    // case 2) if tapped, lock the client until the added track is finished and fill the ring light
    } else if (tapped) {
      isBPMTapped[currQueueOffset]=true;
      ringLight.fill(colorFromUser(clientID), currQueueOffset, ringLight.length);

      let trackIDToBeAdded = chooseNextSong(bpm, cluster, clientID)
      let trackItem = findMatchingTrack(trackIDToBeAdded)
      queue.push(trackItem)

      // lock the client from frequently adding other bpms
      clientTrackAdded[clientID-1] = trackIDToBeAdded;
      userControl(clientID);

      // reverse the flag so that next song and onward can not be caught in this case
      tapped = !tapped;

    // case 3) populate the queue with the regular song selection algo
    } else {
      isBPMTapped = isBPMTapped.concat([false]);
      ringLight = ringLight.concat([ringLight[ringLight.length-1]]);

      let trackIDToBeAdded = chooseNextSong(bpm, cluster)
      let trackItem = findMatchingTrack(trackIDToBeAdded)
      queue.push(trackItem)

    }

  } // while loop

}

// when the currently playing song is finished, modify the queue with a next new song
function shiftQueue_NextSong(bpm = -1, cluster = -1) {
  prevTrackID = currTrackID

  // if no param is provided, use the current values as a reference
  if (bpm < 0) {
    bpm = currBPM;
  }
  if (cluster < 0) {
    cluster = currCluster;
  }

  // move the offset cursor
  currQueueOffset--;
  console.log("#### move to the next song in the queue.. currQueueOffset: ", currQueueOffset)
  if (currQueueOffset<0)
  {
    currQueueOffset=0;
  }

  var deletedFromQueue = queue.shift();
  prevTrackID = deletedFromQueue.track_id

  // shift the list that contains TAP info
  var tapped = isBPMTapped.shift();

  // if the played song is a tapped song, unlock the client
  if (tapped) {
    var indx = clientTrackAdded.indexOf(deletedFromQueue["track_id"]);
    clientTrackAdded[indx]="";
    // this client is now available for tap
    userControl(indx+1);
  }

  // shift the ring light list
  ringLight.shift();

  currtrackID = queue[0].track_id;
  currBPM = queue[0].tempo

  if (currCluster != queue[0].cluster_number) {
    currCluster = queue[0].cluster_number;
    playedTrackIds.clear();
  } else {
    currClusterCounter++;
  }
  playedTrackIds.add(currtrackID);

  // fill the queue with bpm/cluster of the song at the cursor
  fillQueue(queue[currQueueOffset].tempo, queue[currQueueOffset].cluster_number)
}

function broadcastQueue() {

  // at this point, the queue should be full (length = 4)
  broadcastTimestamp = new Date().getTime();

  currQPInfo=JSON.stringify(
    {
      "msg":msg,

      "songdata":{
        "trackID": queue[0].track_id,
        "timestamp": seek,
        "broadcastTimestamp": broadcastTimestamp
        "bpm": currBPM,
        "cluster_number": queue[0].cluster_number
      },

      "canUserAddBPM":[!client1Added,!client2Added,!client3Added,!client4Added],

      "lights":{
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
        } // lights
      } // currQPInfo
    )// JSON.stringify

  console.log("#### Broadcasting the queue to the clients");
  console.log("  ## Current Client States is (true=Active, false=Inactive): ", JSON.stringify(clientState));
  console.log("  ## Printing the first four songs in the queue.");
  console.log(queue[0]);
  console.log(queue[1]);
  console.log(queue[2]);
  console.log(queue[3]);
  console.log("  ## Printing the QP info.");
  console.log(currQPInfo);
  console.log("  ## Printing user-added tracks.");
  console.log(clientTrackAdded);
  console.log("////////////////////////////////////////////////////////////////////////////////////////////////////")

  io.emit('broadcast', currQPInfo)
}
