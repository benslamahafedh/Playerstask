const csv = require('csv-parser')
const fs = require('fs')
const express = require("express")
const axios = require('axios')
const { Parser } = require('json2csv');
const redis = require("redis")
const cron = require('node-cron');
const WebSocket = require('ws')
const http = require("http")

var changed=false


const app = express()
const server = http.createServer(app);

const REDIS_PORT = process.env.PORT || 6379
const client = redis.createClient(6379)

const results = [];
fs.createReadStream('players.csv')
.pipe(csv())
.on('data', (data) => results.push(data))
.on('end', () => {
})



const wss = new WebSocket.Server({ server });
wss.on('connection', (ws) => {
    //send immediatly a feedback to the incoming connection    
    if (changed) ws.send('There was a change in the data');
});

cron.schedule('0 */15 * * * *', () => {
    console.log('running a task every 15 minutes');
    const response = fetchBall(req, res)
    const player = req.params.player
    const id = getIdOfPlayer(results, player)
    client.get(id, (err, data) => {
        if (err) throw err;
        if (data!=response) {
            res.send(setResponse(id, data))
            changed=true
        }})
    });

function getIdOfPlayer(main, player) {
    var id
    for (var i = 0; i < main.length; i++) {
        if (main[i].nickname === player) id = main[i].id
    }
    return id;
};

function fetchBall(req, res) {
    const player = req.params.player
    const id = getIdOfPlayer(results, player)
    axios
        .get(`https://www.balldontlie.io/api/v1/players/${id}`)
        .then(otherres => {
            var fields = []
            var table = [{ "id": id, "nickname": player }]
            if (otherres.data.first_name) {
                fields.push("first_name")
                table[0].first_name = otherres.data.first_name
            }
            if (otherres.data.last_name) {
                fields.push("last_name")
                table[0].last_name = otherres.data.last_name
            }
            if (otherres.data.height_feet) {
                fields.push("height_feet")
                table[0].height_feet = otherres.data.height_feet
            }
            if (otherres.data.height_inches) {
                fields.push("height_inches")
                table[0].height_inches = otherres.data.height_inches
            }
            if (otherres.data.position) {
                fields.push("position")
                table[0].position = otherres.data.position
            }
            //set Data to redis
            client.setex(id, 900, JSON.stringify(table[0]))
            const json2csvParser = new Parser({ fields });
            const csv = json2csvParser.parse(table)
            res.send(setResponse(id, table))
        })
        .catch(error => {
            console.error(error)
        })
};


function cache(req, res, next) {
    const player = req.params.player
    const id = getIdOfPlayer(results, player)
    console.log(id)
    client.get(id, (err, data) => {
        if (err) throw err;
        if (data) {
            res.send(setResponse(id, data))
        } else {
            next()
        }
    })

}


function setResponse(id, table) {
    return `<h2>${table}<h2/>`
}


app.get('/:player', cache, fetchBall)

app.listen(3000, () => {
    console.log('listening on port 3000')
})


server.listen(process.env.PORT || 8999, () => {
    console.log(`Server started on port ${server.address().port} :)`);
});