var mongoose = require('mongoose');
var async = require('async');
var _ = require("lodash");
var moment = require('moment-timezone');
var TIMEZONE = require('../config/secrets').TIMEZONE;

var ModelOrder = require('../models/Order');
var ModelPartner = require('../models/Partner');

var orderOption = require('../data/stockOrderOption');
var orderPopulate = require('../data/stockOrderPopulate');

var phleboOrderOption = require('../data/phleboStockOrderOption');
var phleboOrderPopulate = require('../data/phleboStockOrderPopulate');

exports.report = function(params, callback) {
    partnerStockReport(params, function(e, tempResult) {
        if (e) return callback(e);

        return callback(null, tempResult);
    })
}

exports.phleboReport = function(params, callback) {
    phleboStockReport(params, function(e, tempResult) {
        if (e) return callback(e);

        return callback(null, tempResult);
    })
}


function partnerStockReport(params, callback) {
    var orders = [],
        reportRows = [],
        finalReport = [],
        fromdate = moment(params.fromdate).tz(TIMEZONE).format("DD/MM/YYYY"),
        todate = moment(params.todate).tz(TIMEZONE).format("DD/MM/YYYY"),
        search = {
            fromdate: {
                $gte: new Date(),
                $lte: new Date()
            },
            status: "Completed"
        };

    function makeSearchOrderObject(){
        if (params.provider_id)
            search["provider_id"] = params.provider_id;
        if (params.fromdate) search.fromdate.$gte = params.fromdate;
        if (params.todate) search.fromdate.$lte = params.todate;

        makeInSearch(); 

        function makeInSearch(){
            if(params.partner_id)
                search["partner_id"] = splitIdsAndIn(params.partner_id);
        }
        function splitIdsAndIn(ids){
            if(!ids) return undefined;
            return {
                "$in": ids
            }
        }
    }

    function getOrders(next) {
        makeSearchOrderObject();
        ModelOrder.find(search, orderOption, { lean: true }, function(e, r) {
            orders = r;
            calculateOrdersTube();
            makeReportRows()
            return next(null);
        }).populate(orderPopulate);
    }

    function calculateOrdersTube() {
        orders.forEach(function(o) {
            o.tests = getUniqTests(o);
            // console.log(o)
            o.tubes = getTubeCount(o);
        });
    }

    function makeReportRows() {
        var reportRowObj = {};
        orders.forEach(function(o){
            o.tubes.forEach(function(t){
                var index = _.findIndex(reportRows, function(r){
                    return r._id.toString() === t._id.toString() && r.partner_id.toString() === o.partner_id._id.toString();
                });
                // console.log(t._id, index)
                if (index > -1)
                    reportRows[index].count = reportRows[index].count + t.count;
                else
                    reportRows.push(newObject(t, o));
            })
        });

        function newObject(t, o) {
            return {
                _id : t._id,
                count : t.count,
                name : t.company.toUpperCase() + "-" + t.type.toUpperCase() + "-" + t.size,
                partnername : o.partner_id.info.name.toUpperCase(),
                partner_id : o.partner_id._id
            }
        }
    }

    function makeFinalReport() {
        //header push
        finalReport.push(['Date From : ' + fromdate, 'Date To : ' + todate,'']);
        finalReport.push(['','','']);
        finalReport.push(['Partner name', 'Tube', 'Count']);
        reportRows =  _.sortBy(reportRows, ['partnername','count']);
        reportRows.forEach(function(r) {
            finalReport.push([
                r.partnername,
                r.name,
                r.count
            ]);
        });
    }

    async.waterfall([getOrders], function(error) {
        makeFinalReport();
        return callback(null, finalReport);
    });
}

