
var net = require('net')
  , EventEmitter = require('events').EventEmitter
  , _ = require('lodash')

  , Drone = require('./drone')

module.exports = Queen

function Queen(config) {
  this.config = _.extend({
    port: 7874, // phone number code STRI
    drone: Drone,
    logger: console,
    io: new EventEmitter()
  }, config)

  this.drones = []
  this.dronemap = {}
  // a map of jobid => droneid
  this.jobs = {}
  this.connected = 0
  this.nextid = 0
  this.createServer()
  this.attach(this.config.io)
}

/** compare first by free capacity, then by speed **/
function compareDrones(one, two) {
  if (one.full()) {
    if (!two.full()) return 1
  } else if (two.full()) {
    return -1
  }
  // both have free capacity, compare speed
  if (one.info.speed > two.info.speed) return -1
  if (two.info.speed > one.info.speed) return 1
  return 0
}

Queen.prototype = {
  /** setup functions **/
  // attach listeners to an event emitter
  attach: function (io) {
    var self = this
    io.on('queen:new_connection', this.newConnection.bind(this))
    io.on('job:status', this.checkStatus.bind(this))
    io.on('drone:died', function (id) {
      // the drone will have already killed the jobs it was handling
      var drone = self.dronemap[id]
        , idx = self.drones.indexOf(drone)
      if (!drone || idx === -1) {
        return io.emit('log', "Got a drone:died event but couldn't find the drone in my list. ID %s", id)
      }
      self.drones.splice(idx, 1)
      delete self.dronemap[id]
    })
    io.on('error', function () {
      self.logger.error.apply(self.logger, arguments)
    })
    io.on('log', function () {
      self.logger.log.apply(self.logger, arguments)
    })
  },
  createServer: function () {
    var self = this
    this.server = net.createServer()
    this.server.listen(this.config.port)
    this.server.on('connection', function (socket) {
      self.config.io.emit('queen:new_connection', socket)
    })
  },

  /** event handlers **/
  newConnection: function (socket) {
    var drone = new this.config.drone(socket, this.nextid, this.config.io)
    this.dronemap[this.nextid] = drone
    this.drones.push(drone)
    this.io.emit('queen:drone_created', drone)
    this.connected += 1
    this.nextid += 1
  },
  newJob: function (job) {
    var drone = this.readyDrone()
    this.jobs[job.id] = drone.id
    drone.takeJob(job)
  },

  /** utils **/
  readyDrone: function () {
    this.drones.sort(compareDrones)
    return this.drones[0];
  },
}
