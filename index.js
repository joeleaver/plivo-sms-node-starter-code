const Sequelize = require('sequelize')
const express = require('express')
const formidable = require('express-formidable')
const plivo = require('plivo')

const sequelize = new Sequelize('sqlite:./sms.db')
const app = express()
app.use(formidable())
const port = 3000
const plivoClient = new plivo.Client()

// set up database models

// subscribe
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

// unsubscribe
const unsubscribe = (phoneNumber) => {
  Subscriber
  .destroy({where: {phoneNumber: phoneNumber}})
  .then((destroyed) => {
    console.log(destroyed)
  }
  )
}


// sendMessage

const sendMessage = ({src, dst, text}) => {
  plivoClient.messages.create(
    src,
    dst,
    text,
    {
      url: "https://a64ad272.ngrok.io/messageStatus"
    }
  )
}

// logMessage

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

// logMessageStatus

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


const Subscriber = sequelize.define('subscriber', {
  phoneNumber: { type: Sequelize.STRING }
})

sequelize.sync({alter: true}).then(() => {
  console.log('database ready')
  
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



  app.post('/incoming', (req, res) => {
    console.log(req.fields)
    switch(req.fields.Text.toLowerCase()) {
      case 'start':
        subscribe(req.fields.From)
        sendMessage({
          src: req.fields.To,
          dst: req.fields.From,
          text: "Thank you for subscribing."
        })
        break
      
        case 'stop':
          unsubscribe(req.fields.From)
          break

        default:
          logMessage({
            uuid: req.fields.MessageUUID,
            from: req.fields.From,
            to: req.fields.To,
            text: req.fields.Text,
            units: parseInt(req.fields.Units),
            cost: parseFloat(req.fields.TotalAmount)
          })
  

    }
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

  app.listen(port, () =>{
    console.log(`SMS app running on ${port}`)
  })

})