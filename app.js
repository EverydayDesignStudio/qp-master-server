//Depedency variables
const express = require('express')
var cors = require('cors');
var querystring = require('querystring');
var cookieParser = require('cookie-parser');
var fs= require('fs');
var bodyParser = require("body-parser");
var http=require('http');
var WebSocket = require('ws');

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
  console.log(req.body.clientID);
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

  res.send({"Client 1":client1Active, "Client 2":client2Active, "Client 3":client3Active, "Client 4":client4Active})
})
   
//Get the Track to play as requested by the client
app.post('/getTrackToPlay', (req, res) => {
  var trackInfos = readDatabase();
  var bpmData=getDatafromBPM(trackInfos, req.body.bpm);
  var songAddition = processDatabase(bpmData, req.body.clientID);
  queue=songAddition;
  res.send({"queue": queue, "song":queue[0]});
  queueUpdateBroadcast(queue,queue[0],currSeek);
})
 
 
// Get the track into the queue 
app.post('/getTrackToQueue',(req, res)=>{
  var trackInfos = readDatabase();
  var bpmData=getDatafromBPM(trackInfos, req.body.bpm);
  var songAddition = processDatabase(bpmData, req.body.userID);
  var updatedQueue = queueUpdateUser(queue,songAddition,req.body.offset,req.body.userID);
  userControl(req.body.userID);
  res.send({"queue": updatedQueue});
  queueUpdateBroadcast(updatedQueue,updatedQueue[0],currSeek)
})
 
app.get('/continuePlayingImmediate', (req, res)=>{

  var updatedQueue=queueUpdateAutomatic(queue,req.body.userID,currBPM)
  res.send({"queue": updatedQueue, "song":updatedQueue[0]});
  queueUpdateBroadcast(updatedQueue,updatedQueue[0],currSeek)
})
  
app.post('/updateSeek',(req, res)=>{
  currSeek=req.body.seek;
  currID=req.body.song;
  console.log(currSeek,currID);
  res.send("Seek Updated");
 })

app.get('/getSeek',(req, res)=>{
  res.send({seek:currSeek, id:currID});
})
 
const server = http.createServer(app);

const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
  //send immediatly a feedback to the incoming connection   
  
  // if first connection then send acknowledgement, check this by reading backup.json for the last updated colorJSON 
  // if(!backupCheck)
  // {
    ws.send(JSON.stringify(
      {'colors':{
        'r':Math.floor(Math.random()*255),
        'g':Math.floor(Math.random()*255),
        'b':Math.floor(Math.random()*255),
        'w':0
      }}
    ));
    // backupCheck = true;
  // }
  // else
  // {
  //   var backup=readBackup()
  //   ws.send(backup["color"])
  // }
});

//start our server
server.listen(port, () => {
    console.log(`Server started on port ${server.address().port} :)`);
});

//////////// Server Helper Functions ///////////
 
var queue = []; 
var currBPM=-1;
var colorArr = [];
var currSeek=0;
var currID='';
var client1Active=false;
var client2Active=false;
var client3Active=false;
var client4Active=false;
var user1Added=false;
var user2Added=false;
var user3Added=false;
var user4Added=false;
var backupCheck=false;

// var user1Ended=false;
// var user2Ended=false;
// var user3Ended=false;
// var user4Ended=false;
// var user1Refresh=false;
// var user2Refresh=false;
// var user3Refresh=false;
// var user4Refresh=false;
// var timeoutRunning=false;
// const timeoutInterval=0;
// var timer=0;
 
// Reading the JSON file data
function readDatabase()
{
  var qpDataset=require("./Final Database/qp_multiuser_update.json");
  return qpDataset;
}

// Reading the backup JSON file data
function readBackup()
{
  var baku=require("./backup.json");
  return baku
}
 
function getDatafromBPM(qpData, bpm)
{
  //Handling the case when the specified bpm is not present and then the next lowest bpm is selected
  var qpBPMData=new Array();
  while(qpBPMData.length == 0)
  {
    for(let i=0;i<qpData.length;i++)
    {
      if(qpData[i].tempo==bpm)
      {
        qpBPMData.push(qpData[i]);
      }
    }
    bpm--;
  }
  currBPM=bpm+1;
  return qpBPMData;
}

