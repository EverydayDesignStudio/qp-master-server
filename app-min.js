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

/* remove? */ var currSongTimestamp=-1;   // the timestamp information of the currently playing song in the clients
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

/* remove? */ var backupCheck=false;                  // boolean to check if backup has been created
/* remove? */ var continueCheck=false;                // boolean to check if the clients have continued or transitioned smoothly onto the next song
/* remove? */ var continueTimeout=["","","",""];
/* remove? */ var continueState=[false,false,false,false] // array to store which all clients have ended the song and requested for continuing

var currQPInfo = ''     // current QueuePlayer information that is broadcasted to the clients


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// #3. Create Connections //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const server = http.createServer(app);
const io = new socketio.Server(server);

// TODO: uncomment this
// Load all databases needed for the server
loadDatabases()

/*
Input: N/A
Output: socket connection object which contains socket.id
Description or Flow:
[1] -
*/
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

/*
///// DO WE EVEN NEED A BACKUP?

  // TODO: backup check should happen when populating the queue before broadcasting
  if(!backupCheck)
  {
    io.emit('message',JSON.stringify(
      {"msg": "Initial"}
    ));
    // // send "Initial" message only when there is NO back-up JSON
    // if (!fs.existsSync("backup.json")) {
    //   io.emit('message',JSON.stringify(
    //     {"msg": "Initial"}
    //   ));
    // }
  }
  else
  {
    // TODO: what to do when this fails?
    try {
      var backup=readBackup()
      clientTrackAdded=backup["userTracks"]
      queue=backup["queue"];
    } catch(e) {
      console.log("Error while reading a backup JSON");
      console.log(e);
    }
  }
  */

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

    io.emit('stateChange', clientState);

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

  io.emit('stateChange', clientState);

  console.log(req.body)
  console.log("Previous States of the Clients (true=Active, false=Inactive): ", JSON.stringify(prevClientState))
  console.log("Currents States of the Clients (true=Active, false=Inactive): ", JSON.stringify(clientState))

  // just checking
  res.send( {"Client 1":client1Active, "Client 2":client2Active, "Client 3":client3Active, "Client 4":client4Active} )

  broadcastQueue()

/*

**** NO NEED TO HANDLE THIS HERE --> MOVE TO BROADCAST

  // TODO: what to do when the queue is empty?

  // if (queue.length == 0)
  // {
  //   console.log("Empty queue. Loading a backup file..")
  //   if (fs.existsSync("backup.json")) {
  //     console.log("Found a backup file!")
  //     var backup=readBackup()
  //     console.log(backup)
  //     clientTrackAdded=backup["userTracks"]
  //     queue=backup["queue"];

  //     console.log("Queue length is now : ", queue.length)
  //   }
  //   else
  //   {
  //      console.log("Backup file not found..")
  //   }
  // }


// TODO: rewrite/refactor below!!
  console.log("Queue length: ", queue.length)

  if (queue.length < 4)
  {
    // fill the queue with the active client and a random cluster
    console.log("Filling the queue with the nearest BPM..")
    queue = queueFillwithNearestBPM(queue, req.body.clientID, Math.floor(Math.random() * 4))
    console.log("Queue length is now : ", queue.length)
  }


  // IF Block Explanation
  //    The server checks if the clients are in transition or continuing between songs, if true it does not send a json to all the
  //    active clients and waits for the next song to play
  if(continueCheck)
  {
    console.log("waiting for clients to sync up")
  }
  else
  {
    // IF Block Explanation
    //    The server checks if the clientState before and after the new client activation to handle the corner case of only one
    //    client active to play song from the start, else it would send a json seeking for the most updated timestamp from other
    //    active clients
    if(JSON.stringify(clientState) != JSON.stringify(prevClientState))
    {
      if(clientState.filter(item => item === true).length==1)
      {
        console.log("Returning client corner case: only this client was playing previously, thus songs plays from start")
        broadcastQueue(queue,queue[0],currSongTimestamp, "SeekSong");
      }
      else
      {
        console.log("Sending the JSON to the client with prompt to seek from other active clients")
        broadcastQueue(queue,queue[0],currSongTimestamp, "Seeking");
      }
    }
    else
    {
      console.log("First client to be active in the queue, responsible for creating the queue")
      broadcastQueue(queue,queue[0],currSongTimestamp, "Active");
    }
  }

  */


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
  io.emit('stateChange', clientState);

