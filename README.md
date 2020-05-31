# Kin Ads Network

This repository contains the infrastructure and the codebase for the Kin Ads Network. There are three
main functionalities in this repository:

1.  A proxy between IronSource and the integrating app. It does a few security checks, save the events
    in a database and if it's a valid ad watch event, calls the app's server callback.
2.  A daily cron job that saves revenue per app and per ad network in a Google Sheet, so apps can be
    compensated correctly.
3.  An API that returns the information of an app (like average eCPM) for a specific day.

## How to use this as an app developer

Very simple! Integrate the IronSource SDK in your app per the instruction. Then, notify us with your
server callback. We will send you a secret key to access the information API.

### Security

Make sure your server callback is secure. There are a couple of things to take into consideration:

1.  Of course, the server callback should be secret (not exposed from the app for example)
2.  The callback contains a signature you can recreate on your end. The signature is calculated as a
    HMAC-sha256 with a secret key as the password (we will provide this you), with the body:
    `${clientId}${eventId}${userId}${timestamp}`, which are provided in the callback
3.  Make sure you don't allow double earns by saving the eventId in a database and checking this
    eventId is not used before.

With these measures, even if someone finds out your server callback, they cannot re-earn using the
same url and they cannot generate new urls because they don't have the secret to generate
valid signatures.

## How to run this as a developer

- Clone the script
- Run `yarn install`
- Run `yarn lint` for linting or `yarn coverage` for unit test coverage

To deploy the app, run `serverless deploy`. It will create an application in your linked AWS account on the
development stage. Refer to serverless docs for more information on deploying.

Deploying this app will automatically create 3 DynamoDB tables: clients, info and events. Clients link `clientId`s
to `callbackUrl`s. The events database is a database that saves all events that come through. A future 
possibility is to remove these after x days if the table becomes too big and costly. Note that the source ip checking
only works if the serverless environment is deployed behind a cloudfront distribution.

## Security measures

As you can see in the codebase, all environment variables are stored in the AWS Secrets Manager.
Three security measures have been implemented for the Ironsouce proxy function.

### Signature calculation

Per the docs of IronSource, an optional secret can be sent along with the request. This is the has of some
event properties and a secret variable, which is only visible in the IronSource dashboard and should
be saved in the AWS Secrets Manager, under a secret with the stage as name (configurable in serverless.yml)
and as key: `IRONSOURCE_PRIVATE_KEY`.

This way, the secret is safely stored in AWS Secrets Manager and can freely be accessed in the codebase
using `process.env.IRONSOURCE_PRIVATE_KEY`.

### Duplicate request are denied

With every request, a check is done to see if that request is already been rewarded before. If you happen
to have get a link of a video reward, you cannot run it again and get the reward again. As it is impossible
to generate new links that generate valid rewards (because you need to calculate the signature), you cannot
generate reward links without the secret nor reuse ones that were valid at some point. We only retain events
for one day, as events older than a day are filtered out by timestamp checking.

### Source IP restriction

Only calls that originate from IronSource.