function phleboStockReport(params, callback) {
    var orders = [],
        reportRows = [],
        finalReport = [],
        fromdate = moment(params.fromdate).tz(TIMEZONE).format("DD/MM/YYYY"),
        todate = moment(params.todate).tz(TIMEZONE).format("DD/MM/YYYY"),
        search = {
            fromdate: {
                $gte: new Date(),
                $lte: new Date()
            },
            status: "Completed"
        };

    function makeSearchOrderObject(){
        if (params.provider_id) 
            search["provider_id"] = params.provider_id;
        if (params.fromdate) search.fromdate.$gte = params.fromdate;
        if (params.todate) search.fromdate.$lte = params.todate;

        makeInSearch(); 

        function makeInSearch(field){
            if(params.assignto)
                search["assignto"] = splitIdsAndIn(params.assignto);
        }
        function splitIdsAndIn(ids){
            if(!ids) return undefined;
            return {
                "$in": ids
            }
        }
    }

    function getOrders(next) {
        makeSearchOrderObject()
        ModelOrder.find(search, phleboOrderOption, { lean: true }, function(e, r) {
            orders = r;
            calculateOrdersTube();
            makeReportRows()
            return next(null);
        }).populate(phleboOrderPopulate);
    }

    function calculateOrdersTube() {
        orders.forEach(function(o) {
            o.tests = getUniqTests(o);
            // console.log(o)
            o.tubes = getTubeCount(o);
        });
    }

    function makeReportRows() {
        var reportRowObj = {};
        orders.forEach(function(o){
            o.tubes.forEach(function(t){
                var index = _.findIndex(reportRows, function(r){
                    return r._id.toString() === t._id.toString() && r.assignto_id.toString() === o.assignto._id.toString();
                });
                // console.log(t._id, index)
                if (index > -1)
                    reportRows[index].count = reportRows[index].count + t.count;
                else
                    reportRows.push(newObject(t, o));
            })
        });

        function newObject(t, o) {
            return {
                _id : t._id,
                count : t.count,
                name : t.company.toUpperCase() + "-" + t.type.toUpperCase() + "-" + t.size,
                assignto : o.assignto.profile.name.toUpperCase(),
                assignto_id : o.assignto._id
            }
        }
    }

    function makeFinalReport() {
        //header push
        finalReport.push(['Date From : ' + fromdate, 'Date To : ' + todate,'']);
        finalReport.push(['','','']);
        finalReport.push(['Phlebo', 'Tube', 'Count']);
        reportRows =  _.sortBy(reportRows, ['assignto','count']);
        reportRows.forEach(function(r) {
            finalReport.push([
                r.assignto,
                r.name,
                r.count
            ]);
        });
    }

    async.waterfall([getOrders], function(error) {
        makeFinalReport();
        return callback(null, finalReport);
    });
}

// get uniq test from orderObject
function getUniqTests(o) {
    var tests = [];
    o.services.forEach(function(s) {
        if (s.service_id.category == "TEST")
            tests.push(s.service_id);
        else if (s.service_id.category == "PROFILE")
            getProfileTests(s.service_id.childs);
        else if (s.service_id.category == "PACKAGES") // toDo: Test it
            getPakageTests(s.service_id.childs);
    })


    return _.uniqBy(tests, '_id');

    function getProfileTests(childs) {
        childs.forEach(function(t) {
            tests.push(t.test_id);
        });
    }

    function getPakageTests(childs) {
        // console.log("Package")
        childs.forEach(function(t) {
            if (t.test_id) {
                if (t.test_id.category == "PROFILE") {
                    getProfileTests(t.test_id.childs);
                } else if (t.test_id.category == "PACKAGES") {
                    getPakageTests(t.test_id.childs);
                } else
                    tests.push(t.test_id);
            }
        });
    }
}

// get Tube count from orderObject
function getTubeCount(o) {
    o.tubes = getTubes(o.tests, o.partner_id.sharetubes);
    if (o.ordertype == "PP") {
        o.tubes = addPendingTubes(o.tubes, o.pendingtubes);
    }
    return o.tubes;
}

