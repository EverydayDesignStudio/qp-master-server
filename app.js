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

/*
Input: clientID via the req.body
Output: server variable client{ID}Active set to true
Description or Flow: A client sends its respective client id to the server and the respective client{ID}Active variable of 
the server is set to true. The clientState array is also updated with the new values of all the clients.
*/
app.post('/setClientActive',(req, res)=>{
  if(req.body.clientID==1)
  {
    console.log("QP1 is set active");
    client1Active=true;
  }
  else if(req.body.clientID==2)
  {
    console.log("QP2 is set active");
    client2Active=true;
  }
  else if(req.body.clientID==3)
  {
    console.log("QP3 is set active");
    client3Active=true;
  }
  else if(req.body.clientID==4)
  {
    console.log("QP4 is set active");
    client4Active=true;
  }

  console.log(req.body)

  clientState=[client1Active,client2Active,client3Active,client4Active]
  console.log("Client States is now (true=Active, false=Inactive): ", JSON.stringify(clientState))

  console.log("Queue length: ", queue.length)

  if (queue.length == 0)
  {
    console.log("Empty queue. Loading a backup file..")
    if (fs.existsSync("backup.json")) {
      console.log("Found a backup file!")
      var backup=readBackup()
      clientTrackAdded=backup["userTracks"]
      queue=backup["queue"];
     
      console.log("Queue length is now : ", queue.length)
    }
    else
    {
       console.log("Backup file not found..")
    }
  }
  
  if (queue.length < 4)
  {
    // fill the queue with the active client and a random cluster
    console.log("Filling the queue with the nearest BPM..")
    queue = queueFillwithNearestBPM(queue, req.body.clientID, Math.floor(Math.random() * 4))
    console.log("Queue length is now : ", queue.length)
  }
 
  console.log("Previous States of the Clients (true=Active, false=Inactive): ", JSON.stringify(prevClientState))
  console.log("Currents States of the Clients (true=Active, false=Inactive): ", JSON.stringify(clientState))

  /*
  IF Block Explanation
  The server checks if the clients are in transition or continuing between songs, if true it does not send a json to all the
  active clients and waits for the next song to play
  */
  if(continueCheck)
  {
    console.log("waiting for clients to sync up")
  }
  else
  {
    /*
    IF Block Explanation
    The server checks if the clientState before and after the new client activation to handle the corner case of only one 
    client active to play song from the start, else it would send a json seeking for the most updated timestamp from other 
    active clients
    */
    if(JSON.stringify(clientState) != JSON.stringify(prevClientState))
    {
      if(clientState.filter(item => item === true).length==1)
      {
        console.log("Returning client corner case: only this client was playing previously, thus songs plays from start")
        queueUpdateBroadcast(queue,queue[0],currSeek, "SeekSong");
      }
      else
      {
        console.log("Sending the JSON to the client with prompt to seek from other active clients")
        queueUpdateBroadcast(queue,queue[0],currSeek, "Seeking");
      }
    }
    else
    {
      console.log("First client to be active in the queue, responsible for creating the queue")
      queueUpdateBroadcast(queue,queue[0],currSeek, "Active");
    }
  }


  res.send({"Client 1":client1Active, "Client 2":client2Active, "Client 3":client3Active, "Client 4":client4Active})
})