/*
// MAY NOT NEED THIS
  if(queue.length>=4)
  {
    broadcastQueue(queue,queue[0],currSongTimestamp, "InActive");
  }
*/

  // Just checking
  res.send({"Client 1":client1Active, "Client 2":client2Active, "Client 3":client3Active, "Client 4":client4Active})
})

/*
Input: bpm, clientID via req.body
Output: a queue created with the BPM (or the next lowest one where the client has a common song)
Description or Flow: A client sends the bpm and id during the very first time when the queue is empty and to start
the queue creation process of queue player system. The flow for the server is as follows:
[1] - read the database
[2] - get song details from the client input BPM
[3] - sort the database based on ML clusters but since its the first time the order is retained
[4] - update the queue
[5] - for the json , the first ring from the top i.e. isBPMTapped[0] would be set to true, ringLight is based on clientID
current value of seek or the timestamp for the server is set to 0
*/
app.post('/getTrackToPlay', (req, res) => {

  if (currTrackID != song.track_id) {
    prevTrackID = currTrackID
    currTrackID = song.track_id
  }

  console.log("No song in queue, BPM: ",req.body.bpm,"added by QP",req.body.clientID);
  var trackInfos = readDatabase();
  var bpmData=getDatafromBPM(trackInfos, req.body.bpm, req.body.clientID,0);
  var songAddition = processDatabase(bpmData, req.body.clientID);
  var updatedQueue = queueUpdateUser(queue,songAddition,queue.length,req.body.clientID,0);

  queue=updatedQueue;
  isBPMTapped[0]=true;
  ringLight.fill(colorFromUser(req.body.clientID),0,ringLight.length);
  currtrackID=queue[0].track_id;
  currSongTimestamp=0
  broadcastQueue(queue,queue[0],currSongTimestamp, "Song");

  console.log("Playing First Song ", queue[0]["track_name"])

  res.send({"queue": queue, "song":queue[0]});
})


/*
Input: bpm, clientID and cluster number (cln) via req.body
Output: a queue created with the BPM (or the next lowest one where the client has a common song)
Description or Flow: A client sends the bpm ,id and cluster number to an already filled queue and updates the queue.
The flow for the server is as follows:
[1] - Check if the client already has a song in the queue
[2] - if not then, update the currQueueOffset variable to update the queue from the right index
[3] - read the database, get song details from input BPM and process them based on the previous song cluster to update the queue
[4] - for the json broadcast, the isBPMTapped[currQueueOffset] is set to true to determine the addition of a new BPM in the lights
[5] - ringLight is also updated according to the latest client which updated the queue
[6] - client ID recorded so as to not let the same client another BPM until its song has exited the queue
*/
app.post('/getTrackToQueue',(req, res)=>{
  if(userCheck(req.body.clientID))
  {
    currQueueOffset++;
    var trackInfos = readDatabase();
    console.log(req.body.cln);
    var bpmData=getDatafromBPM(trackInfos, req.body.bpm, req.body.clientID, req.body.cln);
    var songAddition = processDatabase(bpmData, req.body.clientID);
    var updatedQueue = queueUpdateUser(queue,songAddition,currQueueOffset,req.body.clientID,req.body.cln);

    queue=updatedQueue;
    isBPMTapped[currQueueOffset]=true;
    ringLight.fill(colorFromUser(req.body.clientID),currQueueOffset,ringLight.length);
    clientTrackAdded[req.body.clientID-1]=updatedQueue[currQueueOffset]["track_id"];
    userControl(req.body.clientID);

    broadcastQueue(updatedQueue,updatedQueue[0],currSongTimestamp, "Queue")

    console.log("Adding to Queue")
    res.send({"queue": updatedQueue});
  }
  else
  {
    res.send({"queue":"Already added song"})
  }
})

