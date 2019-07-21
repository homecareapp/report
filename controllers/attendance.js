


    // const mongoose = require('mongoose');
    // const moment = require('moment-timezone');
    const ModelAttendance = require('../models/Attendance');
    const attedanceOption = require('../data/attendanceOption');
    const attedancePopulate = require('../data/attendancePopulate');
    


exports.attendenceReport = (params, callback) => {
    // const mongoose = require('mongoose');
    
    const TIMEZONE = require('../config/secrets').TIMEZONE;
    // const ModelAttendance = require('../models/Attendance');
    // const attedanceOption = require('../data/attedanceOption');
    // const attedancePopulate = require('../data/attedancePopulate');
        try {
            let search = {
                att_date: {
                    $gte: (params.fromdate) ? new Date(params.fromdate) : new Date(),
                    $lte: (params.todate) ? new Date(params.todate) : new Date()
                }
            };
            if (params.user_id) search.user_id = params.fromdate;
           
            // getting value from attendance document
            ModelAttendance.find(search,attedanceOption, {lean:true}, (e,r)=>{
                if(e) return callback(e);
                return callback(null,makeReportRows(r))

            }).populate(attedancePopulate);
            
        } catch (error) {
            console.log(error)
            return callback(e)
        }
        //defining search object from params
        
    }

    //make report rows
    function makeReportRows(rows) {
        const moment = require('moment-timezone');
        if(!Array.isArray(rows)) return [];
        
       return rows.map(row=>{
           return {
               staff: row.user_id.profile.name,
               date: moment(row.att_date).format("DD-MM-YYYY"),
               day:moment(row.att_date).format("dddd"),
               punchin: row.punchin_time,
               punchout: row.punchout_time
           }
       })
    }