function addPendingTubes(tubes, pendingtubes) {
    if (!pendingtubes) return tubes;

    pendingtubes.forEach(function(pt) {
        var index = _.findIndex(tubes, function(t) {
            return t._id == pt._id;
        });
        //console.log(index);
        if (index > -1) tubes[index].count = tubes[index].count + pt.count;
    });
    return tubes;
}

function getTubes(tests, partnerShareTubeFlag) {
    var tubeCount = 0,
        totalCount = 0,
        lastTubeId, tempTubes = [];
    tests.forEach(function(ptObj) {
        lastTubeId = undefined; //to update tube id for next test
        if (ptObj.masterservice && ptObj.masterservice.tubes) {
            var tubeIdsCount = _.groupBy(ptObj.masterservice.tubes, function(t) {
                return [t._id]
            });
            ptObj.masterservice.tubes.forEach(function(tube) {
                foundIndex = _.findIndex(tempTubes, function(t) { return t._id == tube._id.toString(); });
                //checking test id index for tube
                if (!lastTubeId || lastTubeId != tube._id) {
                    tubeCount = tubeIdsCount[tube._id].length;
                    totalCount = tubeIdsCount[tube._id].length;
                }
                lastTubeId = tube._id;

                // tube not found 
                if (foundIndex < 0) {
                    var tubeObj = {
                        count: 1,
                        _id: tube._id,
                        company: tube.company,
                        size: tube.size,
                        type: tube.type,
                        departments: [],
                        test_ids: []
                    };

                    tubeObj.departments.push({ id: ptObj.masterservice.department_id._id, count: tubeCount });
                    tubeObj.test_ids.push(ptObj._id);
                    tubeCount--;
                    tempTubes.push(tubeObj);
                } else {
                    var departmentIndexInAddedTube = _.findIndex(tempTubes[foundIndex].departments, function(o) { return o.id.toString() == ptObj.masterservice.department_id._id });

                    //share tube  false and department not added in temptube
                    if (!partnerShareTubeFlag && departmentIndexInAddedTube < 0) {
                        tempTubes[foundIndex].departments.push({ id: ptObj.masterservice.department_id._id, count: tubeCount });

                        tempTubes[foundIndex].count = 0
                        tempTubes[foundIndex].departments.forEach(function(d) {
                            tempTubes[foundIndex].count = tempTubes[foundIndex].count + d.count;
                        })
                        tubeCount--;
                    }
                    //if share tube is false and department found in added tempTubes  
                    else if (!partnerShareTubeFlag && departmentIndexInAddedTube >= 0) {
                        // check if all tubes for given test is added?

                        // if same deparment having two tests and tube count is less in one test so taking highest tubecount
                        if (tempTubes[foundIndex].departments[departmentIndexInAddedTube].count < totalCount)
                            tempTubes[foundIndex].departments[departmentIndexInAddedTube].count = totalCount;

                        tempTubes[foundIndex].count = 0
                        tempTubes[foundIndex].departments.forEach(function(d) {
                            tempTubes[foundIndex].count = tempTubes[foundIndex].count + d.count;
                        })
                        tubeCount--;
                    }

                    //if shareTube = true
                    else if (_.findIndex(tempTubes[foundIndex].test_ids, function(testId) { return testId == ptObj._id }) > -1 && tubeCount > 0) {
                        tempTubes[foundIndex].count++;
                        tubeCount--;
                    }

                    // check if all tubes for given test is added?
                    else if (_.findIndex(tempTubes[foundIndex].test_ids, function(testId) { return testId != ptObj._id }) > -1 && tubeCount > tempTubes[foundIndex].count) {
                        tempTubes[foundIndex].count++;
                        tubeCount--;
                    }
                    // //multiple same tubes in a test 
                    // if(_.findIndex(tempTubes[foundIndex].department_id, function(o){return o==ptObj.masterservice.department_id._id})>-1){
                    //     tempTubes[foundIndex].count++;
                    // }
                    // }
                };
            });
        };
    });
    return tempTubes;
}