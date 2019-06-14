var mongoose = require('mongoose');
var async = require('async');
var _ = require("lodash");
var moment = require('moment-timezone');
var TIMEZONE = require('../config/secrets').TIMEZONE;

var ModelOrder = require('../models/Order');
var ModelPartner = require('../models/Partner');
var ModelAddress = require('../models/Address');
var ModelClient = require('../models/Client');
var ModelProvider = require('../models/Provider');
var ModelPartner = require('../models/Partner');
var ModelArea = require('../models/Area');
var orderOption = require('../data/orderOption');
var orderPopulate = require('../data/orderPopulate');
var TempReportModel = require('../models/TempReport');
// var reportFields = require('../data/homeVisitReportFields');

var stockreport = require('./stockreport');
var visitcount = require('./visitcount');

exports.report = function(params, callback){
    switch (params.reportname) {
        case "homevisitreport":
            homevisitreport(params, function(e,tempResult){


                if (e) return callback(e);

                if (!tempResult) return callback(new Error("Temp data not found"));
                if (!tempResult.details) return callback(new Error("Temp detail data not found"));
                if (!tempResult.details.homeVisitreport) return callback(new Error("Temp data not found"));
                if (!tempResult.details.homeVisitreport.length) return callback(new Error("Temp data not found"));

                var orders = tempResult.details.homeVisitreport;
                var exportdata = [];
                var secondblankrow = [];

                exportdata.push(['S.No','Partner Name','Date of Lead','Time of Lead','Date of Visit','Time of Visit','AM/PM','Fasting Phelbo Name','Created By',
                  'Title','Patients Name','UHID','R/O','Major Area','Location','Patients Contact Number','Age','Gender','R/F/PP',
                  'Test Names','Test Cost','Visit Charge','Total','Completed (Y/N)','Date for PP','Time for PP','AM/PM','PP Phelbo Name','Completed (Y/N)','Remarks',
                  'Phlebo Remark','Description','Test Update Reason','Test Update Comment','Discount Update Reason','Discount Update Comment', 'Add Patient Reason','Add Patient Comment'
                ]);
                exportdata[0].forEach(function(o){
                  secondblankrow.push('');
                });
                exportdata.push(secondblankrow);

                orders.forEach(function(ordersObj, i){
                  exportdata.push([
                    i+1,
                    ordersObj.partnername.toUpperCase(),
                    ordersObj.dateoflead.toUpperCase(),
                    ordersObj.timeoflead.toUpperCase(),
                    ordersObj.dateofvisit.toUpperCase(),
                    ordersObj.timeofvisit.toUpperCase(),
                    ordersObj.timeofvisit_am_pm.toUpperCase(),
                    ordersObj.fastingPhelbo.toUpperCase(),
                    ordersObj.createdbyname.toUpperCase(),
                    ordersObj.patienttitle.toUpperCase(),
                    ordersObj.patientname.toUpperCase(),
                    ordersObj.patientuhid.toUpperCase(),
                    ordersObj.r_o.toUpperCase(),
                    ordersObj.majorlocation.toUpperCase(),
                    ordersObj.location.toUpperCase(),
                    ordersObj.patientcontactnumber.toUpperCase(),
                    ordersObj.patientage.toUpperCase(),
                    ordersObj.patientgender.toUpperCase(),
                    ordersObj.R_F_PP.toUpperCase(),
                    ordersObj.testname.toUpperCase(),
                    ordersObj.testcost.toUpperCase(),
                    ordersObj.visitcharge.toUpperCase(),
                    ordersObj.totalcharge.toUpperCase(),
                    ordersObj.status.toUpperCase(),
                    ordersObj.dateforpp.toUpperCase(),
                    ordersObj.timeforpp.toUpperCase(),
                    ordersObj.timeforpp_am_pm.toUpperCase(),
                    ordersObj.ppPhelbo.toUpperCase(),
                    ordersObj.ppstatus.toUpperCase(),
                    (ordersObj.remark.trim()).toUpperCase(),
                    (ordersObj.phleboremark.trim()).toUpperCase(),
                    ordersObj.prescriptionDescription.toUpperCase(),
                    ordersObj.testupdatereason.toUpperCase(),
                    ordersObj.testupdatecomment.toUpperCase(),
                    ordersObj.discountupdatereason.toUpperCase(),
                    ordersObj.discountupdatecomment.toUpperCase(),
                    ordersObj.addpatientreasons.toUpperCase(),
                    ordersObj.addpatientothercomment.toUpperCase()
                  ]);
                });

                return callback(null, exportdata);
            })
            break;    
        
        case "partnerstockreport":
            stockreport.report(params,function(err, data){
                return callback(null, data);
            });
            break;
        case "phlebostockreport":
            stockreport.phleboReport(params,function(err, data){
                return callback(null, data);
            });
            break;
        case "phlebovisitcount":
            visitcount.phleboVisitReport(params,function(err, data){
                return callback(null, data);
            });
            break;
        default:
            return callback("reportname not found");
            break;
    }
}