/*
Input: clientID via req.body
Output: trigger to play the next songs to all the clients
Description or Flow:
*/
app.get('/trackFinished',(req,res)=>{

// {"clientID":clientID, "msg":n/a, "cln":cluster}

    if (currTrackID != song.track_id) {
      prevTrackID = currTrackID
      currTrackID = song.track_id
    }

  console.log("## trackFinished Request Received from client ", req.body.clientID)
  console.log(req.body)
  console.log("    ## ContinueCheck: ", continueCheck)
  clientIDForContinue=req.body.clientID
 // TODO: instead of having a flag to control the concurrency, we should compare songs to decide whether to process or reject the request
  if(!continueCheck)
  {
    console.log("    ## This is the first Continue request. Locking the flag.")
    continueCheck=true // so that other clients ending their songs don't start their timer again
    res.send("Continue Playing Timeout Called")
    console.log("    ## Now starting the timer. No other trackFinished request should be accepted.")
    startTimer(5000,clientIDForContinue,function() {
      console.log("Timer done, transition every client to next song in queue!");
    });
  }
  else{
    console.log("    ## Continue request received by client ", clientIDForContinue ,", but trackFinished is already initiated.")
    res.send("Continue Playing Function Called")
  }

})

function startTimer(duration,clientIDForContinue) {
  var start = new Date().getTime();
  var elapsed = 0;

  console.log("#### StartTimer for trackFinished..")
  // Loop until the elapsed time is equal to or greater than the duration
  while (elapsed < duration) {
      elapsed = new Date().getTime() - start;
  }

  // Once the timer completes

  console.log("#### StartTimer done. Unlocking the flag..")
  // ### TODO: we may need to unlock the flag at the very end after the broadcast AND move the broadcast logic outside of StartTimer
  continueCheck=false

  //Algo for playing next song in the queue
  currQueueOffset--;
  console.log("#### move to the next song in the queue.. currQueueOffset: ", currQueueOffset)
  if (currQueueOffset<0)
  {
    currQueueOffset=0;
  }

  console.log("#### StartTimer done. Updating the queue..")
  var updatedQueue=queueUpdateAutomatic(queue,clientIDForContinue,currBPM)
  queue=updatedQueue;

  currtrackID=queue[0].track_id;
  currSongTimestamp=0

  console.log("#### StartTimer done. Broadcasting the next song to all clients..")
  broadcastQueue(updatedQueue,updatedQueue[0],currSongTimestamp,"Song")
  //
}



/*
Input: timestamp and song id information of the playing song by the client
Output: updates the seek/timestamp and trackID variable of the server
Description or Flow: The flow for the server is as follows:
[1] - update the currSongTimestamp and currtrackID by the inputs given by the client
[2] - if the clients are not continuing or transitioning to the next song then let the newly joined client play the song
and sync with other clients
*/
app.post('/updateSeek',(req, res)=>{
  currSongTimestamp=req.body.seek;
  currtrackID=req.body.song;
  if(req.body.prompt!="Continue")
  {
    console.log("Auto play should happen")
    broadcastQueue(queue,queue[0],currSongTimestamp, "SeekSong");
  }
  res.send("Seek Updated");
 })

/*
Input: N/A
Output: get the updated song and timestamp info for the newly joined client to sync up with the rest of the clients
Description or Flow: N/A
*/
app.get('/getSeek',(req, res)=>{
  console.log("Seeking the song: "+currtrackID+" to timestamp: "+currSongTimestamp)
  res.send({seek:currSongTimestamp, id:currtrackID});
})


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// #5. QP Server Functions //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

function loadDatabases() {
  qpTrackDB = require("./Final Database/qp_data_multiuser_min.json");
  listeningHistoryDB = require("./Final Database/qp_data_listening_history_per_track.json");
  occurrencesDB = require("./Final Database/qp_data_song_count_trackID.json");
}


// Reading the JSON file data
function readDatabase() {
  // var qpDataset=require("./Final Database/qp_multiuser_update_norepeats.json");
 var qpDataset=require("./Final Database/qp_data_multiuser_min.json");
  return qpDataset;
}

