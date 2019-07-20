

// Model Attendance


exports.attendenceReport = {
    report(params, callback) {
        // const mongoose = require('mongoose');
        // const moment = require('moment-timezone');
        const ModelAttendance = require('../models/Attendance');
        const attedanceOption = require('../data/attedanceOption');
        const attedancePopulate = require('../data/attedancePopulate');

        //defining search object from params
        let search = {};
        if (params.user_id) search.user_id.$gte = params.fromdate;
        if (params.fromdate) search.att_date.$gte = params.fromdate;
        if (params.todate) search.att_date.$lte = params.todate;

        // getting value from attendance document
        ModelAttendance.find(search,attedanceOption, {lean:true}, (e,r)=>{
            if(e) return callback(e)
            return callback(null,r)
        }).populate(attedancePopulate);
    }
}