//Depedency variables
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

app.post('/setClientActive',(req, res)=>{
  if(req.body.clientID==1)
  {
    client1Active=true;
  }
  else if(req.body.clientID==2)
  {
    client2Active=true;
  }
  else if(req.body.clientID==3)
  {
    client3Active=true;
  }
  else if(req.body.clientID==4)
  {
    client4Active=true;
  }
  
  clientState=[client1Active,client2Active,client3Active,client4Active]
  if(queue.length>4)
  {
    if(JSON.stringify(clientState) != JSON.stringify(prevClientState))
    {
      queueUpdateBroadcast(queue,queue[0],currSeek, "Seeking");
    }
    else
    {
      queueUpdateBroadcast(queue,queue[0],currSeek, "Updated");
    }
    // queueUpdateBroadcast(queue,queue[0],currSeek, "Updated");
  }

  console.log("Active Clients: ", [client1Active,client2Active,client3Active,client4Active])
  res.send({"Client 1":client1Active, "Client 2":client2Active, "Client 3":client3Active, "Client 4":client4Active})
})

app.post('/setClientInactive',(req, res)=>{
  if(req.body.clientID==1)
  {
    client1Active=false;
  }
  else if(req.body.clientID==2)
  {
    client2Active=false;
  }
  else if(req.body.clientID==3)
  {
    client3Active=false;
  }
  else if(req.body.clientID==4)
  {
    client4Active=false;
  }

  if(queue.length>4)
  {
    queueUpdateBroadcast(queue,queue[0],currSeek, "Updated");
  }
  
  res.send({"Client 1":client1Active, "Client 2":client2Active, "Client 3":client3Active, "Client 4":client4Active})
})
   
//Get the Track to play as requested by the client
app.post('/getTrackToPlay', (req, res) => {
  var trackInfos = readDatabase();
  var bpmData=getDatafromBPM(trackInfos, req.body.bpm, req.body.clientID);
  var songAddition = processDatabase(bpmData, req.body.clientID);
  var updatedQueue = queueUpdateUser(queue,songAddition,queue.length,req.body.clientID);

  queue=updatedQueue;
  rotation[0]=true;

  currID=queue[0].track_id;
  currSeek=0
  queueUpdateBroadcast(queue,queue[0],currSeek, "Updated");

  console.log("Playing First Song ", queue[0]["track_name"])

  res.send({"queue": queue, "song":queue[0]});
})
 
 
// Get the track into the queue 
app.post('/getTrackToQueue',(req, res)=>{
  if(userCheck(req.body.userID))
  {
    currOffset++;
    var trackInfos = readDatabase();
    var bpmData=getDatafromBPM(trackInfos, req.body.bpm, req.body.userID);
    var songAddition = processDatabase(bpmData, req.body.userID);
    var updatedQueue = queueUpdateUser(queue,songAddition,currOffset,req.body.userID);

    queue=updatedQueue;
    rotation[currOffset]=true;
    clientTrackAdded[req.body.userID-1]=updatedQueue[currOffset]["track_id"];
    userControl(req.body.userID);

    queueUpdateBroadcast(updatedQueue,updatedQueue[0],currSeek, "Updated")

    console.log("Adding to Queue")
    res.send({"queue": updatedQueue});
  }
  else
  {
    res.send({"queue":"Already added song"})
  }
})

// app.get('/continuePlaying',(req,res)=>{
//   if(clientState!=continueState)
//   {
//     //this means that a new client is also playing a song and now the timeout of 10 seconds will be started
//   }
//   else
//   {

//   }
// })
 
app.get('/continuePlaying', (req, res)=>{

  console.log("User ID: ", req.body.userID)
  if(req.body.msg=="Immediate")
  {
    continueCheck=false
    clearTimeout(continueTimeout);
  }

  if(!continueCheck)
  {
    continueCheck = true
    currOffset--;
    if (currOffset<0)
    {
      currOffset=0;
    } 
    var updatedQueue=queueUpdateAutomatic(queue,req.body.userID,currBPM)
  
    queue=updatedQueue;
  
    console.log("Continuing to play the next song")
    currID=queue[0].track_id;
    currSeek=0
    queueUpdateBroadcast(updatedQueue,updatedQueue[0],currSeek, "Updated")

    continueTimeout=setTimeout(() => {
      console.log("Timeout functionality ended")
      continueCheck = false;
    }, 10000);

    res.send({"queue": queue, "song":queue[0]});
  }
  else
  {
    res.send({"queue": queue, "song":queue[0]});
  }
})
  
app.post('/updateSeek',(req, res)=>{
  currSeek=req.body.seek;
  currID=req.body.song;
  res.send("Seek Updated");
 })

app.get('/getSeek',(req, res)=>{
  console.log("Seeking the song: "+currID+" to timestamp: "+currSeek)
  res.send({seek:currSeek, id:currID});
})
 
const server = http.createServer(app);
const io = new socketio.Server(server);

io.on('connection', (socket) => {
  console.log('Client connected');
  if(!backupCheck)
  {
    // pingWrapper()
    io.emit('message',JSON.stringify(
      {"msg":"Initial"}
    ));
  }
  else
  {
    var backup=readBackup()
    clientTrackAdded=backup["userTracks"]
    queue=backup["queue"];

    console.log(clientTrackAdded);
    console.log("Accessing Backup")
    io.emit('message',backup["color"])
  }
  socket.on('disconnect', () => {
    console.log('Client disconnected');
  });
});