// Reading the backup JSON file data
function readBackup() {
  var backu=fs.readFileSync("./backup.json", "utf8")
  backu=JSON.parse(backu);
  return backu
}

function getDatafromBPM(qpData, bpm, user, cln) {
  // Handling the case when the specified bpm is not present and then the next lowest bpm is selected

  // check if this user owns any songs in the given BPM
  userHasBPM=false;
  var qpBPMData=new Array();
  while(qpBPMData.length == 0)
  {
    if(bpm<=0)
    {
      bpm=239
    }

    for(let i=0;i<qpData.length;i++)
    {
      if(qpData[i].tempo==bpm)
      {
        if(qpData[i].user_id.includes(user) && qpData[i].cluster_number==cln)
        {
          console.log("found a song in this BPM with this user and this cluster number")
          userHasBPM=true
        }
        qpBPMData.push(qpData[i]);
      }
    }

    if(!userHasBPM)
    {
      qpBPMData=new Array();
    }
    bpm--;
  }

  currBPM=bpm+1;

  return qpBPMData;
}

//Processing the JSON file data
function processDatabase(qpData,user) {
  //Include Song Selection Algorithm
  if(queue.length == 0)
  {
    qpData.sort((a,b)=> a['cluster_number']-b['cluster_number'])
    let l=0;
    while(l<qpData.length &&  !qpData[l].user_id.includes(user))
    {
      l++;
    }
    var temp=qpData.splice(0,l);
    qpData=qpData.concat(temp);
  }
  else
  {
    qpData.sort((a,b)=> a['cluster_number']-b['cluster_number'])
    cluster0Arr=qpData.filter(ele=>ele['cluster_number']==0);
    cluster1Arr=qpData.filter(ele=>ele['cluster_number']==1);
    cluster2Arr=qpData.filter(ele=>ele['cluster_number']==2);
    cluster3Arr=qpData.filter(ele=>ele['cluster_number']==3);

    if(queue[0]['cluster_number']==0)
    {
      let l=0;
      while(l<cluster0Arr.length && !cluster0Arr[l].user_id.includes(user))
      {
        l++;
      }
      var temp=cluster0Arr.splice(0,l);
      cluster0Arr=cluster0Arr.concat(temp);
      qpData=cluster0Arr.concat(cluster1Arr,cluster2Arr,cluster3Arr)
    }
    else if(queue[0]['cluster_number']==1)
    {
      let l=0;
      while(l<cluster1Arr.length && !cluster1Arr[l].user_id.includes(user))
      {
        l++;
      }
      var temp=cluster1Arr.splice(0,l);
      cluster1Arr=cluster1Arr.concat(temp);
      qpData=cluster1Arr.concat(cluster0Arr,cluster2Arr,cluster3Arr)
    }
    else if(queue[0]['cluster_number']==2)
    {
      let l=0;
      while(l<cluster2Arr.length && !cluster2Arr[l].user_id.includes(user))
      {
        l++;
      }
      var temp=cluster2Arr.splice(0,l);
      cluster2Arr=cluster2Arr.concat(temp);
      qpData=cluster2Arr.concat(cluster0Arr,cluster1Arr,cluster3Arr)
    }
    else if(queue[0]['cluster_number']==3)
    {
      let l=0;
      while(l<cluster3Arr.length && !cluster3Arr[l].user_id.includes(user))
      {
        l++;
      }
      var temp=cluster3Arr.splice(0,l);
      cluster3Arr=cluster3Arr.concat(temp);
      qpData=cluster3Arr.concat(cluster0Arr,cluster1Arr,cluster2Arr)
    }
  }
  return qpData;
}

