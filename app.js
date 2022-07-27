 //Depedency variables
 const express = require('express')
 var cors = require('cors');
 var querystring = require('querystring');
 var cookieParser = require('cookie-parser');
 var fs= require('fs');
 var bodyParser = require("body-parser");

const port = process.env.PORT || '5000';
// const port = '8000';

 
 //Initialising the express server
 const app = express();
 app.use(bodyParser.json());
 const { ppid } = require('process');
 
 app.use(cors())
    .use(cookieParser());
 
 //Authorization flow for the Spotify API 
 app.get('/', (req, res) => {
   res.send("Queue Server Up!!");
 });
   
 
 //Get the Track to play as requested by the client
 app.post('/getTrackToPlay', (req, res) => {
   var trackInfos = readDatabase();
   var bpmData=getDatafromBPM(trackInfos, req.body.bpm);
   var songAddition = processDatabase(bpmData, req.body.userID);
   queue=songAddition;
   var q=queue.shift();
   var cr=getColorSequence(queue);
   // userControl(req.body.userID);
   res.send({"queue": queue, "song":q, "color": cr});
 
   console.log(queue);
 })
 
 
 // Get the track into the queue 
 app.post('/getTrackToQueue',(req, res)=>{
   if(!userCheck(req.body.userID))
   {
     var trackInfos = readDatabase();
     var bpmData=getDatafromBPM(trackInfos, req.body.bpm);
     var songAddition = processDatabase(bpmData, req.body.userID);
     queue.splice(req.body.offset,queue.length-req.body.offset);
     queue=queue.concat(songAddition);
     var cr=getColorSequence(queue);
     // userControl(req.body.userID);
     res.send({"queue": queue, "color": cr});
   }
   else
   {
     res.send({"queue":queue, color:cr});
   }
 })
 
 // Get the track from the queue to automatically continue playing
 app.get('/continuePlaying', (req, res)=>{
   user1Added=false;
   user2Added=false;
   user3Added=false;
   user4Added=false;
   var q=queue.shift();
   var cr=getColorSequence(queue);
   res.send({"queue": queue, "song":q, "color": cr});
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
 
 app.listen(port, () =>
    console.log(
      'HTTP Server up. Now go to http://localhost:${port} in your browser.'
    )
  );

  
 //////////// Server Helper Functions ///////////
 
 var queue = []; 
 var colorArr = [];
 var currSeek=0;
 var currID='hihi';
 var user1Active=false;
 var user2Active=false;
 var user3Active=false;
 var user4Active=false;
 var user1Added=false;
 var user2Added=false;
 var user3Added=false;
 var user4Added=false;
 
 // Reading the JSON file data
 function readDatabase()
 {
   var qpDataset=require("./Final Database/Final Final/qp_multiuser.json");
   return qpDataset;
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
 
 
 function getColorSequence(que)
 {
   colorArr = [];
   let i=0;
   while(i<que.length && i<4)
   {
     var temp=[];
     let j=0;
     while(j<que[i].user_id.length)
     {
       if(que[i].user_id[j]==1)
       {
         temp.push('#FF0000');
       }
       else if(que[i].user_id[j]==2)
       {
         temp.push('#0000FF');
       }
       else if(que[i].user_id[j]==3)
       {
         temp.push('#00FF00');
       }
       else if(que[i].user_id[j]==4)
       {
         temp.push('#FFFF00');
       }
       j++;
     }
     colorArr.push(temp);
     i++;
   }
   return colorArr;
 }
 
 
 