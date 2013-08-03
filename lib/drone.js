
var SockEmitter = require('sockemitter')
  , _ = require('lodash')

module.exports = Drone

function Drone(socket, id, io, config) {
  this.socket = socket
  this.jobio = new SockEmitter(socket)
  this.id = id
  this.config = _.extend({
    timeout: 60000
  }, config || {})
  this.info = {
    speed: 0,
    capacity: 1
  }
  this.jobs = []
  this.jobmap = {}
  this.io = io
  this.connected = true
  this.attachListeners()
  this.jobio.emit('drone:query-info')
}

Drone.prototype = {
  attachListeners: function () {
    var self = this
    this.socket.on('error', function (error) {
      self.error('socket error: %s', error)
    })
    this.socket.on('close', this.close.bind(this))

    // general status
    this.jobio.on('drone:info', function (info) {
      self.info = info
    })

    this.jobio.on('job:stdout', function (id, text) {
      var job = self.jobmap[id]
      if (!job) return self.error('queued event for unknown job', id)
      if (job.cmds.length === 0) { // create a blank job...
        job.cmds.push({
          out: '',
          err: '',
          phase: 'prepare',
          cmd: '[initializing]',
          started: null,
          finished: null,
          exitCode: 0
        })
      }
      job.cmds[job.cmds.length - 1].out += text
    })
    this.jobio.on('job:stderr', function (id, text) {
      var job = self.jobmap[id]
      if (!job) return self.error('queued event for unknown job', id)
      if (job.cmds.length === 0) { // create a blank job...
        job.cmds.push({
          out: '',
          err: '',
          phase: 'prepare',
          cmd: '[initializing]',
          started: null,
          finished: null,
          exitCode: 0
        })
      }
      job.cmds[job.cmds.length - 1].err += text
    })

    // per-job stuff
    this.jobio.on('job:cmd:start', this.startJobCmd.bind(this))
    this.jobio.on('job:cmd:done', function (id, num, code) {
      var cmd = self.getJobCmd(id, num)
      if (!cmd) return
      cmd.finished = new Date().getTime()
      cmd.exitCode = code
    })
    this.jobio.on('job:cmd:stdout', function (id, num, text) {
      var cmd = self.getJobCmd(id, num)
      if (!cmd) return
      cmd.out += text
    })
    this.jobio.on('job:cmd:stderr', function (id, num, text) {
      var cmd = self.getJobCmd(id, num)
      if (!cmd) return
      cmd.err += text
    })
    // for the moment, plugins can't modify job state. So we ignore job:plugin events

    // state changes
    this.jobio.on('job:queued', function (id, timestamp) {
      var job = self.jobmap[id]
      if (!job) return self.error('queued event for unknown job', id)
      job.queued = timestamp
    })
    this.jobio.on('job:started', function (id, timestamp) {
      var job = self.jobmap[id]
      if (!job) return self.error('started event for unknown job', id)
      job.started = timestamp
    })
    this.jobio.on('job:tested', function (id, code, timestamp) {
      var job = self.jobmap[id]
      if (!job) return self.error('tested event for unknown job', id)
      job.testCode = code
      job.testTime = timestamp - job.started
    })
    this.jobio.on('job:deployed', function (id, code, timestamp) {
      var job = self.jobmap[id]
      if (!job) return self.error('deployed event for unknown job', id)
      job.deployCode = code
      job.deployTime = timestamp - job.started - job.testTime
    })
    this.jobio.on('job:done', this.doneJob.bind(this))

    // now pass on all job events to the queen (and from there on the browser)
    this.jobio.on('job:*', function () {
      self.io.emit('browser', this.event, [].slice.call(arguments))
    })

    // watch for timeouts
    var timeout = this.droneTimedOut.bind(this)
    this.jobio.any(function () {
      if (self.timer) clearTimeout(self.timer)
      self.timer = setTimeout(timeout, self.config.timeout)
    })
    this.timer = setTimeout(timeout, this.config.timeout)
      
  },

  droneTimedOut: function () {
    this.error('Drone failed to respond within %dms', this.config.timeout);
    this.close(true, 'Worker timeout')
  },

  startJobCmd: function (id, num, command, screencmd) {
    if (!this.jobmap[id]) return this.error('start for unknown job')
    var job = this.jobmap[id]
    if (job.cmds.length < num) {
      return this.error('start command number %d but current num commans %d', num, job.cmds.length)
    }
    var cmd = {
      out: '',
      err: '',
      phase: job.phase,
      cmd: command,
      screencmd: screencmd || command,
      exitCode: -1,
      started: new Date(),
      finished: null
    }
    if (job.cmds.length <= num) {
      job.cmds.push(cmd)
    } else {
      cmd.out = job.cmds[num].out
      cmd.err = job.cmds[num].err
      job.cmds[num] = cmd
    }
  },

  doneJob: function (id, timestamp) {
    var job = this.jobmap[id]
    if (!job) return this.error('done event for unknown job', id)
    job.finished = timestamp
    this.io.emit('job:done', job)
    delete this.jobmap[id]
    this.jobs.splice(this.jobs.indexOf(job), 1)
  },

  getJobCmd: function (id, num) {
    if (!this.jobmap || !this.jobmap[id]) {
      this.error('unknown job')
      return false
    }
    var job = this.jobmap[id]
      , cmd = job.cmds[num]
    if (!cmd) {
      this.error('unknown command number %d for job %s', num, id)
      return false
    }
    return cmd
  },

  killJob: function (job, message) {
    var now = new Date().getTime()
      , times = ['queued', 'started', 'finished']
    job.queued = job.queued || now
    job.started = job.started || now
    if (job.testCode === null) {
      job.testCode = 504
      job.testTime = now - job.started
    }
    if (job.deployCode === null) {
      job.deployCode = 504
      job.deployTime = now - job.started - job.testTime
    }
    if (!job.cmds.length) {
      job.cmds.push({out: '', err: '', phase: 'prepare', cmd: '', started: now, exitCode: 504})
    }
    job.cmds[job.cmds.length].err += '\n[ERROR] ' + message
    
    this.doneJob(job.id, now)
  },

  // drone has been shut down. Kill all running jobs
  close: function (errored, text) {
    var self = this
    if (errored) {
      this.error('closing after error')
    } else {
      this.log('closing')
    }
    this.jobs.slice().forEach(function(job) {
      self.log('killing job %s', job.id)
      self.killJob(job, text || 'Worker died')
    })
    this.jobs = []
    this.jobmap = {}
    this.connected = false
    this.io.emit('drone:died', this.id)
  },

  name: function () {
    return '[Drone ' + this.id + ' : ' + this.socket.remoteAddress + ']'
  },
  log: function () {
    var args = ['log', this.name()].concat(arguments)
    this.io.emit.apply(this.io, args)
  },
  error: function () {
    var args = ['error', this.name()].concat(arguments)
    this.io.emit.apply(this.io, args)
  },

  /** job stuff **/
  takeJob: function (data) {
    var job = {
      data: data,
      cmds: [],
      id: data.job_id,
      phase: 'prepare',
      queued: null,
      started: null,
      finished: null,
      testCode: null,
      testTime: null,
      deployCode: null,
      deployTime: null
    }
    this.jobs.push(job)
    this.jobmap[job.id] = job
    this.jobio.emit('queue:new', data)
  },

  /** utils **/
  full: function () {
    return this.jobs.length >= this.info.capacity
  }
}

