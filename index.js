const Sequelize = require('sequelize');
const express = require('express')
const formidableMiddleware = require('express-formidable');
const plivo = require('plivo')

const sequelize = new Sequelize('sqlite:./sms.db')
const app = express()
app.use(formidableMiddleware())
const port = 3000
const plivoClient = new plivo.Client() // uses PLIVO_AUTH_ID and PLIVO_AUTH_TOKEN from environment

const statusCallbackURL = "https://yourdomain/messageStatus"

const Subscriber = sequelize.define('subscriber', {
  phoneNumber: { type: Sequelize.STRING },
});

const Message = sequelize.define('message', {
  uuid: { type: Sequelize.STRING },
  from: { type: Sequelize.STRING },
  to: { type: Sequelize.STRING },
  text: { type: Sequelize.STRING },
  units: { type: Sequelize.INTEGER },
  cost:  { type: Sequelize.DECIMAL }
});

const MessageStatus = sequelize.define('messageStatus', {
  uuid: { type: Sequelize.STRING },
  from: { type: Sequelize.STRING },
  to: { type: Sequelize.STRING },
  status: { type: Sequelize.STRING },
  errorCode: { type: Sequelize.STRING }
});

const logMessageStatus = ({uuid, status, errorCode, from, to}) => {
  MessageStatus
  .findOrCreate({where: {uuid: uuid, from: from, to: to}})
  .then(([messageStatus, created]) => {
    if (!created) {
      messageStatus.update({
        status: status,
        errorCode: errorCode,
      }).then(() => {
        console.log("Updated Status")
      })
    }
  })
}

const logMessage = ({uuid, from, to, text, units, cost}) => {
  Message
  .create({uuid: uuid, from: from, to: to, text: text, units: units, cost: cost})
  .then((message) => {
    console.log(message.get({
      plain: true
    }))
  }
  )
}

const subscribe = (phoneNumber) => {
  Subscriber
  .findOrCreate({where: {phoneNumber: phoneNumber}})
  .then(([subscriber, created]) => {
    console.log(subscriber.get({
      plain: true
    }))
    console.log(created)
  }
  )
}

const unsubscribe = (phoneNumber) => {
  Subscriber
  .destroy({where: {phoneNumber: phoneNumber}})
  .then((destroyed) => {
    console.log(destroyed)
  }
  )
}

const sendMessage = ({src, dst, text}) => {
  plivoClient.messages.create(
      src,
      dst,
      text,
      {url: statusCallbackURL}
    ).then(function (response) {
      console.log(response);
  }, function (err) {
      console.error(err);
  });
}

// make sure the database is up to date, then start the server
sequelize.sync({alter: true}).then(() => {
  console.log("server started")

  // handle incoming messages
  app.post('/incoming', (req, res) => {

    switch(req.fields.Text.toLowerCase()) {

      //handle subscribes
      case 'start':
        subscribe(req.fields.From)
        sendMessage({
          src: req.fields.To,
          dst: req.fields.From,
          text: "Thank you for subscribing! We'll send you about 5 messages a week. Reply STOP to unsubscribe at any time."
        })
        break

      //handle unsubscribes
      case 'stop':
        unsubscribe(req.fields.From)
        break

      //log the message
      default:
        logMessage({
          uuid: req.fields.MessageUUID,
          from: req.fields.From,
          to: req.fields.To,
          text: req.fields.Text,
          units: parseInt(req.fields.Units),
          cost: parseFloat(req.fields.TotalAmount)
        })
        console.log(req.fields)
    }
    res.send("OK")
  })

  // handle message status updates
  app.post('/messageStatus', (req, res) => {
    logMessageStatus({
      uuid: req.fields.MessageUUID,
      from: req.fields.From,
      to: req.fields.To,
      status: req.fields.Status,
      errorCode: req.fields.ErrorCode
    })
    res.send("OK")
  })

  app.post('/sendMessageToSubscribers', (req, res) => {
    Subscriber.findAll().then(subscribers => {
      subscribers.forEach(subscriber => {
        subscriber = subscriber.get({plain: true}) 
        console.log(req)
         sendMessage({
           src: req.fields.src,
           text: req.fields.text,
           dst: subscriber.phoneNumber
         })
      })
    })
    res.send("OK")
  })

  app.listen(port, () => {
    console.log(`SMS app listening on port ${port}!`)
  })

})