// ## TODO: add 10 songs to the queue from the same cluster instead of loading all songs of the same BPM
function queueUpdateUser(queue, additionToQueue, offset, user, cln) {
  var i=0;
  var delBPM;
  while(i<queue.length && i<4)
  {
    if(additionToQueue.length>0 && additionToQueue[0].track_id==queue[i].track_id)
    {
      delBPM=additionToQueue[0].tempo;
      additionToQueue.splice(0,1);
    }

    if(additionToQueue.length==0)
    {
      var trackInfos = readDatabase();
      var bpmData=getDatafromBPM(trackInfos,delBPM-1,user,cln);
      additionToQueue = processDatabase(bpmData, user);
      i--;
    }
    i++
  }

  queue.splice(offset,queue.length-offset);
  queue=queue.concat(additionToQueue);

  queue = queueFillwithNearestBPM(queue, user, cln)
  return queue;
}

function queueUpdateAutomatic(queue, user, bpm,cln) {
  console.log("## Inside of queueUpdateAutomatic")
  console.log("## isBPMTapped shift")
  isBPMTapped.shift();
  isBPMTapped=isBPMTapped.concat([false]);

  console.log("## ring light shift")
  ringLight.shift();
  ringLight=ringLight.concat([ringLight[ringLight.length-1]])

  console.log("## get rid of the first song in the queue")
  var deletedFromQueue=queue.shift();
  console.log(deletedFromQueue)
  console.log("## track_id for the current song that's finished: ", deletedFromQueue["track_id"])
  var indx=clientTrackAdded.indexOf(deletedFromQueue["track_id"])
  console.log("## clientID of the finished song: ", indx+1)
  if(indx!=-1)
  {
    clientTrackAdded[indx]="";
    console.log("user free to use is: ", indx+1)
    userControl(indx+1);
  }

  queue = queueFillwithNearestBPM(queue, user, cln)
  return queue;
}

function queueFillwithNearestBPM(queue, user, cln) {
  console.log("## queue size : ", queue.length)
  while(queue.length<4)
  {
    // ## TODO: move some of these variables to global and make less frequent DB calls
    var nextBPM=queue[queue.length-1].tempo-1;
    console.log("    ## next bpm to fill the queue: ", nextBPM)
    var trackInfos = readDatabase();
    var bpmData=getDatafromBPM(trackInfos,nextBPM, user, cln);
    var addMoreToQueue = processDatabase(bpmData, user);
    console.log("    ## adding extra songs to the queue: ", addMoreToQueue.length)
    queue=queue.concat(addMoreToQueue);
  }
  console.log("## queue size is now: ", queue.length)
  return queue
}

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

}


function fillQueue(bpm = -1, cluster = -1, clientID = -1) {

  // if queue is empty, populate the queue
  if (queue.length == 0 and numActiveClients() == 1) {
    ...

  // if not, just fill the rest
  } else {
    ...

  }

}


function broadcastQueue() {
  /*
  ## [Server -> Client] message contains:
  	-- ClientState (for indicator lights)  -- [clientState] >>> this is now separated from the broadcast
  	1) Song (Currently playing)  -- [currTrackID]
  	2) Start time / broadcast time (each client can compare the current time to figure out the duration) -- [currBroadcastTimestamp]
  	3) Color Info (Ring light, Queue lights)
  */

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

/*

  // MAY NOT NEED A BACKUP FILE

  // TODO: Make a backup file
  var jsonContent = JSON.stringify({"queue":queue, "color":currQPInfo, "userTracks":clientTrackAdded});

 // Write files on Heroku is ephemeral, so the backup JSON will be gone when the server restarts
 //   https://devcenter.heroku.com/articles/dynos#ephemeral-filesystem
 //   https://stackoverflow.com/questions/56157723/files-dont-by-fs-writefile-on-heroku
 fs.writeFile("backup.json", jsonContent, 'utf8', function (err) {
      if (err) {
          console.log("An error occured while writing JSON Object to File.");
          return console.log(err);
      }
      backupCheck = true;
      console.log("JSON file has been saved.");
      console.log("  ## Printing the first four songs in the queue.");
      console.log(queue[0]);
      console.log(queue[1]);
      console.log(queue[2]);
      console.log(queue[3]);
      console.log("  ## Printing the color info.");
      console.log(currQPInfo);
      console.log("  ## Printing the user tracks.");
      console.log(clientTrackAdded);
      console.log("////////////////////////////////////////////////////////////////////////////////////////////////////")
  });

  */

}
