var _             = require('lodash')
  , Promise       = require('bluebird')
  , config        = require('config')
  , passport      = require('passport')
  , Strategy      = require('passport-jwt').Strategy
  , ExtractJwt    = require('passport-jwt').ExtractJwt
  , Account       = require('../db/account')
  , { logger }    = require('../logger')
  ;

const PUBLIC_KEY  = config.get('jwt.public')
  ,   ISS         = config.get('jwt.iss')
  ;

function find(payload = {}) {
  let { sub, sub_type } = payload;

  return Promise
          .try(() => {
            if (sub_type != 'account') {
              return payload;
            }

            return Account
                    .read_rec(sub)
                    .then((rec) => {
                      return { ...rec, sub };
                    })
          });
}

var opts = {
    jwtFromRequest  : ExtractJwt.fromExtractors([
        ExtractJwt.fromUrlQueryParameter('token')
      , ExtractJwt.fromAuthHeaderAsBearerToken()
    ])
  , algorithms      : ['RS256']
  , secretOrKey     : PUBLIC_KEY
  , issuer          : ISS
  // opts.audience = 'yoursite.net';
}

passport.use(new Strategy(opts, (payload, done) => {
  find(payload).asCallback(done);
}));

module.exports = {
    required : passport.authenticate('jwt', { session : false })
    // required : (req, res, next) => {
    //   passport.authenticate('jwt', { session : false }, (error, user, jwtError) => {
    //     req.user = user;
    //
    //     next(error, user);
    //   })(req, res);
    // }
  , optional : (req, res, next) => {
      passport.authenticate('jwt', { session : false }, (error, user, jwtError) => {
        if (error) {
          next();
        }

        req.user = user;

        next();
      })(req, res);
    }
};
