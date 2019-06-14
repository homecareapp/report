var express = require('express');
var router = express.Router();
var passportConf = require('../config/passport');
var reportController = require('../controllers/report');

var csv = require('csv');
var stringify = csv.stringify;
var generate = csv.generate;

router.post('/reports', passportConf.isAuthorized, function(req,res,next){
    // console.log("imhere")
    var data = req.body;
    if (!data) return next(new Error("Data not found"));
    data.loggedinuser = req.user;
    if (data.format == "csv") {
      reportController.report(data, function(e,result){
          if (e) return next(e);

          if (!result) return next(new Error('Order Data not saved'));
          

          var stringifier = stringify({ header: true,delimiter: ',' });
          //stringifier = stringify({})
          stringifier.on('readable', function(){
            while(row = stringifier.read()){
              res.write(row);
            }
          });

          stringifier.on('error', function(err){
            consol.log(err.message);
          });

          stringifier.on('finish', function(){
            res.end();
          });
          res.setHeader('Content-disposition', 'attachment; filename=export.csv');
            res.writeHead(200, {
              'Content-Type': 'text/csv'
            });
            result.forEach(function(row){
              stringifier.write(row);
            })
            //stringifier.write([ 'root','x','0','0','root','/root','/bin/bash' ]);
          //stringifier.write([ 'someone','x','1022','1022','a funny cat','/home/someone','/bin/bash' ]);
          stringifier.end();
      });  
    }else if (data.format == "json") {
      reportController.report(data, function(e,result){
          if(e) return next(new Error(e));
          return res.json(result);
      });      
    }
});

module.exports = router;