//start our server
server.listen(port, () => {
    console.log(`Server started on port ${server.address().port} :)`);
});

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
 
var queue = []; 
var colorArr = [];
var currBPM=-1;
var currOffset=0;
var currSeek=-1;
var currID='';
var currNext='';
var client1Active=false;
var client2Active=false;
var client3Active=false;
var client4Active=false;
var client1Added=false;
var client2Added=false;
var client3Added=false;
var client4Added=false;
var clientTrackAdded=["","","",""];
var rotation = [false,false,false,false];
var clientState=[false,false,false,false]
var prevClientState=[false,false,false,false];
var backupCheck=false;
var continueCheck=false;
var userCheckBPM=false;
var continueTimeout;
var continueState=[false,false,false,false]
var prevContinueState=[false,false,false,false]

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
 
function getDatafromBPM(qpData, bpm, user)
{
  //Handling the case when the specified bpm is not present and then the next lowest bpm is selected
  userCheckBPM=false;
  var qpBPMData=new Array();
  console.log(bpm)
  console.log(user)
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
        if(qpData[i].user_id.includes(user))
        {
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
      while(l<cluster0Arr.length &&  !cluster0Arr[l].user_id.includes(user))
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
      while(l<cluster1Arr.length &&  !cluster1Arr[l].user_id.includes(user))
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
      while(l<cluster2Arr.length &&  !cluster2Arr[l].user_id.includes(user))
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
      while(l<cluster3Arr.length &&  !cluster3Arr[l].user_id.includes(user))
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

function queueUpdateUser(queue, additionToQueue, offset, user)
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
      var bpmData=getDatafromBPM(trackInfos,delBPM-1,user);
      additionToQueue = processDatabase(bpmData, user); 
      i--;
    }
    i++
  }

  queue.splice(offset,queue.length-offset);
  queue=queue.concat(additionToQueue);

  while(queue.length<4)
  {
    var nextBPM=queue[queue.length-1].tempo-1
    var trackInfos = readDatabase();
    var bpmData=getDatafromBPM(trackInfos,nextBPM,user);
    var addMoreToQueue = processDatabase(bpmData, user); 
    queue=queue.concat(addMoreToQueue);
  }
  
  return queue;
}

function queueUpdateAutomatic(queue, user, bpm)
{
  rotation.shift();
  rotation=rotation.concat([false]);

  var deletedFromQueue=queue.shift(); 
  var indx=clientTrackAdded.indexOf(deletedFromQueue["track_id"])
  if(indx!=-1)
  { 
    clientTrackAdded[indx]="";
    console.log("user free to use is: ", indx+1)
    userControl(indx+1);
  }
  
  while(queue.length<4)
  {
    var nextBPM=queue[queue.length-1].tempo-1;
    var trackInfos = readDatabase();
    var bpmData=getDatafromBPM(trackInfos,nextBPM,user);
    var addMoreToQueue = processDatabase(bpmData, user); 
    queue=queue.concat(addMoreToQueue);
  }
  return queue;
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
       colorArr[n]={"r":170, "g":140,"b":1,"w":5};
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
 
 
function queueUpdateBroadcast(queue,song,seek, msg)
{    
   prevClientState=[client1Active,client2Active,client3Active,client4Active]
   if(msg=="Updated")
   {
    colorJSON=JSON.stringify(
      { 
        "msg":"Updated",
        "songdata":{
          "songID":song.track_id,
          "timestamp":seek,
          "bpm":song.tempo,
          "offset":currOffset
        },
        "activeUsers":[client1Active,client2Active,client3Active,client4Active],
        "userCanAddBPM":[!client1Added,!client2Added,!client3Added,!client4Added],
        "lights":{
          "ring1":{
            "rotate": rotation[0],
            "bpm": queue[0].tempo,
            "colors":getRGBColors(queue[0])
            },
            "ring2":{
              "rotate": rotation[1],
              "bpm": queue[1].tempo,
              "colors":getRGBColors(queue[1])
            },
            "ring3":{
              "rotate": rotation[2],
              "bpm": queue[2].tempo,
              "colors":getRGBColors(queue[2])
            },
            "ring4":{
              "rotate": rotation[3],
              "bpm": queue[3].tempo,
              "colors":getRGBColors(queue[3])
            },
          }
        }
      )
   }

   else if(msg="Seeking")
   {
    colorJSON=JSON.stringify(
      {
        "msg":"Seeking",
        "activeUsers":[client1Active,client2Active,client3Active,client4Active]
      }
    )
   }


  io.emit('message', colorJSON)

  var jsonContent = JSON.stringify({"queue":queue, "color":colorJSON, "userTracks":clientTrackAdded});
  fs.writeFile("backup.json", jsonContent, 'utf8', function (err) {
     if (err) {
         console.log("An error occured while writing JSON Object to File.");
         return console.log(err);
     }
     backupCheck = true;
     console.log("JSON file has been saved.");
     console.log("////////////////////////////////////////////////////////////////////////////////////////////////////")
  });
}