/*
Input: clientID via the req.body
Output: server variable client{ID}Active set to false
Description or Flow: A client sends its respective client id to the server and the respective client{ID}Active variable of 
the server is set to false. The clientState array is also updated with the new values of all the clients.And a json is sent to
all the clients with the updated clientState array
*/
app.post('/setClientInactive',(req, res)=>{
  if(req.body.clientID==1)
  {
    console.log("QP1 is set inactive");
    client1Active=false;
    continueState[0]=false;
  }
  else if(req.body.clientID==2)
  {
    console.log("QP2 is set inactive");
    client2Active=false;
    continueState[1]=false;

  }
  else if(req.body.clientID==3)
  {
    console.log("QP3 is set inactive");
    client3Active=false;
    continueState[2]=false;

  }
  else if(req.body.clientID==4)
  {
    console.log("QP4 is set inactive");
    client4Active=false;
    continueState[3]=false;

  }

  clientState=[client1Active,client2Active,client3Active,client4Active]
  console.log("Client States is now (true=Active, false=Inactive): ", JSON.stringify(clientState))
 
  if(queue.length>=4)
  {
    queueUpdateBroadcast(queue,queue[0],currSeek, "InActive");
  }

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
[5] - for the json , the first ring from the top i.e. rotation[0] would be set to true, ringLight is based on clientID
current value of seek or the timestamp for the server is set to 0
*/
app.post('/getTrackToPlay', (req, res) => {
  console.log("No song in queue, BPM: ",req.body.bpm,"added by QP",req.body.clientID);
  var trackInfos = readDatabase();
  var bpmData=getDatafromBPM(trackInfos, req.body.bpm, req.body.clientID,0);
  var songAddition = processDatabase(bpmData, req.body.clientID);
  var updatedQueue = queueUpdateUser(queue,songAddition,queue.length,req.body.clientID,0);

  queue=updatedQueue;
  rotation[0]=true;
  ringLight.fill(colorFromUser(req.body.clientID),0,ringLight.length);
  currID=queue[0].track_id;
  currSeek=0
  queueUpdateBroadcast(queue,queue[0],currSeek, "Song");

  console.log("Playing First Song ", queue[0]["track_name"])

  res.send({"queue": queue, "song":queue[0]});
})
 
 
/*
Input: bpm, clientID and cluster number (cln) via req.body
Output: a queue created with the BPM (or the next lowest one where the client has a common song)
Description or Flow: A client sends the bpm ,id and cluster number to an already filled queue and updates the queue.
The flow for the server is as follows:
[1] - Check if the client already has a song in the queue
[2] - if not then, update the currOffset variable to update the queue from the right index
[3] - read the database, get song details from input BPM and process them based on the previous song cluster to update the queue
[4] - for the json broadcast, the rotation[currOffset] is set to true to determine the addition of a new BPM in the lights
[5] - ringLight is also updated according to the latest client which updated the queue
[6] - client ID recorded so as to not let the same client another BPM until its song has exited the queue
*/
app.post('/getTrackToQueue',(req, res)=>{
  if(userCheck(req.body.userID))
  {
    currOffset++;
    var trackInfos = readDatabase();
    console.log(req.body.cln);
    var bpmData=getDatafromBPM(trackInfos, req.body.bpm, req.body.userID, req.body.cln);
    var songAddition = processDatabase(bpmData, req.body.userID);
    var updatedQueue = queueUpdateUser(queue,songAddition,currOffset,req.body.userID,req.body.cln);

    queue=updatedQueue;
    rotation[currOffset]=true;
    ringLight.fill(colorFromUser(req.body.userID),currOffset,ringLight.length);
    clientTrackAdded[req.body.userID-1]=updatedQueue[currOffset]["track_id"];
    userControl(req.body.userID);

    queueUpdateBroadcast(updatedQueue,updatedQueue[0],currSeek, "Queue")

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
app.get('/continuePlaying',(req,res)=>{

  console.log("## ContinuePlaying Request Received from client ", req.body.userID)
  console.log(req.body)
  console.log("    ## ContinueCheck: ", continueCheck)
  userIDForContinue=req.body.userID
 // TODO: instead of having a flag to control the concurrency, we should compare songs to decide whether to process or reject the request
  if(!continueCheck)
  {
    console.log("    ## This is the first Continue request. Locking the flag.")
    continueCheck=true // so that other clients ending their songs don't start their timer again
    res.send("Continue Playing Timeout Called") 
    console.log("    ## Now starting the timer. No other ContinuePlaying request should be accepted.")
    startTimer(5000,userIDForContinue,function() {
      console.log("Timer done, transition every client to next song in queue!");
    });
  }
  else{
    console.log("    ## Continue request received by client ", userIDForContinue ,", but ContinuePlaying is already initiated.")
    res.send("Continue Playing Function Called") 
  }

})

function startTimer(duration,userIDForContinue) {
  var start = new Date().getTime();
  var elapsed = 0;

  console.log("#### StartTimer for ContinuePlaying..")
  // Loop until the elapsed time is equal to or greater than the duration
  while (elapsed < duration) {
      elapsed = new Date().getTime() - start;
  }

  // Once the timer completes

  console.log("#### StartTimer done. Unlocking the flag..")
  // ### TODO: we may need to unlock the flag at the very end after the broadcast AND move the broadcast logic outside of StartTimer
  continueCheck=false
 
  //Algo for playing next song in the queue
  currOffset--;
  console.log("#### move to the next song in the queue.. CurrOffset: ", currOffset)
  if (currOffset<0)
  {
    currOffset=0;
  } 

  console.log("#### StartTimer done. Updating the queue..")
  var updatedQueue=queueUpdateAutomatic(queue,userIDForContinue,currBPM)
  queue=updatedQueue;

  currID=queue[0].track_id;
  currSeek=0
 
  console.log("#### StartTimer done. Broadcasting the next song to all clients..")
  queueUpdateBroadcast(updatedQueue,updatedQueue[0],currSeek,"Song")
  //
}

/*
Input: timestamp and song id information of the playing song by the client
Output: updates the seek/timestamp and songID variable of the server
Description or Flow: The flow for the server is as follows:
[1] - update the currSeek and currID by the inputs given by the client
[2] - if the clients are not continuing or transitioning to the next song then let the newly joined client play the song
and sync with other clients
*/ 
app.post('/updateSeek',(req, res)=>{
  currSeek=req.body.seek;
  currID=req.body.song;
  if(req.body.prompt!="Continue")
  {
    console.log("Auto play should happen")
    queueUpdateBroadcast(queue,queue[0],currSeek, "SeekSong");
  }
  res.send("Seek Updated");
 })

/*
Input: N/A
Output: get the updated song and timestamp info for the newly joined client to sync up with the rest of the clients
Description or Flow: N/A
*/
app.get('/getSeek',(req, res)=>{
  console.log("Seeking the song: "+currID+" to timestamp: "+currSeek)
  res.send({seek:currSeek, id:currID});
})
 
const server = http.createServer(app);
const io = new socketio.Server(server);


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
    console.log(msg.userID);
    if(msg.userID==1)
    {
      console.log("Socket ID registered for QP1")
      client1Socket=socket.id
    }
    else if(msg.userID==2)
    {
      console.log("Socket ID registered for QP2")
      client2Socket=socket.id
    }
    else if(msg.userID==3)
    {
      console.log("Socket ID registered for QP3")
      client3Socket=socket.id
    }
    else if(msg.userID==4)
    {
      console.log("Socket ID registered for QP4")
      client4Socket=socket.id
    }
    
  });

  if(!backupCheck)
  {
    // send "Initial" message only when there is NO back-up JSON
    if (!fs.existsSync("backup.json")) {
      io.emit('message',JSON.stringify(
        {"msg": "Initial"}
      ));
    }
  }
  else
  {
    var backup=readBackup()
    clientTrackAdded=backup["userTracks"]
    queue=backup["queue"];
  }
  socket.on('disconnect', () => {
    console.log(socket.id);
    if(socket.id==client1Socket)
    {
      console.log("QP1 disconnected")
      client1Active=false
    }
    else if(socket.id==client2Socket)
    {
      console.log("QP2 disconnected")
      client2Active=false
    }
    else if(socket.id==client3Socket)
    {
      console.log("QP3 disconnected")
      client3Active=false
    }
    else if(socket.id==client4Socket)
    {
      console.log("QP4 disconnected")
      client4Active=false
    }
    prevClientState=[client1Active,client2Active,client3Active,client4Active]
    console.log(clientState);
    console.log('Client disconnected');
  });
});

//start our server
server.listen(port, () => {
    console.log(`Server started on port ${server.address().port} :)`);
});

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
 
var queue = [];             // array containing the queue for the queue player system
var colorArr = [];          // array containing the color information for each of the 4 slots in the device
var currBPM=-1;             // stores the current BPM playing in the queue player system
var currOffset=0;           // stores the index upto which the queue player has been updated by the user and from where the new song will be added to the queue
var currSeek=-1;            // stores the timestamp information of the currently playing song in the clients
var currID='';              // stores the song/track ID of the currently playing song in the clients

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

var clientTrackAdded=["","","",""];  // array to keep a track of the song updated by a specific client exiting the queue to make it free to add new songs
var rotation = [false,false,false,false]; // array to control the 4 slots of lights to indicate which BPM is newly added by another client
var ringLight =["","","","",""];          // array to map ringLight colors for each song in the queue
var clientState=[false,false,false,false] // array to store all the current client states 
var prevClientState=[false,false,false,false]; // array to store all the previous client states before a new client joins in
var backupCheck=false;                  // boolean to check if backup has been created 
var continueCheck=false;                // boolean to check if the clients have continued or transitioned smoothly onto the next song
var userCheckBPM=false;                 
var continueTimeout=["","","",""];      
var continueState=[false,false,false,false] // array to store which all clients have ended the song and requested for continuing

// Reading the JSON file data
function readDatabase()
{
  var qpDataset=require("./Final Database/qp_multiuser_update_norepeats.json");
  return qpDataset;
}

// Reading the backup JSON file data
function readBackup()
{
  var backu=fs.readFileSync("./backup.json", "utf8")
  backu=JSON.parse(backu);
  return backu
}
 
function getDatafromBPM(qpData, bpm, user, cln)
{
  //Handling the case when the specified bpm is not present and then the next lowest bpm is selected
  userCheckBPM=false;
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
          userCheckBPM=true
        }
        qpBPMData.push(qpData[i]);
      }
    }

    if(!userCheckBPM)
    {
      qpBPMData=new Array();
    }
    bpm--;
  }

  currBPM=bpm+1;

  return qpBPMData;
}