function homevisitreport(params, callback){
    var orders = [], client_ids = [],
    search = {
        fromdate: { 
            $gte : new Date(), 
            $lte : new Date() 
        }            
    };

    if (params.loggedinuser) {
    //search["user_id"] = params.loggedinuser;
    };
    if (params.provider_id) {
        search["provider_id"] = params.provider_id;
    };
    
    if (params.status) {
        search["status"] = params.status;
    };
    // if (params.partner_id) {
    //     search["partner_id"] = params.partner_id;
    // };
    makePartnerInSearch(); 

    function makePartnerInSearch(){
        if(params.partner_id)
            search["partner_id"] = splitIdsAndIn(params.partner_id);
    }
    function splitIdsAndIn(ids){
        if(!ids) return undefined;
        return {
            "$in": ids
        }
    }
    if(params.fromdate) search.fromdate.$gte = params.fromdate;
    if(params.todate) search.fromdate.$lte = params.todate;

    function getOrders(next){
        ModelOrder.find(search,orderOption,{lean:true},function(e,r){
            orders = groupByPPOrdersOfClient(r);
            client_ids = uniqueClientIds(r)
            return next(null);
        }).populate(orderPopulate);
    }

    function getOrderCountOfClient(next){        
        search["client_id"] =  {"$in": client_ids};
        search.fromdate.$lte = new Date(search.fromdate.$lte);
        delete search.fromdate.$gte;
        // delete search.fromdate.$lte;
        var aggregate = [
            { "$match" : search },
             { $group: { _id: "$client_id", count: { $sum: 1 } } } 
        ]
        
        ModelOrder.aggregate(aggregate, function(e,r){
            findRepeateClient(r);
            return next(null);
        });
    }

    function uniqueClientIds(ords){
        var gg = [];
        ords.forEach(function(o){
            if(!gg.length)
                gg.push(o.client_id._id)
            else
                if(!_.find(gg, function(g){ return (g.toString() == o.client_id._id.toString())})){
                    gg.push(o.client_id._id);
                }
        })
        return gg;
    }

    function groupByPPOrdersOfClient(orders){
        return (_.groupBy(orders,function(o){
            return [o.client_id._id,o.orderGroupId]; //check impact on getClientID
        }));
    }

    function findRepeateClient(clientOrders){
        var obj;
        
        _.forIn(orders, function(value,key){
            value.map(function(o){
                obj = _.find(clientOrders, function(co){                    
                    return (co._id.toString() == o.client_id._id.toString())
                });

                if(obj){
                    if(obj.count)
                        o.repeat = "R";
                    else
                        o.repeat = "N"
                }
                else{
                    o.repeat = "N"
                }
            })
        });
    }

    function mapReportParameters(next){
        var finalList = [], client_id;
        // _.forIn(orders, function(value,key){
        //     client_id = getClientID(key);
        //     if(client_id)
        //         value.forEach(rowMap);            
        // });

        var finalOrders = [];
        var ppfinalOrders = {}

        _.forIn(orders, function(value,key){
            ppfinalOrders = {};
            client_id = getClientID(key);
            if(client_id)
            {
                newpushindex = -1;
                value.forEach(function(objrow)
                {
                    // if only pp is present
                    if(value.length == 1)
                    {
                        if(objrow.ordertype == 'PP')
                        {
                            var temponlypp = objrow;
                            //delete temponlypp.fromdate;
                            //delete temponlypp.fromtime
                            temponlypp.pporder = objrow;

                            finalOrders.push(temponlypp);
                        }
                    }
                    // end if only pp is present

                    // to make pporder inside fasting
                    if(objrow.ordertype == 'F')
                    {
                        finalOrders.push(objrow);
                        newpushindex = finalOrders.length - 1;
                        if(ppfinalOrders._id)
                            finalOrders[newpushindex].pporder = ppfinalOrders;
                    }
                    else if(objrow.ordertype == 'PP')
                    {
                        ppfinalOrders = objrow;
                        if(newpushindex >= 0)
                        {
                            finalOrders[newpushindex].pporder = ppfinalOrders
                        }
                    }
                });  
            }
                          
        });

        finalOrders.forEach(rowMap)



        //console.log(finalList);
        return next(null, finalList);

        function getReportFields(){
            return {
                        "reportname":"",
                        "partnername": "",
                        "dateoflead":"",
                        "timeoflead":"",
                        "dateofvisit": "",
                        "timeofvisit": "",
                        "timeofvisit_am_pm": "",
                        "fastingPhelbo": "",
                        "createdbyname": "",
                        "patienttitle": "",
                        "patientname": "",
                        "patientuhid" : "",
                        "r_n" : "",
                        "r_o": "",
                        "majorlocation": "",
                        "location": "",
                        "patientcontactnumber": "",
                        "patientage": "",
                        "patientgender": "",
                        "R_F_PP": "",
                        "testname": "",
                        "testcost": "",
                        "visitcharge" : "",
                        "totalcharge": "",
                        "status": "",
                        "timeforpp":"",
                        "dateforpp":"",
                        "timeforpp_am_pm":"",
                        "ppPhelbo":"",
                        "ppstatus":"",
                        "remark":"",
                        "phleboremark":"",
                        "prescriptionDescription":"",
                        "testupdatereason":"",
                        "testupdatecomment":"",
                        "discountupdatereason":"",
                        "discountupdatecomment":"",
                        "addpatientreasons":"",
                        "addpatientothercomment":""
                    }
        }

        function rowMap(row){
            // var hvf = {}, 
            //     index = _.findIndex(finalList,function(f){
            //                 return f.client_id == row.client_id._id.toString();
            //             });
            // if(index<0)
            //     hvf = getReportFields();
            // else
            //     hvf = finalList[index];

            var hvf = getReportFields();

            // console.log(row.client_id.demography);
            hvf.reportname = "Complete Home Visit Report";
            if (row && row.partner_id && row.partner_id.info  && row.partner_id.info.name) {
              hvf.partnername = row.partner_id.info.name.toUpperCase();
            };
            if (row && row.client_id)
            {
                if (row.client_id.demography)
                {
                    hvf.patientname = row.client_id.demography.fullname;
                    hvf.patienttitle = row.client_id.demography.salutation;
                    hvf.patientage = row.client_id.demography.age;
                    if (row.client_id.demography.gender.toUpperCase() == "MALE")
                        hvf.patientgender = "M";
                    else if (row.client_id.demography.gender.toUpperCase() == "FEMALE")
                        hvf.patientgender = "F";
                }
                hvf.patientcontactnumber = row.client_id.demography.mobilenumber;
                if (row.client_id.externalId)
                    hvf.patientuhid = row.client_id.externalId;
                hvf.client_id = row.client_id._id;
            }

            // console.log(row);
            //hvf.R_F_PP = row.ordertype;
            if (row.ordertype == 'F' && !row.pporder)
              hvf.R_F_PP = "R";
            else if (row.ordertype == 'F' && row.pporder)
              hvf.R_F_PP = "F";
            else if (row.ordertype == 'PP')
              hvf.R_F_PP = "PP";
            // else if (!row.ordertype && row.pporder)
            //     hvf.R_F_PP = "PP";

            hvf.dateoflead = moment(row.createdatetime).tz(TIMEZONE).format('DD-MM-YYYY')
            hvf.timeoflead = moment(row.createdatetime).tz(TIMEZONE).format('hh:mm A')

            hvf.fromtime = waqt(makeFloat(row.fromtime));
            hvf.r_n = row.repeat;

            
            if (row.ordertype == 'F')
            {
                hvf.dateofvisit = moment(row.fromdate).tz(TIMEZONE).format("DD-MM-YYYY");
                tempMinutes = waqt(makeFloat(row.fromtime));
                hvf.timeofvisit = tempMinutes.hour+":"+tempMinutes.remainder;
                hvf.timeofvisit_am_pm = tempMinutes.meridian;
            }


            hvf.testname = getServices(row.services)
            hvf.status = row.status;
            if(row.partner_id)
                hvf.partnername = row.partner_id.info.name;
            // else if(row.pporder)
            //     hvf.partnername = row.pporder.partner_id.info.name;
            

            if (true)
              hvf.r_o = "R";
            else if (true)
              hvf.r_o = "O";

            if(row.createdbyname)
                hvf.createdbyname = row.createdbyname;
            // else if(row.pporder)
            //     hvf.createdbyname = row.pporder.createdbyname;

            if (row.servicedeliveryaddress && row.servicedeliveryaddress.area_id && row.servicedeliveryaddress.area_id.name)
                hvf.majorlocation = row.servicedeliveryaddress.area_id.name;
            if (row.servicedeliveryaddress && row.servicedeliveryaddress.address2)
                hvf.location = row.servicedeliveryaddress.address2;

            if (row && row.paymentdetails) {
                hvf.testcost = makeFloat(row.paymentdetails.amount).toString();
                hvf.visitcharge = makeFloat(row.paymentdetails.visitingcharges).toString();
                hvf.totalcharge = (makeFloat(row.paymentdetails.amount) + makeFloat(row.paymentdetails.visitingcharges)).toString();
            }
            if (row.status && row.status.toUpperCase() == "COMPLETED")
              hvf.status = "Y";
            else
              hvf.status = "N";
            
            if (row.pporder) { 
              
              hvf.dateforpp = moment(row.pporder.fromdate).tz(TIMEZONE).format("DD-MM-YYYY");
              tempMinutes = waqt(makeFloat(row.pporder.fromtime));
              hvf.timeforpp = tempMinutes.hour+":"+tempMinutes.remainder;
              hvf.timeforpp_am_pm = tempMinutes.meridian;

              if (row.pporder.status && row.pporder.status.toUpperCase() == "COMPLETED")
                hvf.ppstatus = "Y";
              else
                hvf.ppstatus = "N";
            };

            if(row.comments)
            {
                row.comments.forEach(function(ro){ //ro = remark object
                  if (ro)
                    hvf.remark += ro + "\n\r";  
                });
            }

            if(row.visitcomments)
            {
                row.visitcomments.forEach(function(pro){ //pro = phlebo remark object
                  if (pro)
                  {
                    var arr = pro.split(':');
                    var a = (arr[0].toUpperCase()).trim()
                    if(params.loggedinuser.role == "partnerfrontoffice" || params.loggedinuser.role == "partnerteamlead")
                    {
                      if((a.toUpperCase()).trim() != 'SINGLE PRICK' && (a.toUpperCase()).trim() != 'DOUBLE PRICK' && (a.toUpperCase()).trim() != 'RESCUE PRICK')
                      {
                        hvf.phleboremark += pro + "\n\r";
                      }
                    }
                    else
                    {
                      hvf.phleboremark += pro + "\n\r";
                    }
                    // if((a.toUpperCase()).trim() != 'SINGLE PRICK' && (a.toUpperCase()).trim() != 'DOUBLE PRICK' && (a.toUpperCase()).trim() != 'RESCUE PRICK')
                    // {
                    //   hvf.phleboremark += pro + "\n\r";
                    // }
                      
                  }
                });
            }

            if(row.prescriptions)
            {
              var desc = ""
              row.prescriptions.forEach(function(prescrp){
                if(prescrp.description != "LabAssistant Signature" 
                    && prescrp.description != "Logistics Signature" 
                    && prescrp.description != "Delivery Signature"
                    && prescrp.description != "Patient Signature")
                {
                  desc += prescrp.description + "\n\r";
                }
                
              })
              hvf.prescriptionDescription = desc;
            }

            if(row.serviceupdatecomment)
            {
              //testupdatereason
              if(row.serviceupdatecomment.testupdatereason)
              {
                if(row.serviceupdatecomment.testupdatereason.length)
                {
                  var testupdatereason = "";
                  row.serviceupdatecomment.testupdatereason.forEach(function(testReasonObj){
                    if(testReasonObj.displayname)
                    {
                      testupdatereason += testReasonObj.displayname + "\n\r";
                    }
                  })
                  hvf.testupdatereason = testupdatereason;
                }
                else
                  hvf.testupdatereason = ""
              }
              else
                hvf.testupdatereason = "";
              //testupdatereason

              //testupdatecomment
              if(row.serviceupdatecomment.testupdatecomment)
              {
                if(row.serviceupdatecomment.testupdatecomment.length)
                {
                  var testupdatecomment = "";
                  row.serviceupdatecomment.testupdatecomment.forEach(function(testCommentObj){
                    if(testCommentObj)
                    {
                      testupdatecomment += testCommentObj + "\n\r";
                    }
                  })
                  hvf.testupdatecomment = testupdatecomment;
                }
                else
                  hvf.testupdatecomment = ""
              }
              else
                hvf.testupdatecomment = "";
              //testupdatecomment
            }
            else
            {
              hvf.testupdatereason = "";
              hvf.testupdatecomment = "";
            }

            if(row.discountupdatecomment)
            {
              //discountupdatereason
              if(row.discountupdatecomment.discountupdatereason)
              {
                if(row.discountupdatecomment.discountupdatereason.length)
                {
                  var discountupdatereason = "";
                  row.discountupdatecomment.discountupdatereason.forEach(function(discountReasonObj){
                    if(discountReasonObj.displayname)
                    {
                      discountupdatereason += discountReasonObj.displayname + "\n\r";
                    }
                  })
                  hvf.discountupdatereason = discountupdatereason;
                }
                else
                  hvf.discountupdatereason = ""
              }
              else
                hvf.discountupdatereason = "";
              //discountupdatereason

              //discountupdatecomment
              if(row.discountupdatecomment.discountupdatecomment)
              {
                if(row.discountupdatecomment.discountupdatecomment.length)
                {
                  var discountupdatecomment = "";
                  row.discountupdatecomment.discountupdatecomment.forEach(function(discountCommentObj){
                    if(discountCommentObj)
                    {
                      discountupdatecomment += discountCommentObj + "\n\r";
                    }
                  })
                  hvf.discountupdatecomment = discountupdatecomment;
                }
                else
                  hvf.discountupdatecomment = ""
              }
              else
                hvf.discountupdatecomment = "";
              //discountupdatecomment
            }
            else
            {
              hvf.discountupdatereason = "";
              hvf.discountupdatecomment = "";
            }

            if(row.addpatientcomment)
            {
              //addpatientreasons
              if(row.addpatientcomment.addpatientothercomment)
              {
                if(row.addpatientcomment.addpatientothercomment.length)
                {
                  var addpatientothercomment = "";
                  row.addpatientcomment.addpatientothercomment.forEach(function(addPatientOtherCommentObj){
                    if(addPatientOtherCommentObj)
                    {
                      addpatientothercomment += addPatientOtherCommentObj + "\n\r";
                    }
                  })
                  hvf.addpatientothercomment = addpatientothercomment;
                }
                else
                  hvf.addpatientothercomment = ""
              }
              else
                hvf.addpatientothercomment = "";
              //addpatientreasons

              //addpatientothercomment
              if(row.addpatientcomment.addpatientreasons)
              {
                if(row.addpatientcomment.addpatientreasons.length)
                {
                  var addpatientreasons = "";
                  row.addpatientcomment.addpatientreasons.forEach(function(addPatientOtherCommentReason){
                    if(addPatientOtherCommentReason.displayname)
                    {
                      addpatientreasons += addPatientOtherCommentReason.displayname + "\n\r";
                    }
                  })
                  hvf.addpatientreasons = addpatientreasons;
                }
                else
                  hvf.addpatientreasons = ""
              }
              else
                hvf.addpatientreasons = "";
              //addpatientothercomment
            }
            else
            {
              hvf.addpatientothercomment = "";
              hvf.addpatientreasons = "";
            }

            if (row.assignto) hvf.fastingPhelbo = row.assignto.profile.name;

            if (row.pporder){
                if (row.pporder.assignto)
                  hvf.ppPhelbo = row.pporder.assignto.profile.name;   
            } 

            // if(index < 0)
            //     finalList.push(hvf);
            // else
            //     finalList[index] = hvf;

            finalList.push(hvf);
        }

        function makeFloat(o){
            // console.log(o);
            if (isNaN(o)) {
                return 0;
            }
            else
            {
                if(isNaN(parseFloat(o)))
                    return 0;
                else
                    return Math.round(parseFloat(o) * 100) / 100;   //return parseFloat(o);
            };
        }

        function waqt(minutes){
            
            var waqt = {};
            waqt.hour = Math.floor(parseInt(minutes) / 60);
            waqt.remainder = parseInt(minutes) % 60;
            waqt.fulltime;
            waqt.meridian;

            if (waqt.remainder == 0) waqt.remainder = "00"
            if (waqt.remainder == 15) waqt.remainder = "15"
            if (waqt.remainder == 30) waqt.remainder = "30"
            if (waqt.remainder == 45) waqt.remainder = "45"

            // if (waqt.hour == 1) waqt.remainder = "00"
            // if (waqt.hour == 1.25) waqt.remainder = "15"
            // if (waqt.hour == 1.5) waqt.remainder = "30"
            // if (waqt.hour == 1.75) waqt.remainder = "45"

            if (waqt.hour > 12) 
            {
                waqt.hour = waqt.hour - 12;
                if (waqt.hour < 10) {
                    waqt.fulltime = "0" + waqt.hour + ":" + waqt.remainder + " PM";
                    waqt.hour = "0" + waqt.hour;
                    waqt.meridian = "PM";

                }
                else {
                    waqt.fulltime = waqt.hour + ":" + waqt.remainder + " PM";
                    waqt.hour = waqt.hour;
                    waqt.meridian = "PM";
                }
            } 
            else if (waqt.hour < 12) 
            {
                //waqt.hour = "0" + waqt.hour + ":" + waqt.remainder + "AM";
                if (waqt.hour < 10) {
                    waqt.fulltime = "0" + waqt.hour + ":" + waqt.remainder + " AM";
                    waqt.hour = "0" + waqt.hour;
                    waqt.meridian = "AM";
                }
                else {
                    waqt.fulltime = waqt.hour + ":" + waqt.remainder + " AM";
                    waqt.hour = waqt.hour;
                    waqt.meridian = "AM";
                }
            } 
            else if(waqt.hour == 12) {
                waqt.fulltime = waqt.hour + ":" + waqt.remainder + "PM";
                waqt.hour = waqt.hour;
                waqt.meridian = "PM";
            }
            else 
            {
                waqt.fulltime = waqt.hour + ":" + waqt.remainder + " PM";
                waqt.hour = waqt.hour;
                waqt.meridian = "PM";
            }
            return waqt;    
        }
        
        function getServices(services){
            var tests = "";
            if(services)
            {
                var servicesLength = services.length;
                
                services.forEach(function(s,index){
                    if (s && s.service_id) {
                        tests += s.service_id.name;
                        if ((servicesLength - 1) != index) {
                            tests += ",\r";
                        };
                    };
                })
            }
            
            return tests;
        }

        function getClientID(key){
            return key.split(",",1);            
        }
    }

    async.waterfall([getOrders,getOrderCountOfClient, mapReportParameters],function(error, finalList){
        var fdate = params.fromdate;
        var tdate = params.todate;
        
        var reportdate = 'From ' + moment(params.fromdate).tz(TIMEZONE).format('DD-MM-YYYY') + ' To ' + moment(params.todate).tz(TIMEZONE).format('DD-MM-YYYY');
        var reportstaff = "";
        if (params.loggedinuser.profile)
            reportstaff = params.loggedinuser.profile.firstname + " " + params.loggedinuser.profile.lastname;

        var savedata = {
            headerinfo: {
                reportname: 'Home Visit Report',
                reportdate: "Date - " + reportdate,
                reportstaff: "Generated by - " + reportstaff
            },
            details: {
                homeVisitreport: finalList
            }
        };

        saveReport(savedata, function(saveerr, saveresult){
            if (saveerr) return next(saveerr);

            return callback(null, saveresult);
        });
    });
}

function saveReport (data, nextreport){
  var Report = new TempReportModel(data);
  Report.save(function(e, r){
    if (e) return nextreport(e);

    return nextreport(null, r);
  });
};