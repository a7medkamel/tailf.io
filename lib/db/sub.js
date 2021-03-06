'use strict';

var Promise       = require('bluebird')
  , _             = require('lodash')
  , through2      = require('through2')
  , through2_sink = require('through2-sink')
  , config        = require('config')
  , { logger }    = require('../logger')
  , cache_man     = require('cache-manager')
  , Log           = require('./log')
  , { redis }     = require('./redis')
  , Socket        = require('./socket')
  ;

// var io_emitter = require('socket.io-emitter')(redis);

// var sub_cache = cache_man.caching({ store : 'memory', max : 10 * 1000, ttl : 5 /*seconds*/, promiseDependency : Promise });

class Sub extends Socket {
  constructor(socket, options = {}) {
    super(socket);

    socket.on('join', (payload, cb) => this.join(payload, cb));
  }

  // todo [akamel] init io here and ref it instead of expecting to have it passed in?
  join(payload = {}, cb) {
    let { replay = true, limit = 4 } = payload
      , { key, socket, io }           = this
      ;

    limit = _.clamp(limit, 0, 8);

    io.of('/').adapter.remoteJoin(socket.id, key, (err) => {
      if (err) {
        /* unknown id */
        return;
      }

      Promise
        .all([
            Log.stats(key)
          , replay && limit > 0 && Log.reader(key, { limit }).catch((err) => {})
        ])
        .spread((stats, stream) => {
          // todo [akamel] we might have broadcasts interleaved with catchup writes
          // or a race condigtion where we to a-c, skip d, and emit e

          Promise
            .try(() => {
              if (stream) {
                return Promise
                        .fromCallback((cb) => {
                          stream
                            .pipe(through2.obj((msg, enc, callback) => {
                              let { type, time, chunk } = msg;

                              let text = chunk.toString('utf-8');

                              if (type == 1) {
                                text = `\x1b[31m${text}\x1b[m`;
                              }

                              socket.emit('chunk', { time, text });

                              callback()
                            }))
                            .on('end', () => {
                              cb();
                            })
                            .on('error', cb)
                            .pipe(through2_sink.obj());
                        });
              }
            })
            .then(() => {
              let { end, error } = stats;

              if (end || error == 'SIZE_LIMIT') {
                // todo [akamel] differs from live 'end'. missing time and type
                socket.emit('end', { error });
                setTimeout(() => { socket.disconnect(true); }, 1000);
              }
            });

          // todo [akamel] should we send stats back?
          cb(stats);
        });
    });
  }

  static get(socket) {
    return Promise
            .try(() => {
              return new Sub(socket);
            });
  }
}

module.exports = Sub;
