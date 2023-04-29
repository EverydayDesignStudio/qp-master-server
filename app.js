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
  var updatedQueue = queueUpdateUser(queue,songAddition,queue.length,req.body.userID);
  queue=updatedQueue;
  rotation[0]=true;
  clientTrackAdded[req.body.clientID-1]=queue[0]["track_id"];
  userControl(req.body.clientID);
  res.send({"queue": queue, "song":queue[0]});
  queueUpdateBroadcast(queue,queue[0],currSeek);
})
 
 
// Get the track into the queue 
app.post('/getTrackToQueue',(req, res)=>{
  if(userCheck(req.body.userID))
  {
    currOffset=req.body.offset
    var trackInfos = readDatabase();
    var bpmData=getDatafromBPM(trackInfos, req.body.bpm);
    var songAddition = processDatabase(bpmData, req.body.userID);
    var updatedQueue = queueUpdateUser(queue,songAddition,req.body.offset,req.body.userID);
    queue=updatedQueue;
    rotation[req.body.offset]=true;
    clientTrackAdded[req.body.userID-1]=updatedQueue[req.body.offset]["track_id"];
    userControl(req.body.userID);
    res.send({"queue": updatedQueue});
    queueUpdateBroadcast(updatedQueue,updatedQueue[0],currSeek)
  }
  else
  {
    res.send("Already added song")
  }
})
 
app.get('/continuePlayingImmediate', (req, res)=>{

  var updatedQueue=queueUpdateAutomatic(queue,req.body.userID,currBPM)
  res.send({"queue": updatedQueue, "song":updatedQueue[0]});
  queueUpdateBroadcast(updatedQueue,updatedQueue[0],currSeek)
})
  
app.post('/updateSeek',(req, res)=>{
  currSeek=req.body.seek;
  currID=req.body.song;
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
  if(!backupCheck)
  {
    ws.send(JSON.stringify(
      {'colors':{
        'r':Math.floor(Math.random()*255),
        'g':Math.floor(Math.random()*255),
        'b':Math.floor(Math.random()*255),
        'w':0
      }}
    ));
  }
  else
  {
    var backup=readBackup()
    ws.send(backup["color"])
  }
});

//start our server
server.listen(port, () => {
    console.log(`Server started on port ${server.address().port} :)`);
});

//////////// Server Helper Functions ///////////
 
var queue = []; 
var currBPM=-1;
var currOffset=0;
var colorArr = [];
var currSeek=0;
var currID='';
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
var backupCheck=false;

// Reading the JSON file data
function readDatabase()
{
  var qpDataset=require("./Final Database/qp_multiuser_update.json");
  return qpDataset;
}

// Reading the backup JSON file data
function readBackup()
{
  var backu=fs.readFileSync("./backup.json", "utf8")
  backu=JSON.parse(backu);
  return backu
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
      var bpmData=getDatafromBPM(trackInfos,delBPM-1);
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
    var bpmData=getDatafromBPM(trackInfos,nextBPM);
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
    userControl(indx);
  }
  
  if(queue.length<4)
  {
    var nextBPM=bpm-1
    var trackInfos = readDatabase();
    var bpmData=getDatafromBPM(trackInfos,nextBPM);
    var addMoreToQueue = processDatabase(bpmData, user); 
    queue=queue.concat(addMoreToQueue);
  }
  return queue;
}

 
function userControl(id)
{
  if(id==1)
  {
    client1Added=!client1Added;
  }
  else if(id==2)
  {
    client2Added=!client2Added;
  }
  else if(id==3)
  {
    client3Added=!client3Added;
  }
  else if(id==4)
  {
    client4Added=!client4Added;
  }
}

function userCheck(id)
{
  if("client"+id+"Added")
  {
    console.log(id)
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
       colorArr[n]={"r":200, "g":45,"b":0,"w":0};
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
         "bpm":song.tempo,
         "offset":currOffset
       },
       "userCanAddBPM":[client1Added,client2Added,client3Added,client4Added],
       "activeUsers":[client1Active,client2Active,client3Active,client4Active],
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
         backupCheck = true;
         console.log("JSON file has been saved.");
     });
}