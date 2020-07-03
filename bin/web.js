#!/usr/bin/env node

'use strict'

// log to files
const logger = require('console-files')
// handle app authentication to Store API
// https://github.com/ecomplus/application-sdk
const { ecomAuth, ecomServerIps } = require('@ecomplus/application-sdk')

// web server with Express
const express = require('express')
const bodyParser = require('body-parser')
const app = express()
const router = express.Router()
const port = process.env.PORT || 4200

app.use(bodyParser.urlencoded({ extended: false }))
app.use(bodyParser.json())

// E-Com Plus Store ID from request header
app.use((req, res, next) => {
  if (req.url.startsWith('/ecom/')) {
    // get E-Com Plus Store ID from request header
    req.storeId = parseInt(req.get('x-store-id'), 10)
    if (req.url.startsWith('/ecom/modules/')) {
      // request from Mods API
      // https://github.com/ecomclub/modules-api
      const { body } = req
      if (typeof body !== 'object' || body === null || !body.params || !body.application) {
        return res.status(406).send('Request not comming from Mods API? Invalid body')
      }
    }

    // on production check if request is comming from E-Com Plus servers
    if (process.env.NODE_ENV === 'production' && ecomServerIps.indexOf(req.get('x-real-ip')) === -1) {
      return res.status(403).send('Who are you? Unauthorized IP address')
    }
  }

  // pass to the endpoint handler
  // next Express middleware
  next()
})

ecomAuth.then(appSdk => {
  // setup app routes
  const routes = './../routes'
  router.get('/', require(`${routes}/`)())

  // base routes for E-Com Plus Store API
  ;[
    '/ecom/auth-callback',
    '/ecom/webhook',
    '/ecom/modules/create-transaction',
    '/ecom/modules/list-payments'
  ].forEach(route => router.post(route, require(`${routes}${route}`)(appSdk)))

  /* Add custom app routes here */
  ;[
    '/wirecard/auth-callback',
    '/wirecard/request-auth'
  ].forEach(route => {
    router.get(route, require(`${routes}${route}`)(appSdk))
  })

  router.post('/wirecard/webhook', require(`${routes}/wirecard/webhook`)(appSdk))

  // add router and start web server
  app.use(router)
  app.listen(port)
  logger.log(`--> Starting web app on port :${port}`)
})

ecomAuth.catch(err => {
  logger.error(err)
  setTimeout(() => {
    // destroy Node process while Store API auth cannot be handled
    process.exit(1)
  }, 1100)
})
