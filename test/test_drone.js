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
    , id = 'dr0ne'
    , io
  beforeEach(function () {
    io = new EventEmitter()
    io.on('error', function () {})
    mocks = Mocket.pair()
    remote = new SockEmitter(mocks[0])
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
})
    
