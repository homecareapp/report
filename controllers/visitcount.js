var mongoose = require('mongoose');
var async = require('async');
var _ = require("lodash");
var moment = require('moment-timezone');
var TIMEZONE = require('../config/secrets').TIMEZONE;

var ModelOrder = require('../models/Order');
var ModelPartner = require('../models/Partner');

var orderCountOption = require('../data/orderCountOption');
var orderCountPopulate = require('../data/orderCountPopulate');

exports.phleboVisitReport = function(params, callback) {
    visitCountReport(params, function(e, tempResult) {
        if (e) return callback(e);
        return callback(null, tempResult);
    })
}

function visitCountReport(params, callback) {
	var orders = [],
        reportRows = [],
        finalReport = [],
        data = {},
        fromdate = moment(params.fromdate).tz(TIMEZONE).format("DD/MM/YYYY"),
        todate = moment(params.todate).tz(TIMEZONE).format("DD/MM/YYYY"),
        search = {
            fromdate: {
                $gte: new Date(),
                $lte: new Date()
            },
            status: "Completed"
        };

	function makeOrderSearchObj() {
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
		makeOrderSearchObj();
		ModelOrder.find(search, orderCountOption, { lean: true }, function(e, r) {
            orders = r;
            calculateOrdersCount();
            return next(null);
        }).populate(orderCountPopulate);
	}
    function calculateOrdersCount() {

        //group order according to Phlebos
        var totalVC, totalPC, phlebo, partner, phlebogrouporders, phlebogrouporderscount, phleboIds, phlebogroupByPartner, phlebogroupByPartnerCount, phleboPartnerIds;

        phlebogrouporders = _.groupBy(orders,function(b){return b.assignto._id});
        phleboIds = _.keys(phlebogrouporders);
        function dataBuilding() {
            data = {
                phleboname : phlebo,
                partnername : partner,
                visitcount : totalVC,
                patientcount: totalPC
            }
            makeReportRows(data);
        }
        function iterateGroupOrders() {
            phleboIds.forEach(function(p){               
                totalVC = _.uniqBy(phlebogrouporders[p], function(v){ return v.orderGroupId + ' ' + v.client_id  + ' ' + v.fromtime}).length; // 1st Phlebo Total Ordercount
                totalPC = _.uniqBy(phlebogrouporders[p], function(v){ return v.orderGroupId + ' ' + v.client_id }).length; // 1st Phlebo's PatientCount
                var a = phlebogrouporders[p];
                phlebo = a[0].assignto.profile.name;
                partner = "--ALL--";
                dataBuilding();

                //group PhleboOrders according to Partners
                phlebogroupByPartner = _.groupBy(phlebogrouporders[p],function(b){return b.partner_id._id});    
                phlebogroupByPartnerCount = _.countBy(phlebogrouporders[p],function(b){return b.partner_id._id});
                phleboPartnerIds = _.keys(phlebogroupByPartner);

                phleboPartnerIds.forEach(function(ppIds){
                    totalVC = _.uniqBy(phlebogroupByPartner[ppIds], function(v){ return v.orderGroupId + ' ' + v.client_id  + ' ' + v.fromtime}).length; // 1st Phlebo's 1st Partner VisitCount
                    totalPC = _.uniqBy(phlebogroupByPartner[ppIds], function(v){ return v.orderGroupId + ' ' + v.client_id }).length;// 1st Phlebo's 1st Partner PatientCount
                    var a = phlebogroupByPartner[ppIds];
                    phlebo = a[0].assignto.profile.name;
                    partner = a[0].partner_id.info.name;
                    dataBuilding();
                })
            })
        }
        iterateGroupOrders();
    }
    function makeFinalReport() {
        //header push
        finalReport.push(['Date From : ' + fromdate, 'Date To : ' + todate,'','']);
        finalReport.push(['','','','']);
        finalReport.push(['Phlebo Name', 'Partner Name', 'Visit Count', 'Patient Count']);

        reportRows =  _.sortBy(reportRows, ['phleboname','partnername']);

        reportRows.forEach(function(r) {
            finalReport.push([
                r.phleboname,
                r.partnername,
                r.visitcount,
                r.patientcount
            ]);
        });
    }
    function makeReportRows(data) {

        reportRows.push(newObject(data));

        function newObject(data) {
            return {
                phleboname : data.phleboname.toUpperCase(),
                partnername : data.partnername.toUpperCase(),
                visitcount : data.visitcount,
                patientcount : data.patientcount
            }
        }
    }
    

	async.waterfall([getOrders], function(error) {
        makeFinalReport();
        return callback(null, finalReport);
    });
}