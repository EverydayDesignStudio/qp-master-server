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
   
 //Get the Track to play as requested by the client
 app.post('/getTrackToPlay', (req, res) => {
   var trackInfos = readDatabase();
   var bpmData=getDatafromBPM(trackInfos, req.body.bpm);
   var songAddition = processDatabase(bpmData, req.body.userID);
   queue=songAddition;
   // userControl(req.body.userID);
   res.send({"queue": queue, "song":queue[0]});
   queueUpdateBroadcast(queue,queue[0],currSeek);
 })
 
 
 // Get the track into the queue 
 app.post('/getTrackToQueue',(req, res)=>{
  //  if(!userCheck(req.body.userID))
  //  {
     var trackInfos = readDatabase();
     var bpmData=getDatafromBPM(trackInfos, req.body.bpm);
     var songAddition = processDatabase(bpmData, req.body.userID);
     queue.splice(req.body.offset,queue.length-req.body.offset);
     queue=queue.concat(songAddition);
     // userControl(req.body.userID);
     res.send({"queue": queue});
     queueUpdateBroadcast(queue,queue[0],currSeek)
  //  }
  //  else
  //  {
  //    res.send({"queue":queue, color:cr});
  //  }
 })
 
 // Get the track from the queue to automatically continue playing
//  app.post('/continuePlaying', (req, res)=>{
//   user1Added=false;
//   user2Added=false;
//   user3Added=false;
//   user4Added=false;

//   if(req.body.user_id == 1 && user1Active || req.body.user_id != 1 && !user1Active)
//   {
//     user1Refresh=true;
//   }
//   if(req.body.user_id == 2 && user2Active || req.body.user_id != 2 && !user2Active)
//   {
//     user2Refresh=true;
//   }
//   if(req.body.user_id == 3 && user3Active || req.body.user_id != 3 && !user3Active)
//   {
//     user3Refresh=true;
//   }
//   if(req.body.user_id == 4 && user4Active || req.body.user_id != 4 && !user4Active)
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

 app.get('/continuePlayingImmediate', (req, res)=>{
  if(queue.length==0)
  {
    console.log("Here to jump to next BPM");
    var trackInfos = readDatabase();
    var bpmData=getDatafromNextBPM(trackInfos, currBPM);
    var songAddition = processDatabase(bpmData, req.body.userID);
    queue=songAddition;
  }
  else
  {
    queue.shift();
  }
  res.send({"queue": queue, "song":queue[0]});
  queueUpdateBroadcast(queue,queue[0],currSeek)

 })
  
 app.post('/makeActive',(req, res)=>{
   console.log(req.body.user_id);
   if(req.body.user_id==1)
   {
     user1Active=true;
   }
   else if(req.body.user_id==2)
   {
     user2Active=true;
   }
   else if(req.body.user_id==3)
   {
     user3Active=true;
   }
   else if(req.body.user_id==4)
   {
     user4Active=true;
   }
 
   res.send({activeUser:[user1Active,user2Active,user3Active,user4Active]})
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
 
// app.listen(port, () =>
//     console.log(
//       'HTTP Server up. Now go to http://localhost:${port} in your browser.'
//     )
//   );

  const server = http.createServer(app);

  const wss = new WebSocket.Server({ server });

  wss.on('connection', (ws) => {
    //send immediatly a feedback to the incoming connection    
    ws.send(JSON.stringify(
      {'colors':{
        'r':Math.floor(Math.random()*255),
        'g':Math.floor(Math.random()*255),
        'b':Math.floor(Math.random()*255),
        'w':0
      }}
    ));
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
 var user1Active=false;
 var user2Active=false;
 var user3Active=false;
 var user4Active=false;
 var user1Added=false;
 var user2Added=false;
 var user3Added=false;
 var user4Added=false;
 var user1Ended=false;
 var user2Ended=false;
 var user3Ended=false;
 var user4Ended=false;
 var user1Refresh=false;
 var user2Refresh=false;
 var user3Refresh=false;
 var user4Refresh=false;


 var timeoutRunning=false;
 const timeoutInterval=0;
 var timer=0;
 
 // Reading the JSON file data
 function readDatabase()
 {
   var qpDataset=require("./Final Database/Final Final/qp_multiuser.json");
   return qpDataset;
 }

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
 
   //Sorting data according to danceability for now , until song selection algorithm
   qpData.sort((first,second) => {
       return first.danceability - second.danceability;
   });
 
   //Choosing the first song for the user interacted
   let l=0;
   while(l<qpData.length &&  !qpData[l].user_id.includes(user))
   {
     l++;
   }
   var temp=qpData.splice(0,l);
   qpData=qpData.concat(temp);
   return qpData;
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
 
 function userCheck(userPressed)
 {
   if(userPressed==1)
   {
     return user1Added;
   }
   else if(userPressed==2)
   {
     return user2Added;
   }
   else if(userPressed==3)
   {
     return user3Added;
   }
   else if(userPressed==4)
   {
     return user4Added;
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
        colorArr[n]={"r":255, "g":0,"b":0,"w":0};
        n++;
      }
      else if(qElement.user_id[i]==2)
      {
        colorArr[n]={"r":0, "g":255,"b":0,"w":0};
        n++;
      }
      else if(qElement.user_id[i]==3)
      {
        colorArr[n]={"r":0, "g":0,"b":255,"w":0};
        n++;
      }
      else if(qElement.user_id[i]==4)
      {
        colorArr[n]={"r":255, "g":255,"b":0,"w":0};
        n++;
      }
      i++;
    }

    return colorArr;
 }
 
 
 function queueUpdateBroadcast(queue,song,seek)
 {       
    
    // stringify JSON Object
    var jsonContent = JSON.stringify(queue);
    
    fs.writeFile("backup.json", jsonContent, 'utf8', function (err) {
        if (err) {
            console.log("An error occured while writing JSON Object to File.");
            return console.log(err);
        }
    
        console.log("JSON file has been saved.");
    });

    wss.clients.forEach((ws) => {
          ws.send(
            JSON.stringify(
              { 
                "songdata":{
                  "songID":song.track_id,
                  "timestamp":seek,
                  "bpm":song.tempo
                },
                "activeUsers":[user1Active,user2Active,user3Active,user4Active],
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
          );
      });
 }