//Processing the JSON file data
function processDatabase(qpData,user)
{
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

function queueUpdateUser(queue, additionToQueue, offset, user, cln)
{
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

function queueUpdateAutomatic(queue, user, bpm,cln)
{
  console.log("## Inside of queueUpdateAutomatic")
  console.log("## rotation shift")
  rotation.shift();
  rotation=rotation.concat([false]);

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

function queueFillwithNearestBPM(queue, user, cln)
{
  console.log("## queue size : ", queue.length)
  while(queue.length<4)
  {
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

 
function userControl(id)
{
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

function userCheck(id)
{
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

function colorFromUser(user)
{
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
 
function getRGBColors(qElement)
{
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
 
 
function queueUpdateBroadcast(queue,song,seek,msg)
{    
  prevClientState=[client1Active,client2Active,client3Active,client4Active]

  colorJSON=JSON.stringify(
    { 
      "msg":msg,
      "songdata":{
        "songID":song.track_id,
        "timestamp":seek,
        "bpm":song.tempo,
        "cluster_number": song.cluster_number,
        "offset":currOffset
      },
      "activeUsers":[client1Active,client2Active,client3Active,client4Active],
      "userCanAddBPM":[!client1Added,!client2Added,!client3Added,!client4Added],
      "lights":{
        "ring1":{
          "rotate": rotation[0],
          "rlight":ringLight[0],
          "bpm": queue[0].tempo,
          "colors":getRGBColors(queue[0])
          },
          "ring2":{
            "rotate": rotation[1],
            "rlight":ringLight[1],
            "bpm": queue[1].tempo,
            "colors":getRGBColors(queue[1])
          },
          "ring3":{
            "rotate": rotation[2],
            "rlight":ringLight[2],
            "bpm": queue[2].tempo,
            "colors":getRGBColors(queue[2])
          },
          "ring4":{
            "rotate": rotation[3],
            "rlight":ringLight[3],
            "bpm": queue[3].tempo,
            "colors":getRGBColors(queue[3])
          },
        }
      }
    )


  io.emit('message', colorJSON)

  var jsonContent = JSON.stringify({"queue":queue, "color":colorJSON, "userTracks":clientTrackAdded});
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
      console.log(colorJSON);
      console.log("  ## Printing the user tracks.");
      console.log(clientTrackAdded);
      console.log("////////////////////////////////////////////////////////////////////////////////////////////////////")
  });
}
 
