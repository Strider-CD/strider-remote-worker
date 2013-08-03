/*jshint -W030: false */
/*global describe: true, it: true, beforeEach: true */
var expect = require('chai').expect
  , EventEmitter = require('events').EventEmitter

  , Mocket = require('mockets')
  , SockEmitter = require('sockemitter')

  , Drone = require('../lib/drone')

describe('Drone', function () {
  var drone
    , mocks
    , remote
    , job = {job_id: 'asdw24'}
    , id = 'dr0ne'
    , io
  beforeEach(function () {
    io = new EventEmitter()
    io.on('error', function () {})
    mocks = Mocket.pair()
    remote = new SockEmitter(mocks[0])
  })

  it('should proxy up all job: events as browser events', function () {
    var drone = new Drone(mocks[1], id, io, {})
      , count = 0
      , jid = job.job_id
    io.on('browser', function (type, args) {
      expect(type.slice(0, 4)).to.equal('job:')
      count++
    })
    drone.takeJob(job)
    remote.emit('job:cmd:start', jid, 0, 'hello', 'howdy')
    remote.emit('job:stdout', jid, 'waat')
    remote.emit('job:queued', jid)
    remote.emit('job:done', job.job_id)
    expect(count).to.equal(4)
  })

  describe('auto timeout', function () {
    beforeEach(function () {
      drone = new Drone(mocks[1], id, io, {timeout: 200})
    })

    it('should work', function (done) {
      this.timeout(500)
      io.on('drone:died', function (did) {
        expect(did).to.equal(id)
        done()
      })
    })

    it('should stay alive if messages are sent', function (done) {
      this.timeout(2000)
      io.on('drone:died', function (did) {
        done(new Error('Expected not to die'))
      })
      var inv = setInterval(function () {
        remote.emit('drone:keep-alive')
      }, 50)
      setTimeout(function () {
        clearInterval(inv)
        expect(drone.connected).to.be.true
        done()
      }, 1000)
    })

  })

  describe('info passing', function () {
    it('should request info on initialization', function (done) {
      this.timeout(200)
      remote.on('drone:query-info', function () {
        done()
      })
      var drone = new Drone(mocks[1], id, io, {})
    })
    it('should store info it receives', function () {
      var drone = new Drone(mocks[1], id, io, {})
        , info = {speed: 10, capacity: 3}
      remote.emit('drone:info', info)
      expect(drone.info).to.eql(info)
    })
  })

  describe('adding a job', function () {
    beforeEach(function () {
      drone = new Drone(mocks[1], id, io)
    })
    it('should work and send the queue:new event', function () {
      var queued = false
        , job = {
          job_id: '123sfwef',
          repo: {url: 'http://github.com/strider-cd/strider.git'}
        }
      remote.on('queue:new', function (data) {
        expect(data).to.eql(job)
        queued = true
      })
      drone.takeJob(job)
      expect(queued).to.be.true
      expect(drone.jobmap[job.job_id], 'job in jobmap').to.be.ok
      expect(drone.jobmap[job.job_id].data).to.eql(job)
    })
  })

  describe('job messages', function () {
    beforeEach(function () {
      drone = new Drone(mocks[1], id, io, {})
      drone.takeJob(job)
      io.on('error', function () {
        console.error.apply(null, ['Failed:'].concat(arguments))
      })
    })
    it('should set the right times', function () {
      var jid = job.job_id
        , djob = drone.jobmap[jid]
      remote.emit('job:queued', jid, 1)
      expect(djob.queued, 'Queued time').to.equal(1)
      remote.emit('job:started', jid, 2)
      expect(djob.started, 'started time').to.equal(2)
      remote.emit('job:tested', jid, 0, 3)
      expect(djob.testTime, 'test time').to.equal(1)
      remote.emit('job:deployed', jid, 0, 5)
      expect(djob.deployTime, 'deploy time').to.equal(2)
      remote.emit('job:done', jid, 10)
      expect(djob.finished, 'done time').to.equal(10)
    })
    it('should set exitcodes', function () {
      remote.emit('job:tested', job.job_id, 10, 2000)
      expect(drone.jobmap[job.job_id].testCode).to.equal(10)
      remote.emit('job:deployed', job.job_id, 25, 2000)
      expect(drone.jobmap[job.job_id].deployCode).to.equal(25)
    })

    it('should save io sent before the first command', function () {
      var jid = job.job_id
      remote.emit('job:stdout', jid, 'one\n')
      var cmd = drone.jobs[0].cmds[0]
      expect(cmd.out).to.equal('one\n')
    })

    it('should not override messages before the first command', function () {
      var jid = job.job_id
      remote.emit('job:stdout', jid, 'one\n')
      remote.emit('job:cmd:start', jid, 0, 'hi', 'hi')
      remote.emit('job:cmd:stdout', jid, 0, 'two\n')
      var cmd = drone.jobs[0].cmds[0]
      expect(cmd.out).to.equal('one\ntwo\n')
    })

    describe('for a command', function () {
      var jid = job.job_id
      beforeEach(function () {
        remote.emit('job:cmd:start', jid, 0, 'hi', 'hi')
      })
      it('should map cmd-specific io', function () {
        remote.emit('job:cmd:stdout', jid, 0, 'things\n')
        remote.emit('job:cmd:stderr', jid, 0, 'problems\n')
        var cmd = drone.jobs[0].cmds[0]
        expect(cmd.out).to.equal('things\n')
        expect(cmd.err, 'stderr').to.equal('problems\n')
      })
      it('should map general io interspersed', function () {
        remote.emit('job:cmd:stdout', jid, 0, 'first\n')
        remote.emit('job:stdout', jid, 'second\n')
        var cmd = drone.jobs[0].cmds[0]
        expect(cmd.out).to.equal('first\nsecond\n')
      })
      it('should record exitcode', function () {
        remote.emit('job:cmd:done', jid, 0, 5)
        var cmd = drone.jobs[0].cmds[0]
        expect(cmd.exitCode).to.equal(5)
      })
    })
  })
})