function getDatafromNextBPM(qpData, bpm)
{
   bpm--;
   var qpBPMData=new Array();
   while(qpBPMData.length == 0)
   {
     for(let i=0;i<qpData.length;i++)
     {
       if(qpData[i].tempo==bpm)
       {
         qpBPMData.push(qpData[i]);
       }
     }
     bpm--;
     if(bpm<=0)
     {
       bpm=240;
     }
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
  queue.splice(offset,queue.length-offset);
  queue=queue.concat(additionToQueue);

  if(queue.length<4)
  {
    var nextBPM=queue[queue.length-1].tempo-1
    var trackInfos = readDatabase();
    var bpmData=getDatafromBPM(trackInfos,nextBPM);
    var addMoreToQueue = processDatabase(bpmData, user); 
    queue.concat(addMoreToQueue);
  }

  return queue;
}

function queueUpdateAutomatic(queue, user, bpm)
{
  queue.shift(); 
  if(queue.length<4)
  {
    var nextBPM=bpm-1
    var trackInfos = readDatabase();
    var bpmData=getDatafromBPM(trackInfos,nextBPM);
    var addMoreToQueue = processDatabase(bpmData, user); 
    queue.concat(addMoreToQueue);
  }
  return queue;
}

 
function userControl(userPressed)
{
  if(userPressed==1)
  {
    user1Added=true;
  }
  else if(userPressed==2)
  {
    user2Added=true;
  }
  else if(userPressed==3)
  {
    user3Added=true;
  }
  else if(userPressed==4)
  {
    user4Added=true;
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
       colorArr[n]={"r":190, "g":210,"b":5,"w":5};
       n++;
     }
     else if(qElement.user_id[i]==3)
     {
       colorArr[n]={"r":150, "g":40,"b":215,"w":0};
       n++;
     }
     else if(qElement.user_id[i]==4)
     {
       colorArr[n]={"r":0, "g":70,"b":180,"w":70};
       n++;
     }
     i++;
   }
   return colorArr;
}
 
 
function queueUpdateBroadcast(queue,song,seek)
{    
   var colorJSON=JSON.stringify(
     { 
       "songdata":{
         "songID":song.track_id,
         "timestamp":seek,
         "bpm":song.tempo
       },
       "activeUsers":[client1Active,client2Active,client3Active,client4Active],
       "lights":{
         "ring1":{
           "rotate": true,
           "bpm": queue[0].tempo,
           "colors":getRGBColors(queue[0])
           },
           "ring2":{
             "rotate": true,
             "bpm": queue[1].tempo,
             "colors":getRGBColors(queue[1])
           },
           "ring3":{
             "rotate": true,
             "bpm": queue[2].tempo,
             "colors":getRGBColors(queue[2])
           },
           "ring4":{
             "rotate": true,
             "bpm": queue[3].tempo,
             "colors":getRGBColors(queue[3])
           },
         }
       }
   )
   
   // stringify JSON Object
   wss.clients.forEach((ws) => {
         ws.send(colorJSON);
     });
     var jsonContent = JSON.stringify({"queue":queue, "color":colorJSON});
   
     fs.writeFile("backup.json", jsonContent, 'utf8', function (err) {
         if (err) {
             console.log("An error occured while writing JSON Object to File.");
             return console.log(err);
         }
     
         console.log("JSON file has been saved.");
     });
}


  // Get the track from the queue to automatically continue playing
//  app.post('/continuePlaying', (req, res)=>{
//   user1Added=false;
//   user2Added=false;
//   user3Added=false;
//   user4Added=false;

//   if(req.body.user_id == 1 && client1Active || req.body.user_id != 1 && !client1Active)
//   {
//     user1Refresh=true;
//   }
//   if(req.body.user_id == 2 && client2Active || req.body.user_id != 2 && !client2Active)
//   {
//     user2Refresh=true;
//   }
//   if(req.body.user_id == 3 && client3Active || req.body.user_id != 3 && !client3Active)
//   {
//     user3Refresh=true;
//   }
//   if(req.body.user_id == 4 && client4Active || req.body.user_id != 4 && !client4Active)
//   {
//     user4Refresh=true;
//   }

//   if(user1Refresh && user2Refresh && user3Refresh && user4Refresh)
//   {
//     console.log("All Clients Finished");
//     if(queue.length==0)
//     {
//       console.log("Here to jump to next BPM");
//       var trackInfos = readDatabase();
//       var bpmData=getDatafromNextBPM(trackInfos, currBPM);
//       var songAddition = processDatabase(bpmData, req.body.userID);
//       console.log(songAddition);
//       queue=songAddition;
//     }
//     var q=queue.shift();
//     res.send({"queue": queue, "song":q});
//     queueUpdateBroadcast(queue,queue[0],currSeek, currBPM)

//   }
//   else
//   {
//     res.send({"queue":[], "song":"Timeout Running", "color":cr});
//   }
//  })