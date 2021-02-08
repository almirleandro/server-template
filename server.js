require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const fetch = require("node-fetch");
const rateLimit = require("express-rate-limit");
const helmet = reqeuire('helmet');
const knex = require('knex')({
  client: 'pg',
  connection: {
    connectionString : process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false
    }
  }
});

const app = express();

const limiter = rateLimit({
  windowMs: 1000, // 1 second
  max: 1, // limit each IP to 1 requests per windowMs
});

var whitelist = ['https://form-experience.herokuapp.com']
var corsOptionsDelegate = function (req, callback) {
  var corsOptions;
  if (whitelist.indexOf(req.header('Origin')) !== -1) {
    corsOptions = { origin: true } // reflect (enable) the requested origin in the CORS response
  } else {
    corsOptions = { origin: false } // disable CORS for this request
  }
  callback(null, corsOptions) // callback expects two parameters: error and options
}

app.use(helmet());
app.use(express.json());
app.use(limiter);



app.get('/', cors(corsOptionsDelegate), (req, res) => {
  res.send('Server is running');
})

app.post('/signin', cors(corsOptionsDelegate), (req, res) => {
  knex.select('email', 'hash').from('login')
    .where('email', '=', req.body.email)
    .then(data => {
      bcrypt.compare(req.body.password, data[0].hash, function(err, resp) {
        if (resp) {
          return knex.select('*').from('users')
            .where('email', '=', req.body.email)
            .then(user => {
              res.json(user[0])
            })
            .catch(err => res.status(400).json('unable to get user'))
        }
        res.status(400).json('Wrong credentials')
      })
    })
    .catch(err => res.status(400).json('Wrong credentials'))
})

app.post('/register', cors(corsOptionsDelegate), (req,res) => {
  const { email, name, password } = req.body;
  bcrypt.genSalt(10, function(err, salt) {
    bcrypt.hash(password, salt, function(err, hash) {
        // Store hash in your password DB.
        knex.transaction(trx => {
          trx.insert({
            hash: hash,
            email: email
          })
          .into('login')
          .returning('email')
          .then(loginEmail => {
            return trx.insert({
                name: name,
                email: loginEmail[0],
                joined: new Date()
            })
            .into('users')
            .returning('*')
            .then(user => {
              res.json(user[0]);
            })
          })
          .then(trx.commit)
          .catch(trx.rollback)
        })
        .catch(err => res.status(400).json('Unable to register'))
    });
  });
})

app.post("/api/search", cors(corsOptionsDelegate), async (req, res) => {
  try {
    // This uses string interpolation to make our search query string
    // it pulls the posted query param and reformats it for goodreads
    const searchString = req.body.q;

    // It uses node-fetch to call the goodreads api, and reads the key from .env
    const response = await fetch(
      `https://api.themoviedb.org/3/search/movie?api_key=${process.env.TMBD_KEY}&language=pt-BR&query=${searchString}&page=1&include_adult=false`,
    );
    const data  = await response.json();
    res.json(data.results);
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
});

app.listen(process.env.PORT || 3002, () => {
  console.log(`Server is running on port ${process.env.PORT}`);
})